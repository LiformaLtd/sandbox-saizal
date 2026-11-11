"""cutout_sheet.py - the 14 cut-outs (cutouts/<name>.gpt<n>__hair_matte-anything+birefnet.png) on one sheet: one row per style, and for
each try the hair alone on grey and the hair on the bald head it was made on (Anna / Caleb m-e05b0001). Writes cutout_sheet.png."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); HW = "/Users/saizalpreetkaur./Desktop/Liforma_LTD/hair_work"
ROWS = [("japanese-updo", "anna"), ("japanese-updo-ornament", "anna"), ("chinese-hairpin-updo", "anna"), ("double-buns", "anna"),
	("samurai-topknot", "m-e05b0001"), ("chinese-topknot", "m-e05b0001"), ("two-block-cut", "m-e05b0001")]
S, TOP, CROP = 340, 22, (192, 0, 832, 640)   # the head and shoulders of the 1024 picture
BASE = {h: Image.open(f"{HW}/races/{h}/base_1024.png").convert("RGBA") for h in ("anna", "m-e05b0001")}

sheet = Image.new("RGB", (S * 4 + 20, len(ROWS) * (S + TOP) + 8), "white"); d = ImageDraw.Draw(sheet)
for r, (name, head) in enumerate(ROWS):
	y = r * (S + TOP) + 4
	for t in (1, 2):
		x = 8 + (t - 1) * (2 * S + 4); path = f"{HERE}/cutouts/{name}.gpt{t}__hair_matte-anything+birefnet.png"
		if not os.path.exists(path):
			d.text((x + 4, y + 4), f"{name} try {t}: not made", fill="red"); continue
		hair = Image.open(path).convert("RGBA").resize((1024, 1024))
		alone = Image.alpha_composite(Image.new("RGBA", (1024, 1024), (128, 128, 128, 255)), hair)
		on = Image.alpha_composite(BASE[head], hair)
		for i, im in enumerate((alone, on)):
			sheet.paste(im.crop(CROP).convert("RGB").resize((S, S), Image.LANCZOS), (x + i * S, y + TOP))
		d.text((x + 4, y + 5), f"{name} try {t}  (alone | on the bald head)", fill="black")
sheet.save(f"{HERE}/cutout_sheet.png"); print("cutout_sheet.png", sheet.size)
