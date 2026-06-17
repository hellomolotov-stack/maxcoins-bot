import { Bot } from 'grammy';
import { authMiddleware } from './middleware/auth';
import { showChildMenu, showParentMenu } from './handlers/menus';
import { registerTaskHandlers } from './handlers/tasks';
import { registerWishHandlers } from './handlers/wishes';

export function createBot() {
  const bot = new Bot(process.env.BOT_TOKEN!);

  // /setup должен работать до authMiddleware (бот ещё не настроен)
  bot.command('setup', async (ctx) => {
    const { db } = await import('../db/firebase');
    const userId = ctx.from?.id;
    if (!userId) return;

    await db.collection('config').doc('settings').set({
      parentIds: [userId],
      childId: 0,
      childName: 'Макс',
      dailyDrift: 10,
    });

    await db.collection('config').doc('balance').set({
      value: 0,
      maxcoins: 0,
      lastDriftAt: new Date(),
    });

    await ctx.reply(
      `✅ Бот настроен!\n\nТы добавлен как родитель.\n\n` +
      `Для добавления ребёнка используй /addchild\n` +
      `Для добавления второго родителя используй /addparent`
    );
  });

  bot.use(authMiddleware);

  bot.command('start', async (ctx) => {
    const role = (ctx as any).userRole;
    if (role === 'child') {
      await showChildMenu(ctx);
    } else {
      await showParentMenu(ctx);
    }
  });

  bot.command('menu', async (ctx) => {
    const role = (ctx as any).userRole;
    if (role === 'child') {
      await showChildMenu(ctx);
    } else {
      await showParentMenu(ctx);
    }
  });

  bot.command('addchild', async (ctx) => {
    const { db } = await import('../db/firebase');
    const args = ctx.message?.text?.split(' ');
    const childId = args?.[1] ? parseInt(args[1], 10) : null;
    const childName = args?.[2] ?? 'Макс';

    if (!childId) {
      await ctx.reply('Использование: /addchild <telegram_id> <имя>\n\nID можно узнать через @userinfobot');
      return;
    }

    await db.collection('config').doc('settings').update({ childId, childName });
    await ctx.reply(`✅ Ребёнок добавлен! ID: ${childId}, имя: ${childName}`);
  });

  bot.command('addparent', async (ctx) => {
    const { db } = await import('../db/firebase');
    const { admin } = await import('../db/firebase').then(m => ({ admin: require('firebase-admin') }));
    const args = ctx.message?.text?.split(' ');
    const parentId = args?.[1] ? parseInt(args[1], 10) : null;

    if (!parentId) {
      await ctx.reply('Использование: /addparent <telegram_id>');
      return;
    }

    await db.collection('config').doc('settings').update({
      parentIds: admin.firestore.FieldValue.arrayUnion(parentId),
    });
    await ctx.reply(`✅ Родитель добавлен! ID: ${parentId}`);
  });

  bot.callbackQuery('admin:settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const { getSettings } = await import('../db/balance');
    const settings = await getSettings();
    await ctx.reply(
      `⚙️ *Настройки*\n\n` +
      `👶 Ребёнок: ${settings.childName} (ID: ${settings.childId})\n` +
      `👨‍👩‍👦 Родители: ${settings.parentIds.join(', ')}\n` +
      `📉 Ежедневный дрейф: ${settings.dailyDrift} очков`,
      { parse_mode: 'Markdown' }
    );
  });

  registerTaskHandlers(bot);
  registerWishHandlers(bot);

  return bot;
}

