"""Install the regenerated Malik plates as lerp pairs: Caleb is A, Malik is B.

Each outfit takes its best surviving version. The existing male_* pairs, which hold
the original batch, are left alone so the two can be compared.
"""
import json
import os
import shutil
import sys

from PIL import Image

L = "/Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma"
PAIRS = f"{L}/liforma/sandbox/image-lerp/static/samples/pairs"
CALEB = f"{L}/tmp/cdn-white/clothes"

# bellboy's skin-cut-out version lost its sleeves; its run-1 head-reference version
# is clean, so that is the one to publish.
FROM_RUN1 = {"bellboy_with_maroon_uniform_and_hat"}
FROM_HEADFIX = {"marroon_top_and_jeans"}
# still regenerating with the head reference
PENDING = set()

slugs = [o["slug"] for o in json.load(open(f"{L}/tmp/malik-wardrobe/regen-list.json"))["outfits"]]

written, skipped = [], []
for slug in slugs:
    if slug in PENDING:
        skipped.append(slug)
        continue
    src = (f"{L}/tmp/headfix_{slug}_keyed.png" if slug in FROM_HEADFIX else
           f"{L}/tmp/malik-regen/keyed/malik_{slug}.png" if slug in FROM_RUN1
           else f"{L}/tmp/skinref_{slug}_keyed.png")
    cal = f"{CALEB}/95b4bafb_neutral_bald-{slug}.webp"
    if not (os.path.exists(src) and os.path.exists(cal)):
        skipped.append(f"{slug} (missing)")
        continue

    name = f"regen_{slug}"
    out = f"{PAIRS}/{name}"
    os.makedirs(out, exist_ok=True)
    shutil.copyfile(cal, f"{out}/a.webp")
    Image.open(src).convert("RGBA").save(f"{out}/b.webp", lossless=True)
    for stale in (f"{out}/a.png", f"{out}/b.png"):
        if os.path.exists(stale):
            os.remove(stale)
    written.append(name)

# rebuild the index from what is actually on disk, recording each pair's format
entries = []
for d in sorted(x for x in os.listdir(PAIRS) if os.path.isdir(f"{PAIRS}/{x}")):
    for ext in ("png", "webp"):
        if os.path.exists(f"{PAIRS}/{d}/a.{ext}") and os.path.exists(f"{PAIRS}/{d}/b.{ext}"):
            entries.append({"slug": d, "ext": ext})
            break
json.dump(entries, open(f"{PAIRS}/index.json", "w"), indent=0)

print(f"installed {len(written)} regen pairs")
if skipped:
    print("skipped:", skipped)
print(f"index now lists {len(entries)} pairs "
      f"({sum(1 for e in entries if e['slug'].startswith('regen_'))} regen, "
      f"{sum(1 for e in entries if e['slug'].startswith('male_'))} male)")
