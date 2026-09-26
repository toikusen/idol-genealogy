import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, cellLayout, fit, renderShareImage } from './sukigao-share-image';
import { SukigaoCandidate } from '../../models';

const face = (i: number, photoUrl = ''): SukigaoCandidate => ({
  id: `m${i}`,
  name: `成員${i}`,
  photoUrl,
  groupNames: i % 2 ? ['Sweet Paradox'] : [],
  color: null,
  isCurrent: true,
});

/** 1×1 pink PNG as a data URL — readable by canvas without CORS. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('sukigao share image', () => {
  it('lays #1 out in the centre, 2 and 3 beside it, the rest around', () => {
    const one = cellLayout(0);
    const two = cellLayout(1);
    const three = cellLayout(2);
    expect(two.cy).toBe(one.cy);
    expect(three.cy).toBe(one.cy);
    expect(two.cx).toBeLessThan(one.cx);
    expect(three.cx).toBeGreaterThan(one.cx);
    expect(one.d).toBeGreaterThan(two.d);
    expect(two.d).toBeGreaterThan(cellLayout(5).d);
    expect(cellLayout(3).cy).toBeLessThan(one.cy);
    expect(cellLayout(6).cy).toBeGreaterThan(one.cy);
  });

  it('keeps every cell inside the image', () => {
    for (let r = 0; r < 9; r++) {
      const { cx, cy, d } = cellLayout(r);
      expect(cx - d / 2).toBeGreaterThan(0);
      expect(cx + d / 2).toBeLessThan(SHARE_IMAGE_WIDTH);
      expect(cy + d / 2 + 90).toBeLessThan(SHARE_IMAGE_HEIGHT - 150);
    }
  });

  it('truncates long names with an ellipsis', () => {
    const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics };
    expect(fit(ctx, 'short', 100)).toBe('short');
    const out = fit(ctx, 'a'.repeat(30), 100);
    expect(out.endsWith('…')).toBeTrue();
    expect(out.length * 10).toBeLessThanOrEqual(100);
  });

  it('renders a 1080×1350 PNG, with or without photos', async () => {
    const faces = Array.from({ length: 9 }, (_, i) => face(i, i % 3 === 0 ? PIXEL : ''));
    const blob = await renderShareImage(faces, 'idolmaps.com/sukigao');
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(1080);
    expect(bitmap.height).toBe(1350);
  });
});
