# Indigenous man (1d5b0001), Studio picture with green eyes: corner layer before vs after the user's 2 Nov 18:03 edit.
# Eye white = inside the eye layer (alpha > 0.5), grey-ish ((max-min)/mean < 0.3), not dark (mean > 70); top-most and lowest row,
# first and last column, per eye (1024-picture px). Picture: both eyes, before (top) / after (bottom), 7x, lines at the white's
# top (red) and bottom (blue).
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
S, OUT = sys.argv[1], sys.argv[2]
base = Image.open(f'{S}/base_1d5b0001.webp').convert('RGBA')
bg = Image.alpha_composite(Image.new('RGBA', base.size, (128, 132, 140, 255)), base)
layers = {'before your edit': f'{S}/old_layers/green_corner_on_before_edit.png',
          'after your edit': '/Users/saizalpreetkaur./Desktop/eye_layers/1d5b0001/green.png'}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
x0, y0, x1, y1 = 425, 198, 600, 248; Z = 7; rows = []
for name, path in layers.items():
    lay = Image.open(path).convert('RGBA'); comp = Image.alpha_composite(bg, lay).convert('RGB')
    c = np.asarray(comp).astype(float); la = np.asarray(lay)[..., 3] / 255
    m = c.mean(-1); rc = (c.max(-1) - c.min(-1)) / np.maximum(m, 1)
    white = (la > 0.5) & (rc < 0.3) & (m > 70)
    img = comp.crop((x0, y0, x1, y1)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.NEAREST); d = ImageDraw.Draw(img)
    line = [name]
    for side, xs_ in (('left', slice(0, 512)), ('right', slice(512, 1024))):
        w = np.zeros_like(white); w[:, xs_] = white[:, xs_]
        ys, xs = np.nonzero(w)
        h, wd = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        line.append(f'{side} eye: white {wd} x {h} px (rows {ys.min()}-{ys.max()}), {int(w.sum())} white px')
        for yy, col in ((ys.min(), (255, 40, 40)), (ys.max() + 1, (40, 120, 255))):
            d.line([((xs.min() - 3 - x0) * Z, (yy - y0) * Z), ((xs.max() + 3 - x0) * Z, (yy - y0) * Z)], fill=col, width=2)
    print(' | '.join(line))
    cell = Image.new('RGB', (img.width, img.height + 34), 'white'); cell.paste(img, (0, 34))
    ImageDraw.Draw(cell).text((8, 6), f'Indigenous man, Studio picture, green eyes, corner layer on - {name}', fill='black', font=font)
    rows.append(cell)
out = Image.new('RGB', (rows[0].width, sum(r.height for r in rows) + 10), 'white')
out.paste(rows[0], (0, 0)); out.paste(rows[1], (0, rows[0].height + 10)); out.save(OUT); print(OUT)
