# Sheet: player eyes with the corner layer off vs on, all 20 avatars (2026-11-02).
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
D = sys.argv[1]; OUT = sys.argv[2]
IDS = '0a5a0001 0a5b0001 1d5a0001 1d5b0001 5a5a0002 5a5b0001 5e5a0001 5e5b0001 ac5a0001 ac5b0001 ae5a0002 ae5b0001 af5a0001 af5b0001 e05a0001 e05b0001 ea5a0002 ea5b0001 ed5a0001 ed5b0001'.split()
NAMES = {'af5a0001': 'Precious (African woman)', 'ac5b0001': 'no corner layer (your choice, 22 Oct)'}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
def eye_box(im):
    a = np.asarray(im.convert('RGB')).astype(int); h = a.shape[0]
    top = a[: int(h * 0.5)]
    mx, mn = top.max(2), top.min(2)
    m = (top.mean(2) > 165) & (mx - mn < 45)
    ys, xs = np.nonzero(m)
    x0, x1 = np.percentile(xs, [0.5, 99.5]); y0, y1 = np.percentile(ys, [0.5, 99.5])
    w = x1 - x0; cy = (y0 + y1) / 2
    return int(x0 - 0.12 * w), int(cy - 0.22 * w), int(x1 + 0.12 * w), int(cy + 0.22 * w)
rows = []
for i in IDS:
    off = Image.open(f'{D}/{i}_off.png').convert('RGB'); on = Image.open(f'{D}/{i}_on.png').convert('RGB')
    b = eye_box(on)
    cw = 720; s = cw / (b[2] - b[0]); ch = int((b[3] - b[1]) * s)
    a1 = off.crop(b).resize((cw, ch), Image.LANCZOS); a2 = on.crop(b).resize((cw, ch), Image.LANCZOS)
    row = Image.new('RGB', (cw * 2 + 30, ch + 34), 'white'); d = ImageDraw.Draw(row)
    d.text((4, 4), f'{i}  {NAMES.get(i, "")}', fill='black', font=font)
    row.paste(a1, (0, 34)); row.paste(a2, (cw + 30, 34)); rows.append(row)
W = max(r.width for r in rows); hdr = 50
for part, chunk in (('1', rows[:10]), ('2', rows[10:])):
    H = hdr + sum(r.height + 12 for r in chunk)
    sheet = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(sheet)
    d.text((4, 10), 'Corner layer OFF', fill='black', font=font); d.text((W // 2 + 15, 10), 'Corner layer ON (now)', fill='black', font=font)
    y = hdr
    for r in chunk: sheet.paste(r, (0, y)); y += r.height + 12
    sheet.save(f'{OUT}/corner_layer_off_vs_on_{part}.png'); print(part, sheet.size)
