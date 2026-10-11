# Idol Maps — Logo Guidelines

## 1. The logo
- **Idea**: an idol's microphone wearing Taiwan's national flower, the plum blossom (梅花). Mic = idols and live
  stages; plum = Taiwan. Round petals (no notch) keep it distinct from Japanese sakura.
- **Versions**: horizontal (primary) · stacked · symbol only · wordmark only.
- **Files**
  | Use | File |
  |---|---|
  | Header, OG image, docs | `idolmaps-horizontal.svg` (dark bg: `idolmaps-horizontal-reversed.svg`) |
  | Square spaces | `idolmaps-stacked.svg` |
  | Avatars, stickers | `idolmaps-symbol.svg` (dark bg: `idolmaps-symbol-reversed.svg`) |
  | 16–31 px (favicon) | `idolmaps-symbol-small.svg` — wider gaps, no flower centre hole |
  | Web / PWA icons | `public/favicon.*`, `public/favicon-192.png`, `public/icons/` (any + maskable) |
  | One colour | Not committed. Regenerate with logo-design `export_variants.py --only black white mono` |

## 2. Clear space
Keep clear space around the logo equal to **one plum-blossom diameter** on every side. The clear space scales with the logo.

## 3. Minimum size
| Version | Screen |
|---|---|
| Horizontal | 120 px wide |
| Stacked | 72 px wide |
| Symbol | 32 px (16–31 px: use the small cut) |

## 4. Colour
| Name | HEX | RGB | Role |
|---|---|---|---|
| Plum Pink | `#dc6390` | 220 99 144 | Flower, "Maps" (on light) |
| Stage Purple | `#4b3a8f` | 75 58 143 | Microphone, one-colour version |
| Ink | `#2d2440` | 45 36 64 | "Idol" (on light) |
| Night Lilac | `#9d90f7` | 157 144 247 | Microphone on dark |
| Idol Pink | `#e879a0` | 232 121 160 | Flower + "Maps" on dark (existing site colour) |
| Blush | `#fdf4f9` | 253 244 249 | App-icon tile / light background (existing site colour) |

Contrast checked (WCAG):
- Plum Pink on white: 3.37:1. The site's `#e879a0` is only 2.74:1, so the logo uses a deeper pink on light backgrounds.
- Stage Purple on white: 9.1:1.
- Idol Pink on `#211b38`: 6.0:1.

CMYK and Pantone values haven't been specified yet. Before printing, have a printer proof the colours.

**Approved pairings:** full colour on white or Blush · reversed version on dark (`#211b38`) · one-colour Stage Purple, black or white.

## 5. Typography
- Wordmark: Cormorant Garamond, weight 650. It's already outlined to paths, so no font needs to be installed.
- Licence: SIL Open Font License (Google Fonts), which allows use in a logo.
- Site typefaces (`tailwind.config.js`): Cormorant Garamond for display headings; Shippori Mincho / Noto Sans JP for body text.

## 6. Don'ts
Don't:
- stretch or squash the logo
- change the rotation (the mic is fixed at 45°)
- recolour it outside this palette
- add shadows, outlines or gradients
- move the plum blossom
- change the size relationship between the symbol and the wordmark
- type the wordmark in a font instead of using the file
- put the full-colour version directly on a busy photo (use the white version or a backing tile)

## 7. Master
`build.py` generates every master SVG: boolean geometry via skia-pathops and outlined type via fontTools.
To change a size or colour, edit the parameters in `build.py` and rebuild. Don't hand-edit the SVG paths.
