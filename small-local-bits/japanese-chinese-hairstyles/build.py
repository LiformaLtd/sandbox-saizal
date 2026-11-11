"""build.py - the six Japanese/Chinese styles, try 2 (user 2026-10-23: "use try 2 for all and fit them on all the other races"), through the
steps the other plate styles took:
  women (Anna, her editor dots races/anna/marks_editor/marks.json, as women_remaining_2026-10-16/build.py) and
  men (Caleb's head m-e05b0001 and his saved dots, as male_hair/ear_fit_v2/build.py):
  1 ear_match.py  - the hair behind each ear slides onto the ear dots
  2 fit_inner.py  - a bent copy of the hair goes UNDER the hair's edge only, within 18 px of the outline
  3 colours       - blue + the five Studio colours (recolour_studio, chestnut tamed), on the fitted layer
  4 ear_cut.py NO_SKIN=1 EAR_SMOOTH_EDGE=1 EAR_TIP_FILL=1 - hair cut inside the ear dots, no skin painted
  5 plates_from_colours.py - one shade plate per style from its five colour files -> plates/<group>/<style>.png
From cutouts/<name>.gpt2__hair_matte-anything+birefnet.png. The ornament try is left out (its cut-out has holes where the flowers were).
Nothing installed or uploaded."""
import os, subprocess, sys, numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); HW = "/Users/saizalpreetkaur./Desktop/Liforma_LTD/hair_work"; NS = f"{HW}/new_styles"
PY = f"{HW}/tools/mpvenv2/bin/python"
sys.path.insert(0, f"{NS}/blue_test"); import recolour_studio as rs  # noqa: E402
rs.tame_top("chestnut")
# cut-out name -> (group, plate style name: women join words with "-", men with "_", as the list's other styles)
STYLES = {"japanese-updo": ("women", "japanese-updo"), "chinese-hairpin-updo": ("women", "chinese-hairpin-updo"), "double-buns": ("women", "double-buns"),
	"samurai-topknot": ("men", "samurai_topknot"), "chinese-topknot": ("men", "chinese_topknot"), "two-block-cut": ("men", "two_block_cut")}
WK, LAY = f"{HERE}/work", f"{HERE}/layers"
for d in (WK, LAY, f"{HERE}/plates/women", f"{HERE}/plates/men"): os.makedirs(d, exist_ok=True)
base_env = {k: v for k, v in os.environ.items() if k != "MARKS"}

def run(*a, extra=None):
	r = subprocess.run([PY, "-W", "ignore", *a], capture_output=True, text=True, env={**base_env, **(extra or {})})
	if r.returncode: raise SystemExit(f"FAILED {os.path.basename(a[0])}: {r.stderr[-600:]}")
	return (r.stdout.strip().splitlines() or [""])[-1]

for name in (sys.argv[1:] or STYLES):
	group, style = STYLES[name]
	head = [] if group == "women" else ["m-e05b0001"]
	marks = {"MARKS": f"{HW}/races/anna/marks_editor/marks.json"} if group == "women" else {}
	src = f"{HERE}/cutouts/{name}.gpt2__hair_matte-anything+birefnet.png"
	w1, w2 = f"{WK}/{style}.1_earmatch.png", f"{WK}/{style}.2_fit.png"
	m1 = run(f"{NS}/chatgpt_wig/ear_match.py", src, w1, *(["--head", "m-e05b0001"] if head else []), extra=marks)
	m2 = run(f"{NS}/chatgpt_wig/fit_inner.py", w1, w2, *head, extra=marks)
	S = np.asarray(Image.open(w2).convert("RGBA"))
	for c, X in [("blue", S)] + [(c, rs.rc.recolour(S, c)) for c in rs.rc.COLOURS]:
		pre = f"{WK}/{style}.3_pre-{c}.png"; Image.fromarray(X).save(pre)
		m3 = run(f"{NS}/chatgpt_wig/ear_cut.py", pre, f"{LAY}/{style}-{c}.png", *head, extra=dict(marks, NO_SKIN="1", EAR_SMOOTH_EDGE="1", EAR_TIP_FILL="1"))
	m4 = run(f"{HW}/male_hair/browser_proof/plates_from_colours.py", f"{LAY}/{style}-{{c}}.png", f"{HERE}/plates/{group}/{style}.png")
	print(f"{style:22s} | {m1[:70]} | {m2[:60]} | ear_cut: {m3[:70]} | {m4[:90]}", flush=True)
print("BUILD_DONE")
