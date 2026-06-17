import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createBot } from './bot/index';

const bot = createBot();
console.log('Bot running in polling mode (dev)...');
bot.start();
