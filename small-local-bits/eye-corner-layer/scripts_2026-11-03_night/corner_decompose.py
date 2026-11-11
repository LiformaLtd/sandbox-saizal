# Indigenous man, 2026-11-03: (1) "the red area I selected is not being displayed even inside the yellow line" and
# (2) "why is this dark black showing while it is nowhere in the shading images".
# Renders his eyes with the Studio layer builder's own eye_patch in five ways and compares them pixel by pixel:
#   OFF   corner_mode 'plate' (the layer is see-through where the patch is: the base picture shows)
#   ON    corner_mode 'patch' (the patch = a copy of the close-up painting, alpha = your mask)  <- what the Studio shows now
#   RED   the same patch with its colours replaced by red: where the patch is drawn
#   PAINT the whole hole filled with the close-up painting (patch alpha 1 everywhere): what the patch copies
#   NONE  no corner patch at all (eyeball + shading only)
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work')
import build_stage_eye_layers as B
PID = '1d5b0001'; S = 1024; K = B.K
OLD = '/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/e7be9061-df19-4b64-910e-8dab35002f37/scratchpad/studio'
ED = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work/work/eye_patch_editor/1d5b0001'
NOTES = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/notes/eye_corner_layer_20261102'
pack = f'{B.SRC}/{PID}'
fm = json.load(open(f'{pack}/face-meshes.json'))
tex = fm['eyeModel']['innerEyeTexture']
face = np.array(next(v for v in fm['visemes'] if v.get('id') == 'neutral')['cohortLandmarks'], float)[:, :2]
scale_mult = fm['eyeModel'].get('innerEyeScale') or 0.9  # as build()
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
big = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
base = np.asarray(Image.open(f'{OLD}/base_{PID}.webp').convert('RGBA')).astype(np.float32) / 255
grey = np.array([236, 236, 236, 255], np.float32) / 255
base_rgb = base[..., :3] * base[..., 3:] + grey[:3] * (1 - base[..., 3:])

# the same inputs build() loads
eyeballs = {s: B.rgba(f'{B.IRISES}/{PID}/brown_{s}.png') for s in tex}  # the Studio's brown layer eyeballs, as build()
shades = {s: B.rgba(f'{pack}/{tex[s]["shadingFile"]}') for s in tex}
corners = {s: B.rgba(f'{pack}/{tex[s]["cornerFile"]}') for s in tex}
masks = {s: np.asarray(Image.open(f'{pack}/_workflow/eye-patch-masks/{s}.png').convert('L')).astype(np.float32) / 255 for s in tex}
painted = {s: np.asarray(Image.open(f'{ED}/{s}/painted.png').convert('RGBA')).astype(np.float32) / 255 for s in tex}
# check: the pack's corner alpha is the saved mask
for s in tex:
    print(s, 'corner alpha vs mask, max diff', float(np.abs(corners[s][..., 3] - masks[s]).max()))

# the iris pictures build() would use for brown
import glob, os
iris_dir = B.IRISES
print('iris dir', iris_dir, os.path.exists(iris_dir))


def render(side, mode):
    corner = corners[side]
    cm = 'patch'
    if mode == 'OFF': cm = 'plate'
    elif mode == 'RED':
        corner = corner.copy(); corner[..., :3] = [1, 0, 0]
    elif mode == 'PAINT':
        corner = painted[side].copy(); corner[..., 3] = 1
    elif mode == 'NONE':
        corner = None
    x0, y0, prem = B.eye_patch(face, tex[side], side, eyeballs[side], scale_mult, S, shades[side], corner, cm)
    return x0, y0, prem


