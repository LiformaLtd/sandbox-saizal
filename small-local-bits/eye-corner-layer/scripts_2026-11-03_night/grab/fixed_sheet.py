# Sheet of the 20 GPT-low avatars' eyes in the local player after the sil plates got the neutral eye dots (2026-11-03).
#   fixed_sheet.py <frames dir> <out prefix>     (frames: <id>.png, 3600x3000 face-canvas grabs; two sheets: women, men)
import sys, os, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
D, OUT = sys.argv[1], sys.argv[2]
NAMES = {
    'af5a0001': 'African woman (Precious)', 'af5b0001': 'African man',
    'ea5a0002': 'East Asian woman', 'ea5b0001': 'East Asian man',
    'e05a0001': 'European woman (Anna)', 'e05b0001': 'European man (Caleb)',
    '1d5a0001': 'Indigenous woman', '1d5b0001': 'Indigenous man',
    'ed5a0001': 'Mediterranean woman', 'ed5b0001': 'Mediterranean man',
    'ae5a0002': 'Middle Eastern woman', 'ae5b0001': 'Middle Eastern man',
    '0a5a0001': 'North African woman', '0a5b0001': 'North African man',
    'ac5a0001': 'Pacific Islander woman', 'ac5b0001': 'Pacific Islander man (no corner layer, your choice 22 Oct)',
    '5a5a0002': 'South Asian woman', '5a5b0001': 'South Asian man',
    '5e5a0001': 'Southeast Asian woman', '5e5b0001': 'Southeast Asian man',
}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)


def pupils(im):
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
    return sorted(tuple(cen[k]) for k in (first, second))


def cell(pid):
    f = f'{D}/{pid}.png'
    if not os.path.exists(f): return None
    im = Image.open(f).convert('RGBA'); bg = Image.new('RGBA', im.size, (236, 236, 236, 255)); im = Image.alpha_composite(bg, im).convert('RGB')
    (x1, y1), (x2, y2) = pupils(im); gap = x2 - x1; cy = (y1 + y2) / 2
    box = (int(x1 - 0.75 * gap), int(cy - 0.42 * gap), int(x2 + 0.75 * gap), int(cy + 0.42 * gap))
    cw = 1100; s = cw / (box[2] - box[0]); ch = int((box[3] - box[1]) * s)
    return im.crop(box).resize((cw, ch), Image.LANCZOS)


for group, ids in (('women', [k for k in NAMES if k[2:4] == '5a']), ('men', [k for k in NAMES if k[2:4] == '5b'])):
    cells = [(pid, cell(pid)) for pid in ids]
    rows = [(pid, c) for pid, c in cells if c is not None]
    missing = [pid for pid, c in cells if c is None]
    W = 1100 + 24; H = 60 + sum(c.height + 44 for _, c in rows)
    sheet = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(sheet)
    d.text((12, 10), f'Local player, {group}: eye hole now on the neutral eye dots, corner layer on (3 Nov 2026)', fill='black', font=font)
    y = 60
    for pid, c in rows:
        d.text((12, y), f'{NAMES[pid]}', fill='black', font=font); d.text((12 + 20 + d.textlength(NAMES[pid], font=font), y + 5), pid, fill=(130, 130, 130), font=small)
        sheet.paste(c, (12, y + 32)); y += c.height + 44
    out = f'{OUT}_{group}.png'; sheet.save(out); print(out, sheet.size, 'missing:', missing)
