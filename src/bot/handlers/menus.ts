import { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getBalance } from '../../db/balance';
import { scalesTextBlock } from '../../scales/text';
import { generateScalesImage } from '../../scales/image';
import { InputFile } from 'grammy';

export async function showChildMenu(ctx: Context) {
  const balance = await getBalance();
  const text = scalesTextBlock(balance);

  const keyboard = new InlineKeyboard()
    .text('📋 Мои задания', 'tasks:list').row()
    .text('🌟 Мои хотелки', 'wishes:my').row()
    .text('➕ Предложить хотелку', 'wishes:propose');

  await ctx.replyWithPhoto(
    new InputFile(generateScalesImage(balance.value), 'scales.png'),
    { caption: text, parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

export async function showParentMenu(ctx: Context) {
  const balance = await getBalance();
  const keyboard = new InlineKeyboard()
    .text('📋 Задания', 'admin:tasks').row()
    .text('✅ Проверить выполненные', 'admin:submissions').row()
    .text('🌟 Хотелки детей', 'admin:wishes').row()
    .text('⚙️ Настройки', 'admin:settings');

  const text =
    `👨‍👩‍👦 *Панель родителей*\n\n` +
    `⚖️ Баланс: ${balance.value > 0 ? '+' : ''}${balance.value}\n` +
    `💰 Макскоинов у Макса: ${balance.maxcoins}`;

  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
}
