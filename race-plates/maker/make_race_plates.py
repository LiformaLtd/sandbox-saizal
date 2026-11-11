#!/usr/bin/env python3
"""make_race_plates.py - one outfit in, one plate per race out.

Inputs are Anna's plate (the light endpoint) and Precious's plate (the dark endpoint) of the SAME outfit, both with a
transparent background, already corrected the way the pack plates are. Each race plate is Anna's body with the skin
brought to the race's colour, the race's face on top, blended only at the neck (rows 361-410 of the 1024 frame).

  colour   the image-lerp tool's mix, out = A + t*(B-A) per channel, with one fixed t per race (race_values.json).
           The browser canvas rounding is reproduced, so the result matches the tool to within a few levels.
  skin     a pixel is skin when it is skin-coloured on Anna AND much darker on Precious where both plates are solid;
           specks and thin strips are dropped; unclear pixels next to skin take the straight mix.
  recolour Anna's skin is scaled by the ratio of local means (mix / Anna), so her own shading is kept. Clothing and
           the outline are Anna's exactly.
  face     the race face above row 361; over rows 361-410 the body's soft shading is carried into the face and the
           two are cross-faded; collars and linings are kept from the body.
  fixes    --fixes on (default) adds three edge fixes: no green pull on the race faces, outline pixels take the skin
           answer from 4 px inside, and the join is never more see-through than the body. --fixes off reproduces the
           v2/v4 Desktop sets byte for byte.
  checks   outline below row 410 exactly Anna's, clothing unchanged, face exact, and the hands moved at least half of
           the intended change; a plate that fails is still written but marked "ok": false in the report.

usage: make_race_plates.py ANNA PRECIOUS OUT_DIR [--name NAME] [--races r1,r2,...] [--fixes on|off]
                           [--faces DIR] [--values FILE] [--webp]
writes: OUT_DIR/<race>/<NAME>.png (or .webp) and OUT_DIR/<NAME>_report.json
needs:  python3 with numpy, scipy, pillow
"""
import os, sys, json, argparse, numpy as np
from PIL import Image
from scipy.ndimage import (gaussian_filter, distance_transform_edt, binary_opening, binary_dilation, binary_erosion,
                           label)

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 1024
Y0, Y1 = 361, 410          # the neck join rows
SIGMA = 12.0               # local-mean radius for the recolour
HAND_BOX = (800, 990, 330, 700)   # rows, cols of the hands in the 1024 frame
HAND_TOL = 45                     # allowed miss from the race's hand colour, red+green+blue shades summed
                                  # (good plates land 10-25 away because shaded skin is counted; a miss of the
                                  # kind seen on the nurse and the blue shirts is over 100)


