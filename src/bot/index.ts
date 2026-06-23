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
    if (session.addParentWizard || session.violation || session.taskProposal || session.featureRequest || session.proposalReward) return next();

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
        const session = await getSession(ctx.from.id);
        const today = new Date().toISOString().split('T')[0];
        const limits = session.talkLimits ?? {};

        // Собираем по одной кнопке на каждого родителя из parentIds
        // (даже если у родителя ещё нет роли — выводим как Родитель/Мама/Папа).
        const parentsById = new Map((settings.parents ?? []).map(p => [p.id, p]));
        const seenRoles = new Set<string>();
        const buttons: { id: number; role: 'Мама' | 'Папа' | 'Родитель' }[] = [];
        for (const pid of settings.parentIds) {
          const known = parentsById.get(pid);
          let role: 'Мама' | 'Папа' | 'Родитель' = known?.role || 'Родитель';
          if (role === 'Родитель' && !seenRoles.has('Мама')) role = 'Мама';
          else if (role === 'Родитель' && !seenRoles.has('Папа')) role = 'Папа';
          seenRoles.add(role);
          buttons.push({ id: pid, role });
        }

        if (!buttons.length) {
          await ctx.reply('Родители ещё не настроены в боте.');
          return;
        }

        const keyboard = new InlineKeyboard();
        for (const b of buttons) {
          const limEntry = limits[String(b.id)];
          const usedToday = limEntry?.date === today ? limEntry.count : 0;
          const remaining = Math.max(0, 3 - usedToday);
          const emoji = b.role === 'Мама' ? '🩷' : b.role === 'Папа' ? '💙' : '👤';
          const label = `${emoji} ${b.role} — осталось ${remaining}/3`;
          keyboard.text(label, `talk:${b.id}`).row();
        }
        await ctx.reply(
          'К кому хочешь обратиться?\n_(можно по 3 раза в день каждому)_',
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
        return;
      }
      if (text === '💡 Предложить задание') {
        await setSessionKey(ctx.from.id, 'taskProposal', { step: 'title' });
        await ctx.reply(
          '💡 *Предложить задание*\n\nШаг 1/2: Как называется задание?\n_(например: «Убрать комнату»)_',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      if (text === '💌 Предложить функцию') {
        await setSessionKey(ctx.from.id, 'featureRequest', true);
        await ctx.reply(
          '💌 *Предложить идею*\n\nЧто ты хочешь добавить в бот? Напиши одним сообщением:',
          { parse_mode: 'Markdown' }
        );
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
      if (text === '⚙️ РАБОТА') {
        const settings = await getSettings();
        const me = (settings.parents ?? []).find(p => p.id === ctx.from!.id);
        const kb = new InlineKeyboard();
        if (me?.role === 'Мама' || me?.role === 'Папа') {
          kb.text(`📢 Сообщить как ${me.role}`, `work:${me.role}`);
        } else {
          kb.text('🩷 Мама работает', 'work:Мама')
            .text('💙 Папа работает', 'work:Папа');
        }
        await ctx.reply(
          '⚙️ *РАБОТА*\n\nКем сообщить ребёнку, что сейчас не нужно отвлекать?',
          { parse_mode: 'Markdown', reply_markup: kb }
        );
        return;
      }
      if (text === '⚙️ Кабинет') {
        await ctx.api.sendMessage(ctx.from.id, '⏳ Загружаю кабинет...').catch(() => {});
        const settings = await getSettings();
        const balance = await import('../db/balance').then(m => m.getBalance());
        const { getActiveTasks } = await import('../db/tasks');
        const { getPendingSubmissions } = await import('../db/tasks');
        const { getPendingTaskProposals } = await import('../db/proposals');
        const { getFeatureRequests } = await import('../db/proposals');
        const { getWishes } = await import('../db/wishes');

        const [tasks, subs, proposals, feats, wishes] = await Promise.all([
          getActiveTasks(),
          getPendingSubmissions(),
          getPendingTaskProposals(),
          getFeatureRequests(),
          getWishes('pending'),
        ]);

        const parents = settings.parents?.length > 0
          ? settings.parents.map(p => {
              const e = p.role === 'Мама' ? '🩷' : p.role === 'Папа' ? '💙' : '👤';
              return `${e} ${p.name}`;
            }).join(' + ')
          : `${settings.parentIds.length} родит.`;

        const familyLine = settings.familyName
          ? `🏠 *${settings.familyName}*  •  👶 ${settings.childName}  •  ${parents}`
          : `👶 ${settings.childName}  •  ${parents}`;

        const sign = balance.value > 0 ? '+' : '';
        const statsLines = [
          `📋 Заданий активных: *${tasks.length}*`,
          `✅ На проверке: *${subs.length}*`,
          `🌟 Хотелок на согласование: *${wishes.length}*`,
          `💡 Предложений заданий: *${proposals.length}*`,
          `💌 Идей функций: *${feats.length}*`,
          `⚖️ Баланс весов: *${sign}${balance.value}*  •  💰 *${balance.maxcoins}* монет`,
          `📉 Дрейф: *${settings.dailyDrift}* очков/день`,
        ].join('\n');

        const keyboard = new InlineKeyboard()
          .text('💡 Предложения задания', 'admin:proposals').row()
          .text('💌 Идеи функций', 'admin:feats').row()
          .text('👨‍👩‍👦 Состав семьи', 'admin:settings').row()
          .text('📉 Изменить дрейф', 'admin:drift').row()
          .text('💌 Предложить функцию', 'feat:start').row()
          .text('🏠 В меню', 'main:parent');

        await ctx.reply(
          `⚙️ *КАБИНЕТ*\n\n${familyLine}\n\n${statsLines}`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
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
  bot.callbackQuery(/^work:(Мама|Папа)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Ребёнок уведомлён');
    const role = ctx.match[1] as 'Мама' | 'Папа';
    const settings = await getSettings();
    if (!settings?.childId) {
      await ctx.editMessageText('⚠️ Ребёнок не подключён к боту.').catch(() => {});
      return;
    }

    const emoji = role === 'Мама' ? '🩷' : '💙';
    await ctx.editMessageText(
      `${emoji} Ребёнку отправлено: *${role}* работает.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    await ctx.api.sendAnimation(
      settings.childId,
      GIF.DISTRACTION,
      {
        caption:
          `${emoji} *${role} сейчас работает*\n\n` +
          `Пожалуйста, не отвлекай — займись чем-то самостоятельно.\n` +
          `Если что-то срочное, нажми «🙏🏻 Важно поговорить».`,
        parse_mode: 'Markdown',
      }
    ).catch(() => {});
  });

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

  // ── Post-auth: admin cabinet callbacks ───────────────────────────────────
  bot.callbackQuery('admin:proposals', async (ctx) => {
    await ctx.answerCallbackQuery();
    const { getPendingTaskProposals } = await import('../db/proposals');
    const proposals = await getPendingTaskProposals();

    if (!proposals.length) {
      await ctx.reply('💡 Нет новых предложений заданий от ребёнка ✅');
      return;
    }

    await ctx.reply(`💡 *Предложений заданий: ${proposals.length}*`, { parse_mode: 'Markdown' });
    for (const p of proposals) {
      const kb = new InlineKeyboard()
        .text('✅ Принять', `prop:accept:${p.id}`)
        .text('❌ Отклонить', `prop:reject:${p.id}`);
      const text = p.description
        ? `💡 *${p.title}*\n\n${p.description}`
        : `💡 *${p.title}*`;
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    }
  });

  bot.callbackQuery('admin:feats', async (ctx) => {
    await ctx.answerCallbackQuery();
    const { getFeatureRequests } = await import('../db/proposals');
    const feats = await getFeatureRequests();

    if (!feats.length) {
      await ctx.reply('💌 Идей пока нет ✅');
      return;
    }

    const text = feats.map((f, i) => `${i + 1}. *${f.fromName}:* ${f.text}`).join('\n\n');
    await ctx.reply(`💌 *Идеи функций (${feats.length}):*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('admin:drift', async (ctx) => {
    await ctx.answerCallbackQuery();
    const settings = await getSettings();
    const d = settings.dailyDrift;
    const kb = new InlineKeyboard()
      .text('−10', `drift:set:${Math.max(0, d - 10)}`)
      .text('−5', `drift:set:${Math.max(0, d - 5)}`)
      .text(`сейчас: ${d}`, 'drift:noop')
      .text('+5', `drift:set:${d + 5}`)
      .text('+10', `drift:set:${d + 10}`);
    await ctx.reply(
      `📉 *Дрейф весов*\n\nКаждый день весы сами движутся к ребёнку на *${d}* очков.\nЭто мотивирует ребёнка выполнять задания для поддержания баланса.\n\nИзмени значение:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  bot.callbackQuery('drift:noop', async (ctx) => {
    await ctx.answerCallbackQuery('Это текущее значение');
  });

  bot.callbackQuery(/^drift:set:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Сохранено!');
    const newDrift = parseInt(ctx.match[1], 10);
    const { db } = await import('../db/firebase');
    await db.collection('config').doc('settings').update({ dailyDrift: newDrift });
    const kb = new InlineKeyboard()
      .text('−10', `drift:set:${Math.max(0, newDrift - 10)}`)
      .text('−5', `drift:set:${Math.max(0, newDrift - 5)}`)
      .text(`сейчас: ${newDrift}`, 'drift:noop')
      .text('+5', `drift:set:${newDrift + 5}`)
      .text('+10', `drift:set:${newDrift + 10}`);
    await ctx.editMessageText(
      `📉 *Дрейф весов*\n\nКаждый день весы движутся к ребёнку на *${newDrift}* очков.\n\nИзмени значение:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  bot.callbackQuery(/^prop:accept:(.+)$/, async (ctx) => {
    const proposalId = ctx.match[1];
    const { getTaskProposal, updateTaskProposalStatus } = await import('../db/proposals');
    const proposal = await getTaskProposal(proposalId);
    if (!proposal) { await ctx.answerCallbackQuery('Предложение не найдено'); return; }

    if (proposal.status === 'accepted') {
      await ctx.answerCallbackQuery('Уже принято другим родителем ✅');
      await ctx.editMessageText(
        `✅ *${proposal.title}* — уже принято другим родителем.`,
        { parse_mode: 'Markdown', reply_markup: new InlineKeyboard() }
      ).catch(() => {});
      return;
    }
    if (proposal.status === 'rejected') {
      await ctx.answerCallbackQuery('Предложение уже отклонено');
      await ctx.editMessageText(
        `❌ *${proposal.title}* — уже отклонено.`,
        { parse_mode: 'Markdown', reply_markup: new InlineKeyboard() }
      ).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery('Принято!');
    await updateTaskProposalStatus(proposalId, 'accepted');
    await setSessionKey(ctx.from.id, 'proposalReward', { proposalId, title: proposal.title });
    await ctx.editMessageText(
      `✅ *${proposal.title}* — принято!\n\nУкажи награду (количество Макскоинов):`,
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard() }
    );
  });

  bot.callbackQuery(/^prop:reject:(.+)$/, async (ctx) => {
    const proposalId = ctx.match[1];
    const { getTaskProposal, updateTaskProposalStatus } = await import('../db/proposals');
    const proposal = await getTaskProposal(proposalId);
    if (!proposal) { await ctx.answerCallbackQuery('Предложение не найдено'); return; }

    if (proposal.status === 'accepted') {
      await ctx.answerCallbackQuery('Уже принято другим родителем ✅');
      await ctx.editMessageText(
        `✅ *${proposal.title}* — уже принято другим родителем.`,
        { parse_mode: 'Markdown', reply_markup: new InlineKeyboard() }
      ).catch(() => {});
      return;
    }
    if (proposal.status === 'rejected') {
      await ctx.answerCallbackQuery('Уже отклонено');
      await ctx.editMessageText(
        `❌ *${proposal.title}* — уже отклонено.`,
        { parse_mode: 'Markdown', reply_markup: new InlineKeyboard() }
      ).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery('Отклонено');
    await updateTaskProposalStatus(proposalId, 'rejected');
    await ctx.editMessageText(`❌ *${proposal.title}* — отклонено.`, { parse_mode: 'Markdown' });

    const settings = await getSettings();
    await ctx.api.sendMessage(
      proposal.childId,
      `😔 Родители пока не приняли твоё предложение задания: *${proposal.title}*\n\nПопробуй предложить что-то другое!`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });

  bot.callbackQuery('feat:start', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'featureRequest', true);
    await ctx.reply('💌 Напиши свою идею для бота — что хочешь добавить или улучшить?');
  });

  bot.callbackQuery('proposal:skip_desc', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const session = await getSession(userId);
    const title = session.taskProposal?.title;
    if (!title) { await ctx.reply('Что-то пошло не так. Нажми «💡 Предложить задание» заново.'); return; }
    await clearSessionKey(userId, 'taskProposal');
    await submitTaskProposal(ctx, userId, title, '');
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

    // Награда за принятое предложение задания
    if (session.proposalReward) {
      const reward = parseInt(ctx.message.text.trim(), 10);
      if (isNaN(reward) || reward <= 0) {
        await ctx.reply('Введи целое число больше 0, например: 20');
        return;
      }
      const { proposalId, title } = session.proposalReward;
      await clearSessionKey(userId, 'proposalReward');

      const { getTaskProposal } = await import('../db/proposals');
      const { createTask } = await import('../db/tasks');
      const proposal = await getTaskProposal(proposalId);
      const settings = await getSettings();

      await createTask({
        title,
        description: proposal?.description ?? '',
        reward,
        type: 'once',
        active: true,
      });

      await ctx.reply(`✅ Задание *${title}* добавлено! Награда: ${reward} Макскоинов.`, { parse_mode: 'Markdown' });

      if (proposal?.childId) {
        await ctx.api.sendAnimation(
          proposal.childId,
          GIF.NEW_TASK,
          {
            caption: `🎉 Твоё предложение задания принято!\n\n📌 *${title}*\n💰 Награда: ${reward} Макскоинов`,
            parse_mode: 'Markdown',
          }
        ).catch(() => {});
      }
      return;
    }

    // Предложение задания от ребёнка
    if (session.taskProposal) {
      const state = session.taskProposal;
      const text = ctx.message.text.trim();

      if (state.step === 'title') {
        await setSessionKey(userId, 'taskProposal', { step: 'desc', title: text });
        const kb = new InlineKeyboard().text('⏭ Пропустить описание', 'proposal:skip_desc');
        await ctx.reply(
          `💡 *${text}*\n\nШаг 2/2: Добавь описание (или нажми «Пропустить»):`,
          { parse_mode: 'Markdown', reply_markup: kb }
        );
        return;
      }

      if (state.step === 'desc') {
        const description = text;
        const title = state.title!;
        await clearSessionKey(userId, 'taskProposal');
        await submitTaskProposal(ctx, userId, title, description);
        return;
      }
    }

    // Идея функции
    if (session.featureRequest) {
      await clearSessionKey(userId, 'featureRequest');
      const { createFeatureRequest } = await import('../db/proposals');
      const settings = await getSettings();
      const fromName = ctx.from.first_name ?? 'Пользователь';
      await createFeatureRequest({ text: ctx.message.text, from: userId, fromName });

      await ctx.reply(
        '💌 Спасибо! Идея отправлена. Родители смогут её увидеть в ⚙️ Кабинете.',
        { reply_markup: (ctx as any).userRole === 'child' ? childKeyboard : parentKeyboard }
      );

      // Notify parents
      for (const pid of settings.parentIds) {
        if (pid !== userId) {
          await ctx.api.sendMessage(
            pid,
            `💌 *${fromName}* предложил идею для бота:\n\n${ctx.message.text}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      }
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

  const submitTaskProposal = async (ctx: any, childId: number, title: string, description: string) => {
    const { createTaskProposal } = await import('../db/proposals');
    const settings = await getSettings();
    const proposal = await createTaskProposal({ title, description, childId, status: 'pending' });

    await ctx.reply(
      `✅ Предложение отправлено!\n\n💡 *${title}*\n\nЖди ответа от родителей.`,
      { parse_mode: 'Markdown', reply_markup: childKeyboard }
    );

    const kb = new InlineKeyboard()
      .text('✅ Принять', `prop:accept:${proposal.id}`)
      .text('❌ Отклонить', `prop:reject:${proposal.id}`);

    const msgText = description
      ? `💡 *${settings.childName} предлагает задание:*\n\n*${title}*\n${description}`
      : `💡 *${settings.childName} предлагает задание:*\n\n*${title}*`;

    for (const pid of settings.parentIds) {
      await ctx.api.sendMessage(pid, msgText, { parse_mode: 'Markdown', reply_markup: kb }).catch(() => {});
    }
  };

  registerTaskHandlers(bot);
  registerWishHandlers(bot);

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error('grammY error:', err.error);
    ctx.reply(`⚠️ Внутренняя ошибка: ${String(err.error)}`).catch(() => {});
  });

  return bot;
}
