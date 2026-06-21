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

  // Intensity hint
  let hint = '';
  if (abs > 50) hint = 'Значительный перевес';
  else if (abs > 20) hint = 'Заметный перевес';
  else if (abs > 5) hint = 'Небольшой перевес';

  // Sign explanation — always shown so the number isn't confusing
  const sign = val > 0 ? '+' : '';
  const signExplain = val > 0
    ? `_${sign}${val} — чаша ${childName} тяжелее: он старается! 💪_`
    : val < 0
    ? `_${val} — чаша родителей тяжелее: ребёнку стоит постараться_`
    : `_0 — полное равновесие_`;

  // Bar with side labels
  const bar = `🟣 ${parentBar}${childBar} 🟡`;

  return (
    `⚖️ *Весы*\n\n` +
    `${headline}\n` +
    (hint ? `_${hint}_\n` : '') +
    `\n${bar}\n` +
    `Родители${' '.repeat(Math.max(1, 10 - parentSlots * 2))}${childName}\n\n` +
    `${signExplain}\n\n` +
    `💰 Монет: *${balance.maxcoins}*`
  );
}
