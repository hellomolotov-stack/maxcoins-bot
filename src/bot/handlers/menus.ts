import { Context, InlineKeyboard, Keyboard, InputFile } from 'grammy';
import { getBalance, getSettings } from '../../db/balance';
import { scalesTextBlock } from '../../scales/text';
import { generateScalesImage } from '../../scales/image';

export const childKeyboard = new Keyboard()
  .text('⚖️ Весы').text('📋 Задания').row()
  .text('🌟 Хотелки').text('➕ Предложить хотелку').row()
  .text('🙏🏻 Важно поговорить')
  .resized().persistent();

export const parentKeyboard = new Keyboard()
  .text('📊 Статус').text('📋 Задания').row()
  .text('✅ На проверке').text('🌟 Хотелки').row()
  .text('➕ Добавить задание').text('‼️ Отвлечение ‼️').row()
  .text('⚠️ Нарушение')
  .resized().persistent();

export async function showChildMenu(ctx: Context) {
  const [balance, settings] = await Promise.all([getBalance(), getSettings()]);
  const childName = settings?.childName ?? 'Ребёнок';
  const text = scalesTextBlock(balance, childName);
  await ctx.replyWithPhoto(
    new InputFile(generateScalesImage(balance.value, childName), 'scales.png'),
    { caption: text, parse_mode: 'Markdown', reply_markup: childKeyboard }
  );
}

export async function showParentMenu(ctx: Context) {
  const [balance, settings] = await Promise.all([getBalance(), getSettings()]);
  const childName = settings?.childName ?? 'Ребёнок';
  const hasChild = settings?.childId && settings.childId !== 0;

  const caption =
    `👨‍👩‍👦 *Панель родителей*\n\n` +
    (hasChild ? `👶 ${childName} подключён\n` : `⚠️ Ребёнок не добавлен\n`) +
    `⚖️ Баланс: ${balance.value > 0 ? '+' : ''}${balance.value}\n` +
    `💰 Макскоинов: ${balance.maxcoins}`;

  const actionKb = new InlineKeyboard()
    .text('📋 Задания', 'admin:tasks').text('✅ На проверке', 'admin:submissions').row()
    .text('🌟 Хотелки', 'admin:wishes').text('⚙️ Настройки', 'admin:settings');

  await ctx.replyWithPhoto(
    new InputFile(generateScalesImage(balance.value, childName), 'scales.png'),
    { caption, parse_mode: 'Markdown', reply_markup: parentKeyboard }
  );
  await ctx.reply('Выбери действие:', { reply_markup: actionKb });
}
