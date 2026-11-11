# Eye white, top-most point to lowest point (straight up-down), both eyes, Indigenous man (1d5b0001) in the Studio preview with
# green eyes (2026-11-02, user screenshot). Studio picture = base (neutral, :3014) + the green eye layer the Studio serves
# (~/Desktop/eye_layers/1d5b0001/green.png, corners left to the base's own painting = what the Studio shows).
# White = inside the eye layer (alpha > 0.5), grey-ish ((max-min)/mean < 0.3) and not dark (mean > 70): the iris is green, the
# pupil black. Cross-check on the screenshot itself (white = (max-min)/mean < 0.3, mean > 110, near each eye).
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
S = sys.argv[1]; OUT = sys.argv[2]; SHOT = sys.argv[3]
base = Image.open(f'{S}/studio/base_1d5b0001.webp').convert('RGBA')
layer = Image.open('/Users/saizalpreetkaur./Desktop/eye_layers/1d5b0001/green.png').convert('RGBA')
comp = Image.alpha_composite(Image.alpha_composite(Image.new('RGBA', base.size, (128, 132, 140, 255)), base), layer).convert('RGB')
c = np.asarray(comp).astype(float); la = np.asarray(layer)[..., 3] / 255
mean = c.mean(-1); rc = (c.max(-1) - c.min(-1)) / np.maximum(mean, 1)
white = (la > 0.5) & (rc < 0.3) & (mean > 70)
n, lab, st, cen = cv2.connectedComponentsWithStats(white.astype(np.uint8))
res = {}
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] < 10: continue
    side = 'left' if cen[i][0] < 512 else 'right'
    ys, xs = np.nonzero(lab == i)
    for y, x in zip(ys, xs):
        r = res.setdefault(side, {'top': (y, x), 'bot': (y, x)})
        if y < r['top'][0]: r['top'] = (y, x)
        if y > r['bot'][0]: r['bot'] = (y, x)
for side in ('left', 'right'):
    r = res[side]
    print(f"{side} eye (as you look): white top y={r['top'][0]} (x={r['top'][1]}), bottom y={r['bot'][0]} (x={r['bot'][1]}), "
          f"height = {r['bot'][0] - r['top'][0] + 1} px of the 1024 picture")
# screenshot cross-check (its own pixels)
shot = np.asarray(Image.open(SHOT).convert('RGB')).astype(float)
sm = shot.mean(-1); src = (shot.max(-1) - shot.min(-1)) / np.maximum(sm, 1)
sw = (src < 0.3) & (sm > 110)
sw[:120] = False; sw[320:] = False  # the eye band of the screenshot only
n2, lab2, st2, cen2 = cv2.connectedComponentsWithStats(sw.astype(np.uint8))
for i in range(1, n2):
    if st2[i, cv2.CC_STAT_AREA] < 400: continue
    ys, xs = np.nonzero(lab2 == i)
    print(f"  screenshot white piece at x {xs.min()}-{xs.max()}: top y={ys.min()}, bottom y={ys.max()}, height {ys.max() - ys.min() + 1} screenshot px")
# picture: the eye band, 4x, white marked, top and bottom lines
x0, y0, x1, y1 = 410, 190, 615, 255; Z = 7
img = comp.crop((x0, y0, x1, y1)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.NEAREST)
d = ImageDraw.Draw(img)
f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
for side in ('left', 'right'):
    r = res[side]
    (ty, tx), (by, bx) = r['top'], r['bot']
    for y, x, col in ((ty, tx, (255, 40, 40)), (by + 1, bx, (40, 120, 255))):
        yy = (y - y0) * Z
        d.line([((tx if side else 0) * 0 + (min(tx, bx) - 14 - x0) * Z, yy), ((max(tx, bx) + 14 - x0) * Z, yy)], fill=col, width=2)
    d.text(((max(tx, bx) + 15 - x0) * Z, ((ty + by) / 2 - y0) * Z - 12), f'{by - ty + 1} px', fill=(255, 255, 0), font=f)
out = Image.new('RGB', (img.width, img.height + 40), 'white'); out.paste(img, (0, 40))
ImageDraw.Draw(out).text((8, 8), 'Indigenous man, Studio picture with green eyes: red = top of the eye white, blue = bottom (1024-picture px)',
                         fill='black', font=f)
out.save(OUT); print(OUT)
