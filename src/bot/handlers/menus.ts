import { Context, InlineKeyboard, Keyboard, InputFile } from 'grammy';
import { getBalance, getSettings } from '../../db/balance';
import { scalesTextBlock } from '../../scales/text';
import { generateScalesImage } from '../../scales/image';

export const childKeyboard = new Keyboard()
  .text('⚖️ Весы').text('📋 Задания').row()
  .text('🌟 Хотелки').text('➕ Предложить хотелку')
  .resized().persistent();

export const parentKeyboard = new Keyboard()
  .text('📊 Статус').text('📋 Задания').row()
  .text('✅ На проверке').text('🌟 Хотелки')
  .resized().persistent();

export async function showChildMenu(ctx: Context) {
  const balance = await getBalance();
  const text = scalesTextBlock(balance);
  await ctx.replyWithPhoto(
    new InputFile(generateScalesImage(balance.value), 'scales.png'),
    { caption: text, parse_mode: 'Markdown', reply_markup: childKeyboard }
  );
}

export async function showParentMenu(ctx: Context) {
  const balance = await getBalance();
  const settings = await getSettings();
  const hasChild = settings?.childId && settings.childId !== 0;

  let text = `👨‍👩‍👦 *Панель родителей*\n\n`;
  text += hasChild ? `👶 ${settings!.childName} подключён\n` : `⚠️ Ребёнок не добавлен\n`;
  text += `⚖️ Баланс: ${balance.value > 0 ? '+' : ''}${balance.value}\n`;
  text += `💰 Макскоинов: ${balance.maxcoins}`;

  const actionKb = new InlineKeyboard()
    .text('📋 Задания', 'admin:tasks').text('✅ На проверке', 'admin:submissions').row()
    .text('🌟 Хотелки', 'admin:wishes').text('⚙️ Настройки', 'admin:settings');

  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: parentKeyboard });
  await ctx.reply('Выбери действие:', { reply_markup: actionKb });
}
