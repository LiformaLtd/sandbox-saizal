"""sheet.py - the 7 Japanese/Chinese styles on one sheet: one row per style, fal GPT low tries 1 and 2 side by side (women/, men/; the
orchestrator run was cancelled 2026-10-23, no GPU free), each labelled with its face check (clear blue inside the face mask, eyebrows not
counted). Writes sheet.png next to this file."""
import json, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); HW = "/Users/saizalpreetkaur./Desktop/Liforma_LTD/hair_work"
P = json.load(open(f"{HERE}/prompts_asian.json"))
PINK = {"women": f"{HW}/new_styles/blue_test/masked_pink", "men": f"{HW}/male_hair"}
PINK = {g: np.load(f"{d}/pink.npy") & ~np.load(f"{d}/brows.npy") for g, d in PINK.items()}
S, TRIES, TOP = 448, (1, 2), 24

def face_px(g, R):
	R = R.astype(int)
	return int((((R[..., 2] > R[..., 0] + 40) & (R[..., 2] > 90)) & PINK[g]).sum())

rows = [k for k in P if not k.startswith("_")]
sheet = Image.new("RGB", (S * len(TRIES) + 16, len(rows) * (S + TOP) + 8), "white"); d = ImageDraw.Draw(sheet)
for r, k in enumerate(rows):
	g = "women" if "_W" in k else "men"; y = r * (S + TOP) + 4
	for c, t in enumerate(TRIES):
		path = f"{HERE}/{g}/{k}_t{t}.png"; x = 8 + c * S
		if not os.path.exists(path):
			d.text((x + 4, y + 4), f"{k.replace('gpt_ASIA_', '')} try {t}: not back", fill="red"); continue
		R = np.asarray(Image.open(path).convert("RGB").resize((1024, 1024)))
		sheet.paste(Image.fromarray(R).resize((S, S), Image.LANCZOS), (x, y + TOP))
		d.text((x + 4, y + 6), f"{k.replace('gpt_ASIA_', '')}  try {t}  -  {face_px(g, R)} px on the face", fill="black")
sheet.save(f"{HERE}/sheet.png"); print("sheet.png", sheet.size)
