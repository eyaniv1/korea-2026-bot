require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const { TRIP_CONTEXT } = require('./trip-context');
const { findNearbyPois, addCustomPoi, clearCustomPois, getDistance, loadCustomPois } = require('./poi-database');
const { initDB, getWanderUserDB, upsertWanderUser, updateWanderLocation, getLastAlertTime: dbGetLastAlertTime, getLastAlertTimeAny: dbGetLastAlertTimeAny, recordAlert, clearAlertHistory } = require('./db');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ===== PUSHOVER NOTIFICATIONS =====
const PUSHOVER_APP_TOKEN = 'adnxddgcogxfhuna1ypzhnueb4pe9o';
// User keys — add more users here
const pushoverUsers = new Map();
pushoverUsers.set('eran', 'uid2drphnhyiti8fnni3ieox6eav9m');

async function sendPushover(userKey, title, message, url) {
  try {
    const body = new URLSearchParams({
      token: PUSHOVER_APP_TOKEN,
      user: userKey,
      title: title || 'WanderGuide',
      message,
      sound: 'pushover',
      priority: '0'
    });
    if (url) body.append('url', url);
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body
    });
  } catch (err) {
    console.error('Pushover error:', err.message);
  }
}

function sendPushoverToAll(title, message, url) {
  for (const [name, key] of pushoverUsers) {
    sendPushover(key, title, message, url);
  }
}

// ===== EXPRESS HTTP SERVER (for web app) =====
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Per-user chat sessions
const webSessions = new Map();
const WEB_MAX_HISTORY = 30;

// Broadcast messages (scheduled messages visible to all web users)
const broadcastMessages = [];

function getWebSession(sessionId) {
  if (!webSessions.has(sessionId)) {
    webSessions.set(sessionId, []);
  }
  return webSessions.get(sessionId);
}

// Chat endpoint — per-user sessions via X-Session-Id header
app.post('/api/chat', async (req, res) => {
  try {
    const { message, image } = req.body;
    const sessionId = req.headers['x-session-id'] || 'default';
    if (!message && !image) return res.status(400).json({ error: 'No message or image provided' });

    const history = getWebSession(sessionId);

    // Build user content — text only or text + image
    if (image) {
      const content = [];
      if (message) content.push({ type: 'text', text: message });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: image.data }
      });
      history.push({ role: 'user', content });
    } else {
      history.push({ role: 'user', content: message });
    }
    if (history.length > WEB_MAX_HISTORY) {
      history.splice(0, history.length - WEB_MAX_HISTORY);
    }

    // Merge consecutive same-role messages (only merge strings, not image arrays)
    const cleaned = [];
    for (const msg of history) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role
          && typeof cleaned[cleaned.length - 1].content === 'string'
          && typeof msg.content === 'string') {
        cleaned[cleaned.length - 1].content += '\n' + msg.content;
      } else {
        cleaned.push({ ...msg });
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: TRIP_CONTEXT + `\n\nYou are chatting via the trip companion web app. Keep answers short and mobile-friendly. Use bullet points for lists.

If the user asks to add a POI, extract the coordinates and description and respond with a JSON block like: {"addPoi":{"lat":37.5,"lng":126.9,"name":"Place name","desc":"Description"}} followed by a confirmation message.

If the user asks to remove/clear their POIs, respond with {"clearPois":true} followed by a confirmation.

## Vouchers & Confirmations
When the user asks for a voucher, confirmation, or ticket, provide the link from this list. The base URL is https://eyaniv1.github.io/korea-2026-bot/

**Hotels:**
- Seoul 23-26 Apr (Eran/Michal): vouchers/hotels/Hotel%20Seoul%2023-26%20APR%20Eran%20Michal%20Confirmation.pdf
- Seoul 22-26 Apr (Jonathan/Ofir): vouchers/hotels/Hotel%20Seoul%2022-26%20APR%20Jonathan%20Ofir%20Confirmation.pdf
- Jeju 26-29 Apr: vouchers/hotels/Hotel%20Jeju%2026-29%20APR%20Confirmation.pdf
- Busan 29 Apr-1 May: vouchers/hotels/Hotel%20Busan%2029%20APR%20-%201%20May%20Confirmation.pdf
- Seoul 1-4 May: vouchers/hotels/Hotel%20Seoul%201-4%20May%20Confirmation.pdf

**Flights:**
- Eran/Michal international: vouchers/flights/TLV%20Seoul%20TLV%20Eran%20Michal.pdf
- Jonathan international: vouchers/flights/Katmandu%20Seoul%20JONATHAN%20YANIV%2021APR2026.pdf
- Ofir international: vouchers/flights/Danang%20Seoul%20Ofir%20Tovel%2020APR2026.pdf
- Internal flights overview: vouchers/flights/Internal%20flights%20-%20My%20Trips%20_%20Korean%20Air.pdf
- E-tickets: vouchers/flights/Eran%20Korean%20Air%20%20e-Ticket.pdf, vouchers/flights/Michal%20Korean%20Air%20e-Ticket.pdf, vouchers/flights/Jonathan%20Korean%20Air%20e-Ticket.pdf, vouchers/flights/Ofir%20Korean%20Air%20%20e-Ticket.pdf

**Car Rental:**
- Alamo Jeju 26-29 Apr: vouchers/car-rental/Car%20rental%20Alamo%20Jeju%2026-29%20APR.pdf

**Train:**
- KTX Busan-Seoul: vouchers/train/Korean%20Train%20Busan%20Seoul%20Confirmation.pdf

**Attractions:**
- DMZ tour 3 May: vouchers/Attractions/Klook%20voucher%20DMZ%20tour%203%20May.pdf
- E-bikes Seoul 25 Apr: vouchers/Attractions/ebikes%20along%20river%20in%20Seoul%2025%20Apr%20Millim.pdf
- N Seoul Tower cable car 25 Apr: vouchers/Attractions/Klook%20voucher%20Seoul%20Cable%20car%20observatory%2025%20Apr.pdf

**Taxis/Drivers:**
- Jonathan airport taxi: vouchers/Taxis/Jonathan%2C%20your%20journey%20from%20Incheon%20International%20Airport%20(ICN).pdf
- Busan-Gyeongju driver 30 Apr: vouchers/Taxis/Klook%20voucher%20Car%20Hire%20Busan%2030%20Apr.pdf

When providing a voucher link, format it as: [📎 Description](https://eyaniv1.github.io/korea-2026-bot/PATH)`,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: cleaned,
    });

    let reply = '';
    for (const block of response.content) {
      if (block.type === 'text') reply += block.text;
    }

    // Check for POI commands in the reply
    const addPoiMatch = reply.match(/\{"addPoi":\s*(\{[^}]+\})\}/);
    if (addPoiMatch) {
      try {
        const poi = JSON.parse(addPoiMatch[1]);
        addCustomPoi(poi.name || poi.desc.substring(0, 50), poi.lat, poi.lng, poi.desc);
        reply = reply.replace(/\{"addPoi":[^}]+\}\}/, '').trim();
      } catch(e) { /* ignore parse errors */ }
    }
    const clearMatch = reply.match(/\{"clearPois":\s*true\s*\}/);
    if (clearMatch) {
      clearCustomPois();
      reply = reply.replace(/\{"clearPois":\s*true\s*\}/, '').trim();
    }

    history.push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (err) {
    console.error('Web chat error:', err.message);
    const sessionId = req.headers['x-session-id'] || 'default';
    const history = getWebSession(sessionId);
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop();
    }
    res.status(500).json({ error: 'Sorry, something went wrong. Try again.' });
  }
});

