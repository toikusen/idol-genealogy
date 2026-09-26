import { SukigaoCandidate } from '../../models';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';

/**
 * Draws the shareable 顏控9選 result card (1080×1350, 4:5 — the tallest ratio
 * Instagram / Facebook / Threads feeds show uncropped) with the Canvas API.
 * No html-to-image dependency: the layout is simple enough to draw directly.
 *
 * Photos come from Supabase Storage. They are loaded with crossOrigin so the
 * canvas stays exportable; if a photo can't be read that way it is retried
 * through the same-origin /api/sukigao-photo proxy, and if that fails too the
 * face is drawn as an initial so one bad photo never blocks the whole image.
 */

export const SHARE_IMAGE_WIDTH = 1080;
export const SHARE_IMAGE_HEIGHT = 1350;
const FONT = '"JF Openhuninn", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const PHOTO_WIDTH = 480;

/** Medal ring colours, shared with the result page CSS. */
export const MEDALS = [
  { from: '#ffe07a', to: '#e2a31c', label: '1st' },
  { from: '#f1f4f8', to: '#9aa6b4', label: '2nd' },
  { from: '#f3c29a', to: '#b8692f', label: '3rd' },
] as const;

/** Rank (0-based) → cell centre and photo diameter, in the 4 5 6 / 2 1 3 / 7 8 9 layout. */
export function cellLayout(rank: number): { cx: number; cy: number; d: number } {
  const col = [1, 0, 2, 0, 1, 2, 0, 1, 2][rank];
  const row = [1, 1, 1, 0, 0, 0, 2, 2, 2][rank];
  const cx = 190 + col * 350;
  const cy = [320, 660, 1000][row];
  const d = rank === 0 ? 220 : rank < 3 ? 190 : 170;
  return { cx, cy, d };
}

export async function renderShareImage(faces: readonly SukigaoCandidate[], siteLabel: string): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderShareImage needs a browser');
  await ensureFont();
  const photos = await Promise.all(faces.map(f => loadPhoto(f.photoUrl)));

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  drawBackground(ctx);
  drawHeader(ctx);
  faces.slice(0, 9).forEach((face, rank) => drawFace(ctx, face, photos[rank], rank));
  drawFooter(ctx, siteLabel);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'),
  );
}

// ── drawing ──

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  bg.addColorStop(0, '#fff3f8');
  bg.addColorStop(0.55, '#fde4ef');
  bg.addColorStop(1, '#efe6ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  // Soft blobs for depth.
  for (const [x, y, r, c] of [
    [120, 140, 260, 'rgba(236,127,168,0.18)'],
    [980, 1180, 320, 'rgba(176,100,216,0.14)'],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  }

  // Card.
  roundRect(ctx, 40, 200, SHARE_IMAGE_WIDTH - 80, 990, 48);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,121,160,0.25)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e879a0';
  ctx.font = `600 34px ${FONT}`;
  spacedText(ctx, 'YOUR FACE 9', SHARE_IMAGE_WIDTH / 2, 78, 10);

  const title = ctx.createLinearGradient(300, 0, 780, 0);
  title.addColorStop(0, '#e2548a');
  title.addColorStop(1, '#9b4fd1');
  ctx.fillStyle = title;
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText('我的台灣地偶顏控9選', SHARE_IMAGE_WIDTH / 2, 160);
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  face: SukigaoCandidate,
  photo: CanvasImageSource | null,
  rank: number,
): void {
  const { cx, cy, d } = cellLayout(rank);
  const r = d / 2;
  const medal = MEDALS[rank];

  // Ring: gold / silver / bronze for the podium, a thin pink line otherwise.
  ctx.save();
  if (medal) {
    ctx.shadowColor = rank === 0 ? 'rgba(236,127,168,0.55)' : 'rgba(45,27,46,0.18)';
    ctx.shadowBlur = rank === 0 ? 36 : 18;
    const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, medal.from);
    ring.addColorStop(1, medal.to);
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, r + (rank === 0 ? 14 : 10), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(232,121,160,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Photo, clipped to a circle (and zoomed 5% like the page, so the dark
  // corners of circle-cropped uploads stay hidden).
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#f4e6ee';
  ctx.fillRect(cx - r, cy - r, d, d);
  if (photo) {
    drawCover(ctx, photo, cx - r * 1.05, cy - r * 1.05, d * 1.05, d * 1.05);
  } else {
    ctx.fillStyle = '#c9a3b9';
    ctx.font = `700 ${Math.round(d * 0.4)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(face.name.charAt(0), cx, cy);
  }
  ctx.restore();

  // Rank badge.
  const bx = cx - r * 0.72;
  const by = cy - r * 0.72;
  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, rank < 3 ? 30 : 24, 0, Math.PI * 2);
  if (medal) {
    const g = ctx.createLinearGradient(bx - 30, by - 30, bx + 30, by + 30);
    g.addColorStop(0, medal.from);
    g.addColorStop(1, medal.to);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = 'rgba(45,27,46,0.72)';
  }
  ctx.fill();
  // Dark digits on the light medal metals, white on the plain dark badge.
  ctx.fillStyle = rank === 1 ? '#3d4450' : medal ? '#4a2c0c' : '#fff';
  ctx.font = `700 ${rank < 3 ? 30 : 24}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank + 1), bx, by + 1);
  ctx.restore();

  if (rank === 0) {
    // Sits on the ring's top edge so it clears the row above.
    ctx.font = `56px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('👑', cx, cy - r + 18);
  }

  // Name + group.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2d1b2e';
  ctx.font = `700 ${rank === 0 ? 36 : 30}px ${FONT}`;
  ctx.fillText(fit(ctx, face.name, 310), cx, cy + r + (rank === 0 ? 58 : 48));
  ctx.fillStyle = '#9a7a98';
  ctx.font = `24px ${FONT}`;
  const group = face.groupNames.length ? face.groupNames.join('・') : 'Solo';
  ctx.fillText(fit(ctx, group, 310), cx, cy + r + (rank === 0 ? 92 : 80));
}

function drawFooter(ctx: CanvasRenderingContext2D, siteLabel: string): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7a5a7a';
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText('你的顏控9選是誰？', SHARE_IMAGE_WIDTH / 2, 1232);

  roundRect(ctx, SHARE_IMAGE_WIDTH / 2 - 300, 1260, 600, 64, 32);
  const pill = ctx.createLinearGradient(SHARE_IMAGE_WIDTH / 2 - 300, 0, SHARE_IMAGE_WIDTH / 2 + 300, 0);
  pill.addColorStop(0, '#ec7fa8');
  pill.addColorStop(1, '#b064d8');
  ctx.fillStyle = pill;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `700 32px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${siteLabel}  #IdolMaps`, SHARE_IMAGE_WIDTH / 2, 1293);
}

// ── helpers ──

function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width;
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number): void {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

/** Truncates with an ellipsis so long names stay inside their cell. */
export function fit(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

async function ensureFont(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load(`700 40px "JF Openhuninn"`),
      new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Fallback fonts are fine.
  }
}

const imgPipe = new SupabaseImgPipe();

async function loadPhoto(url: string): Promise<CanvasImageSource | null> {
  if (!url) return null;
  const direct = imgPipe.transform(url, PHOTO_WIDTH, 85) ?? url;
  return (await loadImage(direct)) ?? (await loadImage(`/api/sukigao-photo?src=${encodeURIComponent(direct)}`));
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(isReadable(img) ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** True when drawing this image would not taint the canvas. */
function isReadable(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}
