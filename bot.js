require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const { TRIP_CONTEXT } = require('./trip-context');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic();

// Store conversation history per chat (group or private)
const conversations = new Map();
const MAX_HISTORY = 50; // keep last 50 messages per chat

function getHistory(chatId) {
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  return conversations.get(chatId);
}

function addMessage(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  // Trim to keep memory bounded
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// Handle text messages
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'Someone';
  const userMessage = `${userName}: ${ctx.message.text}`;

  addMessage(chatId, 'user', userMessage);

  try {
    await ctx.sendChatAction('typing');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: TRIP_CONTEXT,
      messages: getHistory(chatId),
    });

    const reply = response.content[0].text;
    addMessage(chatId, 'assistant', reply);

    await ctx.reply(reply, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error:', err.message);
    // Retry without Markdown if parsing failed
    if (err.message?.includes('parse')) {
      const history = getHistory(chatId);
      const lastAssistant = history[history.length - 1];
      if (lastAssistant?.role === 'assistant') {
        await ctx.reply(lastAssistant.content);
        return;
      }
    }
    await ctx.reply('Sorry, I hit a snag. Try again in a moment.');
  }
});

// Handle photos (signs, menus, etc.)
bot.on('photo', async (ctx) => {
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'Someone';
  const caption = ctx.message.caption || 'What is this?';

  try {
    await ctx.sendChatAction('typing');

    // Get the highest resolution photo
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    // Download the image as base64
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Determine media type from URL
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

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: TRIP_CONTEXT,
      messages: getHistory(chatId),
    });

    const reply = aiResponse.content[0].text;
    addMessage(chatId, 'assistant', reply);

    await ctx.reply(reply, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Photo error:', err.message);
    await ctx.reply('Had trouble with that photo. Try again or describe what you need.');
  }
});

// Handle /start command
bot.start((ctx) => {
  ctx.reply(
    `🇰🇷 *Korea Trip 2026 Bot is live!*\n\n` +
    `I'm your AI travel companion for the trip (Apr 23 - May 4).\n\n` +
    `I can help with:\n` +
    `• Trip planning & daily itinerary\n` +
    `• Restaurant & activity recommendations\n` +
    `• Directions & transportation\n` +
    `• Translating Korean (send me photos of signs/menus!)\n` +
    `• Cultural tips & emergency info\n\n` +
    `Just chat naturally — I know the whole group!`,
    { parse_mode: 'Markdown' }
  );
});

// Handle /plan command - show today's plan
bot.command('plan', async (ctx) => {
  const chatId = ctx.chat.id;
  addMessage(chatId, 'user', 'Show me today\'s plan. What are we doing today?');

  try {
    await ctx.sendChatAction('typing');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: TRIP_CONTEXT,
      messages: getHistory(chatId),
    });

    const reply = response.content[0].text;
    addMessage(chatId, 'assistant', reply);
    await ctx.reply(reply, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Plan error:', err.message);
    await ctx.reply('Couldn\'t load the plan. Try asking me directly.');
  }
});

// Handle /translate command
bot.command('translate', async (ctx) => {
  const text = ctx.message.text.replace('/translate', '').trim();
  if (!text) {
    return ctx.reply('Usage: /translate hello, where is the subway?');
  }

  const chatId = ctx.chat.id;
  addMessage(chatId, 'user', `Translate this to Korean (with pronunciation): "${text}"`);

  try {
    await ctx.sendChatAction('typing');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: TRIP_CONTEXT,
      messages: getHistory(chatId),
    });

    const reply = response.content[0].text;
    addMessage(chatId, 'assistant', reply);
    await ctx.reply(reply, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply('Translation failed. Try again.');
  }
});

// Launch
bot.launch();
console.log('🤖 Korea Trip Bot is running!');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
