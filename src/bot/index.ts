import { Bot, InlineKeyboard } from 'grammy';
import { authMiddleware } from './middleware/auth';
import {
  showChildMenu, showParentMenu, childKeyboard, parentKeyboard,
} from './handlers/menus';
import {
  registerTaskHandlers, showTaskListForChild, showAdminTasksPanel, showAdminSubmissions,
} from './handlers/tasks';
import {
  registerWishHandlers, showWishesForChild, showAdminWishesPanel, startWishProposal,
} from './handlers/wishes';
import { getSession, setSessionKey, clearSessionKey, createTaskDraft } from '../db/session';
import { spendMaxcoins, getSettings } from '../db/balance';
import { GIF } from './gifs';

export function createBot() {
  const bot = new Bot(process.env.BOT_TOKEN!);

  // /setup — регистрируется ДО authMiddleware (бот ещё не настроен)
  bot.command('setup', async (ctx) => {
    const { db } = await import('../db/firebase');
    const userId = ctx.from?.id;
    if (!userId) return;

    await db.collection('config').doc('settings').set({
      parentIds: [userId],
      childId: 0,
      childName: 'Ребёнок',
      dailyDrift: 10,
    });

    await db.collection('config').doc('balance').set({
      value: 0,
      maxcoins: 0,
      lastDriftAt: new Date(),
    });

    await setSessionKey(userId, 'childSetup', { step: 'id' });

    await ctx.reply(
      `✅ *Бот настроен!* Ты добавлен как родитель.\n\n` +
      `Теперь добавим ребёнка.\n\n` +
      `*Шаг 1/2:* Введи Telegram ID ребёнка\n` +
      `_Его можно узнать: попроси ребёнка написать_ @userinfobot`,
      { parse_mode: 'Markdown' }
    );
  });

  // Обработка текстов ДО authMiddleware — визарды setup и addchild
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const session = await getSession(userId);

    // Визард первичной настройки (после /setup)
    if (session.childSetup) {
      const state = session.childSetup;
      const text = ctx.message.text.trim();

      if (state.step === 'id') {
        const childId = parseInt(text, 10);
        if (isNaN(childId) || childId <= 0) {
          await ctx.reply(
            'Не похоже на Telegram ID 🤔\n\nВведи числовой ID, например: `6603463762`\n\n_Узнать через_ @userinfobot',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        await setSessionKey(userId, 'childSetup', { step: 'name', childId });
        await ctx.reply('👶 *Шаг 2/2:* Как зовут ребёнка? (например: Макс)', { parse_mode: 'Markdown' });
        return;
      }

      if (state.step === 'name') {
        const childName = text;
        const childId = state.childId!;
        await clearSessionKey(userId, 'childSetup');
        const { db } = await import('../db/firebase');
        await db.collection('config').doc('settings').update({ childId, childName });
        await ctx.reply(
          `✅ *${childName} добавлен!*\n\nБот полностью готов к работе.\nПопроси ${childName} написать /start этому боту.`,
          { parse_mode: 'Markdown', reply_markup: parentKeyboard }
        );
        await showParentMenu(ctx);
        return;
      }
    }

    // Визард добавления ребёнка (после /addchild без аргументов)
    if (session.addChild) {
      const state = session.addChild;
      const text = ctx.message.text.trim();

      if (state.step === 'id') {
        const childId = parseInt(text, 10);
        if (isNaN(childId) || childId <= 0) {
          await ctx.reply('Введи числовой Telegram ID, например: `6603463762`', { parse_mode: 'Markdown' });
          return;
        }
        await setSessionKey(userId, 'addChild', { step: 'name', childId });
        await ctx.reply('👶 Как зовут ребёнка?');
        return;
      }

      if (state.step === 'name') {
        const childName = text;
        const childId = state.childId!;
        await clearSessionKey(userId, 'addChild');
        const { db } = await import('../db/firebase');
        await db.collection('config').doc('settings').update({ childId, childName });
        await ctx.reply(`✅ *${childName} добавлен!* ID: ${childId}`, { parse_mode: 'Markdown' });
        await showParentMenu(ctx);
        return;
      }
    }

    return next();
  });

  // Далее все обработчики работают через authMiddleware
  bot.use(authMiddleware);

  // "В меню" — кнопки возврата
  bot.callbackQuery('main:child', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showChildMenu(ctx);
  });

  bot.callbackQuery('main:parent', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showParentMenu(ctx);
  });

  // /start и /menu — всегда показывают главное меню
  bot.command(['start', 'menu'], async (ctx) => {
    const role = (ctx as any).userRole;
    if (role === 'child') {
      await ctx.replyWithAnimation(GIF.WELCOME, { caption: '👋 Привет! Вот твои весы:' });
      await showChildMenu(ctx);
    } else {
      await ctx.replyWithAnimation(GIF.WELCOME, { caption: '👋 Панель родителей:' });
      await showParentMenu(ctx);
    }
  });

  // Роутинг постоянной клавиатуры
  bot.on('message:text', async (ctx, next) => {
    const role = (ctx as any).userRole as string | undefined;
    const text = ctx.message.text;

    if (role === 'child') {
      if (text === '⚖️ Весы') { await showChildMenu(ctx); return; }
      if (text === '📋 Задания') { await showTaskListForChild(ctx); return; }
      if (text === '🌟 Хотелки') { await showWishesForChild(ctx); return; }
      if (text === '➕ Предложить хотелку') {
        await startWishProposal(ctx.from.id);
        await ctx.reply(
          '✨ *Новая хотелка*\n\nШаг 1/2: Что ты хочешь? Напиши название:',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      if (text === '🙏🏻 Важно поговорить') {
        const settings = await getSettings();
        for (const parentId of settings.parentIds) {
          await ctx.api.sendAnimation(
            parentId,
            GIF.CHILD_WANTS_TALK,
            {
              caption: `🙏🏻 *${settings.childName} хочет поговорить!*\n\nОн нажал кнопку «Важно поговорить». Найди время его выслушать.`,
              parse_mode: 'Markdown',
            }
          );
        }
        await ctx.reply('✅ Родители уведомлены! Скоро поговорят с тобой 🤗');
        return;
      }
    }

    if (role === 'parent') {
      if (text === '📊 Статус') { await showParentMenu(ctx); return; }
      if (text === '📋 Задания') { await showAdminTasksPanel(ctx); return; }
      if (text === '✅ На проверке') { await showAdminSubmissions(ctx); return; }
      if (text === '🌟 Хотелки') { await showAdminWishesPanel(ctx); return; }
      if (text === '➕ Добавить задание') {
        await createTaskDraft(ctx.from!.id);
        await ctx.reply('📝 *Новое задание*\n\nШаг 1/4: Как называется задание?', { parse_mode: 'Markdown' });
        return;
      }
      if (text === '‼️ Отвлечение ‼️') {
        const settings = await getSettings();
        if (!settings?.childId) {
          await ctx.reply('⚠️ Ребёнок не добавлен в бот.');
          return;
        }
        const newBalance = await spendMaxcoins(5);
        await ctx.api.sendAnimation(
          settings.childId,
          GIF.DISTRACTION,
          {
            caption:
              `⚖️ Ты потерял 5 Максокинов за отвлечение.\n\n` +
              `В следующий раз:\n` +
              `1. Убедись, что родитель не говорил тебе, что будет занят.\n` +
              `2. Если не говорил, молча подойди к нему, посмотри издалека и убедись, что родитель не занят. Если он занят – он нажмёт кнопку «‼️ Отвлечение ‼️» и это повлияет на твои весы.\n\n` +
              `Если же у тебя что-то срочное, и ты хочешь отвлечь его от работы, в следующий раз прежде, чем подойти нажми кнопку «🙏🏻 Важно поговорить»`,
          }
        );
        await ctx.reply(`✅ Списано 5 Макскоинов.\n💰 У ${settings.childName}: ${newBalance.maxcoins} монет`);
        return;
      }
    }

    return next();
  });

  // /addchild — с визардом если нет аргументов
  bot.command('addchild', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const args = ctx.message?.text?.split(' ');

    if (args && args.length >= 2) {
      const childId = parseInt(args[1], 10);
      const childName = args[2] ?? 'Макс';
      if (!isNaN(childId) && childId > 0) {
        const { db } = await import('../db/firebase');
        await db.collection('config').doc('settings').update({ childId, childName });
        await ctx.reply(`✅ *${childName} добавлен!* ID: ${childId}`, { parse_mode: 'Markdown' });
        await showParentMenu(ctx);
        return;
      }
    }

    await setSessionKey(userId, 'addChild', { step: 'id' });
    await ctx.reply(
      `👶 *Добавление ребёнка*\n\n*Шаг 1/2:* Введи Telegram ID ребёнка\n_Узнать через_ @userinfobot`,
      { parse_mode: 'Markdown' }
    );
  });

  // /addparent
  bot.command('addparent', async (ctx) => {
    const { db } = await import('../db/firebase');
    const args = ctx.message?.text?.split(' ');
    const parentId = args?.[1] ? parseInt(args[1], 10) : null;

    if (!parentId || isNaN(parentId)) {
      await ctx.reply(
        'Использование: `/addparent <telegram_id>`\n_ID узнать через_ @userinfobot',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Читаем текущий список и добавляем
    const snap = await db.collection('config').doc('settings').get();
    const currentIds: number[] = snap.data()?.parentIds ?? [];
    if (!currentIds.includes(parentId)) {
      await db.collection('config').doc('settings').update({
        parentIds: [...currentIds, parentId],
      });
    }

    await ctx.reply(`✅ Родитель добавлен! ID: ${parentId}`);
  });

  // Настройки
  bot.callbackQuery('admin:settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const { getSettings } = await import('../db/balance');
    const settings = await getSettings();
    const keyboard = new InlineKeyboard()
      .text('👶 Сменить ребёнка', 'settings:change_child').row()
      .text('🏠 В меню', 'main:parent');
    await ctx.reply(
      `⚙️ *Настройки*\n\n` +
      `👶 Ребёнок: ${settings.childName} (ID: ${settings.childId})\n` +
      `👨‍👩‍👦 Родителей: ${settings.parentIds.length}\n` +
      `📉 Дрейф: ${settings.dailyDrift} очков/день`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.callbackQuery('settings:change_child', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    await setSessionKey(userId, 'addChild', { step: 'id' });
    await ctx.reply(
      '👶 Введи новый Telegram ID ребёнка\n_Узнать через_ @userinfobot',
      { parse_mode: 'Markdown' }
    );
  });

  registerTaskHandlers(bot);
  registerWishHandlers(bot);

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error('grammY error:', err.error);
    ctx.reply(`⚠️ Внутренняя ошибка: ${String(err.error)}`).catch(() => {});
  });

  return bot;
}
