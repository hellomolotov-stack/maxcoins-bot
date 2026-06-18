import { createCanvas } from '@napi-rs/canvas';

export function generateScalesImage(balanceValue: number, childName: string = 'Ребёнок'): Buffer {
  const canvas = createCanvas(600, 340);
  const ctx = canvas.getContext('2d');

  // фон
  ctx.fillStyle = '#FAFAF8';
  ctx.fillRect(0, 0, 600, 340);

  const cx = 300;
  const poleTop = 40;
  const poleBottom = 160;

  // угол наклона: ограничиваем ±30°
  const clamped = Math.max(-100, Math.min(100, balanceValue));
  const angleDeg = (clamped / 100) * 28;
  const angleRad = (angleDeg * Math.PI) / 180;

  const armLen = 180;
  const lx = cx - Math.cos(angleRad) * armLen;
  const ly = poleBottom + Math.sin(angleRad) * armLen;
  const rx = cx + Math.cos(angleRad) * armLen;
  const ry = poleBottom - Math.sin(angleRad) * armLen;

  // стойка
  ctx.strokeStyle = '#888780';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, poleTop);
  ctx.lineTo(cx, poleBottom + 10);
  ctx.stroke();

  // перекладина
  ctx.strokeStyle = '#5F5E5A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(rx, ry);
  ctx.stroke();

  // шарнир
  ctx.fillStyle = '#5F5E5A';
  ctx.beginPath();
  ctx.arc(cx, poleBottom, 8, 0, Math.PI * 2);
  ctx.fill();

  const chainLen = 60;

  // левая чаша (родители)
  const lPlatY = ly + chainLen;
  ctx.strokeStyle = '#888780';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(lx, lPlatY);
  ctx.stroke();

  ctx.fillStyle = '#AFA9EC';
  ctx.strokeStyle = '#534AB7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(lx, lPlatY + 10, 68, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // правая чаша (ребёнок)
  const rPlatY = ry + chainLen;
  ctx.strokeStyle = '#888780';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx, rPlatY);
  ctx.stroke();

  ctx.fillStyle = '#FAC775';
  ctx.strokeStyle = '#BA7517';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(rx, rPlatY + 10, 68, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // подписи под чашами
  ctx.fillStyle = '#3C3489';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Родители', lx, lPlatY + 44);

  ctx.fillStyle = '#854F0B';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(childName, rx, rPlatY + 44);

  // статус
  ctx.fillStyle = '#2C2C2A';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  let statusText = '';
  if (clamped > 20) statusText = `⚡ Весы на стороне ${childName}!`;
  else if (clamped < -20) statusText = '⚡ Весы на стороне родителей';
  else statusText = '⚖ Весы почти ровные';
  ctx.fillText(statusText, cx, 310);

  // значение
  ctx.fillStyle = '#888780';
  ctx.font = '13px sans-serif';
  ctx.fillText(`Баланс: ${clamped > 0 ? '+' : ''}${clamped}`, cx, 330);

  return canvas.toBuffer('image/png');
}