# ---------------------------------------------------------------- loading
def load_rgba(path):
    """Plate as RGBA uint8 in the 1024 frame. Other sizes are resized with the colour pre-multiplied by the
    see-through, so soft edges do not bleed their hidden colour."""
    im = Image.open(path).convert('RGBA')
    if im.size == (SIZE, SIZE):
        return np.asarray(im)
    a = np.asarray(im).astype(np.float64) / 255.
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4]
    rs = np.asarray(Image.fromarray((pm * 255).astype(np.uint8), 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64) / 255.
    al = np.clip(rs[..., 3], 0, 1)
    rgb = np.where(al[..., None] > 1e-4, np.clip(rs[..., :3] / np.maximum(al[..., None], 1e-4), 0, 1), 0)
    return np.dstack([np.round(rgb * 255), np.round(al * 255)]).astype(np.uint8)


# ---------------------------------------------------------------- the lerp tool's mix
def _premul(x):
    a = x[..., 3:4]; p = x[..., :3] * a + 128; p = (p + (p >> 8)) >> 8
    return np.concatenate([p, a], -1)

def _unpremul(p):
    a = p[..., 3:4]; c = np.where(a > 0, np.round(p[..., :3] * 255 / np.maximum(a, 1)), 0)
    return np.concatenate([np.clip(c, 0, 255).astype(np.int64), a], -1)

def browser(x):
    """The browser canvas stores colour pre-multiplied by see-through; fully see-through pixels come back black and
    soft-edge colours get rounded. Applied to both inputs and to the output, like drawImage/getImageData/putImageData."""
    return _unpremul(_premul(x.astype(np.int64)))

def lerp_tool(A, B, t):
    t = np.clip(np.array(t, np.float64), -0.25, 1.25)
    tt = np.array([t[0], t[1], t[2], (t[0] + t[1] + t[2]) / 3])
    a, b = browser(A), browser(B)
    out = np.round(np.clip(a + tt * (b - a), 0, 255)).astype(np.int64)
    return browser(out).astype(np.uint8)


# ---------------------------------------------------------------- skin test
def ramp(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)

def skin_colour(x):
    r, g, b = x[..., 0], x[..., 1], x[..., 2]; rr = np.maximum(r, 1.0)
    return ramp(r - g, -4, 4) * ramp(g - b, -4, 4) * ramp(g / rr, 0.30, 0.40) * ramp((r - b) / rr, 0.10, 0.18) * ramp(r, 50, 70)

def skin_weight(Af, Bb):
    solidA = Af[..., 3] >= 250; both = solidA & (Bb[..., 3] >= 250)
    ratio = (Af[..., :3].sum(-1) + 15) / (Bb[..., :3].sum(-1) + 15)
    s = skin_colour(Af[..., :3]) * ramp(ratio, 1.20, 1.35) * both
    # real skin is one big connected area; shine on leather and the edge of a cardigan pass both tests in scattered
    # specks and thin strips. Drop anything thinner than 3 px or smaller than 300 px.
    disc = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)
    core = binary_opening(s > 0.5, structure=disc)
    lab, n = label(core); sizes = np.bincount(lab.ravel()); sizes[0] = 0
    big = np.isin(lab, np.where(sizes >= 300)[0])
    s = s * (binary_dilation(big, structure=disc, iterations=2) & (s > 0))
    # unclear pixels: skin-coloured on Anna, both solid, but not clearly darker on Precious. Shared highlights and
    # skin-coloured clothing land here; they take the straight mix (right for a highlight, nearly no change for
    # clothing). Only within 20 px of sure skin.
    unclear = both & (s <= 0.5) & (skin_colour(Af[..., :3]) > 0.5) & (ratio < 1.35)
    unclear &= distance_transform_edt(~((s > 0.5) & both)) <= 20
    # where only one plate is solid the answer comes from the nearest pixel where both are
    idx = distance_transform_edt(~both, return_indices=True)[1]
    s = np.where(both, s, s[idx[0], idx[1]])
    s[Af[..., 3] == 0] = 0
    return s, both, ratio, unclear

def edge_from_inside(s, unclear, Af):
    """fix 2: pixels within 4 px of Anna's outline take the skin answer of the nearest pixel 4 px inside."""
    solidA = Af[..., 3] >= 250; inner = binary_erosion(solidA, iterations=4)
    idx = distance_transform_edt(~inner, return_indices=True)[1]
    s = np.where(inner, s, s[idx[0], idx[1]]); s[Af[..., 3] == 0] = 0
    unclear = np.where(inner, unclear, unclear[idx[0], idx[1]]) & (Af[..., 3] > 0)
    return s, unclear


# ---------------------------------------------------------------- body recolour
def body(A, B, mix, fixes):
    L = lerp_tool(A, B, mix).astype(np.float64)
    Af = A.astype(np.float64); Bb = browser(B).astype(np.float64)
    s, both, ratio, unclear = skin_weight(Af, Bb)
    if fixes:
        s, unclear = edge_from_inside(s, unclear, Af)
    w = ((s > 0.99) * (skin_colour(Bb[..., :3]) > 0.99) * both * (ratio > 1.4)).astype(np.float64); w[:340] = 0
    cov = gaussian_filter(w, SIGMA); k = np.clip(cov / 0.05, 0, 1)[..., None]
    mL = np.stack([gaussian_filter(w * L[..., c], SIGMA) for c in range(3)], -1) / np.maximum(cov, 1e-6)[..., None]
    mA = np.stack([gaussian_filter(w * Af[..., c], SIGMA) for c in range(3)], -1) / np.maximum(cov, 1e-6)[..., None]
    gL = np.array([(w * L[..., c]).sum() / w.sum() for c in range(3)]); gA = np.array([(w * Af[..., c]).sum() / w.sum() for c in range(3)])
    mL = k * mL + (1 - k) * gL; mA = k * mA + (1 - k) * gA
    new = Af[..., :3] * (mL / np.maximum(mA, 1e-3))
    out = Af.copy(); out[..., :3] = np.clip(Af[..., :3] + s[..., None] * (new - Af[..., :3]), 0, 255)
    u = np.where(unclear, skin_colour(Af[..., :3]), 0.0)[..., None]
    out[..., :3] = out[..., :3] * (1 - u) + L[..., :3] * u
    return out, s, unclear, L


