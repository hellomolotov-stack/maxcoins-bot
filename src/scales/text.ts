import { Balance } from '../types';

export function scalesTextBlock(balance: Balance, childName: string = 'Ребёнок'): string {
  const val = balance.value;
  const clamped = Math.max(-100, Math.min(100, val));
  const total = 8;

  const childSlots = Math.round(((clamped + 100) / 200) * total);
  const parentSlots = total - childSlots;

  const parentBar = '🟣'.repeat(parentSlots);
  const childBar = '🟡'.repeat(childSlots);

  // Primary status — most prominent line
  let headline: string;
  const abs = Math.abs(clamped);
  if (abs <= 5) {
    headline = '⚖️ *Весы в равновесии*';
  } else if (clamped > 50) {
    headline = `🌟 *Весы на стороне ${childName}!*`;
  } else if (clamped > 0) {
    headline = `📈 *Весы на стороне ${childName}*`;
  } else if (clamped < -50) {
    headline = `😔 *Весы на стороне родителей*`;
  } else {
    headline = `📉 *Весы на стороне родителей*`;
  }

  // Intensity line
  let hint = '';
  if (abs > 50) hint = 'Значительный перевес';
  else if (abs > 20) hint = 'Заметный перевес';
  else if (abs > 5) hint = 'Небольшой перевес';

  // Bar with side labels
  const bar = `🟣 ${parentBar}${childBar} 🟡`;
  const sideLabels = `Родители${' '.repeat(Math.max(1, 12 - parentSlots * 2))}${childName}`;

  return (
    `⚖️ *Весы*\n\n` +
    `${headline}\n` +
    (hint ? `_${hint}_\n` : '') +
    `\n${bar}\n${sideLabels}\n\n` +
    `💰 Монет: *${balance.maxcoins}*`
  );
}
