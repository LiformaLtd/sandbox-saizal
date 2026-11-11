"""make_blue_table.py - 2026-10-21 (user: "yes make the blue table and show me"). A sixth colour table, blue, for the hair plates, made
the way the five were (male_hair/browser_proof/make_plates.py: colour_unify/recolour.py reference() -> lightness at every rank + the
typical red-green / yellow-blue at each lightness -> 1024 shades in sRGB). The blue reference is the 8 styles made in blue
(~/Desktop/hair_layers/dd80126a/<style>-blue.png), each style the same weight (an equal sample of its solid pixels), so the long
styles do not outvote the short ones. Writes colour_tables.json = the staging table file with "blue" added (the five unchanged).
Nothing is uploaded. Usage: python make_blue_table.py <staging colour_tables.json> <out dir>"""
import json, sys, numpy as np
from PIL import Image
sys.path.insert(0, "/Users/saizalpreetkaur./Desktop/Liforma_LTD/hair_work/colour_unify"); import recolour as rc
STYLES = ["half-up-half-down.gpt2", "half-up.s404", "high-top-knot.s1234", "long-sleek.s1234", "long-wavy-textured.s1234",
	"straight-shoulder.gpt1", "swept-back-low-ponytail.s404", "tapered-afro.gpt1"]
SRC, OUT = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(20261021); per = 40000; labs = []
for s in STYLES:
	a = np.asarray(Image.open(f"/Users/saizalpreetkaur./Desktop/hair_layers/dd80126a/{s}-blue.png").convert("RGBA"))
	px = a[..., :3][a[..., 3] >= 250]
	pick = px[rng.choice(len(px), per, replace=len(px) < per)]
	lab = rc.srgb_to_lab(pick[None].astype(np.uint8))[0]
	labs.append(lab); print(f"{s}: {len(px)} solid px, median L {np.median(lab[:, 0]):.1f} a {np.median(lab[:, 1]):.1f} b {np.median(lab[:, 2]):.1f}")
lab = np.concatenate(labs)
# reference(): lightness at 256 ranks, and the median a/b in 64 lightness chunks (copied from recolour.reference)
q = np.linspace(0, 1, 256); Lq = np.quantile(lab[:, 0], q)
order = np.argsort(lab[:, 0]); chunks = np.array_split(order, 64)
Lc = np.array([np.median(lab[c, 0]) for c in chunks]); ac = np.array([np.median(lab[c, 1]) for c in chunks]); bc = np.array([np.median(lab[c, 2]) for c in chunks])
def lab_to_srgb_float(lab):
	"""make_plates.py's lab_to_srgb_float, copied unchanged (importing make_plates runs its whole plate build)"""
	fy = (lab[..., 0] + 16) / 116; fx = fy + lab[..., 1] / 500; fz = fy - lab[..., 2] / 200
	f = np.stack([fx, fy, fz], -1)
	xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * np.array([0.95047, 1.0, 1.08883])
	c = np.clip(xyz @ np.array([[3.2404542, -0.9692660, 0.0556434], [-1.5371385, 1.8760108, -0.2040259], [-0.4985314, 0.0415560, 1.0572252]]), 0, 1)
	c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
	return np.clip(c * 255, 0, 255)
# table: make_plates.py's colour-table lines, unchanged
r = np.linspace(0, 1, 1024)
L = np.interp(r, q, Lq); lab_t = np.stack([L, np.interp(L, Lc, ac), np.interp(L, Lc, bc)], -1)[None]
blue = [[round(float(x), 2) for x in t] for t in lab_to_srgb_float(lab_t)[0]]
src = json.load(open(SRC))
assert "blue" not in src["tables"], "the table file already has blue"
out = {"note": src["note"] + "; blue (2026-10-21) from the 8 styles made in blue, each style weighted the same", "tables": {**src["tables"], "blue": blue}}
json.dump(out, open(f"{OUT}/colour_tables.json", "w"))
for k in (0, 256, 512, 768, 1023): print(f"blue shade {k / 1023:.2f}: rgb {blue[k]}")
print("tables:", list(out["tables"]), "| the five unchanged:", all(out["tables"][c] == src["tables"][c] for c in src["tables"]))
