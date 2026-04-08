require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');
const { TRIP_CONTEXT } = require('./trip-context');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic();

// Store conversation history per chat (group or private)
const conversations = new Map();
const MAX_HISTORY = 50;

// Track active group chat IDs so we can send proactive messages
const activeGroups = new Set();

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

// Call Claude with web search tool support
async function askClaude(chatId, messages) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: TRIP_CONTEXT,
    tools: [{ type: 'web_search_20250305' }],
    messages,
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

// Handle text messages
bot.on('text', async (ctx) => {
  trackGroup(ctx);
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
    console.error('Error:', err.message);
    await ctx.reply('Sorry, I hit a snag. Try again in a moment.');
  }
});

// Handle photos (signs, menus, etc.)
bot.on('photo', async (ctx) => {
  trackGroup(ctx);
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
    await ctx.reply('Had trouble with that photo. Try again or describe what you need.');
  }
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
