# Indigenous man, 2026-11-03 ("the corner layer turned on is a bit funny ... it isn't displaying everything"):
# per eye: what was painted in the editor (red), and where that lands on the Studio picture with the corner layer on/off.
# Both the Studio layer (build_stage_eye_layers: A = out_a * hole_a) and the player (irisGpuLayers: the corner patch is
# drawn on the eye-hole triangles only) cut the corner patch at the eye hole, so only the painted area INSIDE the hole shows.
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work')
import build_stage_eye_layers as B
PID = '1d5b0001'; S = 1024; Z = 8
OLD = '/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/e7be9061-df19-4b64-910e-8dab35002f37/scratchpad/studio'
ED = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work/work/eye_patch_editor/1d5b0001'
pack = f'{B.SRC}/{PID}'
fm = json.load(open(f'{pack}/face-meshes.json'))
tex = fm['eyeModel']['innerEyeTexture']
face = np.array(next(v for v in fm['visemes'] if v.get('id') == 'neutral')['cohortLandmarks'], float)[:, :2]
F = face * S
meta = json.load(open(f'{ED}/meta.json'))
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
big = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)

base = Image.open(f'{OLD}/base_{PID}.webp').convert('RGBA')
bg = Image.new('RGBA', base.size, (236, 236, 236, 255))
on = Image.alpha_composite(Image.alpha_composite(bg, base), Image.open(f'/Users/saizalpreetkaur./Desktop/eye_layers/{PID}/brown.png').convert('RGBA'))
off = Image.alpha_composite(Image.alpha_composite(bg, base), Image.open(f'{OLD}/plate/{PID}/brown.png').convert('RGBA'))


def mask_in_picture(side, x0, y0, W, H):
    """The painted area (shade-frame mask) sampled over the picture crop at Z x, through the same lid-dot mapping the
    Studio builder uses (global affine outside the hole, triangles inside), with no hole cut."""
    m = np.asarray(Image.open(f'{pack}/_workflow/eye-patch-masks/{side}.png').convert('L')).astype(np.float32) / 255
    hole = B.smooth_loop(F[B.DRAW[side]])
    X, Y = np.meshgrid(x0 + (np.arange(W) + 0.5) / Z, y0 + (np.arange(H) + 0.5) / Z)
    sh_h, sh_w = m.shape
    suv = tex[side]['shadingLandmarkUv']
    raw = np.array([[suv[str(i)][0] * sh_w, suv[str(i)][1] * sh_h] for i in B.DRAW[side]])
    loop_uv = B.uv_following_curve(hole, B.straight_loop(raw), len(raw))
    off_ = np.c_[hole, np.ones(len(hole))]
    g = np.linalg.lstsq(off_, loop_uv, rcond=None)[0]
    su = g[0, 0] * X + g[1, 0] * Y + g[2, 0]; sv = g[0, 1] * X + g[1, 1] * Y + g[2, 1]
    for t in B.ear_clip(hole) or []:
        P = hole[list(t)]; T = loop_uv[list(t)]
        M = cv2.getAffineTransform(P.astype(np.float32), T.astype(np.float32))
        mm = np.zeros((H, W), np.uint8)
        cv2.fillConvexPoly(mm, np.round(((P - [x0, y0]) * Z - 0.5) * 16).astype(np.int32), 1, lineType=cv2.LINE_8, shift=4)
        sel = mm.astype(bool)
        su[sel] = M[0, 0] * X[sel] + M[0, 1] * Y[sel] + M[0, 2]
        sv[sel] = M[1, 0] * X[sel] + M[1, 1] * Y[sel] + M[1, 2]
    return B.sample(np.dstack([m, m, m, m]), su, sv)[..., 3], hole


def outline(img, pts, colour, width=2, dash=False):
    d = ImageDraw.Draw(img)
    P = [tuple(p) for p in np.vstack([pts, pts[:1]])]
    if not dash:
        d.line(P, fill=colour, width=width); return
    for i in range(len(P) - 1):
        if i % 2 == 0: d.line([P[i], P[i + 1]], fill=colour, width=width)