// POI database endpoint
app.get('/api/pois', (req, res) => {
  res.json(require('./poi-database').getAllPois());
});

// Add POI endpoint (for web app direct add)
app.post('/api/pois', (req, res) => {
  const { name, lat, lng, desc } = req.body;
  if (!lat || !lng || !desc) return res.status(400).json({ error: 'lat, lng, desc required' });
  addCustomPoi(name || desc.substring(0, 50), parseFloat(lat), parseFloat(lng), desc);
  res.json({ success: true, total: require('./poi-database').getAllPois().length });
});

// Clear custom POIs
app.delete('/api/pois', (req, res) => {
  clearCustomPois();
  res.json({ success: true });
});

// Broadcast messages endpoint (scheduled messages for web app)
app.get('/api/broadcasts', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const msgs = broadcastMessages.filter(m => m.time > since);
  res.json(msgs);
});

// Send push to specific user or broadcast
app.post('/api/push', (req, res) => {
  const { to, message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  if (to === 'all' || !to) {
    // Broadcast to all registered Pushover users
    sendPushoverToAll('Trip Message', message);
    // Also add to alert queue for web chat
    alertQueue.push({ text: `📢 <b>Broadcast:</b> ${message}`, time: Date.now() });
    if (alertQueue.length > 50) alertQueue.splice(0, alertQueue.length - 50);
    res.json({ success: true, sentTo: Array.from(pushoverUsers.keys()) });
  } else {
    // Send to specific user
    const key = pushoverUsers.get(to.toLowerCase());
    if (!key) return res.status(404).json({ error: `User "${to}" not found. Registered: ${Array.from(pushoverUsers.keys()).join(', ')}` });
    sendPushover(key, 'Trip Message', message);
    res.json({ success: true, sentTo: to });
  }
});

// Alert queue endpoint — web app polls this for proximity alerts
app.get('/api/alerts', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const alerts = alertQueue.filter(a => a.time > since);
  res.json(alerts);
});

// Register Pushover user endpoint
app.post('/api/pushover/register', (req, res) => {
  const { name, userKey, sendTest } = req.body;
  if (!name || !userKey) return res.status(400).json({ error: 'name and userKey required' });
  const registeredName = name.toLowerCase();
  pushoverUsers.set(registeredName, userKey);
  if (sendTest) {
    sendPushover(userKey, 'WanderGuide', `Welcome ${name}! Push notifications are working. You'll be alerted when near interesting places.`);
  }
  res.json({ success: true, registeredName, users: Array.from(pushoverUsers.keys()) });
});

