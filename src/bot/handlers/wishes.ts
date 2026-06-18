import { Bot, Context, InlineKeyboard } from 'grammy';
import { createWish, getWishes, getWish, updateWishStatus } from '../../db/wishes';
import { spendMaxcoins, getBalance, getSettings } from '../../db/balance';
import { Settings } from '../../types';
import { childKeyboard, parentKeyboard } from './menus';

const pendingWishProposal = new Map<number, Partial<{ title: string; cost: number }>>();

export function startWishProposal(userId: number) {
  pendingWishProposal.set(userId, {});
}

export async function showWishesForChild(ctx: Context) {
  const balance = await getBalance();
  const wishes = await getWishes('approved');

  if (!wishes.length) {
    const kb = new InlineKeyboard().text('➕ Предложить хотелку', 'wishes:propose');
    await ctx.reply(
      `🌟 *Хотелки*\n\nОдобренных хотелок пока нет.\nПредложи что-нибудь!`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
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
  keyboard.text('➕ Предложить новую', 'wishes:propose');

  await ctx.reply(
    `🌟 *Хотелки*\n\n💰 У тебя ${balance.maxcoins} Макскоинов\n` +
    `✅ — можешь получить сейчас\n🔒 — не хватает монеток`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

export async function showAdminWishesPanel(ctx: Context) {
  const pending = await getWishes('pending');

  if (!pending.length) {
    await ctx.reply('Нет новых предложений от ребёнка ✅');
    return;
  }

  await ctx.reply(`💌 *Новых предложений: ${pending.length}*`, { parse_mode: 'Markdown' });

  for (const wish of pending) {
    const keyboard = new InlineKeyboard()
      .text('✅ Одобрить', `admin:wishes:approve:${wish.id}`)
      .text('❌ Отклонить', `admin:wishes:reject:${wish.id}`);
    await ctx.reply(
      `✨ *${wish.title}*\n💰 Цена: ${wish.cost} Макскоинов`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }
}

export function registerWishHandlers(bot: Bot) {

  bot.callbackQuery('wishes:my', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWishesForChild(ctx);
  });

  bot.callbackQuery(/^wishes:spend:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wish = await getWish(ctx.match[1]);
    if (!wish || wish.status !== 'approved') { await ctx.reply('Хотелка недоступна'); return; }

    const balance = await getBalance();
    if (balance.maxcoins < wish.cost) {
      await ctx.reply(
        `Не хватает монеток 😔\nНужно ${wish.cost}, у тебя ${balance.maxcoins}.\n\nПродолжай выполнять задания!`
      );
      return;
    }

    await updateWishStatus(wish.id, 'redeemed');
    const newBalance = await spendMaxcoins(wish.cost);

    await ctx.reply(
      `🎁 Ты активировал хотелку *${wish.title}*!\n\n` +
      `Потрачено: ${wish.cost} 🪙\nОсталось: ${newBalance.maxcoins} 🪙\n\n` +
      `Родители скоро исполнят! 🎉`,
      { parse_mode: 'Markdown', reply_markup: childKeyboard }
    );

    const settings = await getSettings() as Settings;
    for (const parentId of settings.parentIds) {
      await ctx.api.sendMessage(
        parentId,
        `🎁 *${settings.childName} активировал хотелку!*\n\n` +
        `✨ ${wish.title}\n💰 Потрачено: ${wish.cost} Макскоинов\n💼 Осталось: ${newBalance.maxcoins}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  bot.callbackQuery('wishes:propose', async (ctx) => {
    await ctx.answerCallbackQuery();
    pendingWishProposal.set(ctx.from.id, {});
    await ctx.reply('✨ *Новая хотелка*\n\nШаг 1/2: Что ты хочешь? Напиши название:', { parse_mode: 'Markdown' });
  });

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !pendingWishProposal.has(userId)) return next();

    const draft = pendingWishProposal.get(userId)!;
    const text = ctx.message.text;

    if (!draft.title) {
      draft.title = text;
      pendingWishProposal.set(userId, draft);
      await ctx.reply('💰 Шаг 2/2: Сколько Макскоинов должна стоить эта хотелка?');
      return;
    }

    if (draft.cost === undefined) {
      const cost = parseInt(text, 10);
      if (isNaN(cost) || cost <= 0) { await ctx.reply('Напиши целое число, например: 50'); return; }
      pendingWishProposal.delete(userId);

      const wish = await createWish({ title: draft.title, cost, proposedBy: userId, status: 'pending' });

      await ctx.reply(
        `✅ Предложение отправлено родителям!\n\n✨ ${wish.title}\n💰 ${wish.cost} Макскоинов\n\nЖди ответа 🙏`,
        { reply_markup: childKeyboard }
      );

      const settings = await getSettings() as Settings;
      const keyboard = new InlineKeyboard()
        .text('✅ Одобрить', `admin:wishes:approve:${wish.id}`)
        .text('❌ Отклонить', `admin:wishes:reject:${wish.id}`);

      for (const parentId of settings.parentIds) {
        await ctx.api.sendMessage(
          parentId,
          `💌 *${settings.childName} предложил хотелку!*\n\n✨ ${wish.title}\n💰 Цена: ${wish.cost} Макскоинов`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }
      return;
    }
  });

  bot.callbackQuery('admin:wishes', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAdminWishesPanel(ctx);
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
      `🎉 Родители одобрили хотелку *${wish.title}*!\n\nНакопи ${wish.cost} Макскоинов и она станет доступна. 🌟`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.callbackQuery(/^admin:wishes:reject:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Отклонено');
    const wish = await getWish(ctx.match[1]);
    if (!wish) { await ctx.reply('Не найдено'); return; }

    await updateWishStatus(wish.id, 'rejected');
    await ctx.editMessageText(`❌ Отклонена: ${wish.title}`);

    const settings = await getSettings() as Settings;
    await ctx.api.sendMessage(
      settings.childId,
      `😔 Родители пока не одобрили хотелку *${wish.title}*.\nПопробуй предложить что-то другое.`,
      { parse_mode: 'Markdown' }
    );
  });
}
