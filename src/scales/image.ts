import { createCanvas, loadImage, Image } from '@napi-rs/canvas';
import { CAT_BUFFERS } from './cats';

let catImagesPromise: Promise<Image[]> | null = null;
function loadCats(): Promise<Image[]> {
  if (!catImagesPromise) {
    catImagesPromise = Promise.all(CAT_BUFFERS.map(buf => loadImage(buf)));
  }
  return catImagesPromise;
}

function pickTwoDifferentCats(cats: Image[]): [Image, Image] {
  const a = Math.floor(Math.random() * cats.length);
  let b = Math.floor(Math.random() * cats.length);
  while (b === a) b = Math.floor(Math.random() * cats.length);
  return [cats[a], cats[b]];
}

export async function generateScalesImage(balanceValue: number, childName: string = 'Ребёнок'): Promise<Buffer> {
  const canvas = createCanvas(600, 380);
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, 380);
  grad.addColorStop(0, '#F8F7FF');
  grad.addColorStop(1, '#FFF8F0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 380);

  const cx = 300;
  const poleTop = 30;
  const poleBottom = 145;

  const clamped = Math.max(-100, Math.min(100, balanceValue));
  const angleDeg = (clamped / 100) * 30;
  const angleRad = (angleDeg * Math.PI) / 180;

  const armLen = 175;
  const lx = cx - Math.cos(angleRad) * armLen;
  const ly = poleBottom + Math.sin(angleRad) * armLen;
  const rx = cx + Math.cos(angleRad) * armLen;
  const ry = poleBottom - Math.sin(angleRad) * armLen;

  // Pole
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
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

  // Pivot dot
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#4E4D4A';
  ctx.beginPath();
  ctx.arc(cx, poleBottom, 10, 0, Math.PI * 2);
  ctx.fill();

  const chainLen = 55;
  const panH = 28; // semi-minor axis (height of pan)
  const panW = 78; // semi-major axis (width of pan)

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

  const parentWins = clamped < -10;
  const childWins = clamped > 10;

  // Left pan (parents)
  const lCY = lPlatY + panH; // ellipse center Y
  ctx.shadowColor = parentWins ? 'rgba(83,74,183,0.45)' : 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = parentWins ? 16 : 7;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = parentWins ? '#B8B0FF' : '#AFA9EC';
  ctx.strokeStyle = parentWins ? '#3D2FBB' : '#534AB7';
  ctx.lineWidth = parentWins ? 4 : 2.5;
  ctx.beginPath();
  ctx.ellipse(lx, lCY, panW, panH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Right pan (child)
  const rCY = rPlatY + panH;
  ctx.shadowColor = childWins ? 'rgba(186,117,23,0.45)' : 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = childWins ? 16 : 7;
  ctx.fillStyle = childWins ? '#FFD98A' : '#FAC775';
  ctx.strokeStyle = childWins ? '#9B5B00' : '#BA7517';
  ctx.lineWidth = childWins ? 4 : 2.5;
  ctx.beginPath();
  ctx.ellipse(rx, rCY, panW, panH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Random cat images on each pan
  const cats = await loadCats();
  const [leftCat, rightCat] = pickTwoDifferentCats(cats);

  // Draw cat image centered on each pan, sized to fit
  const catSize = 44;
  ctx.drawImage(leftCat, lx - catSize / 2, lCY - catSize / 2 - 4, catSize, catSize);
  ctx.drawImage(rightCat, rx - catSize / 2, rCY - catSize / 2 - 4, catSize, catSize);

  // Labels under the cats
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px sans-serif';

  ctx.fillStyle = parentWins ? '#1A0E8A' : '#2E2575';
  ctx.fillText('Родители', lx, lCY + 22);

  ctx.fillStyle = childWins ? '#5C2800' : '#6B3A00';
  ctx.fillText(childName, rx, rCY + 22);

  ctx.textBaseline = 'alphabetic';

  // Winner arrow above winning pan
  if (parentWins || childWins) {
    const badgeX = parentWins ? lx : rx;
    const badgeY = parentWins ? lPlatY - 14 : rPlatY - 14;
    ctx.fillStyle = parentWins ? '#3D2FBB' : '#9B5B00';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ тяжелее', badgeX, badgeY);
  }

  // ── Status bar ──────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(0, 315, 600, 65);

  // Human-readable balance description
  let statusLine: string;
  if (Math.abs(clamped) <= 5) {
    statusLine = 'Весы в равновесии';
  } else if (clamped > 0) {
    statusLine = `Весы на стороне ${childName}`;
  } else {
    statusLine = 'Весы на стороне родителей';
  }

  ctx.fillStyle = '#2C2C2A';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusLine, cx, 340);

  // Intensity hint
  const abs = Math.abs(clamped);
  let hintText = '';
  if (abs > 60) hintText = 'значительный перевес';
  else if (abs > 25) hintText = 'заметный перевес';
  else if (abs > 5) hintText = 'небольшой перевес';

  if (hintText) {
    ctx.fillStyle = '#888780';
    ctx.font = '13px sans-serif';
    ctx.fillText(hintText, cx, 360);
  }

  return canvas.toBuffer('image/png');
}