// List Pushover users
app.get('/api/pushover/users', (req, res) => {
  res.json(Array.from(pushoverUsers.entries()).map(([name]) => name));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', pois: require('./poi-database').getAllPois().length, sessions: webSessions.size });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web API running on port ${PORT}`));

// Helper to add broadcast message (called from scheduled messages)
function addBroadcast(text) {
  broadcastMessages.push({ text, time: Date.now() });
  // Keep last 20 broadcasts
  if (broadcastMessages.length > 20) broadcastMessages.splice(0, broadcastMessages.length - 20);
}

// Store conversation history per chat (group or private)
const conversations = new Map();
const MAX_HISTORY = 50;

// Track active group chat IDs so we can send proactive messages
const activeGroups = new Set();

// Store last known location per chat (for general use)
const lastLocations = new Map();

// ===== WANDERGUIDE — Per-User Proximity Alert System =====
let alertRadius = 300;
let alertCooldown = 20 * 60 * 1000;
let alertRevisitCooldown = 4 * 60 * 60 * 1000;

// Per-user tracking: telegramUserId → { pushoverKey, lat, lng, name, enabled }
// In-memory cache backed by PostgreSQL
const wanderUsers = new Map();
// Alert queue for web app display (global — all users see all alerts)
const alertQueue = [];

function getWanderUser(userId) {
  if (!wanderUsers.has(userId)) {
    wanderUsers.set(userId, { pushoverKey: null, lat: null, lng: null, name: '', enabled: false });
  }
  return wanderUsers.get(userId);
}

// Load wander users from DB on startup
async function loadWanderUsers() {
  try {
    const { pool } = require('./db');
    const result = await pool.query('SELECT * FROM wander_users');
    for (const row of result.rows) {
      wanderUsers.set(Number(row.telegram_user_id), {
        pushoverKey: row.pushover_key,
        lat: row.lat,
        lng: row.lng,
        name: row.name || '',
        enabled: row.enabled
      });
      // Also add to pushoverUsers map
      if (row.pushover_key && row.name) {
        pushoverUsers.set(row.name.toLowerCase(), row.pushover_key);
      }
    }
    console.log(`👤 Loaded ${result.rows.length} WanderGuide users from database`);
  } catch (err) {
    console.error('Failed to load wander users:', err.message);
  }
}

async function checkUserProximity(userId) {
  const user = getWanderUser(userId);
  if (!user.enabled || !user.lat || !user.lng) return;

  const now = Date.now();
  const lastAny = await dbGetLastAlertTimeAny(userId);
  if (lastAny && (now - lastAny) < alertCooldown) return;

  const nearby = findNearbyPois(user.lat, user.lng, alertRadius);
  if (nearby.length === 0) return;

  for (const poi of nearby) {
    const lastAlerted = await dbGetLastAlertTime(userId, poi.name);
    if (lastAlerted && (now - lastAlerted) < alertRevisitCooldown) continue;

    // Mark as alerted in DB
    await recordAlert(userId, poi.name);

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
    const mapsUrl = `https://www.google.com/maps/@${poi.lat},${poi.lng},17z`;

    // 1. Send Pushover — SHORT message for Siri readout (name + distance only)
    if (user.pushoverKey) {
      const pushMsg = `Hey ${user.name}, you're ${poi.distance} meters from ${poi.name}.`;
      sendPushover(user.pushoverKey, 'WanderGuide', pushMsg, mapsUrl);
    }

    // 2. Send Telegram DM — FULL message with description + maps link
    try {
      const msg = `📍 *Hey ${user.name}! You're ${poi.distance}m from ${poi.name}!*\n\n${poi.desc}\n\n🗺️ [Open in Maps](${mapsUrl})`;
      await bot.telegram.sendMessage(userId, msg, { parse_mode: 'Markdown' })
        .catch(() => bot.telegram.sendMessage(userId, msg.replace(/[*_\[\]()]/g, '')));
    } catch (err) {
      console.error(`Telegram alert error for ${user.name}:`, err.message);
    }

    // 3. Add to alert queue for web app display
    alertQueue.push({
      text: `📍 <b>${user.name} is ${poi.distance}m from ${poi.name}!</b> <span style="color:#888;font-size:12px">${timeStr}</span><br>${poi.desc || ''}<br><a href="${mapsUrl}" target="_blank">🗺️ Open in Maps</a>`,
      time: now
    });
    if (alertQueue.length > 50) alertQueue.splice(0, alertQueue.length - 50);

    // Only one alert at a time per user
    break;
  }
}

// Admin config — Eran's Telegram user ID (set on first /admin command)
const ADMIN_NAME = 'Eran';
const adminUserIds = new Set();

// Runtime settings (configurable via Telegram commands)
const settings = {
  responseMode: 'mentions', // 'mentions' = only when addressed, 'all' = respond to everything, 'commands' = only slash commands
  scheduleEnabled: true,
  tips: [], // curated tips added on the fly
};

function getHistory(chatId) {
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  return conversations.get(chatId);
}

function addMessage(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// Build system prompt with runtime tips and location
function buildSystemPrompt(chatId) {
  let prompt = TRIP_CONTEXT;
  if (settings.tips.length > 0) {
    prompt += `\n\n## Curated Tips from Eran\n`;
    prompt += settings.tips.map((t, i) => `${i + 1}. ${t}`).join('\n');
    prompt += `\nUse these tips when relevant to questions about food, activities, or places.`;
  }
  const loc = lastLocations.get(chatId);
  if (loc) {
    prompt += `\n\n## Current Location\n`;
    prompt += `Last shared by ${loc.from} at ${loc.time}:\n`;
    prompt += `Latitude: ${loc.latitude}, Longitude: ${loc.longitude}\n`;
    prompt += `Use this location when answering questions about nearby places, directions, restaurants, etc. Search the web for places near these coordinates when relevant.`;
  }
  return prompt;
}

// Call Claude with web search tool support
async function askClaude(chatId, messages) {
  // Merge consecutive same-role messages to prevent API errors
  const cleaned = [];
  for (const msg of messages) {
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role) {
      const prev = cleaned[cleaned.length - 1];
      prev.content = (typeof prev.content === 'string' ? prev.content : '') + '\n' + (typeof msg.content === 'string' ? msg.content : '');
    } else {
      cleaned.push({ ...msg });
    }
  }
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: buildSystemPrompt(chatId),
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: cleaned,
  });

  let reply = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      reply += block.text;
    }
  }
  return reply;
}

