import { Context, NextFunction } from 'grammy';
import { getSettings } from '../../db/balance';

export async function authMiddleware(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const settings = await getSettings();
  if (!settings) {
    // бот ещё не настроен
    await ctx.reply('Бот ещё не настроен. Попросите родителей запустить /setup');
    return;
  }

  const isParent = settings.parentIds.includes(userId);
  const isChild = userId === settings.childId;

  if (!isParent && !isChild) {
    await ctx.reply('Тебя нет в списке пользователей. Попросите родителей добавить тебя.');
    return;
  }

  // кладём роль в контекст
  (ctx as any).userRole = isParent ? 'parent' : 'child';
  (ctx as any).settings = settings;

  await next();
}