# ---------------------------------------------------------------- race face
def load_face(path, fixes):
    """The race face in the 1024 frame: see-through pixels take the colour of the nearest solid pixel. With fixes off
    the green pull written for Precious's green-screen base also runs (that is what turned the neck edge pink)."""
    f = load_rgba(path).astype(np.float64)
    rgb = f[..., :3]; a = f[..., 3] / 255.
    if not fixes:
        fg = a > 0.02; d = distance_transform_edt(fg)
        inner = d >= 8; ii = distance_transform_edt(~inner, return_indices=True)[1]; ref = rgb[ii[0], ii[1]]
        R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        g_ref = R * ref[..., 1] / np.maximum(ref[..., 0], 1)
        same = np.abs(np.log((R + 10) / (B + 10)) - np.log((ref[..., 0] + 10) / (ref[..., 2] + 10))) < 0.5
        w = np.clip((8 - d) / 4, 0, 1) * fg * same * (G > g_ref + 2)
        rgb = rgb.copy(); rgb[..., 1] = G - w * (G - g_ref)
    else:
        rgb = rgb.copy()
    solid = a >= 0.99; si = distance_transform_edt(~solid, return_indices=True)[1]
    rgb[~solid] = rgb[si[0], si[1]][~solid]
    return rgb, a