// Send a proactive message to all active groups
async function sendToAllGroups(prompt) {
  // Send to Telegram groups
  for (const chatId of activeGroups) {
    try {
      addMessage(chatId, 'user', prompt);
      const reply = await askClaude(chatId, getHistory(chatId));
      addMessage(chatId, 'assistant', reply);
      await bot.telegram.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(() =>
        bot.telegram.sendMessage(chatId, reply)
      );
      // Also broadcast to web app
      addBroadcast(reply);
    } catch (err) {
      console.error(`Proactive message failed for chat ${chatId}:`, err.message);
    }
  }
  // If no active groups, still generate broadcast for web app users
  if (activeGroups.size === 0) {
    try {
      const tempHistory = [{ role: 'user', content: prompt }];
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: TRIP_CONTEXT,
        messages: tempHistory,
      });
      let reply = '';
      for (const block of response.content) {
        if (block.type === 'text') reply += block.text;
      }
      addBroadcast(reply);
    } catch (err) {
      console.error('Broadcast-only message failed:', err.message);
    }
  }
}

// ===== SCHEDULED PROACTIVE MESSAGES =====
// All times in KST (UTC+9) — Korea Standard Time

// Morning briefing at 8:00 AM KST (= 23:00 UTC previous day)
cron.schedule('0 23 * * *', () => {
  if (!settings.scheduleEnabled) return;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', weekday: 'long', month: 'long', day: 'numeric' });
  sendToAllGroups(
    `[SYSTEM - Morning Briefing] It's 8:00 AM in Korea, ${today}. ` +
    `Give the group a cheerful good morning and share today's plan from the itinerary. ` +
    `Include the weather outlook, what to wear, and any reservations or time-sensitive activities. ` +
    `If there are no plans yet for today, suggest some options. Keep it concise and energizing.`
  );
}, { timezone: 'Asia/Seoul' });

// Reminder check at 8:00 PM KST (= 11:00 UTC) — remind about tomorrow
cron.schedule('0 11 * * *', () => {
  if (!settings.scheduleEnabled) return;
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', weekday: 'long', month: 'long', day: 'numeric' });
  sendToAllGroups(
    `[SYSTEM - Evening Reminder] It's 8:00 PM in Korea. ` +
    `Ask the group how their day was (briefly). ` +
    `Then remind them about tomorrow's plan (${tomorrow}): any reservations, early wake-ups, or things to prepare. ` +
    `If there are no plans for tomorrow, ask if they'd like to plan. Keep it warm and brief.`
  );
}, { timezone: 'Asia/Seoul' });

// Late evening prompt at 10:00 PM KST (= 13:00 UTC) — nudge to share photos
cron.schedule('0 13 * * *', () => {
  if (!settings.scheduleEnabled) return;
  sendToAllGroups(
    `[SYSTEM - Evening Prompt] It's 10:00 PM in Korea. ` +
    `Send a short, casual message encouraging the group to share their favorite photo or moment from today. ` +
    `Keep it to one or two sentences, warm and fun.`
  );
}, { timezone: 'Asia/Seoul' });

// ===== MESSAGE HANDLERS =====

// Track groups when bot receives any message
function trackGroup(ctx) {
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    activeGroups.add(ctx.chat.id);
  }
}