def compose(x0, y0, prem):
    """Layer (K x supersampled, premultiplied) over the base picture crop, at K x (base upscaled with LANCZOS)."""
    H, W = prem.shape[:2]
    bw, bh = W // K, H // K
    crop = Image.fromarray((base_rgb[y0:y0 + bh, x0:x0 + bw] * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    c = np.asarray(crop).astype(np.float32) / 255
    out = prem[..., :3] + c * (1 - prem[..., 3:])
    return out


def to_img(a, z=1):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    if z != 1: im = im.resize((im.width * z, im.height * z), Image.NEAREST)
    return im


results = {}
for side in ('right', 'left'):
    rs = {m: render(side, m) for m in ('OFF', 'ON', 'RED', 'PAINT', 'NONE')}
    x0, y0, _ = rs['ON']
    imgs = {m: compose(*rs[m]) for m in rs}
    hole = B.smooth_loop(face[B.DRAW[side]] * S)
    hz = (hole - [x0, y0]) * K
    H, W = imgs['ON'].shape[:2]
    inside = np.zeros((H, W), np.uint8); cv2.fillPoly(inside, [np.round(hz * 16).astype(np.int32)], 1, shift=4); inside = inside.astype(bool)
    red_a = rs['RED'][2][..., 3] > 0  # where any layer pixel is drawn
    patch_here = (rs['RED'][2][..., 0] > 0.5 * rs['RED'][2][..., 3]) & inside  # red dominant = patch drawn here
    d = np.abs(imgs['ON'] - imgs['OFF']).max(-1)
    lum_on = imgs['ON'].mean(-1); lum_off = imgs['OFF'].mean(-1); lum_paint = imgs['PAINT'].mean(-1)
    n_patch = patch_here.sum() / K / K
    changed = (d > 8 / 255) & patch_here
    dark_on = (lum_on < 0.25) & inside; dark_off = (lum_off < 0.25) & inside; dark_none = (imgs['NONE'].mean(-1) < 0.25) & inside
    results[side] = dict(patch_px=float(n_patch), visibly_changed_px=float(changed.sum() / K / K),
                         dark_px_on=float(dark_on.sum() / K / K), dark_px_off=float(dark_off.sum() / K / K),
                         dark_px_no_corner=float(dark_none.sum() / K / K),
                         dark_in_patch=float((dark_on & patch_here).sum() / K / K),
                         paint_dark_in_patch=float(((lum_paint < 0.25) & patch_here).sum() / K / K))
    print(side, results[side])
    results[side]['imgs'] = imgs; results[side]['hz'] = hz; results[side]['xy'] = (x0, y0); results[side]['inside'] = inside
    results[side]['patch_here'] = patch_here; results[side]['dark_on'] = dark_on

# ---- sheet 1: the five renders per eye, hole in yellow
Z = 1  # already K=8 x
GAP = 14
PW = max(results[s]['imgs']['ON'].shape[1] for s in results); PH = max(results[s]['imgs']['ON'].shape[0] for s in results)
titles = [('OFF', 'Corner layer OFF (base picture shows where the patch is)'), ('ON', 'Corner layer ON = what the Studio shows'),
          ('RED', 'Where the patch is drawn (red)'), ('PAINT', 'The close-up painting the patch copies, filling the hole'),
          ('NONE', 'No corner patch at all')]
cols = 5
sheet = Image.new('RGB', (cols * (PW + GAP) + GAP, 150 + 2 * (PH + 70)), 'white')
dr = ImageDraw.Draw(sheet)
dr.text((GAP, 10), 'Indigenous man: the Studio eye built five ways with the same builder. Yellow = eye hole. The patch is a copy of the close-up painting with your mask as its alpha,', fill='black', font=big)
dr.text((GAP, 44), 'so where the painting is white, the patch paints white over white: it IS drawn (red panel) but looks the same. Dark pixels appear only where the painting is dark there (the lid band at the inner corner).', fill='black', font=big)
y = 150
for side in ('right', 'left'):
    r = results[side]
    tag = "His right eye (viewer's left)" if side == 'right' else "His left eye (viewer's right)"
    dr.text((GAP, y - 40), f"{tag}: patch drawn on {r['patch_px']:.0f} px inside the hole, of which {r['visibly_changed_px']:.0f} px look different from OFF; "
            f"dark pixels inside the hole: OFF {r['dark_px_off']:.0f}, ON {r['dark_px_on']:.0f} (all {r['dark_in_patch']:.0f} of them under the patch; the painting is dark on {r['paint_dark_in_patch']:.0f} px there)", fill='black', font=font)
    x = GAP
    for m, t in titles:
        im = to_img(r['imgs'][m])
        if m in ('ON', 'RED', 'OFF'):
            ImageDraw.Draw(im).line([tuple(p) for p in np.vstack([r['hz'], r['hz'][:1]])], fill=(255, 220, 0), width=1)
        dr.text((x, y), t, fill=(60, 60, 60), font=font)
        sheet.paste(im, (x, y + 28)); x += PW + GAP
    y += PH + 70 + 40
out1 = f'{NOTES}/indigenous_man_corner_five_ways.png'; sheet.save(out1); print(out1, sheet.size)

# ---- sheet 2: the black wedge, his right eye inner corner, zoomed: ON / NONE / PAINT / the shading picture / painted close-up
side = 'right'; r = results[side]
dark = r['dark_on'] & r['patch_here']
ys, xs = np.nonzero(dark)
if len(xs):
    cx, cy = int(xs.mean()), int(ys.mean())
    print('dark wedge centre (K px)', cx, cy, '-> 1024 px', r['xy'][0] + cx / K, r['xy'][1] + cy / K, 'n', len(xs) / K / K)
    half = 16 * K
    x0c, y0c = max(cx - half, 0), max(cy - half, 0)
    x1c, y1c = min(cx + half, r['imgs']['ON'].shape[1]), min(cy + half, r['imgs']['ON'].shape[0])
    ZZ = 3
    panels = []
    for m, t in (('OFF', 'Corner layer OFF'), ('ON', 'Corner layer ON (the black wedge)'), ('NONE', 'No corner patch'),
                 ('RED', 'Where the patch is drawn'), ('PAINT', 'The close-up painting there')):
        im = to_img(r['imgs'][m][y0c:y1c, x0c:x1c], ZZ)
        if m in ('ON', 'OFF'):
            pts = (r['hz'] - [x0c, y0c]) * ZZ
            ImageDraw.Draw(im).line([tuple(p) for p in np.vstack([pts, pts[:1]])], fill=(255, 220, 0), width=1)
        panels.append((t, im))
    # the shading picture at the same spot: render with eyeball = white, no corner -> shows the shade map's own values in the hole
    white = eyeballs[side].copy(); white[..., :3] = 1
    xs_, ys_, prem = B.eye_patch(face, tex[side], side, white, scale_mult, S, shades[side], None, 'plate')
    shade_img = compose(xs_, ys_, prem)
    panels.append(('The shading picture there (on plain white)', to_img(shade_img[y0c:y1c, x0c:x1c], ZZ)))
    PW2 = max(p.width for _, p in panels); PH2 = max(p.height for _, p in panels)
    sh2 = Image.new('RGB', (len(panels) * (PW2 + GAP) + GAP, 110 + PH2 + 40), 'white')
    d2 = ImageDraw.Draw(sh2)
    d2.text((GAP, 10), "His right eye, inner corner, 24x: the black wedge is the close-up painting's dark lid band, copied in by the corner patch where your mask", fill='black', font=big)
    d2.text((GAP, 44), 'covers it inside the hole. With no corner patch it is gone. The shading picture there is bright: it is not the shading.', fill='black', font=big)
    x = GAP
    for t, p in panels:
        d2.text((x, 84), t, fill=(60, 60, 60), font=font); sh2.paste(p, (x, 112)); x += PW2 + GAP
    out2 = f'{NOTES}/indigenous_man_black_wedge_source.png'; sh2.save(out2); print(out2, sh2.size)
else:
    print('no dark pixels under the patch in his right eye')
