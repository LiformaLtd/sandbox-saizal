# Indigenous man, 2026-11-03: his eyes as the LOCAL PLAYER draws them now (full-size frame grabbed from the WebGPU canvas,
# corner layer on, your edited corners), next to the Studio picture (served brown layer over the 1024 base picture) and the
# eye patch editor's own preview. Each eye at the same on-screen eye width, plus the inner corners enlarged.
#   player_vs_studio_sheet.py <frame.png> <out.png>
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work')
import build_stage_eye_layers as B
FRAME, OUT = sys.argv[1], sys.argv[2]
PID = '1d5b0001'; S = 1024
OLD = '/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/e7be9061-df19-4b64-910e-8dab35002f37/scratchpad/studio'
ED = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work/work/eye_patch_editor/1d5b0001'
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22); big = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
fm = json.load(open(f'{B.SRC}/{PID}/face-meshes.json'))
face = np.array(next(v for v in fm['visemes'] if v.get('id') == 'neutral')['cohortLandmarks'], float)[:, :2] * S
holes = {s: B.smooth_loop(face[B.DRAW[s]]) for s in ('right', 'left')}
EYE_W_SHOW = 640  # every eye panel is scaled so the eye hole is this wide


def pupils(im):
    """The two pupils in a player frame (as corner_sheet.py eye_box): solid near-black round blobs with eye white beside."""
    a = np.asarray(im.convert('RGBA')); h = a.shape[0]
    dark = ((a[..., 3] > 200) & (a[..., :3].max(2) < 40) & (np.arange(h)[:, None] < h * 0.6)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark)
    rgb = a[..., :3].astype(int)
    white = (a[..., 3] > 200) & (rgb.mean(2) > 150) & (rgb[..., 0] - rgb[..., 2] < 15)
    def white_near(k):
        x, y, w, hh = st[k, :4]; r = max(w, hh)
        return white[max(0, y - r): y + hh + r, max(0, x - 2 * r): x + w + 2 * r].sum()
    round_ = [k for k in range(1, n) if 0.6 < st[k, 2] / st[k, 3] < 1.6 and st[k, 4] > 40]
    first, *rest = sorted(round_, key=white_near, reverse=True)
    second = next(k for k in rest if abs(cen[k][0] - cen[first][0]) > a.shape[1] * 0.04)
    (x1, y1), (x2, y2) = sorted(tuple(cen[k]) for k in (first, second))
    return (x1, y1), (x2, y2)


frame = Image.open(FRAME).convert('RGB')
(px1, py1), (px2, py2) = pupils(frame)
gap = px2 - px1
# the 1024 picture: pupil dots and their gap -> the frame's scale
pp = {s: face[B.PUPIL[s]] for s in ('right', 'left')}
gap1024 = abs(pp['left'][0] - pp['right'][0])
scale = gap / gap1024
print(f'frame {frame.size}, pupils {px1:.0f},{py1:.0f} / {px2:.0f},{py2:.0f}; frame px per 1024 px = {scale:.2f}')

base = Image.open(f'{OLD}/base_{PID}.webp').convert('RGBA'); bg = Image.new('RGBA', base.size, (236, 236, 236, 255))
studio = Image.alpha_composite(Image.alpha_composite(bg, base), Image.open(f'/Users/saizalpreetkaur./Desktop/eye_layers/{PID}/brown.png').convert('RGBA')).convert('RGB')
meta = json.load(open(f'{ED}/meta.json'))


