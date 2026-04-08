require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const cron = require('node-cron');
const { TRIP_CONTEXT } = require('./trip-context');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Store conversation history per chat (group or private)
const conversations = new Map();
const MAX_HISTORY = 50;

// Track active group chat IDs so we can send proactive messages
const activeGroups = new Set();

// Store last known location per chat
const lastLocations = new Map();

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
  for (const chatId of activeGroups) {
    try {
      addMessage(chatId, 'user', prompt);
      const reply = await askClaude(chatId, getHistory(chatId));
      addMessage(chatId, 'assistant', reply);
      await bot.telegram.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(() =>
        bot.telegram.sendMessage(chatId, reply)
      );
    } catch (err) {
      console.error(`Proactive message failed for chat ${chatId}:`, err.message);
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

// Handle text messages
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

// Handle location shares
bot.on('location', async (ctx) => {
  trackGroup(ctx);
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'Someone';
  const { latitude, longitude } = ctx.message.location;

  lastLocations.set(chatId, { latitude, longitude, from: userName, time: new Date().toISOString() });

  addMessage(chatId, 'user',
    `${userName} shared their location: latitude ${latitude}, longitude ${longitude}. ` +
    `Acknowledge briefly that you know where they are. If there was a recent question about nearby places, answer it using this location.`
  );

  try {
    await ctx.sendChatAction('typing');
    const reply = await askClaude(chatId, getHistory(chatId));
    addMessage(chatId, 'assistant', reply);
    await ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(reply)
    );
  } catch (err) {
    console.error('Location error:', err.message);
  }
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

// /status — show current bot config
bot.command('status', (ctx) => {
  trackGroup(ctx);
  ctx.reply(
    `⚙️ *Bot Status*\n` +
    `• Response mode: ${settings.responseMode}\n` +
    `• Scheduled messages: ${settings.scheduleEnabled ? 'ON' : 'OFF'}\n` +
    `• Curated tips: ${settings.tips.length}\n` +
    `• Active groups: ${activeGroups.size}`,
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
    `📝 /tips — show curated tips\n` +
    `⚙️ /status — bot settings\n\n` +
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
    `• Nudge you to share photos at 10pm 📸\n\n` +
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

// Launch
bot.launch();
console.log('🤖 Korea Trip Bot is running! (with web search + scheduled messages)');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
