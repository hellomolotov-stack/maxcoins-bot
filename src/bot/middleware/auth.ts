import { Context, NextFunction, InlineKeyboard } from 'grammy';
import { getSettings } from '../../db/balance';

export async function authMiddleware(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;
  if (!userId) return;

  let settings;
  try {
    settings = await getSettings();
  } catch {
    settings = null;
  }

  if (!settings || !settings.parentIds) {
    await ctx.reply('Бот ещё не настроен. Запусти /setup');
    return;
  }

  const isParent = settings.parentIds.includes(userId);
  const isChild = userId === settings.childId;

  if (!isParent && !isChild) {
    const knownParents = (settings.parents ?? []).filter(p => p.name || p.role);
    const parentsText = knownParents.length > 0
      ? knownParents.map(p => {
          const emoji = p.role === 'Мама' ? '🩷' : p.role === 'Папа' ? '💙' : '👤';
          return `${emoji} ${p.name || p.role}`;
        }).join(', ')
      : `${settings.parentIds.length} родит.`;

    const keyboard = new InlineKeyboard()
      .text('✅ Присоединиться как родитель', 'family:join');

    await ctx.reply(
      `👨‍👩‍👦 *Семья ${settings.childName}*\n\n` +
      `👶 Ребёнок: *${settings.childName}*\n` +
      `👤 Родители: ${parentsText}\n\n` +
      `Если ты родитель этой семьи — нажми кнопку ниже.`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  (ctx as any).userRole = isParent ? 'parent' : 'child';
  (ctx as any).settings = settings;

  await next();
}