// Check if the bot should respond to this message
function shouldRespond(ctx) {
  // Always respond in private chats
  if (ctx.chat.type === 'private') return true;

  // Commands-only mode
  if (settings.responseMode === 'commands') return false;

  // Chatty mode — respond to everything
  if (settings.responseMode === 'all') return true;

  // Default (mentions mode) — respond if addressed
  if (ctx.message.reply_to_message?.from?.id === bot.botInfo?.id) return true;

  const text = (ctx.message.text || ctx.message.caption || '').toLowerCase();
  const botName = (bot.botInfo?.first_name || '').toLowerCase();
  const botUsername = (bot.botInfo?.username || '').toLowerCase();
  if (botName && text.includes(botName)) return true;
  if (botUsername && text.includes(`@${botUsername}`)) return true;
  if (text.includes('bot,') || text.includes('bot ') || text === 'bot') return true;

  return false;
}

// Handle photos (signs, menus, etc.)
bot.on('photo', async (ctx) => {
  trackGroup(ctx);

  if (!shouldRespond(ctx)) return;
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'Someone';
  const caption = ctx.message.caption || 'What is this?';

  try {
    await ctx.sendChatAction('typing');

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const url = fileLink.href;
    const mediaType = url.includes('.png') ? 'image/png' : 'image/jpeg';

    const userMessage = `${userName} sent a photo with caption: "${caption}"`;
    addMessage(chatId, 'user', [
      { type: 'text', text: userMessage },
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      },
    ]);

    const reply = await askClaude(chatId, getHistory(chatId));
    addMessage(chatId, 'assistant', reply);

    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(reply)
    );
  } catch (err) {
    console.error('Photo error:', err.message);
    const history = getHistory(chatId);
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop();
    }
    await ctx.reply('Had trouble with that photo. Try again or describe what you need.');
  }
});

// Handle voice messages
bot.on('voice', async (ctx) => {
  trackGroup(ctx);
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'Someone';

  try {
    await ctx.sendChatAction('typing');

    // Download the voice file
    const file = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const response = await fetch(file.href);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Create a File object for Groq
    const audioFile = new File([buffer], 'voice.ogg', { type: 'audio/ogg' });

    // Transcribe with Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
    });

    const text = transcription.text;
    if (!text || text.trim().length === 0) {
      return ctx.reply('Couldn\'t make out what was said. Try again?');
    }

    // Show the transcription so everyone can read it
    await ctx.reply(`🎤 *${userName}:* ${text}`, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(`🎤 ${userName}: ${text}`)
    );

    // Send to Claude
    addMessage(chatId, 'user', `${userName} (voice message): ${text}`);
    const reply = await askClaude(chatId, getHistory(chatId));
    addMessage(chatId, 'assistant', reply);

    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(reply)
    );
  } catch (err) {
    console.error('Voice error:', err.message, err.status || '', err.error || '');
    // Remove dangling user message to prevent consecutive user messages breaking future calls
    const history = getHistory(chatId);
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop();
    }
    await ctx.reply('Had trouble with that voice message. Try typing or sending again.');
  }
});

// Handle location shares (one-time and live location updates)
bot.on('location', async (ctx) => {
  trackGroup(ctx);
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Someone';
  const { latitude, longitude } = ctx.message.location;
  const isLive = !!ctx.message.location.live_period;

  // Update general location store
  lastLocations.set(chatId, { latitude, longitude, from: userName, time: new Date().toISOString() });

  // Update per-user WanderGuide location (memory + DB)
  const wu = getWanderUser(userId);
  wu.lat = latitude;
  wu.lng = longitude;
  wu.name = userName;
  updateWanderLocation(userId, latitude, longitude).catch(err => console.error('DB location update error:', err.message));

  // Check per-user proximity alerts
  await checkUserProximity(userId);

  // Only respond conversationally for one-time location shares in non-DM chats
  if (!isLive && ctx.chat.type !== 'private') {
    addMessage(chatId, 'user',
      `${userName} shared their location: latitude ${latitude}, longitude ${longitude}. ` +
      `Acknowledge briefly that you know where they are.`
    );
    try {
      await ctx.sendChatAction('typing');
      const reply = await askClaude(chatId, getHistory(chatId));
      addMessage(chatId, 'assistant', reply);
      await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() => ctx.reply(reply));
    } catch (err) {
      console.error('Location error:', err.message);
    }
  } else if (!isLive && ctx.chat.type === 'private') {
    // In DM, just acknowledge briefly
    await ctx.reply(`📍 Got your location, ${userName}. WanderGuide is ${wu.enabled ? 'active — I\'ll alert you when you\'re near interesting places.' : 'off. Send /alerts on to enable.'}`);
  }
});

// Handle edited messages (live location updates come as edits)
bot.on('edited_message', async (ctx) => {
  if (!ctx.editedMessage?.location) return;
  const userId = ctx.editedMessage.from.id;
  const userName = ctx.editedMessage.from.first_name || 'Someone';
  const { latitude, longitude } = ctx.editedMessage.location;
  const chatId = ctx.editedMessage.chat.id;

  lastLocations.set(chatId, { latitude, longitude, from: userName, time: new Date().toISOString() });

  // Update per-user location (memory + DB)
  const wu = getWanderUser(userId);
  wu.lat = latitude;
  wu.lng = longitude;
  wu.name = userName;
  updateWanderLocation(userId, latitude, longitude).catch(err => console.error('DB location update error:', err.message));

  // Check per-user proximity
  await checkUserProximity(userId);
});

