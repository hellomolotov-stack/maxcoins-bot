import { Bot, InlineKeyboard } from 'grammy';
import { createWish, getWishes, getWish, updateWishStatus } from '../../db/wishes';
import { spendMaxcoins, getBalance, getSettings } from '../../db/balance';
import { Settings } from '../../types';

const pendingWishProposal = new Map<number, Partial<{ title: string; cost: number }>>();

export function registerWishHandlers(bot: Bot) {

  // ребёнок смотрит одобренные хотелки
  bot.callbackQuery('wishes:my', async (ctx) => {
    await ctx.answerCallbackQuery();
    const balance = await getBalance();
    const wishes = await getWishes('approved');

    if (!wishes.length) {
      await ctx.reply('Одобренных хотелок пока нет. Предложи что-нибудь!');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const wish of wishes) {
      const canAfford = balance.maxcoins >= wish.cost;
      keyboard.text(
        `${canAfford ? '✅' : '🔒'} ${wish.title} — ${wish.cost} 🪙`,
        `wishes:spend:${wish.id}`
      ).row();
    }

    await ctx.reply(
      `🌟 *Твои хотелки*\n\n💰 У тебя ${balance.maxcoins} Макскоинов\n\nВыбери, на что потратить:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // ребёнок тратит монетки на хотелку
  bot.callbackQuery(/^wishes:spend:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wish = await getWish(ctx.match[1]);
    if (!wish || wish.status !== 'approved') { await ctx.reply('Хотелка недоступна'); return; }

    const balance = await getBalance();
    if (balance.maxcoins < wish.cost) {
      await ctx.reply(`Не хватает монеток 😔\nНужно ${wish.cost}, у тебя ${balance.maxcoins}.`);
      return;
    }

    await updateWishStatus(wish.id, 'redeemed');
    const newBalance = await spendMaxcoins(wish.cost);

    await ctx.reply(
      `🎁 Ты активировал хотелку *${wish.title}*!\n\n` +
      `Потрачено: ${wish.cost} 🪙\n` +
      `Осталось: ${newBalance.maxcoins} 🪙\n\n` +
      `Родители скоро исполнят!`,
      { parse_mode: 'Markdown' }
    );

    const settings = await getSettings() as Settings;
    for (const parentId of settings.parentIds) {
      await ctx.api.sendMessage(
        parentId,
        `🎁 *Макс хочет исполнить хотелку!*\n\n` +
        `✨ ${wish.title}\n` +
        `💰 Потрачено: ${wish.cost} Макскоинов\n` +
        `💼 Осталось монеток: ${newBalance.maxcoins}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // ребёнок предлагает хотелку
  bot.callbackQuery('wishes:propose', async (ctx) => {
    await ctx.answerCallbackQuery();
    pendingWishProposal.set(ctx.from.id, {});
    await ctx.reply('✨ *Новая хотелка*\n\nЧто ты хочешь? Напиши название:', { parse_mode: 'Markdown' });
  });

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !pendingWishProposal.has(userId)) return next();

    const draft = pendingWishProposal.get(userId)!;
    const text = ctx.message.text;

    if (!draft.title) {
      draft.title = text;
      pendingWishProposal.set(userId, draft);
      await ctx.reply('💰 Сколько Макскоинов должна стоить эта хотелка? (напиши число)');
      return;
    }

    if (!draft.cost) {
      const cost = parseInt(text, 10);
      if (isNaN(cost) || cost <= 0) { await ctx.reply('Напиши целое положительное число, например: 50'); return; }
      pendingWishProposal.delete(userId);

      const wish = await createWish({ title: draft.title, cost, proposedBy: userId, status: 'pending' });

      await ctx.reply(
        `✅ Предложил хотелку родителям!\n\n✨ ${wish.title}\n💰 ${wish.cost} Макскоинов\n\nЖди, когда они одобрят.`
      );

      const settings = await getSettings() as Settings;
      const keyboard = new InlineKeyboard()
        .text('✅ Одобрить', `admin:wishes:approve:${wish.id}`)
        .text('❌ Отклонить', `admin:wishes:reject:${wish.id}`);

      for (const parentId of settings.parentIds) {
        await ctx.api.sendMessage(
          parentId,
          `💌 *Макс предложил хотелку!*\n\n✨ ${wish.title}\n💰 Цена: ${wish.cost} Макскоинов`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }
      return;
    }
  });

  // родитель видит список хотелок
  bot.callbackQuery('admin:wishes', async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await getWishes('pending');

    if (!pending.length) {
      await ctx.reply('Нет новых предложений от Макса ✅');
      return;
    }

    for (const wish of pending) {
      const keyboard = new InlineKeyboard()
        .text('✅ Одобрить', `admin:wishes:approve:${wish.id}`)
        .text('❌ Отклонить', `admin:wishes:reject:${wish.id}`);

      await ctx.reply(
        `✨ *${wish.title}*\n💰 Цена: ${wish.cost} Макскоинов`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    }
  });

  bot.callbackQuery(/^admin:wishes:approve:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Одобрено!');
    const wish = await getWish(ctx.match[1]);
    if (!wish) { await ctx.reply('Не найдено'); return; }

    await updateWishStatus(wish.id, 'approved');
    await ctx.editMessageText(
      `✅ Одобрена: *${wish.title}* (${wish.cost} 🪙)`,
      { parse_mode: 'Markdown' }
    );

    const settings = await getSettings() as Settings;
    await ctx.api.sendMessage(
      settings.childId,
      `🎉 Родители одобрили хотелку *${wish.title}*!\n\nНакопи ${wish.cost} Макскоинов и она станет доступна.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.callbackQuery(/^admin:wishes:reject:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Отклонено');
    const wish = await getWish(ctx.match[1]);
    if (!wish) { await ctx.reply('Не найдено'); return; }

    await updateWishStatus(wish.id, 'rejected');
    await ctx.editMessageText(`❌ Отклонена: ${wish.title}`, { parse_mode: 'Markdown' });

    const settings = await getSettings() as Settings;
    await ctx.api.sendMessage(
      settings.childId,
      `😔 Родители пока не одобрили хотелку *${wish.title}*. Попробуй предложить что-то другое.`,
      { parse_mode: 'Markdown' }
    );
  });
}
