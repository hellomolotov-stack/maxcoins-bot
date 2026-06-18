import { Bot, Context, InlineKeyboard } from 'grammy';
import {
  getActiveTasks, getTask, createTask, createSubmission,
  updateSubmission, getSubmission, getPendingSubmissions, deactivateTask,
} from '../../db/tasks';
import { addMaxcoins, getSettings } from '../../db/balance';
import { getSession, setSessionKey, clearSessionKey } from '../../db/session';
import { Settings } from '../../types';
import { childKeyboard, parentKeyboard } from './menus';

export async function showTaskListForChild(ctx: Context) {
  const tasks = await getActiveTasks();
  if (!tasks.length) {
    await ctx.reply('Заданий пока нет. Скоро что-нибудь появится! 😊');
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const task of tasks) {
    keyboard.text(`${task.title} (+${task.reward} 🪙)`, `tasks:view:${task.id}`).row();
  }
  await ctx.reply('📋 *Задания:*', { parse_mode: 'Markdown', reply_markup: keyboard });
}

export async function showAdminTasksPanel(ctx: Context) {
  const tasks = await getActiveTasks();
  const keyboard = new InlineKeyboard().text('➕ Новое задание', 'admin:tasks:new').row();
  if (!tasks.length) {
    await ctx.reply('Заданий пока нет.', { reply_markup: keyboard });
    return;
  }
  let text = '📋 *Активные задания:*\n\n';
  for (const t of tasks) {
    text += `${t.type === 'recurring' ? '🔄' : '1️⃣'} *${t.title}* — ${t.reward} 🪙\n`;
  }
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

export async function showAdminSubmissions(ctx: Context) {
  const subs = await getPendingSubmissions();
  if (!subs.length) {
    await ctx.reply('Нет заданий на проверке ✅');
    return;
  }
  await ctx.reply(`📬 *На проверке: ${subs.length}*`, { parse_mode: 'Markdown' });
  for (const sub of subs) {
    const keyboard = new InlineKeyboard()
      .text('✅ Принять', `review:approve:${sub.id}`)
      .text('🔄 На переделку', `review:reject:${sub.id}`);
    await ctx.api.sendPhoto(ctx.from!.id, sub.photoFileId, {
      caption: `📌 *${sub.taskTitle}*`,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
}

export function registerTaskHandlers(bot: Bot) {

  bot.callbackQuery('tasks:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showTaskListForChild(ctx);
  });

  bot.callbackQuery(/^tasks:view:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const task = await getTask(ctx.match[1]);
    if (!task) { await ctx.reply('Задание не найдено'); return; }
    const typeLabel = task.type === 'recurring' ? '🔄 Повторяющееся' : '1️⃣ Разовое';
    const keyboard = new InlineKeyboard()
      .text('✅ Выполнил!', `tasks:done:${task.id}`).row()
      .text('◀️ К списку', 'tasks:list');
    await ctx.reply(
      `📌 *${task.title}*\n\n${task.description}\n\n💰 Награда: *${task.reward} Макскоинов*\n${typeLabel}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.callbackQuery(/^tasks:done:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'pendingPhoto', ctx.match[1]);
    await ctx.reply('📸 Пришли фото выполнения — я отправлю его родителям на проверку.');
  });

  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = await getSession(userId);
    const taskId = session.pendingPhoto;
    if (!taskId) return;

    await clearSessionKey(userId, 'pendingPhoto');
    const task = await getTask(taskId);
    if (!task) { await ctx.reply('Задание не найдено'); return; }

    const photoFileId = ctx.message.photo.at(-1)!.file_id;
    const submission = await createSubmission({
      taskId, taskTitle: task.title, childId: userId, photoFileId, status: 'pending',
    });

    await ctx.reply('✅ Отправил! Жди, пока родители проверят. 🕐', { reply_markup: childKeyboard });

    const settings = await getSettings() as Settings;
    const keyboard = new InlineKeyboard()
      .text('✅ Принять', `review:approve:${submission.id}`)
      .text('🔄 На переделку', `review:reject:${submission.id}`);

    for (const parentId of settings.parentIds) {
      await ctx.api.sendPhoto(parentId, photoFileId, {
        caption:
          `📬 *${settings.childName} выполнил задание!*\n\n` +
          `📌 ${task.title}\n💰 Награда: ${task.reward} Макскоинов`,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
  });

  bot.callbackQuery(/^review:approve:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Принято!');
    const submission = await getSubmission(ctx.match[1]);
    if (!submission) { await ctx.reply('Не найдено'); return; }

    const task = await getTask(submission.taskId);
    const reward = task?.reward ?? 0;

    await updateSubmission(submission.id, { status: 'approved' });
    const balance = await addMaxcoins(reward);

    if (task?.type === 'once') await deactivateTask(submission.taskId);

    await ctx.editMessageCaption({ caption: `✅ Принято! Начислено ${reward} Макскоинов.` });

    await ctx.api.sendMessage(
      submission.childId,
      `🎉 Родители приняли задание *${submission.taskTitle}*!\n\n` +
      `💰 Ты получил *${reward} Макскоинов*.\n💼 Всего: *${balance.maxcoins}*`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.callbackQuery(/^review:reject:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'pendingReject', ctx.match[1]);
    await ctx.reply('✏️ Напиши комментарий — что нужно переделать:');
  });

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const session = await getSession(userId);

    if (session.pendingReject) {
      const submissionId = session.pendingReject;
      await clearSessionKey(userId, 'pendingReject');
      const submission = await getSubmission(submissionId);
      if (!submission) { await ctx.reply('Не найдено'); return; }
      await updateSubmission(submissionId, { status: 'rejected', comment: ctx.message.text });
      await ctx.reply('✅ Отправил комментарий.', { reply_markup: parentKeyboard });
      await ctx.api.sendMessage(
        submission.childId,
        `🔄 Задание *${submission.taskTitle}* нужно переделать.\n\n💬 Комментарий:\n_${ctx.message.text}_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (session.taskDraft !== undefined) {
      await handleTaskCreationStep(ctx, userId, session.taskDraft);
      return;
    }

    return next();
  });

  bot.callbackQuery('admin:tasks:new', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'taskDraft', {});
    await ctx.reply('📝 *Новое задание*\n\nШаг 1/4: Как называется задание?', { parse_mode: 'Markdown' });
  });

  async function handleTaskCreationStep(
    ctx: Context,
    userId: number,
    draft: { title?: string; description?: string; reward?: number }
  ) {
    const text = (ctx.message as any)?.text as string;

    if (!draft.title) {
      await setSessionKey(userId, 'taskDraft', { ...draft, title: text });
      await ctx.reply('📄 Шаг 2/4: Опиши — что именно нужно сделать:');
      return;
    }
    if (!draft.description) {
      await setSessionKey(userId, 'taskDraft', { ...draft, description: text });
      await ctx.reply('💰 Шаг 3/4: Сколько Макскоинов за выполнение?');
      return;
    }
    if (!draft.reward) {
      const reward = parseInt(text, 10);
      if (isNaN(reward) || reward <= 0) {
        await ctx.reply('Напиши целое число, например: 10');
        return;
      }
      await setSessionKey(userId, 'taskDraft', { ...draft, reward });
      const keyboard = new InlineKeyboard()
        .text('1️⃣ Разовое', 'tasktype:once').row()
        .text('🔄 Каждый день', 'tasktype:recurring');
      await ctx.reply('📅 Шаг 4/4: Задание разовое или повторяется каждый день?', { reply_markup: keyboard });
    }
  }

  bot.callbackQuery(/^tasktype:(once|recurring)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const session = await getSession(userId);
    const draft = session.taskDraft;

    if (!draft?.title || !draft.description || !draft.reward) {
      await ctx.reply('Сессия истекла. Начни создание задания заново — нажми «➕ Новое задание».');
      return;
    }

    const type = ctx.match[1] as 'once' | 'recurring';
    await clearSessionKey(userId, 'taskDraft');

    const task = await createTask({
      title: draft.title,
      description: draft.description,
      reward: draft.reward,
      type,
      recurringSchedule: type === 'recurring' ? 'daily' : undefined,
      active: true,
    });

    const keyboard = new InlineKeyboard()
      .text('➕ Ещё задание', 'admin:tasks:new').row()
      .text('🏠 В меню', 'main:parent');

    await ctx.editMessageText(
      `✅ *Задание создано!*\n\n📌 ${task.title}\n${task.description}\n` +
      `💰 ${task.reward} Макскоинов · ${type === 'recurring' ? '🔄 каждый день' : '1️⃣ разовое'}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.callbackQuery('admin:tasks', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAdminTasksPanel(ctx);
  });

  bot.callbackQuery('admin:submissions', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAdminSubmissions(ctx);
  });
}
