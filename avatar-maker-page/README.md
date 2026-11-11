# Avatar maker page (port 3055)

A local web page that makes the pictures for a new avatar. You pick a model for each picture (the one we used
before is "Suggested" and already picked), and the page checks every answer and tries again by itself when a
check fails. It covers steps 1-4 of `../new-avatar-pipeline-guide/pipeline-guide.md` and can then build the pack.

When: built 6 Nov 2026.

## The question

Can the new-avatar picture steps, which were spread over many scripts, be run from one page that looks like the
Studio tools Charles made, with the checks and re-tries done for you?

## What happened

- The page and runner work. A European woman, `e05a0002`, was made with it on 6 Nov. Her pack was built and plays
  on the local lab page (`localhost:3009/lab/avatars`). She was rebuilt the same day on Anna's white tee body.
- The hand steps (dot page, eye-hole cut) were not done for her.
- A free test avatar, `dryrun01`, uses old pictures of bald Anna in place of real model answers. It never calls a
  model, so the checks and re-tries can be watched for free.
- `1a5a0001` (Latin American woman with hair and a cardigan) got one body try on Azure low ($0.02). It failed the bald-Anna outline check by design: edges -10/+9 px, head top -25 px, neck +17.4 px. Two words-only hero tries followed, then it was dropped. See `../latin-american-hero-tries-2026-11-06/`.
- Teeth gap limits: Anna's measures 6.8 % for E and 11.4 % for the teeth picture; the 20 packs measure 0-4.5 % E and
  1.9-4.4 % teeth. Saizal kept the page's limits at E 4 % and teeth 7 %.

Status: unfinished, local only. Not used for any avatar on staging.

## The steps on the page

| Step | Suggested model | Fallback |
| --- | --- | --- |
| Base body | fal GPT Image 2.5 Sunburst low | none (a ChatGPT picture can be added by hand and gets the same check) |
| Master (head close-up) | fal GPT high for women, medium for men | none |
| 34 face plates | fal GPT low, 3 tries each | fal GPT medium |
| E, SS, teeth picture | Azure GPT low, one each | Nano Banana 2 ("Make another") |

Free local steps: crop, masks, painted mask, add a picture, set, build the pack.
Every model gets at most 3 tries per picture; the first try that passes is kept, otherwise the best one.

## Files

- `server.mjs`: the page server. It shows things and starts `maker.py`. One job at a time.
- `maker.py`: does the work (model calls, checks, files). It also runs by hand:
  - `maker.py config` - models, prices, steps and limits
  - `maker.py plan <avatar dir> '<json>'` - what a run would send and cost; sends nothing
  - `maker.py run <avatar dir> '{"step": "base|master|plates|mouth", ...}'`
  - `maker.py free <avatar dir> '{"step": "crop|masks|painted_mask|addpic|set|pack"}'`
  - `maker.py pick <avatar dir> '{"step", "item", "try"}'`
- `index.html`: the page.

Every paid request is written to `<avatar dir>/requests.jsonl` before the answer comes back, so a fal request is
fetched again by its id and never paid twice.

## How to run

```
cd ~/Desktop/Liforma_LTD/NEW/liforma/.local-dev/avatar-maker   # (the original place; this is a copy)
node server.mjs            # -> http://localhost:3055
```

It needs, on the Mac:

- Python: `~/Desktop/Liforma_LTD/ComfyUI/.venv/bin/python` (cv2, numpy, requests, Pillow).
- `~/Desktop/Liforma_LTD/ComfyUI/plate_gate.py` (the picture checks; see `avatar-face-plates/`).
- Face points on port 4011: `cd ~/Desktop/Liforma_LTD/Liforma/liforma/models.liforma.ai && MODELS_PORT=4011 ./run`
  (`FACE_POINTS_URL` changes it).
- For the pack build only: the old labs behind the no-generation gate on port 3019 (`LABS_GATE_URL` changes it;
  the gate is `../local-dev-scripts/pack-staging/labs_no_generation_gate.mjs`).
  On 6 Nov the old labs on 3004 answered 500, so a fresh one was started on 3104 with the gate on 3119.
- Keys are read from files, never written in the code:
  - `FAL_KEY` and `GEMINI_API_KEY` from `~/Desktop/Liforma_LTD/Liforma/labs.liforma.ai/.env`
  - `AZURE_MODELS_API_KEY` and `AZURE_MODELS_ENDPOINT` from `~/Desktop/Liforma_LTD/worktrees/api-main-a9d4ddc/.env`
- Inputs: the female start picture `Liforma/dd80126a_neutral_bald-blue-sceen.png`, the male
  `plates/base_plates/male_race_base_plates/input_caleb_1254_blue.png`, plate prompts in
  `Desktop_cleanup_2026-10-27/mediterranean_face_plates/gpt_low_prompts.json` and
  `plates/men/male_face_plates/gpt_low_prompts_male.json`, mouth prompts in `plates/E_regen_azure_2026-10-30/`.
  The paths are written at the top of `maker.py`.

Paid steps cost money (fal, Azure, Gemini). Prices per picture are in `maker.py` (`MODELS`).

## Left on the Mac

- `~/Desktop/Liforma_LTD/plates/new_avatars/` (481 MB): `e05a0002/` 220 MB, 335 pictures; `dryrun01/` 255 MB,
  359 pictures; `1a5a0001/` 5.9 MB, 6 pictures. Each has `maker.json`, `maker/<step>.json` and `requests.jsonl`.
- e05a0002's first (own body) pack: `~/Desktop/Liforma_LTD/backups/e05a0002_own_body_pack_before_v4_rebuild_20261106-1711/`.