// ===== ADMIN COMMANDS =====

function isAdmin(ctx) {
  // Allow Eran by first name match, or anyone who has registered via /admin
  const name = ctx.from.first_name || '';
  if (name.toLowerCase() === ADMIN_NAME.toLowerCase()) {
    adminUserIds.add(ctx.from.id);
    return true;
  }
  return adminUserIds.has(ctx.from.id);
}

// /quiet — only respond to slash commands
bot.command('quiet', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  settings.responseMode = 'commands';
  ctx.reply('🤫 Quiet mode — I\'ll only respond to /commands now.');
});

// /chatty — respond to everything
bot.command('chatty', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  settings.responseMode = 'all';
  ctx.reply('🗣️ Chatty mode — I\'ll respond to every message.');
});

// /normal — respond only when mentioned/replied to (default)
bot.command('normal', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  settings.responseMode = 'mentions';
  ctx.reply('👋 Normal mode — I\'ll respond when mentioned or replied to.');
});

// /schedule on|off
bot.command('schedule', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  const arg = ctx.message.text.replace('/schedule', '').trim().toLowerCase();
  if (arg === 'off') {
    settings.scheduleEnabled = false;
    ctx.reply('🔕 Scheduled messages disabled (morning briefing, evening reminder, photo prompt).');
  } else if (arg === 'on') {
    settings.scheduleEnabled = true;
    ctx.reply('🔔 Scheduled messages enabled.');
  } else {
    ctx.reply(`Scheduled messages are currently: ${settings.scheduleEnabled ? '🔔 ON' : '🔕 OFF'}\nUsage: /schedule on or /schedule off`);
  }
});

// /addtip <text> — add a curated tip
bot.command('addtip', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  const tip = ctx.message.text.replace('/addtip', '').trim();
  if (!tip) return ctx.reply('Usage: /addtip Try the black bean noodles at Myeongdong Kyoja');
  settings.tips.push(tip);
  ctx.reply(`✅ Tip added (#${settings.tips.length}): "${tip}"`);
});

// /tips — list all curated tips
bot.command('tips', (ctx) => {
  trackGroup(ctx);
  if (settings.tips.length === 0) return ctx.reply('No tips saved yet. Use /addtip to add one.');
  const list = settings.tips.map((t, i) => `${i + 1}. ${t}`).join('\n');
  ctx.reply(`📝 *Curated Tips:*\n${list}`, { parse_mode: 'Markdown' });
});

// /deltip <number> — remove a tip
bot.command('deltip', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  const num = parseInt(ctx.message.text.replace('/deltip', '').trim());
  if (!num || num < 1 || num > settings.tips.length) return ctx.reply(`Usage: /deltip <number> (1-${settings.tips.length})`);
  const removed = settings.tips.splice(num - 1, 1);
  ctx.reply(`🗑️ Removed tip: "${removed[0]}"`);
});

// ===== WANDERGUIDE COMMANDS =====

// /alerts on|off — toggle proximity alerts (per user)
bot.command('alerts', (ctx) => {
  trackGroup(ctx);
  const userId = ctx.from.id;
  const wu = getWanderUser(userId);
  wu.name = ctx.from.first_name || 'Someone';
  const arg = ctx.message.text.replace('/alerts', '').trim().toLowerCase();
  if (arg === 'off') {
    wu.enabled = false;
    upsertWanderUser(userId, { name: wu.name, enabled: false });
    ctx.reply(`📍 WanderGuide disabled for ${wu.name}.`);
  } else if (arg === 'on') {
    wu.enabled = true;
    upsertWanderUser(userId, { name: wu.name, enabled: true });
    ctx.reply(`📍 WanderGuide enabled for ${wu.name}! Share your live location in this DM to start receiving alerts.${wu.pushoverKey ? '' : '\n\nTip: Send /register YOUR_PUSHOVER_KEY to get native push notifications.'}`);
  } else {
    ctx.reply(`📍 WanderGuide for ${wu.name}: ${wu.enabled ? 'ON' : 'OFF'}\nPushover: ${wu.pushoverKey ? 'registered' : 'not set'}\nLocation: ${wu.lat ? 'tracking' : 'not shared'}\n\nUsage: /alerts on or /alerts off`);
  }
});

// /register <pushover_key> — link Pushover to this Telegram user
bot.command('register', (ctx) => {
  trackGroup(ctx);
  const userId = ctx.from.id;
  const wu = getWanderUser(userId);
  wu.name = ctx.from.first_name || 'Someone';
  const key = ctx.message.text.replace('/register', '').trim();
  if (!key) return ctx.reply('Usage: /register YOUR_PUSHOVER_USER_KEY\n\nGet your key from the Pushover app.');
  wu.pushoverKey = key;
  pushoverUsers.set(wu.name.toLowerCase(), key);
  upsertWanderUser(userId, { name: wu.name, pushoverKey: key });
  ctx.reply(`✅ Pushover registered for ${wu.name}! Sending a test notification now...`);
  sendPushover(key, 'WanderGuide', `Welcome ${wu.name}! Push notifications are working. You'll be alerted when near interesting places.`);
});

