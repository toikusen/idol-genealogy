import sharp from 'sharp';
import { readdirSync } from 'fs';
import { join } from 'path';

const badgeDir = 'public/badges';
const files = readdirSync(badgeDir).filter(f => f.endsWith('.png'));

for (const file of files) {
  const input = join(badgeDir, file);
  const output = join(badgeDir, file.replace('.png', '.webp'));
  await sharp(input).webp({ quality: 85 }).toFile(output);
  console.log(`Converted: ${file} → ${file.replace('.png', '.webp')}`);
}
