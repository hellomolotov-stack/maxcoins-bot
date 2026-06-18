import { VercelRequest, VercelResponse } from '@vercel/node';
import { createBot } from '../src/bot/index';

const bot = createBot();
const botReady = bot.init();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }
  try {
    await botReady;
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('Webhook error:', e?.message, e?.stack);
    // Пытаемся сообщить пользователю об ошибке
    try {
      const chatId = req.body?.message?.chat?.id
        || req.body?.callback_query?.message?.chat?.id;
      if (chatId) {
        await bot.api.sendMessage(chatId,
          `⚠️ Ошибка: ${e?.message ?? 'неизвестная ошибка'}`);
      }
    } catch {}
    res.status(200).json({ ok: false, error: e?.message });
  }
}
