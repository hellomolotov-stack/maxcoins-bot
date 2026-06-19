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
import { ParentInfo } from '../types';

export function createBot() {
  const bot = new Bot(process.env.BOT_TOKEN!);

  // ── /setup ────────────────────────────────────────────────────────────
  bot.command('setup', async (ctx) => {
    const { db } = await import('../db/firebase');
    const userId = ctx.from?.id;
    if (!userId) return;

    // Защита от повторного запуска — если семья уже настроена
    const existing = await db.collection('config').doc('settings').get();
    if (existing.exists && (existing.data()?.parentIds?.length ?? 0) > 0) {
      await ctx.reply(
        '⚠️ *Бот уже настроен!*\n\n' +
        'Для управления семьёй нажми /menu → ⚙️ Настройки → 👨‍👩‍👦 Управление родителями.\n\n' +
        '_Повторный /setup сбросит всю семью. Если это нужно — сначала напиши администратору бота._',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await db.collection('config').doc('settings').set({
      parentIds: [userId],
      parents: [],
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
      `*Шаг 1/3:* Введи Telegram ID ребёнка\n` +
      `_Узнать через_ @userinfobot`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── Pre-auth: присоединение нового родителя ───────────────────────────
  bot.callbackQuery('family:join', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'joinFamily', { step: 'name' });
    await ctx.reply('Как тебя зовут?');
  });

  bot.callbackQuery(/^joinFamily:role:(Мама|Папа)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const role = ctx.match[1] as 'Мама' | 'Папа';
    const userId = ctx.from.id;
    const session = await getSession(userId);
    const name = session.joinFamily?.name;

    if (!name) {
      await ctx.reply('Что-то пошло не так. Нажми /start и попробуй ещё раз.');
      return;
    }
    await clearSessionKey(userId, 'joinFamily');

    const { db } = await import('../db/firebase');
    const snap = await db.collection('config').doc('settings').get();
    const data = snap.data() || {};
    const currentIds: number[] = data.parentIds ?? [];
    const currentParents: ParentInfo[] = data.parents ?? [];

    if (!currentIds.includes(userId)) {
      await db.collection('config').doc('settings').update({
        parentIds: [...currentIds, userId],
        parents: [...currentParents, { id: userId, name, role }],
      });
      for (const pid of currentIds) {
        await ctx.api.sendMessage(
          pid,
          `👋 *${name} (${role}) присоединился к семье!*`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }

    await ctx.reply(
      `✅ Добро пожаловать, *${name}*! Роль: *${role}*`,
      { parse_mode: 'Markdown', reply_markup: parentKeyboard }
    );
    await showParentMenu(ctx);
  });

  bot.callbackQuery(/^parentSetup:role:(Мама|Папа)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const role = ctx.match[1] as 'Мама' | 'Папа';
    const userId = ctx.from.id;
    const session = await getSession(userId);
    const name = session.parentSetup?.name;

    if (!name) {
      await ctx.reply('Что-то пошло не так. Начни заново с /setup');
      return;
    }
    await clearSessionKey(userId, 'parentSetup');

    const { db } = await import('../db/firebase');
    const snap = await db.collection('config').doc('settings').get();
    const data = snap.data() || {};
    const parents: ParentInfo[] = data.parents ?? [];
    const idx = parents.findIndex(p => p.id === userId);
    if (idx >= 0) {
      parents[idx] = { id: userId, name, role };
    } else {
      parents.push({ id: userId, name, role });
    }
    await db.collection('config').doc('settings').update({ parents });

    // Спрашиваем название семьи
    await setSessionKey(userId, 'familyNameInput', true);
    await ctx.reply(
      `✅ *Отлично, ${name}!* Роль: *${role}*\n\n` +
      `Последний шаг: как называется ваша семья?\n_(например: Ивановы, Семья Максима)_`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── Pre-auth: текстовые визарды ──────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();
    const session = await getSession(userId);

    // Если активен post-auth визард — не перехватываем здесь
    if (session.addParentWizard || session.violation) return next();

    // Название семьи (последний шаг /setup или изменение из настроек)
    if (session.familyNameInput) {
      const name = ctx.message.text.trim();
      await clearSessionKey(userId, 'familyNameInput');
      const { db } = await import('../db/firebase');
      await db.collection('config').doc('settings').update({ familyName: name });
      await ctx.reply(
        `✅ Семья названа *«${name}»*!\n\nТеперь всё готово. Попроси ребёнка написать /start.`,
        { parse_mode: 'Markdown', reply_markup: parentKeyboard }
      );
      await showParentMenu(ctx);
      return;
    }

    // Визард: childSetup (после /setup)
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
        await ctx.reply('👶 *Шаг 2/3:* Как зовут ребёнка? (например: Макс)', { parse_mode: 'Markdown' });
        return;
      }

      if (state.step === 'name') {
        const childName = text;
        const childId = state.childId!;
        await clearSessionKey(userId, 'childSetup');
        const { db } = await import('../db/firebase');
        await db.collection('config').doc('settings').update({ childId, childName });
        await setSessionKey(userId, 'parentSetup', { step: 'name' });
        await ctx.reply(
          `✅ *${childName} добавлен!*\n\n*Шаг 3/3:* Как тебя зовут? (например: Иван или Мама)`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    // Визард: addChild
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

    // Визард: parentSetup — имя родителя
    if (session.parentSetup?.step === 'name') {
      const name = ctx.message.text.trim();
      await setSessionKey(userId, 'parentSetup', { step: 'role', name });
      const kb = new InlineKeyboard()
        .text('🩷 Мама', 'parentSetup:role:Мама')
        .text('💙 Папа', 'parentSetup:role:Папа');
      await ctx.reply('Выбери свою роль в семье:', { reply_markup: kb });
      return;
    }

    // Визард: joinFamily — имя нового родителя
    if (session.joinFamily?.step === 'name') {
      const name = ctx.message.text.trim();
      await setSessionKey(userId, 'joinFamily', { step: 'role', name });
      const kb = new InlineKeyboard()
        .text('🩷 Мама', 'joinFamily:role:Мама')
        .text('💙 Папа', 'joinFamily:role:Папа');
      await ctx.reply('Выбери свою роль:', { reply_markup: kb });
      return;
    }

    return next();
  });

  // ── Auth middleware ───────────────────────────────────────────────────
  bot.use(authMiddleware);

  // ── Post-auth: навигация ──────────────────────────────────────────────
  bot.callbackQuery('main:child', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showChildMenu(ctx);
  });

  bot.callbackQuery('main:parent', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showParentMenu(ctx);
  });

  // ── Post-auth: ребёнок → выбор родителя для разговора ────────────────
  bot.callbackQuery(/^talk:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const parentId = parseInt(ctx.match[1], 10);
    const childId = ctx.from.id;
    const settings = await getSettings();
    const parent = settings.parents?.find(p => p.id === parentId);

    const session = await getSession(childId);
    const today = new Date().toISOString().split('T')[0];
    const limits = session.talkLimits ?? {};
    const limKey = String(parentId);
    const limEntry = limits[limKey];
    const currentCount = (limEntry?.date === today) ? limEntry.count : 0;

    if (currentCount >= 3) {
      const role = parent?.role ?? 'родителю';
      await ctx.reply(`На сегодня лимит обращений к ${role} исчерпан (3/3). Попробуй завтра. 🌙`);
      return;
    }

    const newCount = currentCount + 1;
    await setSessionKey(childId, 'talkLimits', {
      ...limits,
      [limKey]: { count: newCount, date: today },
    });

    const emoji = parent?.role === 'Мама' ? '🩷' : '💙';
    const roleLabel = parent?.role ?? 'Родитель';
    const roleAccusative = roleLabel === 'Мама' ? 'маме' : 'папе';
    await ctx.api.sendAnimation(
      parentId,
      GIF.CHILD_WANTS_TALK,
      {
        caption:
          `${emoji} *${settings.childName} хочет поговорить!*\n\n` +
          `Он написал ${roleAccusative}. Найди время его выслушать. 🤍`,
        parse_mode: 'Markdown',
      }
    );

    const suffix = roleLabel === 'Мама' ? 'а' : '';
    await ctx.reply(
      `✅ ${roleLabel} уведомлен${suffix}! (${newCount}/3 на сегодня)`,
      { reply_markup: childKeyboard }
    );
  });

  // ── Post-auth: нарушение — выбор суммы ───────────────────────────────
  bot.callbackQuery(/^viol:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1], 10);

    const session = await getSession(userId);
    const violation = session.violation;
    if (!violation || violation.step !== 'coins') {
      await ctx.reply('Нарушение не найдено. Нажми «⚠️ Нарушение» заново.');
      return;
    }
    await clearSessionKey(userId, 'violation');

    const settings = await getSettings();
    const newBalance = await spendMaxcoins(amount);

    const descLine = violation.text
      ? `Произошло нарушение: ${violation.text}\n\n`
      : '';
    const caption =
      `⚠️ У тебя списано *${amount} Макскоинов*.\n\n` +
      descLine +
      `В следующий раз будь внимательней. А сейчас – исправь ситуацию и больше не повторяй её.`;

    if (violation.photoFileId) {
      await ctx.api.sendPhoto(settings.childId, violation.photoFileId, {
        caption, parse_mode: 'Markdown',
      });
    } else {
      await ctx.api.sendAnimation(settings.childId, GIF.GRUMPY, {
        caption, parse_mode: 'Markdown',
      });
    }

    await ctx.editMessageText(
      `✅ Нарушение оформлено. Списано *${amount} Макскоинов*.\n💰 У ${settings.childName}: ${newBalance.maxcoins}`,
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard() }
    );
  });

  // ── Post-auth: настройки родителей ───────────────────────────────────
  bot.callbackQuery('settings:parents', async (ctx) => {
    await ctx.answerCallbackQuery();
    const settings = await getSettings();

    const parents = settings.parents?.length > 0
      ? settings.parents
      : settings.parentIds.map(id => ({ id, name: `ID: ${id}`, role: '' as '' }));

    const keyboard = new InlineKeyboard();
    for (const p of parents) {
      const emoji = p.role === 'Мама' ? '🩷' : p.role === 'Папа' ? '💙' : '👤';
      keyboard.text(`${emoji} ${p.name || p.role || 'Родитель'} — роль`, `settings:role:${p.id}`).row();
    }
    keyboard.text('➕ Добавить родителя', 'settings:add_parent').row()
            .text('◀️ Назад', 'admin:settings');

    await ctx.reply('👨‍👩‍👦 *Управление родителями:*', { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  bot.callbackQuery(/^settings:role:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(ctx.match[1], 10);
    const settings = await getSettings();
    const p = settings.parents?.find(x => x.id === targetId);
    const label = p?.name || p?.role || `ID: ${targetId}`;

    const kb = new InlineKeyboard()
      .text('🩷 Мама', `settings:setrole:${targetId}:Мама`)
      .text('💙 Папа', `settings:setrole:${targetId}:Папа`);
    await ctx.reply(`Роль для *${label}*:`, { parse_mode: 'Markdown', reply_markup: kb });
  });

  bot.callbackQuery(/^settings:setrole:(\d+):(Мама|Папа)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Сохранено!');
    const targetId = parseInt(ctx.match[1], 10);
    const role = ctx.match[2] as 'Мама' | 'Папа';

    const { db } = await import('../db/firebase');
    const snap = await db.collection('config').doc('settings').get();
    const data = snap.data() || {};
    const parents: ParentInfo[] = data.parents ?? [];
    const idx = parents.findIndex(p => p.id === targetId);
    if (idx >= 0) {
      parents[idx] = { ...parents[idx], role };
    } else {
      parents.push({ id: targetId, name: '', role });
    }
    await db.collection('config').doc('settings').update({ parents });
    await ctx.reply(`✅ Роль назначена: *${role}*`, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('settings:add_parent', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    // Сбрасываем устаревшие pre-auth сессии, чтобы избежать конфликта
    await clearSessionKey(userId, 'childSetup');
    await clearSessionKey(userId, 'addChild');
    await clearSessionKey(userId, 'familyNameInput');
    await setSessionKey(userId, 'addParentWizard', { step: 'id' });
    await ctx.reply(
      '👤 *Добавление родителя*\n\nШаг 1/3: Введи Telegram ID нового родителя\n_Узнать через_ @userinfobot',
      { parse_mode: 'Markdown' }
    );
  });

  bot.callbackQuery('settings:family_name', async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearSessionKey(ctx.from.id, 'addParentWizard');
    await setSessionKey(ctx.from.id, 'familyNameInput', true);
    await ctx.reply('📝 Как называется ваша семья? (например: Ивановы)');
  });

  bot.callbackQuery(/^settings:newparent:(\d+):(Мама|Папа)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const newParentId = parseInt(ctx.match[1], 10);
    const role = ctx.match[2] as 'Мама' | 'Папа';
    const userId = ctx.from.id;
    const session = await getSession(userId);
    const name = session.addParentWizard?.name ?? 'Родитель';
    await clearSessionKey(userId, 'addParentWizard');

    const { db } = await import('../db/firebase');
    const snap = await db.collection('config').doc('settings').get();
    const data = snap.data() || {};
    const currentIds: number[] = data.parentIds ?? [];
    const currentParents: ParentInfo[] = data.parents ?? [];

    if (!currentIds.includes(newParentId)) {
      await db.collection('config').doc('settings').update({
        parentIds: [...currentIds, newParentId],
        parents: [...currentParents, { id: newParentId, name, role }],
      });
    }
    await ctx.reply(
      `✅ *${name} (${role})* добавлен!\n\nID: ${newParentId}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── Post-auth: /start, /menu ──────────────────────────────────────────
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

  // ── Post-auth: роутинг кнопок клавиатуры ─────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const role = (ctx as any).userRole as string | undefined;
    const text = ctx.message.text;

    if (role === 'child') {
      if (text === '⚖️ Весы') { await showChildMenu(ctx); return; }
      if (text === '📋 Задания') { await showTaskListForChild(ctx); return; }
      if (text === '🌟 Хотелки') { await showWishesForChild(ctx); return; }
      if (text === '➕ Предложить хотелку') {
        await startWishProposal(ctx.from.id);
        await ctx.reply('✨ *Новая хотелка*\n\nШаг 1/2: Что ты хочешь? Напиши название:', { parse_mode: 'Markdown' });
        return;
      }
      if (text === '🙏🏻 Важно поговорить') {
        const settings = await getSettings();
        const parents = (settings.parents ?? []).filter(p => p.role);

        if (!parents.length) {
          for (const pid of settings.parentIds) {
            await ctx.api.sendAnimation(pid, GIF.CHILD_WANTS_TALK, {
              caption: `🙏🏻 *${settings.childName} хочет поговорить!*\n\nНайди время его выслушать.`,
              parse_mode: 'Markdown',
            });
          }
          await ctx.reply('✅ Родители уведомлены! Скоро поговорят с тобой 🤗');
          return;
        }

        const keyboard = new InlineKeyboard();
        for (const p of parents) {
          const emoji = p.role === 'Мама' ? '🩷' : '💙';
          keyboard.text(`${emoji} ${p.role}`, `talk:${p.id}`).row();
        }
        await ctx.reply('К кому хочешь обратиться?', { reply_markup: keyboard });
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
        if (!settings?.childId) { await ctx.reply('⚠️ Ребёнок не добавлен в бот.'); return; }
        const newBalance = await spendMaxcoins(5);
        await ctx.api.sendAnimation(
          settings.childId,
          GIF.DISTRACTION,
          {
            caption:
              `⚖️ Ты потерял 5 Максокинов за отвлечение.\n\n` +
              `В следующий раз:\n` +
              `1. Убедись, что родитель не говорил тебе, что будет занят.\n` +
              `2. Если не говорил, молча подойди к нему, посмотри издалека и убедись, что родитель не занят. ` +
              `Если он занят – он нажмёт кнопку «‼️ Отвлечение ‼️» и это повлияет на твои весы.\n\n` +
              `Если же у тебя что-то срочное, в следующий раз прежде, чем подойти нажми кнопку «🙏🏻 Важно поговорить»`,
          }
        );
        await ctx.reply(`✅ Списано 5 Макскоинов.\n💰 У ${settings.childName}: ${newBalance.maxcoins} монет`);
        return;
      }
      if (text === '⚠️ Нарушение') {
        await setSessionKey(ctx.from!.id, 'violation', { step: 'description' });
        await ctx.reply(
          '⚠️ *Нарушение*\n\nОпиши, что произошло.\n_Можно прислать текст, фото или фото с подписью._',
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    return next();
  });

  // ── Post-auth: /addchild ──────────────────────────────────────────────
  bot.command('addchild', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const args = ctx.message?.text?.split(' ');

    if (args && args.length >= 2) {
      const childId = parseInt(args[1], 10);
      const childName = args[2] ?? 'Ребёнок';
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

  // ── Post-auth: /addparent (legacy) ────────────────────────────────────
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

    const snap = await db.collection('config').doc('settings').get();
    const data = snap.data() || {};
    const currentIds: number[] = data.parentIds ?? [];
    if (!currentIds.includes(parentId)) {
      await db.collection('config').doc('settings').update({
        parentIds: [...currentIds, parentId],
      });
    }
    await ctx.reply(`✅ Родитель добавлен! ID: ${parentId}`);
  });

  // ── Post-auth: настройки ──────────────────────────────────────────────
  bot.callbackQuery('admin:settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const settings = await getSettings();

    const familyHeader = settings.familyName
      ? `🏠 *Семья «${settings.familyName}»*`
      : `🏠 *Семья* _(название не задано)_`;

    const members: string[] = [];
    members.push(`👶 ${settings.childName} — ребёнок`);

    const parents = settings.parents?.length > 0
      ? settings.parents
      : settings.parentIds.map(id => ({ id, name: `ID: ${id}`, role: '' as '' }));

    for (const p of parents) {
      const emoji = p.role === 'Мама' ? '🩷' : p.role === 'Папа' ? '💙' : '👤';
      const roleStr = p.role || 'роль не задана';
      members.push(`${emoji} ${p.name || `ID: ${p.id}`} — ${roleStr}`);
    }

    const keyboard = new InlineKeyboard()
      .text('📝 Название семьи', 'settings:family_name').row()
      .text('👶 Сменить ребёнка', 'settings:change_child').row()
      .text('👨‍👩‍👦 Управление родителями', 'settings:parents').row()
      .text('🏠 В меню', 'main:parent');

    await ctx.reply(
      `${familyHeader}\n\n` +
      `👨‍👩‍👦 *Состав семьи:*\n${members.join('\n')}\n\n` +
      `📉 Дрейф: ${settings.dailyDrift} очков/день`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.callbackQuery('settings:change_child', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'addChild', { step: 'id' });
    await ctx.reply('👶 Введи новый Telegram ID ребёнка\n_Узнать через_ @userinfobot', { parse_mode: 'Markdown' });
  });

  // ── Post-auth: нарушение — текст ─────────────────────────────────────
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    let session;
    try {
      session = await getSession(userId);
    } catch (e: any) {
      await ctx.reply(`⚠️ Ошибка сессии: ${e?.message}`);
      return;
    }

    // Визард: addParentWizard
    if (session.addParentWizard) {
      const state = session.addParentWizard;
      const text = ctx.message.text.trim();

      if (state.step === 'id') {
        const newPId = parseInt(text, 10);
        if (isNaN(newPId) || newPId <= 0) {
          await ctx.reply('Введи числовой Telegram ID, например: `123456789`', { parse_mode: 'Markdown' });
          return;
        }
        await setSessionKey(userId, 'addParentWizard', { step: 'name', parentId: newPId });
        await ctx.reply('👤 Шаг 2/3: Как зовут нового родителя?');
        return;
      }

      if (state.step === 'name') {
        const name = text;
        await setSessionKey(userId, 'addParentWizard', { step: 'role', parentId: state.parentId, name });
        const kb = new InlineKeyboard()
          .text('🩷 Мама', `settings:newparent:${state.parentId}:Мама`)
          .text('💙 Папа', `settings:newparent:${state.parentId}:Папа`);
        await ctx.reply('👤 Шаг 3/3: Выбери роль:', { reply_markup: kb });
        return;
      }

      return next();
    }

    // Нарушение — описание текстом
    if (session.violation?.step === 'description') {
      await setSessionKey(userId, 'violation', { step: 'coins', text: ctx.message.text });
      const kb = new InlineKeyboard()
        .text('−5', 'viol:5').text('−10', 'viol:10').text('−20', 'viol:20').row()
        .text('−30', 'viol:30').text('−50', 'viol:50').text('−100', 'viol:100');
      await ctx.reply('Сколько Макскоинов списать?', { reply_markup: kb });
      return;
    }

    return next();
  });

  // ── Post-auth: нарушение — фото ───────────────────────────────────────
  bot.on('message:photo', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    let session;
    try {
      session = await getSession(userId);
    } catch { return next(); }

    if (session.violation?.step !== 'description') return next();

    const photoFileId = ctx.message.photo.at(-1)!.file_id;
    const text = ctx.message.caption ?? '';
    await setSessionKey(userId, 'violation', { step: 'coins', text, photoFileId });

    const kb = new InlineKeyboard()
      .text('−5', 'viol:5').text('−10', 'viol:10').text('−20', 'viol:20').row()
      .text('−30', 'viol:30').text('−50', 'viol:50').text('−100', 'viol:100');
    await ctx.reply('Сколько Макскоинов списать?', { reply_markup: kb });
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
