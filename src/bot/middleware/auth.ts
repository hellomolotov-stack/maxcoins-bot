import { Context, NextFunction } from 'grammy';
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
    await ctx.reply('Тебя нет в списке пользователей. Попроси родителей добавить тебя.');
    return;
  }

  (ctx as any).userRole = isParent ? 'parent' : 'child';
  (ctx as any).settings = settings;

  await next();
}