// /radius <meters> — change alert radius
bot.command('radius', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change WanderGuide settings.');
  const val = parseInt(ctx.message.text.replace('/radius', '').trim());
  if (!val || val < 50 || val > 5000) return ctx.reply(`📍 WanderGuide radius: ${alertRadius}m\nUsage: /radius <50-5000>`);
  alertRadius = val;
  ctx.reply(`📍 WanderGuide radius set to ${alertRadius}m`);
});

// /cooldown <minutes> — change time between alerts
bot.command('cooldown', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change WanderGuide settings.');
  const val = parseInt(ctx.message.text.replace('/cooldown', '').trim());
  if (!val || val < 1 || val > 120) return ctx.reply(`📍 WanderGuide cooldown: ${alertCooldown / 60000} min\nUsage: /cooldown <1-120> (minutes)`);
  alertCooldown = val * 60 * 1000;
  ctx.reply(`📍 WanderGuide cooldown set to ${val} min between alerts`);
});

// /realert <hours> — change time before re-alerting same POI
bot.command('realert', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change WanderGuide settings.');
  const val = parseFloat(ctx.message.text.replace('/realert', '').trim());
  if (!val || val < 0.5 || val > 24) return ctx.reply(`📍 WanderGuide re-alert: ${alertRevisitCooldown / 3600000} hrs\nUsage: /realert <0.5-24> (hours)`);
  alertRevisitCooldown = val * 60 * 60 * 1000;
  ctx.reply(`📍 WanderGuide re-alert set to ${val} hrs for same POI`);
});

// /nearby — show nearby POIs based on last known location
bot.command('nearby', async (ctx) => {
  trackGroup(ctx);
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const wu = getWanderUser(userId);
  // Try per-user location first, then fall back to chat location
  const loc = (wu.lat ? { latitude: wu.lat, longitude: wu.lng } : lastLocations.get(chatId));
  if (!loc) return ctx.reply('📍 Share your location first (paperclip → Location), then try /nearby again.');

  const nearby = findNearbyPois(loc.latitude, loc.longitude, 1000); // 1km radius for manual check
  if (nearby.length === 0) return ctx.reply('No known POIs within 1km. Try sharing a new location or walking toward a neighborhood center.');

  const list = nearby.slice(0, 8).map((p, i) =>
    `${i + 1}. *${p.name}* (${p.distance}m)\n   ${p.desc.substring(0, 80)}...`
  ).join('\n\n');

  await ctx.reply(`📍 *Nearby places (within 1km):*\n\n${list}`, { parse_mode: 'Markdown' }).catch(() =>
    ctx.reply(nearby.slice(0, 8).map((p, i) => `${i + 1}. ${p.name} (${p.distance}m)`).join('\n'))
  );
});

// /clearpois — remove all custom POIs
bot.command('clearpois', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change WanderGuide settings.');
  const count = require('./poi-database').customPois.length;
  clearCustomPois();
  ctx.reply(`🗑️ Cleared ${count} custom POI(s). Static database (${require('./poi-database').getAllPois().length} POIs) unchanged.`);
});

// /addpoi lat lng description — add a custom POI
bot.command('addpoi', (ctx) => {
  trackGroup(ctx);
  if (!isAdmin(ctx)) return ctx.reply('Only Eran can change bot settings.');
  const parts = ctx.message.text.replace('/addpoi', '').trim().split(/\s+/);
  if (parts.length < 3) return ctx.reply('Usage: /addpoi 37.5745 126.9856 Amazing tea house on the corner');
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return ctx.reply('Invalid coordinates. Usage: /addpoi 37.5745 126.9856 Description here');
  const desc = parts.slice(2).join(' ');
  addCustomPoi(desc.substring(0, 50), lat, lng, desc);
  ctx.reply(`📍 Custom POI added at ${lat}, ${lng}: "${desc}"`);
});

// /status — show current bot config
bot.command('status', (ctx) => {
  trackGroup(ctx);
  const userId = ctx.from.id;
  const wu = getWanderUser(userId);
  const wanderStatus = wu.enabled ? '📍 ON' : '⭕ OFF';
  const locStatus = wu.lat ? `${wu.lat.toFixed(4)}, ${wu.lng.toFixed(4)}` : 'not shared';
  const pushStatus = wu.pushoverKey ? 'registered' : 'not set';
  ctx.reply(
    `⚙️ *Bot Status*\n` +
    `• Response mode: ${settings.responseMode}\n` +
    `• Scheduled messages: ${settings.scheduleEnabled ? 'ON' : 'OFF'}\n` +
    `• Curated tips: ${settings.tips.length}\n` +
    `• Active groups: ${activeGroups.size}\n` +
    `• WanderGuide: ${wanderStatus} (radius: ${alertRadius}m, cooldown: ${alertCooldown/60000}min, re-alert: ${alertRevisitCooldown/3600000}hrs)\n` +
    `• Your location: ${locStatus}\n` +
    `• Pushover: ${pushStatus}\n` +
    `• POIs in database: ${require('./poi-database').getAllPois().length}\n` +
    `• WanderGuide users: ${wanderUsers.size}`,
    { parse_mode: 'Markdown' }
  );
});

