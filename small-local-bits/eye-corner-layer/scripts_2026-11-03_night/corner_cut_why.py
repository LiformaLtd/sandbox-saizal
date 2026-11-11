# Indigenous man, his right eye (left of the screen), inner corner: why the white ends in a jagged cut there, and a
# preview of the fix. Everything in the eye's frame, as the player draws it (the editor's preview math = the player now).
import json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
ED = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work/work/eye_patch_editor/1d5b0001'
PACK = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/source/avatars/1d5b0001'
NOTES = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/notes/eye_corner_layer_20261102'
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22); big = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
meta = json.load(open(f'{ED}/meta.json'))
rows = []
for side in ('right', 'left'):
    e = meta['eyes'][side]; W, H = e['width'], e['height']; hole_pts = np.array(e['hole'])
    hc = np.zeros((H * 4, W * 4), np.uint8); cv2.fillPoly(hc, [np.round(hole_pts * 64).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
    hole = cv2.resize(hc, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    pic = np.asarray(Image.open(f'{ED}/{side}/painted.png').convert('RGB')).astype(np.float32)   # the rest picture, in the frame
    ball = np.asarray(Image.open(f'{ED}/{side}/eyeball.png').convert('RGBA')).astype(np.float32)
    sh = np.asarray(Image.open(f'{ED}/{side}/shade.png').convert('RGB')).astype(np.float32)
    m = np.asarray(Image.open(f'{PACK}/_workflow/eye-patch-masks/{side}.png').convert('L')).astype(np.float32) / 255
    # the picture's own eye white (same rule as build_eye_shade_map's automatic corner: not pink, not dark)
    pink = pic[..., 0] - pic[..., 2]
    white = np.clip((38 - pink) / 16, 0, 1) * np.clip((pic.mean(-1) - 90) / 30, 0, 1)
    ic = np.array(e['innerCorner']); ew = e['eyeWidth']
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    near = np.hypot(xx - ic[0], yy - ic[1]) < 0.2 * ew
    inside = hole > 0.5
    # fake white drawn over the picture's skin: inside the hole, near the corner, picture not white, your area not there
    bad = inside & near & (white < 0.5) & (m < 0.5)
    print(f"{side}: hole px near the inner corner where the picture is skin/pink but your area is not painted = {int(bad.sum())} "
          f"(of {int((inside & near & (white < 0.5)).sum())} skin px there); your area there: {int((inside & near & (m >= 0.5)).sum())} px")
    def render(alpha):
        ba = ball[..., 3:] / 255; ev = ball[..., :3] * (sh / 255) * ba + pic * (1 - ba)
        v = pic * (1 - hole[..., None]) + ev * hole[..., None]
        return v * (1 - alpha[..., None]) + pic * alpha[..., None]
    now = render(m)
    # fix: inside the hole, near the inner corner, show the picture wherever it is not eye white, with the picture's own
    # soft white edge - added to your area
    auto = cv2.GaussianBlur(((1 - white) * near).astype(np.float32), (0, 0), 0.6)
    fixed = render(np.maximum(m, auto))
    Z = 12; r = int(0.22 * ew)
    x0, y0 = int(ic[0] - r), int(ic[1] - r); x1, y1 = int(ic[0] + r), int(ic[1] + r)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W), min(y1, H)
    def crop(img):
        return Image.fromarray(np.clip(img[y0:y1, x0:x1], 0, 255).astype(np.uint8)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.NEAREST)
    def edge(im, a, col):
        a8 = (a[y0:y1, x0:x1] > 0.5).astype(np.uint8); ed = a8 - cv2.erode(a8, np.ones((3, 3), np.uint8))
        d = ImageDraw.Draw(im)
        for yy_, xx_ in zip(*np.nonzero(ed)): d.rectangle([xx_ * Z, yy_ * Z, xx_ * Z + Z - 1, yy_ * Z + Z - 1], outline=col, width=2)
        return im
    def loop(im):
        ImageDraw.Draw(im).line([((p[0] - x0) * Z, (p[1] - y0) * Z) for p in np.vstack([hole_pts, hole_pts[:1]])], fill=(255, 220, 0), width=2)
        return im
    p1 = loop(crop(pic))
    p2 = edge(loop(crop(pic)), m, (255, 0, 255))
    p3 = crop(now)
    b = crop(np.where(bad[..., None], np.array([0, 230, 255], np.float32), now))
    p5 = crop(fixed)
    rows.append((side, [('1. The picture the player shows (yellow = eye hole)', p1), ('2. Your painted area (pink edge)', p2),
                        ('3. Player now: the cut', p3), ('4. Blue = fake white over his skin', b), ('5. Fix preview', p5)]))
PW = max(p.width for _, ps in rows for _, p in ps); PH = max(p.height for _, ps in rows for _, p in ps); G = 12
sheet = Image.new('RGB', (5 * (PW + G) + G, 60 + 2 * (PH + 70)), 'white'); d = ImageDraw.Draw(sheet)
d.text((G, 10), 'Indigenous man, inner corners, 12x (one square = one pixel of the eye frame)', fill='black', font=big)
y = 60
for side, ps in rows:
    d.text((G, y), 'Eye on the LEFT of the screen' if side == 'right' else 'Eye on the RIGHT of the screen', fill='black', font=big); y += 32
    for i, (t, p) in enumerate(ps):
        x = G + i * (PW + G); d.text((x, y), t, fill=(50, 50, 50), font=font); sheet.paste(p, (x, y + 26))
    y += PH + 38
out = f'{NOTES}/indigenous_man_corner_cut_why.png'; sheet.save(out); print(out, sheet.size)
