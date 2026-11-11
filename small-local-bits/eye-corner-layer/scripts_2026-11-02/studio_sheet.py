"""Studio preview still (base picture + eye layer, the Studio's stacking) with the corner layer ON (built --corner patch),
own eye colour; eye crops for all 20, named. Also checks the plate-mode rebuild equals the layer the Studio serves."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
S = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.expanduser('~/Desktop/Liforma_LTD/notes/eye_corner_layer_20261102')
NAMES = {
    'af5a0001': 'African woman (Precious)', 'af5b0001': 'African man',
    'ea5a0002': 'East Asian woman', 'ea5b0001': 'East Asian man',
    'e05a0001': 'European woman (Anna)', 'e05b0001': 'European man (Caleb)',
    '1d5a0001': 'Indigenous woman', '1d5b0001': 'Indigenous man',
    'ed5a0001': 'Mediterranean woman', 'ed5b0001': 'Mediterranean man',
    'ae5a0002': 'Middle Eastern woman', 'ae5b0001': 'Middle Eastern man',
    '0a5a0001': 'North African woman', '0a5b0001': 'North African man',
    'ac5a0001': 'Pacific Islander woman', 'ac5b0001': 'Pacific Islander man (no corner pictures)',
    '5a5a0002': 'South Asian woman', '5a5b0001': 'South Asian man',
    '5e5a0001': 'Southeast Asian woman', '5e5b0001': 'Southeast Asian man',
}
own = json.load(open(f'{S}/own_colours.json'))
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
CW = 900
rows = []
for pid, name in NAMES.items():
    col = own[pid]
    base = Image.open(f'{S}/base_{pid}.webp').convert('RGBA')
    layer = Image.open(f'{S}/patch/{pid}/{col}.png').convert('RGBA')
    served = np.asarray(Image.open(os.path.expanduser(f'~/Desktop/eye_layers/{pid}/{col}.png')).convert('RGBA')).astype(int)
    plate = np.asarray(Image.open(f'{S}/plate/{pid}/{col}.png').convert('RGBA')).astype(int)
    same = np.abs(served - plate).max()
    bg = Image.new('RGBA', base.size, (236, 236, 236, 255))
    still = Image.alpha_composite(Image.alpha_composite(bg, base), layer)
    a = np.asarray(layer)[..., 3]
    ys, xs = np.nonzero(a > 10)
    w, h = xs.max() - xs.min(), ys.max() - ys.min()
    cx, cy = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2
    bw = w * 1.3; bh = bw * 0.30
    box = tuple(int(round(v)) for v in (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))
    crop = still.crop(box).convert('RGB').resize((CW, int(CW * bh / bw)), Image.LANCZOS)
    cell = Image.new('RGB', (CW, crop.height + 40), 'white')
    cell.paste(crop, (0, 40))
    ImageDraw.Draw(cell).text((8, 6), f'{name}  -  Studio brown eyes, corner layer on', fill='black', font=font)
    rows.append(cell)
    print(f'{pid} {name}: served Studio layer vs plate rebuild max diff {same}')
for k in range(2):
    part = rows[k * 10:(k + 1) * 10]
    sheet = Image.new('RGB', (CW, sum(r.height for r in part) + 8 * len(part)), 'white')
    y = 0
    for r in part:
        sheet.paste(r, (0, y)); y += r.height + 8
    p = f'{OUT}/studio_preview_corner_on_{k + 1}.png'
    sheet.save(p); print(p, sheet.size)
