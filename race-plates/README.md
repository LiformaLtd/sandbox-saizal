# Race plates sandbox

Anna's plate + Precious's plate of one outfit → the plates for the eight other female races, made by the Python
maker in [`maker/`](./maker/) (its own README explains the method, the checks and the options). This page runs
that exact script locally and shows Anna | the race plates | Precious, with the neck zoomed under each, and each
plate's pass/fail.

Local only: nothing here is deployed or read by the site.

## Setup

```bash
cd sandboxes/sandbox/race-plates
npm install
npm run pull     # plates/ from the private authoring bucket (needs the workspace .env)
npm run dev      # http://localhost:5173, or the next free port
```

The maker needs a Python with numpy, scipy and pillow. On the authoring Mac that is ComfyUI's
(`Liforma_LTD/ComfyUI/.venv/bin/python`), which the page finds on its own; elsewhere set `RACE_PLATES_PYTHON`.

## Folders

- `maker/` — `make_race_plates.py`, the eight race faces (`faces/`, BiRefNet-keyed), `race_values.json` — one
  red/green/blue mix per race, all eight fitted the same way: per outfit the median Anna and Precious skin colour on
  the forearms (rows 760-860 beside the hands) and the hands (rows 800-990), then the least-squares mix against the
  race base plate's own colour in the same places
- `plates/` — pulled, not in git: `anna/<outfit>.png`, `precious/<outfit>.png`, `faces/`, `race_values.json`
- `out/<outfit>/<race>/<outfit>.png` — what the page makes, plus `<outfit>_report.json`; not in git

## The private bucket

The plates live in `race-plates/` of `S3_AUTHORING_BUCKET` (`liforma-authoring`), which has no public domain:
only the R2 token in the workspace `.env` or the Cloudflare dashboard can reach them.

```bash
npm run pull                                                       # bucket -> plates/
npm run push -- --anna DIR --precious DIR --faces DIR --values FILE # local folders -> bucket
npm run push -- --values maker/race_values.json                     # just the values file
npm run push -- ... --dry-run                                       # list only
```

`push` refuses if Anna's and Precious's folders do not hold the same outfit names.

## Running the maker by hand

```bash
python3 maker/make_race_plates.py plates/anna/tennis_outfit.png plates/precious/tennis_outfit.png out/tennis_outfit
```