def editor_preview(side):
    e = meta['eyes'][side]; W, H = e['width'], e['height']
    hc = np.zeros((H * 4, W * 4), np.uint8); cv2.fillPoly(hc, [np.round(np.array(e['hole']) * 64).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
    h = cv2.resize(hc, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    ball = np.asarray(Image.open(f'{ED}/{side}/eyeball.png').convert('RGBA')).astype(np.float32)
    p = np.asarray(Image.open(f'{ED}/{side}/painted.png').convert('RGB')).astype(np.float32)
    s = np.asarray(Image.open(f'{ED}/{side}/shade.png').convert('RGB')).astype(np.float32)
    ma = np.asarray(Image.open(f'{B.SRC}/{PID}/_workflow/eye-patch-masks/{side}.png').convert('L')).astype(np.float32) / 255
    ba = ball[..., 3:] / 255; ev = ball[..., :3] * (s / 255) * ba + p * (1 - ba); v = p * (1 - h[..., None]) + ev * h[..., None]
    o = v * (1 - ma[..., None]) + p * ma[..., None]
    return Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)), np.array(e['hole'])


rows = []
for side in ('right', 'left'):
    hole = holes[side]; hw = np.ptp(hole[:, 0]); cx, cy = hole[:, 0].mean(), hole[:, 1].mean()
    # the same window (in 1024 units) around the eye: 1.5 eye widths wide, 0.9 high
    win_w, win_h = hw * 1.5, hw * 0.9
    z = EYE_W_SHOW / hw
    # player: the frame's pupil for this side -> window around it
    pxy = (px1, py1) if side == 'right' else (px2, py2)
    off = (pp[side] - [cx, cy]) * scale   # pupil offset from the hole centre, in frame px
    fx, fy = pxy[0] - off[0], pxy[1] - off[1]
    box_f = (fx - win_w * scale / 2, fy - win_h * scale / 2, fx + win_w * scale / 2, fy + win_h * scale / 2)
    pl = frame.crop(tuple(int(round(v)) for v in box_f)).resize((int(win_w * z), int(win_h * z)), Image.LANCZOS)
    box_s = (cx - win_w / 2, cy - win_h / 2, cx + win_w / 2, cy + win_h / 2)
    st = studio.crop(tuple(int(round(v)) for v in box_s)).resize((int(win_w * z), int(win_h * z)), Image.LANCZOS)
    ep, ehole = editor_preview(side)
    ehw = np.ptp(ehole[:, 0]); ecx, ecy = ehole[:, 0].mean(), ehole[:, 1].mean(); ez = EYE_W_SHOW / ehw
    box_e = (ecx - win_w / hw * ehw / 2, ecy - win_h / hw * ehw / 2, ecx + win_w / hw * ehw / 2, ecy + win_h / hw * ehw / 2)
    ed = ep.crop(tuple(int(round(v)) for v in box_e)).resize((int(win_w * z), int(win_h * z)), Image.LANCZOS)
    rows.append((side, [('Local player now (frame from the WebGPU canvas, corner layer on)', pl),
                        ('Studio picture now (brown layer over the 1024 picture)', st),
                        ('Eye patch editor preview', ed)]))
    print(side, 'player crop px', [round(v) for v in box_f], 'frame px per eye width', round(hw * scale, 1))

PW = max(p.width for _, ps in rows for _, p in ps); PH = max(p.height for _, ps in rows for _, p in ps); GAP = 16
# inner-corner zooms: the inner third of each panel, x2
ZC = 2
sheet = Image.new('RGB', (3 * (PW + GAP) + GAP, 90 + 2 * (PH + 70 + PH // 3 * ZC + 40)), 'white'); d = ImageDraw.Draw(sheet)
d.text((GAP, 10), 'Indigenous man: the player, the Studio picture and the editor preview, each eye scaled to the same width; under each, its inner corner enlarged 2x more.', fill='black', font=big)
d.text((GAP, 46), f'Player frame: {frame.size[0]}x{frame.size[1]} px, {rows and round(np.ptp(holes["right"][:, 0]) * scale)} frame px per eye width (1024 picture: {np.ptp(holes["right"][:, 0]):.0f} px).', fill=(60, 60, 60), font=font)
y = 90
for side, panels in rows:
    d.text((GAP, y), "His right eye (viewer's left) - inner corner on the right" if side == 'right' else "His left eye (viewer's right) - inner corner on the left", fill='black', font=big); y += 36
    x = GAP
    for t, p in panels:
        d.text((x, y), t, fill=(60, 60, 60), font=font); sheet.paste(p, (x, y + 28))
        cw = p.width // 3; ch = p.height // 3
        cbox = (p.width - cw, p.height // 3, p.width, p.height // 3 + ch) if side == 'right' else (0, p.height // 3, cw, p.height // 3 + ch)
        zoom = p.crop(cbox).resize((cw * ZC, ch * ZC), Image.LANCZOS)
        sheet.paste(zoom, (x, y + 28 + PH + 8)); x += PW + GAP
    y += PH + 70 + PH // 3 * ZC + 4
sheet.save(OUT); print(OUT, sheet.size)
