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
  } catch (e) {
    console.error(e);
    res.status(200).json({ ok: false });
  }
}
