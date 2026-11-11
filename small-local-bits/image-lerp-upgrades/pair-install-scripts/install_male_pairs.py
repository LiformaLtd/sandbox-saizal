"""Install every male outfit as a lerp pair: Caleb is A, Malik is B.

Both sides are written as lossless webp so the files stay the size they arrived at
rather than being re-encoded up to PNG.
"""
import glob
import json
import os
import shutil

from PIL import Image

L = "/Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma"
PAIRS = f"{L}/liforma/sandbox/image-lerp/static/samples/pairs"
CALEB = f"{L}/tmp/cdn-white/clothes"
MALIK = f"{L}/tmp/malik-wardrobe/keyed"
SWEEP = f"{L}/tmp/sweep/keyed"

# The two done before the batch live under their sweep run names.
EXTRA = {
    "astronaut": f"{SWEEP}/astro_head_rb4_a3.png",
    "autumn_outfit_jacket_and_scarf": f"{SWEEP}/head_rb4_a3.png",
}

malik_for = {
    os.path.basename(p)[len("malik_"):-4]: p for p in glob.glob(f"{MALIK}/*.png")
}
malik_for.update(EXTRA)

caleb_for = {
    os.path.basename(p)[len("95b4bafb_neutral_bald-"):-5]: p
    for p in glob.glob(f"{CALEB}/*.webp")
}

slugs = sorted(set(malik_for) & set(caleb_for))
missing_malik = sorted(set(caleb_for) - set(malik_for))

written, skipped = [], []
for slug in slugs:
    name = f"male_{slug}"
    out = f"{PAIRS}/{name}"
    os.makedirs(out, exist_ok=True)

    # A: Caleb, copied through untouched — it is already lossless webp from the CDN.
    shutil.copyfile(caleb_for[slug], f"{out}/a.webp")

    # B: Malik, PNG off the orchestrator, re-saved lossless.
    im = Image.open(malik_for[slug]).convert("RGBA")
    if im.size != (1024, 1024):
        skipped.append(f"{slug} (malik is {im.size})")
        continue
    im.save(f"{out}/b.webp", lossless=True)

    # A stale .png from an earlier install would win the format race.
    for stale in (f"{out}/a.png", f"{out}/b.png"):
        if os.path.exists(stale):
            os.remove(stale)
    written.append(name)

# The autumn pair was first installed under a shorter, inconsistent name.
legacy = f"{PAIRS}/male_autumn_jacket"
if os.path.isdir(legacy) and "male_autumn_outfit_jacket_and_scarf" in written:
    shutil.rmtree(legacy)
    print("removed the duplicate male_autumn_jacket pair")

index_path = f"{PAIRS}/index.json"
index = set(json.load(open(index_path)))
index.update(written)
index.discard("male_autumn_jacket")
index = sorted(x for x in index if os.path.isdir(f"{PAIRS}/{x}"))
json.dump(index, open(index_path, "w"))

print(f"wrote {len(written)} male pairs")
if skipped:
    print("skipped:", skipped)
if missing_malik:
    print(f"no Malik plate for {len(missing_malik)}: {missing_malik}")
print(f"index now lists {len(index)} pairs, {sum(1 for x in index if x.startswith('male_'))} male")
