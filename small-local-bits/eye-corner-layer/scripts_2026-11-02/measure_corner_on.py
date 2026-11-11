# Visible eye opening on the Studio preview picture with the corner layer ON (2026-11-02, user: "measure here").
# Opening = where the eyeball still shows once the corner layer is drawn = the layer built --corner plate (eyeball x hole x
# (1 - corner alpha); identical to the Studio's served brown layer), alpha > 127. Width along the corner-to-corner line,
# height at right angles to it (same as studio_eye_holes_1024.csv). Picture-left / picture-right as you look at it.
import sys, json, csv, numpy as np
from PIL import Image
sys.path.insert(0, '/Users/saizalpreetkaur./Desktop/Liforma_LTD/face_mesh_work')
sys.path.insert(0, sys.argv[1] + '/studio')
import build_stage_eye_layers as B
from studio_sheet import NAMES
CORNERS = {'right': (33, 133), 'left': (263, 362)}
OUT = sys.argv[2]; S = 1024
def along(pts, a, b):
    u = (b - a) / np.linalg.norm(b - a); n = np.array([-u[1], u[0]])
    t = (pts - a) @ u; h = (pts - a) @ n
    return t.max() - t.min(), h.max() - h.min()
hole_csv = {r['avatar']: r for r in csv.DictReader(open(OUT.replace('studio_eye_openings_corner_on_1024.csv', 'studio_eye_holes_1024.csv')))}
rows = []
for pid, name in NAMES.items():
    fm = json.load(open(f'{B.SRC}/{pid}/face-meshes.json'))
    face = np.array(next(v for v in fm['visemes'] if v.get('id') == 'neutral')['cohortLandmarks'], float)[:, :2] * S
    alpha = np.asarray(Image.open(f'{sys.argv[1]}/studio/plate/{pid}/brown.png'))[..., 3]
    ys, xs = np.nonzero(alpha > 127)
    r = {'avatar': pid, 'name': name.replace(' (no corner pictures)', '')}
    for side in ('right', 'left'):
        a, b = face[CORNERS[side][0]], face[CORNERS[side][1]]
        cx = (a[0] + b[0]) / 2
        near = np.abs(xs - cx) < abs(b[0] - a[0])
        w, h = along(np.c_[xs[near], ys[near]].astype(float), a, b)
        tag = 'picL' if cx < S / 2 else 'picR'
        r[f'{tag}_w'] = round(w + 1, 1); r[f'{tag}_h'] = round(h + 1, 1)
        r[f'{tag}_w_lost'] = round(float(hole_csv[pid][f'{tag}_w']) - r[f'{tag}_w'], 1)
        r[f'{tag}_h_lost'] = round(float(hole_csv[pid][f'{tag}_h']) - r[f'{tag}_h'], 1)
    rows.append(r)
cols = ['avatar', 'name', 'picL_w', 'picL_h', 'picR_w', 'picR_h', 'picL_w_lost', 'picL_h_lost', 'picR_w_lost', 'picR_h_lost']
with open(OUT, 'w', newline='') as f:
    wtr = csv.DictWriter(f, cols); wtr.writeheader(); wtr.writerows(rows)
for r in rows:
    dw = 100 * (r['picR_w'] / r['picL_w'] - 1); dh = 100 * (r['picR_h'] / r['picL_h'] - 1)
    print(f"| {r['name']} | {r['picL_w']} × {r['picL_h']} | {r['picR_w']} × {r['picR_h']} | {dw:+.1f}% / {dh:+.1f}% | {r['picL_w_lost']} / {r['picR_w_lost']} | {r['picL_h_lost']} / {r['picR_h_lost']} |")
