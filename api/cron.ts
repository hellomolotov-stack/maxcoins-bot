import { VercelRequest, VercelResponse } from '@vercel/node';
import { applyDailyDrift, getSettings } from '../src/db/balance';
import { getActiveTasks } from '../src/db/tasks';
import { scalesTextBlock } from '../src/scales/text';
import { generateScalesImage } from '../src/scales/image';
import { Bot, InputFile } from 'grammy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // защита от несанкционированных вызовов
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bot = new Bot(process.env.BOT_TOKEN!);
  const settings = await getSettings();

  // применяем ежедневный дрейф
  const balance = await applyDailyDrift();

  // утреннее сообщение ребёнку
  const tasks = await getActiveTasks();
  const todayTasks = tasks.filter(t => {
    if (t.type === 'once') return true;
    if (t.recurringSchedule === 'daily') return true;
    if (Array.isArray(t.recurringSchedule)) {
      return t.recurringSchedule.includes(new Date().getDay());
    }
    return false;
  });

  const scalesText = scalesTextBlock(balance);
  const image = await generateScalesImage(balance.value);

  let tasksText = '';
  if (todayTasks.length) {
    tasksText = `\n\n📋 *Задания на сегодня:*\n`;
    for (const t of todayTasks) {
      tasksText += `• ${t.title} (+${t.reward} 🪙)\n`;
    }
    tasksText += `\nНапиши /menu чтобы начать выполнять!`;
  } else {
    tasksText = `\n\nНа сегодня заданий нет — отдыхай! 🎉`;
  }

  await bot.api.sendPhoto(
    settings.childId,
    new InputFile(image, 'scales.png'),
    {
      caption: `🌅 *Доброе утро, ${settings.childName}!*\n\n${scalesText}${tasksText}`,
      parse_mode: 'Markdown',
    }
  );

  res.status(200).json({ ok: true, drift: settings.dailyDrift, tasks: todayTasks.length });
}
