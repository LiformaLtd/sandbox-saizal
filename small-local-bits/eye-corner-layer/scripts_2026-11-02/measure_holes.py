# Eye hole width + height on the Studio still picture (1024 px), both eyes, all 20 (2026-11-02).
# Hole = the curve build_stage_eye_layers.py cuts (Catmull-Rom through the 16 eyelid dots, neutral cohort dots).
# Width = corner to corner; height = widest opening at right angles to that line. Cross-check: the brown layer's alpha.
import sys, json, csv, numpy as np
from PIL import Image
sys.path.insert(0, '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work')
import build_stage_eye_layers as B
IDS = '0a5a0001 0a5b0001 1d5a0001 1d5b0001 5a5a0002 5a5b0001 5e5a0001 5e5b0001 ac5a0001 ac5b0001 ae5a0002 ae5b0001 af5a0001 af5b0001 e05a0001 e05b0001 ea5a0002 ea5b0001 ed5a0001 ed5b0001'.split()
CORNERS = {'right': (33, 133), 'left': (263, 362)}  # outer, inner
OUT = sys.argv[1]; S = 1024
def along(pts, a, b):
    u = (b - a) / np.linalg.norm(b - a); n = np.array([-u[1], u[0]])
    t = (pts - a) @ u; h = (pts - a) @ n
    return t.max() - t.min(), h.max() - h.min()
rows = []
for pid in IDS:
    fm = json.load(open(f'{B.SRC}/{pid}/face-meshes.json'))
    face = np.array(next(v for v in fm['visemes'] if v.get('id') == 'neutral')['cohortLandmarks'], float)[:, :2] * S
    alpha = np.asarray(Image.open(f'/Users/saizalpreetkaur./Desktop/eye_layers/{pid}/brown.png'))[..., 3]
    r = {'avatar': pid}
    for side in ('right', 'left'):
        hole = B.smooth_loop(face[B.DRAW[side]])
        a, b = face[CORNERS[side][0]], face[CORNERS[side][1]]
        w, h = along(hole, a, b)
        cx = hole[:, 0].mean()
        # the layer's own opaque pixels near this eye
        ys, xs = np.nonzero(alpha > 127)
        near = np.abs(xs - cx) < w
        lw, lh = along(np.c_[xs[near], ys[near]].astype(float), a, b)
        tag = 'picL' if cx < S / 2 else 'picR'
        r[f'{tag}_w'] = round(w, 1); r[f'{tag}_h'] = round(h, 1)
        r[f'{tag}_layer_w'] = round(lw + 1, 1); r[f'{tag}_layer_h'] = round(lh + 1, 1)
    rows.append(r)
cols = ['avatar', 'picL_w', 'picL_h', 'picR_w', 'picR_h', 'picL_layer_w', 'picL_layer_h', 'picR_layer_w', 'picR_layer_h']
with open(OUT, 'w', newline='') as f:
    wtr = csv.DictWriter(f, cols); wtr.writeheader(); wtr.writerows(rows)
for r in rows:
    dw = 100 * (r['picR_w'] / r['picL_w'] - 1); dh = 100 * (r['picR_h'] / r['picL_h'] - 1)
    print(f"{r['avatar']}  L {r['picL_w']:5.1f} x {r['picL_h']:4.1f}   R {r['picR_w']:5.1f} x {r['picR_h']:4.1f}   R vs L: w {dw:+5.1f}%  h {dh:+5.1f}%   layer L {r['picL_layer_w']}x{r['picL_layer_h']} R {r['picR_layer_w']}x{r['picR_layer_h']}")
