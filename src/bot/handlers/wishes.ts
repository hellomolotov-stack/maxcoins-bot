import { Bot, Context, InlineKeyboard } from 'grammy';
import { createWish, getWishes, getWish, updateWishStatus, getWishesMulti } from '../../db/wishes';
import { spendMaxcoins, addMaxcoins, getBalance, getSettings } from '../../db/balance';
import { getSession, setSessionKey, clearSessionKey } from '../../db/session';
import { Settings } from '../../types';
import { childKeyboard } from './menus';
import { GIF } from '../gifs';

export function startWishProposal(userId: number): Promise<void> {
  return setSessionKey(userId, 'wishDraft', {});
}

export async function showWishesForChild(ctx: Context) {
  const balance = await getBalance();

  // approved = ready to activate; current = already activated (coins spent)
  const [approved, current] = await Promise.all([
    getWishes('approved'),
    getWishes('current'),
  ]);

  const keyboard = new InlineKeyboard();
  let text = `🌟 *Хотелки*\n\n💰 У тебя ${balance.maxcoins} Макскоинов\n\n`;

  if (current.length) {
    text += `⚡ *Активные сейчас:*\n`;
    for (const w of current) {
      text += `• ${w.title} (${w.cost} 🪙)\n`;
    }
    text += `\n_Родители видят эти хотелки и знают, что ты хочешь их сейчас._\n\n`;
  }

  if (approved.length) {
    text += `✅ *Доступны:*\n`;
    for (const w of approved) {
      const canAfford = balance.maxcoins >= w.cost;
      const label = `${canAfford ? '✅' : '🔒'} ${w.title} — ${w.cost} 🪙`;
      keyboard.text(label, `wishes:spend:${w.id}`).row();
      text += `• ${w.title} — ${w.cost} 🪙${canAfford ? '' : ' (не хватает монет)'}\n`;
    }
    text += `\n✅ — нажми чтобы активировать\n🔒 — не хватает монеток\n`;
  }

  if (!approved.length && !current.length) {
    text += `Одобренных хотелок пока нет.\nПредложи что-нибудь!`;
  }

  keyboard.text('➕ Предложить новую', 'wishes:propose');

  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

export async function showAdminWishesPanel(ctx: Context) {
  // Show ALL wishes grouped by status
  const [pending, current, approved, redeemed, rejected] = await Promise.all([
    getWishes('pending'),
    getWishes('current'),
    getWishes('approved'),
    getWishes('redeemed'),
    getWishes('rejected'),
  ]);

  const total = pending.length + current.length + approved.length + redeemed.length + rejected.length;
  if (!total) {
    await ctx.reply('🌟 Хотелок пока нет. Ребёнок ещё не предлагал.');
    return;
  }

  // Pending — needs approval
  if (pending.length) {
    await ctx.reply(`💌 *На согласование (${pending.length}):*`, { parse_mode: 'Markdown' });
    for (const w of pending) {
      const kb = new InlineKeyboard()
        .text('✅ Одобрить', `admin:wishes:approve:${w.id}`)
        .text('❌ Отклонить', `admin:wishes:reject:${w.id}`);
      await ctx.reply(`✨ *${w.title}*\n💰 Цена: ${w.cost} 🪙`, { parse_mode: 'Markdown', reply_markup: kb });
    }
  }

  // Current — child activated (coins spent), parent needs to confirm or cancel
  if (current.length) {
    await ctx.reply(`⚡ *Хочет СЕЙЧАС (${current.length}):*`, { parse_mode: 'Markdown' });
    for (const w of current) {
      const kb = new InlineKeyboard()
        .text('✓ Выполнено', `admin:wishes:done:${w.id}`)
        .text('✗ Отменить (вернуть монеты)', `admin:wishes:cancel:${w.id}`);
      await ctx.reply(
        `⚡ *${w.title}*\n💰 Стоит: ${w.cost} 🪙 (уже списано)\n\n_Ребёнок потратил монеты и ждёт!_`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    }
  }

  // Approved — waiting for child to activate
  if (approved.length) {
    const lines = approved.map(w => `• ${w.title} — ${w.cost} 🪙`).join('\n');
    await ctx.reply(`✅ *Одобрены (${approved.length}):*\n${lines}`, { parse_mode: 'Markdown' });
  }

  // Redeemed and rejected — brief summary
  const doneCount = redeemed.length + rejected.length;
  if (doneCount) {
    const lines = [
      ...redeemed.map(w => `✓ ${w.title}`),
      ...rejected.map(w => `✗ ${w.title}`),
    ].join('\n');
    await ctx.reply(`📋 *Выполнено / отклонено (${doneCount}):*\n${lines}`, { parse_mode: 'Markdown' });
  }
}

export function registerWishHandlers(bot: Bot) {

  bot.callbackQuery('wishes:my', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWishesForChild(ctx);
  });

  // Child activates wish → deduct coins, set status 'current', notify parents
  bot.callbackQuery(/^wishes:spend:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wish = await getWish(ctx.match[1]);
    if (!wish || wish.status !== 'approved') {
      await ctx.reply('Хотелка недоступна или уже активирована');
      return;
    }

    const balance = await getBalance();
    if (balance.maxcoins < wish.cost) {
      await ctx.reply(`Не хватает монеток 😔\nНужно ${wish.cost}, у тебя ${balance.maxcoins}.\nПродолжай выполнять задания!`);
      return;
    }

    await updateWishStatus(wish.id, 'current');
    const newBalance = await spendMaxcoins(wish.cost);

    await ctx.reply(
      `⚡ *${wish.title}* — активирована!\n\nПотрачено: ${wish.cost} 🪙\nОсталось: ${newBalance.maxcoins} 🪙\n\nРодители видят, что ты хочешь это сейчас! 🌟`,
      { parse_mode: 'Markdown', reply_markup: childKeyboard }
    );

    const settings = await getSettings() as Settings;
    for (const parentId of settings.parentIds) {
      const kb = new InlineKeyboard()
        .text('✓ Выполнено', `admin:wishes:done:${wish.id}`)
        .text('✗ Отменить', `admin:wishes:cancel:${wish.id}`);
      await ctx.api.sendMessage(
        parentId,
        `⚡ *${settings.childName} хочет хотелку СЕЙЧАС!*\n\n✨ ${wish.title}\n💰 Потрачено: ${wish.cost} Макскоинов`,
        { parse_mode: 'Markdown', reply_markup: kb }
      ).catch(() => {});
    }
  });

  bot.callbackQuery('wishes:propose', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setSessionKey(ctx.from.id, 'wishDraft', {});
    await ctx.reply('✨ *Новая хотелка*\n\nШаг 1/2: Что ты хочешь? Напиши название:', { parse_mode: 'Markdown' });
  });

  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    let session;
    try {
      session = await getSession(userId);
    } catch (e: any) {
      console.error('getSession error in wish handler:', e);
      await ctx.reply(`⚠️ Ошибка чтения сессии: ${e?.message}`);
      return;
    }

    if (session.wishDraft === undefined) return next();

    try {
      const draft = session.wishDraft;
      const text = ctx.message.text;

      if (!draft.title) {
        await setSessionKey(userId, 'wishDraft', { title: text });
        await ctx.reply('💰 Шаг 2/2: Сколько Макскоинов должна стоить эта хотелка?');
        return;
      }

      const cost = parseInt(text, 10);
      if (isNaN(cost) || cost <= 0) { await ctx.reply('Напиши целое число, например: 50'); return; }

      await clearSessionKey(userId, 'wishDraft');
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
    } catch (e: any) {
      console.error('wish proposal handler error:', e);
      await ctx.reply(`⚠️ Ошибка при создании хотелки: ${e?.message}`);
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
    if (wish.status !== 'pending') {
      await ctx.editMessageText(`ℹ️ Хотелка «${wish.title}» уже обработана (статус: ${wish.status}).`).catch(() => {});
      return;
    }

    await updateWishStatus(wish.id, 'approved');
    await ctx.editMessageText(`✅ Одобрена: *${wish.title}* (${wish.cost} 🪙)`, { parse_mode: 'Markdown' });

    const settings = await getSettings() as Settings;
    await ctx.api.sendAnimation(
      settings.childId,
      GIF.WISH_APPROVED,
      {
        caption: `🎉 Родители одобрили хотелку *${wish.title}*!\n\nНакопи ${wish.cost} Макскоинов и она станет доступна. 🌟`,
        parse_mode: 'Markdown',
      }
    ).catch(() => {});
  });

  bot.callbackQuery(/^admin:wishes:reject:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Отклонено');
    const wish = await getWish(ctx.match[1]);
    if (!wish) { await ctx.reply('Не найдено'); return; }
    if (wish.status !== 'pending') {
      await ctx.editMessageText(`ℹ️ Хотелка «${wish.title}» уже обработана (статус: ${wish.status}).`).catch(() => {});
      return;
    }

    await updateWishStatus(wish.id, 'rejected');
    await ctx.editMessageText(`❌ Отклонена: ${wish.title}`);

    const settings = await getSettings() as Settings;
    await ctx.api.sendAnimation(
      settings.childId,
      GIF.WISH_REJECTED,
      {
        caption: `😔 Родители пока не одобрили хотелку *${wish.title}*.\nПопробуй предложить что-то другое.`,
        parse_mode: 'Markdown',
      }
    ).catch(() => {});
  });

  // Parent confirms wish was fulfilled (current → redeemed)
  bot.callbackQuery(/^admin:wishes:done:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Выполнено!');
    const wish = await getWish(ctx.match[1]);
    if (!wish) { await ctx.reply('Не найдено'); return; }

    await updateWishStatus(wish.id, 'redeemed');
    await ctx.editMessageText(`✓ Выполнено: *${wish.title}*`, { parse_mode: 'Markdown' }).catch(() => {});

    const settings = await getSettings() as Settings;
    await ctx.api.sendAnimation(
      settings.childId,
      GIF.WISH_REDEEMED,
      {
        caption: `🎁 Хотелка *${wish.title}* исполнена! Ура! 🎉`,
        parse_mode: 'Markdown',
      }
    ).catch(() => {});
  });

  // Parent cancels current wish → refund coins (current → approved)
  bot.callbackQuery(/^admin:wishes:cancel:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Монеты возвращены');
    const wish = await getWish(ctx.match[1]);
    if (!wish) { await ctx.reply('Не найдено'); return; }

    await updateWishStatus(wish.id, 'approved');
    const newBalance = await addMaxcoins(wish.cost);

    await ctx.editMessageText(
      `✗ Хотелка *${wish.title}* отменена.\n💰 Возвращено ${wish.cost} Макскоинов.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    const settings = await getSettings() as Settings;
    await ctx.api.sendMessage(
      settings.childId,
      `😔 Родители отменили хотелку *${wish.title}*.\n\n💰 Тебе вернули ${wish.cost} Макскоинов.\nТеперь у тебя ${newBalance.maxcoins} 🪙`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });
}
