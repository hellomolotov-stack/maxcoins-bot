import { Balance } from '../types';

export function scalesTextBlock(balance: Balance, childName: string = 'Ребёнок'): string {
  const val = balance.value;
  const clamped = Math.max(-100, Math.min(100, val));
  const total = 8;

  const childSlots = Math.round(((clamped + 100) / 200) * total);
  const parentSlots = total - childSlots;

  const parentBar = '🟣'.repeat(parentSlots);
  const childBar = '🟡'.repeat(childSlots);
  const bar = parentBar + childBar;

  // Arrow shows which side is heavier (lower = heavier)
  let tiltLine: string;
  if (clamped > 20) {
    tiltLine = `⬆️ Родители            ${childName} ⬇️`;
  } else if (clamped < -20) {
    tiltLine = `⬇️ Родители            ${childName} ⬆️`;
  } else {
    tiltLine = `➡️ Родители            ${childName} ⬅️`;
  }

  let status: string;
  const abs = Math.abs(clamped);
  if (abs <= 5) {
    status = '⚖️ Равновесие — отличный баланс!';
  } else if (clamped > 50) {
    status = `🌟 *Весы сильно на стороне ${childName}!* 🎉`;
  } else if (clamped > 15) {
    status = `⚡ Весы на стороне *${childName}* — продолжай! 💪`;
  } else if (clamped > 0) {
    status = `📈 Чуть-чуть в пользу *${childName}*`;
  } else if (clamped < -50) {
    status = `😔 Весы *сильно* на стороне родителей`;
  } else if (clamped < -15) {
    status = `⚡ Весы на стороне *родителей*`;
  } else {
    status = `📉 Чуть-чуть в пользу родителей`;
  }

  const sign = val > 0 ? '+' : '';

  return (
    `⚖️ *Весы*\n\n` +
    `${bar}\n` +
    `${tiltLine}\n\n` +
    `${status}\n\n` +
    `Баланс: *${sign}${val}*  •  💰 Монет: *${balance.maxcoins}*`
  );
}
