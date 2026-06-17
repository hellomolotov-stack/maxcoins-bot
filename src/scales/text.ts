import { Balance } from '../types';

export function scalesTextBlock(balance: Balance): string {
  const total = 12;
  const clamped = Math.max(-100, Math.min(100, balance.value));
  const childSlots = Math.round(((clamped + 100) / 200) * total);
  const parentSlots = total - childSlots;

  let bar = '';
  for (let i = 0; i < parentSlots; i++) bar += '🟣';
  for (let i = 0; i < childSlots; i++) bar += '🟡';

  let statusLine = '';
  if (clamped > 20) statusLine = 'Весы на твоей стороне — отлично! 🎉';
  else if (clamped < -20) statusLine = 'Весы пока на стороне родителей';
  else statusLine = 'Весы в равновесии — хороший баланс ✨';

  return (
    `⚖️ *Весы*\n` +
    `${bar}\n` +
    `🟣 Родители  🟡 Макс\n\n` +
    `${statusLine}\n\n` +
    `💰 *Макскоинов:* ${balance.maxcoins}`
  );
}