# ---------------------------------------------------------------- neck join
def ss(y, a, b):
    t = np.clip((y - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10)

def face_paste(FA, aA, FP, aP, skin_w, colour_w, fixes):
    H = FA.shape[0]; y = np.arange(H, dtype=np.float64)[:, None]; rows = np.arange(H)[:, None]
    both = binary_erosion((aA > 0.99) & (aP > 0.99) & (skin_w > 0.9), np.ones((7, 7))); band = np.zeros_like(both); band[350:Y1 + 2] = True
    valid = both & band; Dd = FP - FA
    if valid.sum() > 50:
        k = distance_transform_edt(~valid, return_indices=True)[1]; Df = Dd[k[0], k[1]]
    else:
        Df = np.zeros_like(Dd)
    Dlow = np.stack([gaussian_filter(Df[..., c], 24., mode='nearest') for c in range(3)], -1)
    Dhigh = np.where(((aA > 0.99) & (aP > 0.99))[..., None], Dd - Dlow, 0)
    FA2 = FA + ss(y, Y0 - 1, Y1 - 10)[..., None] * Dlow + ss(y, Y1 - 20, Y1)[..., None] * Dhigh
    w = ss(y, Y0, Y1)
    fa = (1 - w) * aA; fb = w * aP; den = fa + fb
    FO = np.where(den[..., None] > 1e-4, (fa[..., None] * FA2 + fb[..., None] * FP) / np.maximum(den, 1e-4)[..., None], FP)
    aO = np.maximum(den, aP) if fixes else den          # fix 3: never more see-through than the body
    FO[:Y0] = FA[:Y0]; aO[:Y0] = aA[:Y0]; FO[Y1:] = FP[Y1:]; aO[Y1:] = aP[Y1:]
    solidP = binary_erosion(aP > 0.99, iterations=3)
    cloth = ((solidP & (rows >= 355)) | ((aP > 0.5) & (rows >= 362))).astype(np.float64) * (1 - np.clip(skin_w, 0, 1))
    lining = ((aA < 0.5) & (aP > 0.5) & (colour_w < 0.5) & (rows >= 355)) | ((aA < 0.5) & (aP > 0.5) & (rows >= 362))
    c = np.maximum(cloth, lining.astype(np.float64))
    FO = FO * (1 - c[..., None]) + FP * c[..., None]; aO = aO * (1 - c) + aP * c
    return np.dstack([np.round(np.clip(FO, 0, 255)), np.round(np.clip(aO, 0, 1) * 255)]).astype(np.uint8)


# ---------------------------------------------------------------- checks
def checks(out, A, FA, aA, s, unclear, L, target):
    Af = A.astype(np.float64)
    low = np.zeros(s.shape, bool); low[Y1:] = True
    cloth = (s == 0) & ~unclear & (A[..., 3] >= 250) & low
    rep = dict(outline_not_anna_below_neck=int((out[Y1:, :, 3] != A[Y1:, :, 3]).sum()),
               clothing_changed=int((out[cloth][:, :3] != A[cloth][:, :3]).any(-1).sum()),
               face_not_exact=int((out[:Y0, :, :3][aA[:Y0] > 0.99] != np.round(FA[:Y0][aA[:Y0] > 0.99])).any(-1).sum()))
    # hands: the skin-coloured solid pixels in the hand box should land near the race's hand colour (race_values.json,
    # measured on the race's own plate). A miss of more than HAND_TOL shades summed over red, green and blue means the
    # skin test did not find the hands, or Precious's hands were not right on this outfit.
    r0, r1, c0, c1 = HAND_BOX; box = np.zeros(s.shape, bool); box[r0:r1, c0:c1] = True
    hand = box & (A[..., 3] >= 250) & (skin_colour(Af[..., :3]) > 0.99)
    if hand.sum() < 300:
        rep['hands'] = 'no skin found in the hand box'
    else:
        got = np.median(out[hand][:, :3].astype(np.float64), 0); miss = got - np.array(target, np.float64)
        rep['hands'] = dict(result=got.round(1).tolist(), target=list(target), miss=miss.round(1).tolist(),
                            anna=np.median(Af[hand][:, :3], 0).round(1).tolist())
        if np.abs(miss).sum() > HAND_TOL:
            rep['hands']['problem'] = f'hands are {np.abs(miss).sum():.0f} shades from the race colour (limit {HAND_TOL})'
    rep['ok'] = (rep['outline_not_anna_below_neck'] == 0 and rep['clothing_changed'] == 0 and rep['face_not_exact'] == 0
                 and not (isinstance(rep['hands'], dict) and 'problem' in rep['hands']))
    return rep


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('anna'); ap.add_argument('precious'); ap.add_argument('out_dir')
    ap.add_argument('--name', help='output file name (default: the Anna file name)')
    ap.add_argument('--races', help='comma-separated subset (default: every race in the values file)')
    ap.add_argument('--fixes', choices=['on', 'off'], default='on')
    ap.add_argument('--faces', default=os.path.join(HERE, 'faces'), help='folder with <race>_female_gpt.png')
    ap.add_argument('--values', default=os.path.join(HERE, 'race_values.json'))
    ap.add_argument('--webp', action='store_true', help='write .webp (lossless) instead of .png')
    args = ap.parse_args()
    fixes = args.fixes == 'on'
    values = json.load(open(args.values))
    races = args.races.split(',') if args.races else list(values.keys())
    name = args.name or os.path.splitext(os.path.basename(args.anna))[0]
    A = load_rgba(args.anna); B = load_rgba(args.precious)
    report = dict(anna=args.anna, precious=args.precious, fixes=args.fixes, plates={})
    for race in races:
        if race not in values:
            print(f'{race}: no values in {args.values}, skipped'); continue
        mix = values[race]['values']
        FA, aA = load_face(os.path.join(args.faces, f'{race}_female_gpt.png'), fixes)
        bd, s, unclear, L = body(A, B, mix, fixes)
        out = face_paste(FA, aA, bd[..., :3], bd[..., 3] / 255., s, skin_colour(A[..., :3].astype(np.float64)), fixes)
        d = os.path.join(args.out_dir, race); os.makedirs(d, exist_ok=True)
        p = os.path.join(d, f'{name}.webp' if args.webp else f'{name}.png')
        Image.fromarray(out, 'RGBA').save(p, **({'lossless': True} if args.webp else {}))
        rep = checks(out, A, FA, aA, s, unclear, L, values[race]['target']['hands']); rep['values'] = mix; rep['file'] = p
        report['plates'][race] = rep
        hands = rep['hands'] if not isinstance(rep['hands'], dict) else f'miss {rep["hands"]["miss"]}' + (' PROBLEM' if 'problem' in rep['hands'] else '')
        print(f'{race:16s} {"ok" if rep["ok"] else "PROBLEM"}  values {mix}  hands {hands}')
    os.makedirs(args.out_dir, exist_ok=True)
    json.dump(report, open(os.path.join(args.out_dir, f'{name}_report.json'), 'w'), indent=1)
    return 0 if all(r['ok'] for r in report['plates'].values()) else 1

if __name__ == '__main__':
    sys.exit(main())