// /help — show all commands
bot.command('help', (ctx) => {
  trackGroup(ctx);
  ctx.reply(
    `*Commands:*\n` +
    `🗺️ /plan — today's itinerary\n` +
    `🌐 /translate <text> — translate to Korean\n` +
    `📍 /nearby — show POIs near your location\n` +
    `📝 /tips — show curated tips\n` +
    `⚙️ /status — bot settings\n` +
    `/help — this message\n\n` +
    `*WanderGuide (proximity alerts):*\n` +
    `/alerts on|off — enable/disable alerts\n` +
    `/radius <meters> — set alert distance (default 300)\n` +
    `/cooldown <minutes> — time between alerts (default 20)\n` +
    `/realert <hours> — re-alert same POI after (default 4)\n` +
    `/nearby — show POIs within 1km\n` +
    `/addpoi <lat> <lng> <desc> — add custom POI\n` +
    `/clearpois — remove all custom POIs\n\n` +
    `*Admin (Eran only):*\n` +
    `/quiet — only respond to commands\n` +
    `/normal — respond when mentioned (default)\n` +
    `/chatty — respond to everything\n` +
    `/schedule on|off — toggle daily messages\n` +
    `/addtip <text> — add a tip\n` +
    `/deltip <num> — remove a tip`,
    { parse_mode: 'Markdown' }
  );
});

// Handle /start command
bot.start((ctx) => {
  trackGroup(ctx);
  ctx.reply(
    `🇰🇷 *Korea Trip 2026 Bot is live!*\n\n` +
    `I'm your AI travel companion for the trip (Apr 23 - May 4).\n\n` +
    `I can help with:\n` +
    `• Trip planning & daily itinerary\n` +
    `• Restaurant & activity recommendations\n` +
    `• Directions & transportation\n` +
    `• Translating Korean (send me photos of signs/menus!)\n` +
    `• Cultural tips & emergency info\n` +
    `• 🔍 Live web search for current info\n\n` +
    `I'll also:\n` +
    `• Send a morning briefing at 8am 🌅\n` +
    `• Remind you about tomorrow's plans at 8pm 📋\n` +
    `• Nudge you to share photos at 10pm 📸\n` +
    `• 📍 WanderGuide — alert you near interesting places (/alerts on + share live location)\n\n` +
    `Just chat naturally — I know the whole group!`,
    { parse_mode: 'Markdown' }
  );
});

// Handle /plan command
bot.command('plan', async (ctx) => {
  trackGroup(ctx);
  const chatId = ctx.chat.id;
  addMessage(chatId, 'user', 'Show me today\'s plan. What are we doing today?');

  try {
    await ctx.sendChatAction('typing');
    const reply = await askClaude(chatId, getHistory(chatId));
    addMessage(chatId, 'assistant', reply);
    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(reply)
    );
  } catch (err) {
    console.error('Plan error:', err.message);
    await ctx.reply('Couldn\'t load the plan. Try asking me directly.');
  }
});

// Handle /translate command
bot.command('translate', async (ctx) => {
  trackGroup(ctx);
  const text = ctx.message.text.replace('/translate', '').trim();
  if (!text) {
    return ctx.reply('Usage: /translate hello, where is the subway?');
  }

  const chatId = ctx.chat.id;
  addMessage(chatId, 'user', `Translate this to Korean (with pronunciation): "${text}"`);

  try {
    await ctx.sendChatAction('typing');
    const reply = await askClaude(chatId, getHistory(chatId));
    addMessage(chatId, 'assistant', reply);
    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(reply)
    );
  } catch (err) {
    await ctx.reply('Translation failed. Try again.');
  }
});

// Handle text messages — MUST be after all bot.command() handlers
bot.on('text', async (ctx) => {
  trackGroup(ctx);

  if (!shouldRespond(ctx)) return;

  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'Someone';
  const userMessage = `${userName}: ${ctx.message.text}`;

  addMessage(chatId, 'user', userMessage);

  try {
    await ctx.sendChatAction('typing');
    const reply = await askClaude(chatId, getHistory(chatId));
    addMessage(chatId, 'assistant', reply);
    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(reply)
    );
  } catch (err) {
    console.error('Error:', err.status, err.message, err.error);
    const history = getHistory(chatId);
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop();
    }
    await ctx.reply('Sorry, I hit a snag. Try again in a moment.');
  }
});

// Launch with database initialization
async function start() {
  try {
    await initDB();
    await loadCustomPois();
    await loadWanderUsers();
  } catch (err) {
    console.error('DB init error (continuing without persistence):', err.message);
  }
  bot.launch();
  console.log('🤖 Korea Trip Bot is running! (with web search + scheduled messages + PostgreSQL persistence)');
}
start();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
