# Indigenous man: the painted white's shading (the white template, multiplied onto a flat white) laid into his eye hole
# the player's way (ear clipping = a fan of long thin triangles from the inner corner) vs a lid-to-lid ladder, next to the
# player frame. Contrast stretched (170-255) so creases show.
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work')
import build_stage_eye_layers as B
PID = '1d5b0001'; S = 1024; K = 8; s_fr = 2.925; ox, oy = 103, 0
TD = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/dev/eyeColours/whiteTemplate'
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22); big = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
fm = json.load(open(f'{B.SRC}/{PID}/face-meshes.json')); V = {v['id']: v for v in fm['visemes'] if 'id' in v}
F = np.array(V['sil']['cohortLandmarks'], float)[:, :2] * S
tj = json.load(open(f'{TD}/white_template.json'))


def ladder(n):
    """Lid-to-lid strips: loop index i (lower lid, 0 -> n/2) paired with n - i (upper lid); dot 0 = outer corner,
    dot 8 (index n/2) = inner corner."""
    h = n // 2; out = []
    for i in range(h):
        a, b = i, i + 1; c, d = (n - i - 1) % n, (n - i) % n      # lower a->b, upper d->c
        if a == d: out.append((a, b, c))                          # outer-corner wedge
        elif b == c: out.append((a, b, d))                        # inner-corner wedge
        else: out += [(a, b, c), (a, c, d)]
    return out


def render(side, tris_fn):
    hole = B.smooth_loop(F[B.DRAW[side]])
    tpl = np.asarray(Image.open(f'{TD}/white_{side}.png').convert('RGB')).astype(np.float32) / 255
    th, tw = tpl.shape[:2]; luv = tj[side]['landmarkUv']
    raw = np.array([[luv[str(i)][0] * tw, luv[str(i)][1] * th] for i in B.DRAW[side]])
    loop_uv = B.uv_following_curve(hole, B.straight_loop(raw), len(raw))
    x0, y0 = np.floor(hole.min(0)).astype(int) - 2; x1, y1 = np.ceil(hole.max(0)).astype(int) + 2
    W, H = (x1 - x0) * K, (y1 - y0) * K
    X, Y = np.meshgrid(x0 + (np.arange(W) + 0.5) / K, y0 + (np.arange(H) + 0.5) / K)
    U = np.full((H, W), -1.0); Vv = np.full((H, W), -1.0); inside = np.zeros((H, W), bool)
    for t in tris_fn(hole):
        P = hole[list(t)]; T = loop_uv[list(t)]
        e1, e2 = P[1] - P[0], P[2] - P[0]
        if abs(e1[0] * e2[1] - e1[1] * e2[0]) < 1e-9: continue
        M = cv2.getAffineTransform(P.astype(np.float32), T.astype(np.float32))
        m = np.zeros((H, W), np.uint8)
        cv2.fillConvexPoly(m, np.round(((P - [x0, y0]) * K - 0.5) * 16).astype(np.int32), 1, lineType=cv2.LINE_8, shift=4)
        sel = m.astype(bool); inside |= sel
        U[sel] = M[0, 0] * X[sel] + M[0, 1] * Y[sel] + M[0, 2]; Vv[sel] = M[1, 0] * X[sel] + M[1, 1] * Y[sel] + M[1, 2]
    img = B.sample(tpl, U, Vv) * inside[..., None]
    small = img.reshape(H // K, K, W // K, K, 3).mean((1, 3))
    return small, (x0, y0, x1, y1), hole


fr = Image.open('grab/frames/cut/a_all_on.png').convert('RGBA'); bgf = Image.new('RGBA', fr.size, (236, 236, 236, 255))
frame = np.asarray(Image.alpha_composite(bgf, fr).convert('L')).astype(np.float32)
stretch = lambda g: (np.clip((g - 170) / 85, 0, 1) * 255).astype(np.uint8)
rows = []
for side in ('right', 'left'):
    fan, box, hole = render(side, lambda h: B.ear_clip(h))
    lad, _, _ = render(side, lambda h: ladder(len(h)))
    x0, y0, x1, y1 = box; Z = 8
    fx0, fy0, fx1, fy1 = [int(round(v)) for v in ((x0 + ox) * s_fr, (y0 + oy) * s_fr, (x1 + ox) * s_fr, (y1 + oy) * s_fr)]
    pl = Image.fromarray(stretch(frame[fy0:fy1, fx0:fx1])).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.LANCZOS)
    def show(img, tris=None):
        im = Image.fromarray(stretch(img.mean(-1) * 255)).resize(((x1 - x0) * Z, (y1 - y0) * Z), Image.LANCZOS).convert('RGB')
        if tris is not None:
            d = ImageDraw.Draw(im)
            for t in tris:
                p = [((hole[k][0] - x0) * Z, (hole[k][1] - y0) * Z) for k in t]; d.line(p + [p[0]], fill=(0, 200, 255), width=1)
        return im
    rows.append((side, [('Player now (frame)', pl.convert('RGB')), ('Simulated: fan of triangles (what the player does)', show(fan)),
                        ('Simulated: lid-to-lid strips (the fix)', show(lad)), ('The fan', show(fan, B.ear_clip(hole))),
                        ('The strips', show(lad, ladder(len(hole))))]))
PW = max(p.width for _, ps in rows for _, p in ps); PH = max(p.height for _, ps in rows for _, p in ps); G = 12
sheet = Image.new('RGB', (5 * (PW + G) + G, 60 + 2 * (PH + 64)), 'white'); d = ImageDraw.Draw(sheet)
d.text((G, 10), "Indigenous man: the painted white's shading, bright range stretched. Player frame vs the same shading laid in two ways.", fill='black', font=big)
y = 50
for side, ps in rows:
    d.text((G, y), 'Eye on the LEFT of the screen' if side == 'right' else 'Eye on the RIGHT of the screen', fill='black', font=big); y += 32
    for i, (t, p) in enumerate(ps):
        x = G + i * (PW + G); d.text((x, y), t, fill=(50, 50, 50), font=font); sheet.paste(p, (x, y + 26))
    y += PH + 34
out = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/notes/eye_corner_layer_20261102/indigenous_man_fan_vs_strips.png'; sheet.save(out); print(out, sheet.size)