def red_edge(img, area, colour=(255, 40, 40)):
    """Draw the edge of a 0..1 area as a line."""
    a = (area > 0.5).astype(np.uint8)
    edge = a - cv2.erode(a, np.ones((3, 3), np.uint8))
    arr = np.asarray(img).copy()
    arr[edge.astype(bool), :3] = colour
    return Image.fromarray(arr)


rows = []
counts = {}
for side in ('right', 'left'):
    hole = B.smooth_loop(F[B.DRAW[side]])
    x0, y0 = int(hole[:, 0].min()) - 10, int(hole[:, 1].min()) - 10
    x1, y1 = int(hole[:, 0].max()) + 11, int(hole[:, 1].max()) + 11
    W, H = (x1 - x0) * Z, (y1 - y0) * Z
    area, _ = mask_in_picture(side, x0, y0, W, H)
    hz = (hole - [x0, y0]) * Z
    panels = []
    # 1. editor view: painted close-up with the painted area in red, hole dashed yellow
    e = meta['eyes'][side]
    painted = Image.open(f'{ED}/{side}/painted.png').convert('RGBA')
    m = np.asarray(Image.open(f'{pack}/_workflow/eye-patch-masks/{side}.png').convert('L')).astype(np.float32) / 255
    arr = np.asarray(painted).astype(np.float32)
    arr[..., :3] = arr[..., :3] * (1 - 0.55 * m[..., None]) + np.array([255, 40, 40]) * 0.55 * m[..., None]
    ev = Image.fromarray(arr.astype(np.uint8)).resize((painted.width * 5, painted.height * 5), Image.NEAREST)
    outline(ev, np.array(e['hole']) * 5, (255, 220, 0), 3, dash=True)
    panels.append(('What you painted (red), eye hole dashed', ev))
    # 2. Studio on, with the painted area's edge in red and the hole in yellow
    crop_on = on.crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS)
    v = red_edge(crop_on, area)
    outline(v, hz, (255, 220, 0), 2)
    panels.append(('Studio, corner layer ON: red = your area, yellow = eye hole', v))
    # 3. Studio on, plain
    panels.append(('Studio, corner layer ON', on.crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS)))
    # 4. Studio off
    panels.append(('Studio, corner layer OFF', off.crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS)))
    inside = np.zeros((H, W), np.uint8); cv2.fillPoly(inside, [np.round(hz * 16).astype(np.int32)], 1, shift=4)
    painted_px = (m > 0.5).sum()
    in_px = ((area > 0.5) & inside.astype(bool)).sum() / Z / Z
    counts[side] = (int(painted_px), float(in_px))
    rows.append((side, panels))

GAP = 16
PW = max(p.width for _, ps in rows for _, p in ps)
PH = max(p.height for _, ps in rows for _, p in ps)
cols = 4
sheet_w = cols * (PW + GAP) + GAP
sheet_h = 120 + 2 * (PH + 50 + GAP)
sheet = Image.new('RGB', (sheet_w, sheet_h), 'white')
d = ImageDraw.Draw(sheet)
d.text((GAP, 10), 'Indigenous man: the corner layer is cut at the eye hole (yellow) in the Studio picture and in the player alike,', fill='black', font=big)
d.text((GAP, 46), 'so only the part of your red area inside the yellow line is drawn. Outside it the picture is the plain face.', fill='black', font=big)
d.text((GAP, 84), f"His right eye (viewer's left): painted {counts['right'][0]} px of the editor frame, about {counts['right'][1]:.0f} px of the 1024 picture show inside the hole.   "
       f"His left eye: {counts['left'][0]} px painted, about {counts['left'][1]:.0f} shown.", fill=(60, 60, 60), font=font)
y = 120
for side, panels in rows:
    tag = "His right eye (viewer's left)" if side == 'right' else "His left eye (viewer's right)"
    d.text((GAP, y), tag, fill='black', font=big); y += 36
    x = GAP
    for title, p in panels:
        d.text((x, y), title, fill=(60, 60, 60), font=font)
        sheet.paste(p.convert('RGB'), (x, y + 28))
        x += PW + GAP
    y += PH + 28 + GAP
out = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/notes/eye_corner_layer_20261102/indigenous_man_corner_on_what_shows.png'
sheet.save(out); print(out, sheet.size, counts)
