import { CanvasTexture, SRGBColorSpace } from 'three';

function random(seed: number) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function texture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas textures are unavailable.');
  draw(ctx);
  const result = new CanvasTexture(canvas);
  result.colorSpace = SRGBColorSpace;
  result.anisotropy = 8;
  return result;
}

export function floorTexture(length: number, width: number) {
  return texture(1024, 1024, ctx => {
    const rand = random(529);
    const rows = Math.ceil(width / 0.21);
    const rowHeight = 1024 / rows;
    const plankWidth = 1024 * 1.42 / length;
    ctx.fillStyle = '#927451';
    ctx.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < rows; row++) {
      const y = row * rowHeight;
      for (let x = -plankWidth * rand(); x < 1024; x += plankWidth) {
        const value = rand() * 12 + 53;
        ctx.fillStyle = `hsl(${28 + rand() * 7} 38% ${value}%)`;
        ctx.fillRect(x + 0.7, y + 0.8, plankWidth - 1.4, rowHeight - 1.6);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, plankWidth - 2, rowHeight - 2);
        ctx.clip();
        for (let i = 0; i < Math.max(12, rowHeight); i++) {
          const gy = y + rand() * rowHeight;
          const gx = x + rand() * plankWidth;
          const span = (0.16 + rand() * 0.84) * plankWidth;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.bezierCurveTo(gx + span * 0.3, gy + rand() * 3 - 1.5, gx + span * 0.66, gy + rand() * 3 - 1.5, gx + span, gy);
          ctx.strokeStyle = i % 3 ? `rgba(73,48,30,${0.03 + rand() * 0.16})` : 'rgba(251,218,164,.2)';
          ctx.lineWidth = rand() * 1.15 + 0.25;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
}

export function rugTexture() {
  return texture(512, 384, ctx => {
    ctx.fillStyle = '#d7c4a7';
    ctx.fillRect(0, 0, 512, 384);
    const rand = random(31);
    for (let y = 0; y < 384; y += 2) {
      ctx.globalAlpha = 0.12 + rand() * 0.25;
      ctx.fillStyle = y % 4 ? '#eee5d1' : '#91816b';
      ctx.fillRect(0, y, 512, 1);
    }
    ctx.globalAlpha = 0.23;
    for (let x = 0; x < 512; x += 3) {
      ctx.fillStyle = x % 2 ? '#b4a18a' : '#f3e7cd';
      ctx.fillRect(x, 0, 1, 384);
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#a0927c';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 488, 360);
    ctx.strokeRect(18, 18, 476, 348);
    ctx.globalAlpha = 1;
  });
}

export function artTexture() {
  return texture(512, 320, ctx => {
    ctx.fillStyle = '#efe5d5';
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = '#ca9c76';
    ctx.beginPath();
    ctx.arc(359, 101, 49, 0, Math.PI * 2);
    ctx.fill();
    for (const [y, color] of [[208, '#a9ad91'], [252, '#737d65'], [292, '#c8b499']] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y - 36);
      ctx.bezierCurveTo(102, y - 118, 168, y + 42, 295, y - 20);
      ctx.bezierCurveTo(400, y - 50, 431, y - 50, 512, y - 5);
      ctx.lineTo(512, 320);
      ctx.lineTo(0, 320);
      ctx.fill();
    }
    const rand = random(93);
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.12)' : 'rgba(45,35,25,.10)';
      ctx.fillRect(rand() * 512, rand() * 320, 1, 1);
    }
  });
}

export function windowTexture() {
  return texture(512, 340, ctx => {
    const sky = ctx.createLinearGradient(0, 0, 0, 340);
    sky.addColorStop(0, '#b8cdd0');
    sky.addColorStop(0.72, '#e2e2d2');
    sky.addColorStop(1, '#ccd0b7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 340);
    const rand = random(447);
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ['#afb9a1', '#9ba78e', '#88967d'][layer];
      ctx.beginPath();
      ctx.moveTo(0, 340);
      for (let x = 0; x <= 530; x += 14) ctx.lineTo(x, 244 + layer * 24 + Math.sin(x / 53 + layer) * 25 + rand() * 24);
      ctx.lineTo(512, 340);
      ctx.fill();
    }
  });
}
