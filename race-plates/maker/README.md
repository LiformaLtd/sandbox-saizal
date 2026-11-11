# race_plates

One outfit in, one plate per race out. Given Anna's plate and Precious's plate of the same outfit (both with a
transparent background, corrected the way the pack plates are), it writes the plate for each of the eight other
female races: Anna's body with the skin brought to the race's colour, the race's face on top, blended only at the
neck.

```
python3 make_race_plates.py ANNA.png PRECIOUS.png OUT_DIR
```

Writes `OUT_DIR/<race>/<name>.png` for east-asian, southeast-asian, mediterranean, middle-eastern, north-african
and south-asian, plus `OUT_DIR/<name>_report.json` with the checks. Exit code 0 when every plate passes, 1 otherwise.

Options

- `--name N` output file name (default: the Anna file's name)
- `--races a,b` a subset
- `--fixes on|off` the three edge fixes (default on). `off` reproduces the v2/v4 Desktop sets exactly.
- `--faces DIR` the race face plates (default `faces/`)
- `--values FILE` the mix values (default `race_values.json`)
- `--webp` write lossless webp instead of png

What is in the folder

- `faces/<race>_female_gpt.png` the race faces, 1254 px, keyed with BiRefNet v4 (blue-screen version). Never change per outfit.
- `race_values.json` one red/green/blue mix per race, fitted once on forearms and hands across all outfits.

Needs python3 with numpy, scipy and pillow. About 3-5 s per race plate on an M-series Mac. Run it once when an outfit
is published and store the results; it is not meant to run per page view.

How a plate is made

1. Mix: the image-lerp tool's `out = A + t*(B-A)` per channel with the race's fixed t, including the browser's canvas rounding.
2. Skin: a pixel is skin when it is skin-coloured on Anna and much darker on Precious where both plates are solid.
   Specks and thin strips are dropped; unclear pixels next to skin take the straight mix.
3. Recolour: Anna's skin is scaled by the ratio of local means (mix over Anna), so her own shading is kept.
   Clothing and the outline stay exactly Anna's.
4. Face: the race face above row 361; over rows 361-410 the body's soft shading is carried into the face and the two
   are cross-faded. Collars and linings are kept from the body.

The checks

- outline below row 410 exactly Anna's
- clothing pixels unchanged
- face exact
- hands: the skin in the hand box lands within 45 shades (red+green+blue summed) of the race's hand colour from
  `race_values.json`. Good plates are 10-25 away; when the skin test cannot find the hands, or Precious's hands were
  wrong on that outfit (the nurse and the two blue shirts), the miss is over 100 and the plate is marked `"ok": false`.

Known limits

- The rim light on the left of the neck is in the renders (race faces and Anna's plates alike); Anna's own grey edge
  on the right of the neck is in her pack plates. The script does not remove either.
- On outfits with a dark collar the neck join can cut the collar into small blocks. Judge by eye.
- Both endpoints are required: without Precious's plate of the outfit the skin test cannot run.
