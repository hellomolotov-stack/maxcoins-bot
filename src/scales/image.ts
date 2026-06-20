import { createCanvas } from '@napi-rs/canvas';

export function generateScalesImage(balanceValue: number, childName: string = 'Ребёнок'): Buffer {
  const canvas = createCanvas(600, 360);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 360);
  grad.addColorStop(0, '#F8F7FF');
  grad.addColorStop(1, '#FFF8F0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 360);

  const cx = 300;
  const poleTop = 35;
  const poleBottom = 155;

  const clamped = Math.max(-100, Math.min(100, balanceValue));
  const angleDeg = (clamped / 100) * 32;  // up to 32° tilt
  const angleRad = (angleDeg * Math.PI) / 180;

  const armLen = 185;
  const lx = cx - Math.cos(angleRad) * armLen;
  const ly = poleBottom + Math.sin(angleRad) * armLen;
  const rx = cx + Math.cos(angleRad) * armLen;
  const ry = poleBottom - Math.sin(angleRad) * armLen;

  // Pole shadow
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;

  // Pole
  ctx.strokeStyle = '#7C7B78';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, poleTop);
  ctx.lineTo(cx, poleBottom + 12);
  ctx.stroke();

  // Arm
  ctx.strokeStyle = '#4E4D4A';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(rx, ry);
  ctx.stroke();

  // Pivot
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4E4D4A';
  ctx.beginPath();
  ctx.arc(cx, poleBottom, 10, 0, Math.PI * 2);
  ctx.fill();

  const chainLen = 58;

  // Left chain (parents)
  const lPlatY = ly + chainLen;
  ctx.strokeStyle = '#9997C4';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(lx, lPlatY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Right chain (child)
  const rPlatY = ry + chainLen;
  ctx.strokeStyle = '#E8B86D';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx, rPlatY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Determine winner for highlight
  const parentWins = clamped < -10;
  const childWins = clamped > 10;

  // Left pan (parents)
  ctx.shadowColor = parentWins ? 'rgba(83,74,183,0.4)' : 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = parentWins ? 14 : 6;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = parentWins ? '#B8B0FF' : '#AFA9EC';
  ctx.strokeStyle = parentWins ? '#3D2FBB' : '#534AB7';
  ctx.lineWidth = parentWins ? 4 : 2.5;
  ctx.beginPath();
  ctx.ellipse(lx, lPlatY + 10, 72, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Right pan (child)
  ctx.shadowColor = childWins ? 'rgba(186,117,23,0.4)' : 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = childWins ? 14 : 6;
  ctx.fillStyle = childWins ? '#FFD98A' : '#FAC775';
  ctx.strokeStyle = childWins ? '#9B5B00' : '#BA7517';
  ctx.lineWidth = childWins ? 4 : 2.5;
  ctx.beginPath();
  ctx.ellipse(rx, rPlatY + 10, 72, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Labels ON the pans
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';

  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4;
  ctx.fillText('Родители', lx, lPlatY + 15);
  ctx.fillText(childName, rx, rPlatY + 15);
  ctx.shadowBlur = 0;

  // Winner badge (above the winning pan)
  if (parentWins || childWins) {
    const badgeX = parentWins ? lx : rx;
    const badgeY = parentWins ? lPlatY - 18 : rPlatY - 18;
    ctx.fillStyle = parentWins ? '#3D2FBB' : '#9B5B00';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('▼ тяжелее', badgeX, badgeY);
  }

  // Status bar at bottom
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, 305, 600, 55);

  ctx.fillStyle = '#2C2C2A';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';

  let statusText = '';
  if (Math.abs(clamped) <= 5) statusText = '⚖ Равновесие';
  else if (clamped > 40) statusText = `⚡ Весы на стороне ${childName}! 🌟`;
  else if (clamped > 10) statusText = `📈 Весы на стороне ${childName}`;
  else if (clamped < -40) statusText = '⚡ Весы на стороне родителей! 💪';
  else statusText = '📉 Весы на стороне родителей';

  ctx.fillText(statusText, cx, 327);

  ctx.fillStyle = '#888780';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Баланс: ${clamped > 0 ? '+' : ''}${clamped}`, cx, 347);

  return canvas.toBuffer('image/png');
}
