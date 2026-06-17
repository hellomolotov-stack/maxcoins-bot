import { VercelRequest, VercelResponse } from '@vercel/node';
import { createWebhookHandler } from '../src/bot/index';

const handleUpdate = createWebhookHandler();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }
  await handleUpdate(req as any, res as any);
}
