#!/usr/bin/env python3
"""Avatar maker runner (local only, 6 Nov 2026). Runs one step of the new-avatar picture pipeline
(notes/new_avatar_pipeline_2026-11-06/README.md, sections 1-4) for one avatar, with the step's checks and automatic re-tries.
server.mjs starts it; it also works by hand:

  maker.py config                         models, prices, steps and limits as JSON
  maker.py plan <avatar dir> '<json>'     what a run would send and what it could cost; sends nothing
  maker.py run  <avatar dir> '<json>'     {"step": "base|master|plates|mouth", "models": {item: id}, "fallbacks": {item: id|null}, "resume": false}
  maker.py free <avatar dir> '<json>'     free local steps: {"step": "crop|masks|painted_mask|addpic|set|pack", ...}
  maker.py pick <avatar dir> '<json>'     {"step", "item", "try"}: use that try instead of the one the checks kept

State of a step: <avatar dir>/maker/<step>.json, rewritten after every change (the page reads it).
Paid calls: every request is written to <avatar dir>/requests.jsonl BEFORE waiting for it. A fal request already in that log
is fetched again by its id, never sent twice; an Azure or Gemini request that was sent and never saved is not sent again
(they give no id to fetch by). A dry avatar (maker.json "dry": true) calls nothing: old pictures of bald Anna (e05a0001)
stand in for the model's answer, so the checks and re-tries can be watched for free.
Every model gets at most 3 tries per picture; a picture stops at the first try that passes, otherwise the best try is kept.
"""
import base64, glob, json, os, shutil, signal, socket, subprocess, sys, threading, time, uuid
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont

HOME = os.path.expanduser('~')
L = f'{HOME}/Desktop/Liforma_LTD'
CLEAN = f'{HOME}/Desktop/Desktop_cleanup_2026-10-27'
COMFY = f'{L}/ComfyUI'
sys.path.insert(0, COMFY)
from plate_gate import DETAIL_MIN, LIMITS, check as gate_check, feature_mask, load as load_rgb, match_gain  # noqa: E402

CPY = f'{COMFY}/.venv/bin/python'
LABS = f'{L}/Liforma/labs.liforma.ai'
FAL_ENV = f'{LABS}/.env'
AZURE_ENV = f'{L}/worktrees/api-main-a9d4ddc/.env'
EREG = f'{L}/plates/E_regen_azure_2026-10-30'
ME = f'{CLEAN}/middle_eastern_face_plates'          # Layla's painted masks, moved onto every new face (race-transfer-mask.py)
PAINTER = f'{CLEAN}/mediterranean_face_plates/mask-painter-mediterranean.html'
NEWL = f'{L}/NEW/liforma'
SRC = f'{NEWL}/source/avatars'
KEYERS = f'{L}/Liforma/liforma/tools/image-to-image/scripts'
# The page's own face points: the :4011 copy (Liforma/liforma/models.liforma.ai, MODELS_PORT=4011 ./run). The pack build's own scripts
# use :3011 (its old process answered "Could not decode image" until it was restarted on 6 Nov), so free_pack tests :3011 with a real picture.
FACE_POINTS = os.environ.get('FACE_POINTS_URL', 'http://127.0.0.1:4011/v1/face-landmarker/fit-upload')
LABS_GATE = os.environ.get('LABS_GATE_URL', 'http://127.0.0.1:3019')   # OLD labs behind the no-generation gate (pack build only)
TEST_FACE = f'{CLEAN}/european_face_plates/european_hd_face_area_neutral.png'
TRIES = 3

INPUT = {'female': f'{L}/Liforma/dd80126a_neutral_bald-blue-sceen.png',
         'male': f'{L}/plates/base_plates/male_race_base_plates/input_caleb_1254_blue.png'}
PLATE_PROMPTS = {'female': f'{CLEAN}/mediterranean_face_plates/gpt_low_prompts.json',
                 'male': f'{L}/plates/men/male_face_plates/gpt_low_prompts_male.json'}
MOUTH_PROMPTS = {  # name: (file, key)
    'E': (f'{EREG}/prompt.json', 'E'), 'E_v1': (f'{EREG}/prompt_v1.json', 'E'),
    'E_nb': (f'{L}/plates/men/male_face_plates/_nano_banana_regen/E_no_tongue_prompt.json', 'E'),
    'SS': (f'{EREG}/prompt_ss_narrow.json', 'SS'), 'SS_wide': (f'{EREG}/prompt.json', 'SS'),
    'TEETH': (f'{EREG}/prompt_teeth_open.json', 'TEETH')}
MASTER_PROMPT = ('Increase the resolution of this cropped face image, improving detail while keeping the exact same square crop, face '
                 'structure, pose, expression, lighting, colors, and background. Do not zoom, reframe, or change the aspect ratio.')

MODELS = {
    'fal-low': {'group': 'fal.ai', 'label': 'GPT Image 2.5 Sunburst · low', 'kind': 'fal', 'quality': 'low', 'usd': 0.015, 'sec': 40,
                'price': 'measured on the fal bill (29 Sep)'},
    'fal-medium': {'group': 'fal.ai', 'label': 'GPT Image 2.5 Sunburst · medium', 'kind': 'fal', 'quality': 'medium', 'usd': 0.033, 'sec': 60,
                   'price': "fal's table x 2.5 (low cost 2.5 x its table); not measured"},
    'fal-high': {'group': 'fal.ai', 'label': 'GPT Image 2.5 Sunburst · high', 'kind': 'fal', 'quality': 'high', 'usd': 0.13, 'sec': 90,
                 'price': "fal's table x 2.5; not measured (the guide says ~12c a master)"},
    'azure-low': {'group': 'Azure', 'label': 'GPT Image 2.5 Sunburst · low', 'kind': 'azure', 'quality': 'low', 'usd': 0.015, 'sec': 25,
                  'price': 'measured (E and SS runs, 30 Oct)'},
    'azure-medium': {'group': 'Azure', 'label': 'GPT Image 2.5 Sunburst · medium', 'kind': 'azure', 'quality': 'medium', 'usd': 0.04, 'sec': 40,
                     'price': 'guess from the token prices; each try records its real token cost'},
    'azure-high': {'group': 'Azure', 'label': 'GPT Image 2.5 Sunburst · high', 'kind': 'azure', 'quality': 'high', 'usd': 0.13, 'sec': 60,
                   'price': 'guess from the token prices; each try records its real token cost'},
    'nb2': {'group': 'Google Gemini', 'label': 'Nano Banana 2 (Gemini 3.1 Flash Image)', 'kind': 'gemini',
            'model': 'gemini-3.1-flash-image-preview', 'usd': 0.07, 'sec': 30, 'price': 'about 7c a picture (2 Oct runs)'},
}
# The model we chose for each picture is "Suggested" and picked by default on the page.
STEPS = {
    'base': {'items': {'base': {'suggested': {'female': 'fal-low', 'male': 'fal-low'}, 'fallback': None}},
             'why': 'fal GPT low gave the best neck fit on 6 Nov (+0.1 px). ChatGPT in the browser is free and held the framing too, '
                    'but a page cannot drive it: add its picture below and it gets the same check.'},
    'master': {'items': {'master': {'suggested': {'female': 'fal-high', 'male': 'fal-medium'}, 'fallback': None}},
               'why': 'Women at high, men at medium, as all 20 masters were made (ComfyUI/new-race-masters.py).'},
    'plates': {'items': {'plates': {'suggested': 'fal-low', 'fallback': 'fal-medium'}},
               'why': 'fal GPT low with 3 tries, checked by plate_gate.py (ComfyUI/race-gpt-gated.py). Medium matched the master\'s '
                      'mouth colour better when many plates failed on low.'},
    'mouth': {'items': {'E': {'suggested': 'azure-low', 'fallback': None}, 'SS': {'suggested': 'azure-low', 'fallback': None},
                        'TEETH': {'suggested': 'azure-low', 'fallback': None}},
              'why': 'Azure GPT low, as on 30 Oct (plates/E_regen_azure_2026-10-30): one picture each (E in both wordings). You judge the '
                     'teeth gap and the SS corners by eye; "Make another" asks for one more (for E, Nano Banana 2 uses the no-tongue wording, '
                     'which gave 8-15 % gaps when GPT closed the rows).'},
}
LIM = {'edge_px': 1, 'overlap': 0.995, 'neck_px': 2.0, 'master_shift_px': 2.0}   # E / SS / teeth: the user judges (6 Nov), no limits

BALD_ANNA = f'{CLEAN}/european_face_plates'
DRY = {  # stand-in pictures for a dry avatar (bald Anna, e05a0001, and the 6 Nov middle-aged European tries)
    'base': [f'{L}/plates/base_plates/european_middle_aged_female/chatgpt_try3_age38.png', f'{L}/plates/base_plates/race_base_plates/european_female.png'],
    'master': [f'{BALD_ANNA}/european_hd_face_area_neutral.png'],
    'E': [f'{EREG}/raw/e05a0001_E_try1.png', f'{EREG}/raw_v1/e05a0001_E_try1.png'],
    'E_nb': [f'{CLEAN}/new_avatars_nano_banana_E/bald-anna_E_nb_raw.png', f'{CLEAN}/new_avatars_nano_banana_E/bald-anna_E_nb_try1_raw.png'],
    'SS': [f'{EREG}/raw_ss_narrow_v3/e05a0001_SS_try1.png'],
    'SS_wide': [f'{EREG}/raw/e05a0001_SS_try1.png'],
    'TEETH': [f'{EREG}/raw_teeth_open/e05a0001_TEETH_try1.png'],
}


class StepError(Exception):
    """Stops the whole step with a message for the page (a missing service, a missing input, a check that cannot run)."""


class NoFace(Exception):
    """The face points service found no face in a picture: that picture fails its check."""


def now():
    return time.strftime('%Y-%m-%d %H:%M:%S')


def jload(p, default=None):
    try:
        with open(p) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def jsave(p, d):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = f'{p}.{os.getpid()}.{threading.get_ident()}.tmp'
    with open(tmp, 'w') as f:
        json.dump(d, f, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else o.tolist() if isinstance(o, np.ndarray) else str(o))
    os.replace(tmp, p)


def env_value(path, name):
    with open(path) as f:
        for line in f:
            if line.startswith(name + '='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise StepError(f'{name} is missing in {path}')


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0


def save_png(img, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.convert('RGB').save(out)


def b64_png(path):
    if path.lower().endswith('.png'):
        return base64.b64encode(open(path, 'rb').read()).decode()
    import io
    buf = io.BytesIO(); Image.open(path).convert('RGB').save(buf, 'PNG')
    return base64.b64encode(buf.getvalue()).decode()


def lm_px(path):
    """Face points from a saved json (px or fractions of 1024) -> (478, 2) px."""
    a = jload(path)['landmarks']
    a = np.array([[q['x'], q['y']] if isinstance(q, dict) else q[:2] for q in a], float)
    return a * 1024 if a.max() <= 1 else a


def face_points(path):
    """Face points (px of the picture's own size) from the :3011 service. Service down = StepError; no face = NoFace."""
    try:
        with open(path, 'rb') as fh:
            r = requests.post(FACE_POINTS, files={'file': fh}, data={'item_id': 'avatar-maker'}, timeout=180)
    except requests.exceptions.ConnectionError:
        raise StepError(f'The face points service ({FACE_POINTS.split("/v1")[0]}) is not running. Start it: cd ~/Desktop/Liforma_LTD/Liforma/liforma/models.liforma.ai && MODELS_PORT=4011 ./run')
    j = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    if not j.get('landmarks'):
        raise NoFace(f'no face found in {os.path.basename(path)} ({j.get("status") or r.status_code})')
    W, H = Image.open(path).size
    return np.array([q[:2] for q in j['landmarks']], float) * [W, H], j


def points_ok(port):
    """Does the face points service on this port really fit a face (not just listen)?"""
    try:
        with open(TEST_FACE, 'rb') as fh:
            r = requests.post(f'http://127.0.0.1:{port}/v1/face-landmarker/fit-upload', files={'file': fh}, data={'item_id': 'health'}, timeout=60)
        return r.ok and r.json().get('status') == 'ok'
    except Exception:  # noqa: BLE001 - any failure means "cannot use it"; the caller says so
        return False


def labs_ok():
    """Does OLD labs behind the gate really answer (its fit-mesh route rejects an empty body with 400), not just listen?"""
    try:
        r = requests.post(f'{LABS_GATE}/api/avatar-generation/fit-mesh', json={}, timeout=60)
        return r.status_code == 400 and 'sourceFile' in r.text
    except Exception:  # noqa: BLE001 - any failure means "cannot use it"; the caller says so
        return False


def chk(name, value, limit, ok):
    """One line of a check for the page. ok None = shown only, not used to pass."""
    return {'name': name, 'value': value, 'limit': limit, 'ok': None if ok is None else bool(ok)}


# ---------------------------------------------------------------------------------------------------------------- avatar + state
class Avatar:
    def __init__(self, d):
        self.dir = os.path.abspath(d)
        self.cfg = jload(f'{self.dir}/maker.json')
        if not self.cfg:
            raise StepError(f'no maker.json in {self.dir}')
        self.id, self.slug, self.gender = self.cfg['id'], self.cfg['slug'], self.cfg['gender']
        self.dry = bool(self.cfg.get('dry'))
        self.face = f'{self.dir}/face'                       # RACE_DIR for the ComfyUI scripts
        self.master = f'{self.face}/{self.slug}_hd_face_area_neutral.png'
        self.plain = f'{self.face}/{self.slug}_hd_face_area_neutral.plain.png'
        self.set_dir = f'{self.face}_gpt_low_set'
        self.tmp = f'{self.dir}/maker/tmp'
        os.makedirs(self.tmp, exist_ok=True)

    def state_path(self, step):
        return f'{self.dir}/maker/{step}.json'

    def chosen(self, step, item):
        """The try the next step uses: the user's pick, else the one the checks kept."""
        sd = jload(self.state_path(step))
        it = (sd or {}).get('items', {}).get(item)
        n = it and (it.get('picked') or it.get('kept'))
        if not n:
            return None
        return next(t for t in it['tries'] if t['try'] == n)


CURRENT = []   # the running State, so a stop signal can mark it


class State:
    def __init__(self, av, step, options=None, resume=False, append=False):
        self.av, self.path, self.lock = av, av.state_path(step), threading.RLock()
        old = jload(self.path)
        if append:   # "Make another": add to the current run, keep everything in it
            if not old or old.get('status') == 'running':
                raise StepError(f'no finished {step} run to add to')
            self.run, self.d, self.halt = old['run'], old, None
            self.d.update(status='running', error=None, finished=None, pid=os.getpid())
            CURRENT[:] = [self]
            self.save()
            return
        if resume:
            if not old:
                raise StepError(f'nothing to resume for {step}')
            run = old['run']
        else:
            run = (old['run'] + 1) if old else 1
            if old:
                os.replace(self.path, self.path.replace('.json', f'.run{old["run"]}.json'))
        self.run = run
        self.d = {'step': step, 'run': run, 'status': 'running', 'error': None, 'started': now(), 'finished': None,
                  'options': options or {}, 'dry': av.dry, 'items': {}, 'log': [], 'usd': 0.0, 'pid': os.getpid()}
        self.halt = None   # set when one plate worker hits a StepError: the others stop before their next try
        CURRENT[:] = [self]
        self.save()

    def save(self):
        with self.lock:
            jsave(self.path, self.d)

    def log(self, msg):
        line = f'{time.strftime("%H:%M:%S")} {msg}'
        print(line, flush=True)
        with self.lock:
            self.d['log'] = (self.d['log'] + [line])[-600:]
            self.save()

    def item(self, name, **extra):
        with self.lock:
            it = self.d['items'].setdefault(name, {'tries': [], 'kept': None, 'passed': None, 'picked': None})
            it.update(extra)
            self.save()
            return it

    def update(self, target, **fields):
        with self.lock:
            target.update(fields)
            self.save()

    def add_usd(self, usd):
        with self.lock:
            self.d['usd'] = round(self.d['usd'] + (usd or 0), 4)

    def finish(self, status, error=None):
        with self.lock:
            self.d.update(status=status, error=error, finished=now())
            self.save()


def on_stop(signum, frame):  # the page's Stop button: mark the step stopped and leave (fal keeps any request; Resume fetches it)
    for st in CURRENT:
        st.log('stopped by the Stop button; a request already sent keeps running at fal and Resume fetches it by id')
        st.finish('stopped')
    os._exit(1)


signal.signal(signal.SIGTERM, on_stop)


# ---------------------------------------------------------------------------------------------------------------- paid calls
REQ_LOCK = threading.Lock()


def req_log(av, rec):
    rec = {'at': now(), **rec}
    with REQ_LOCK, open(f'{av.dir}/{"dry_requests" if av.dry else "requests"}.jsonl', 'a') as f:
        f.write(json.dumps(rec) + '\n')
        f.flush()
        os.fsync(f.fileno())


def req_last(av, key):
    p = f'{av.dir}/requests.jsonl'
    last = None
    if os.path.exists(p):
        with REQ_LOCK:
            for line in open(p):
                r = json.loads(line)
                if r.get('key') == key:
                    last = {**(last or {}), **r}
    return last


FAL_MODEL, FAL_APP = 'openai/gpt-image-2.5/sunburst/edit', 'openai/gpt-image-2.5'


def fal_curl(args, timeout=300):
    """curl, not Python, for fal: Python uploads to fal stall on this Mac (fal_one_call.py)."""
    r = subprocess.run(['curl', '-s', '-m', str(timeout), '-H', f'Authorization: Key {env_value(FAL_ENV, "FAL_KEY")}',
                        '-H', 'Content-Type: application/json', *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'curl exit {r.returncode} talking to fal {r.stderr.strip()[:200]}')
    try:
        return json.loads(r.stdout or 'null')
    except json.JSONDecodeError:
        raise RuntimeError(f'fal answered without JSON: {r.stdout[:300]}')


def fal_submit(av, m, prompt, src):
    body = {'prompt': prompt, 'image_urls': ['data:image/png;base64,' + b64_png(src)], 'quality': m['quality'],
            'image_size': 'square_hd', 'output_format': 'png', 'background': 'opaque', 'num_images': 1}
    tmp = f'{av.tmp}/fal_body_{uuid.uuid4().hex}.json'
    json.dump(body, open(tmp, 'w'))
    try:
        res = fal_curl(['-X', 'POST', f'https://queue.fal.run/{FAL_MODEL}', '--data-binary', f'@{tmp}'])
    finally:
        os.remove(tmp)
    rid = (res or {}).get('request_id')
    if not rid:
        raise RuntimeError(f'fal did not take the request: {json.dumps(res)[:300]}')
    return rid


def fal_wait(rid, limit=600):
    base = f'https://queue.fal.run/{FAL_APP}/requests/{rid}'
    t0, blips = time.time(), 0
    while True:
        if time.time() - t0 > limit:
            raise RuntimeError(f'fal request {rid} not done after {limit // 60} min; Resume fetches it by id later')
        time.sleep(3)
        try:
            st = fal_curl([f'{base}/status'], 60) or {}
        except RuntimeError:
            blips += 1
            if blips > 10:
                raise
            continue
        if st.get('status') == 'COMPLETED':
            break
        if st.get('status') not in ('IN_QUEUE', 'IN_PROGRESS'):
            raise RuntimeError(f'fal request {rid}: {json.dumps(st)[:300]}')
    res = fal_curl([base], 120) or {}
    imgs = res.get('images') or []
    if not imgs:
        raise RuntimeError(f'fal request {rid} finished without a picture: {json.dumps(res)[:300]}')
    return imgs[0]['url']


def download(av, url, out):
    tmp = f'{av.tmp}/dl_{uuid.uuid4().hex}'
    r = subprocess.run(['curl', '-s', '-f', '-m', '300', '-o', tmp, url], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'download failed (curl {r.returncode}): {url[:120]}')
    save_png(Image.open(tmp), out)
    os.remove(tmp)


def azure_make(prompt, src, out, quality='low'):
    """The api's own Azure image edit, as plates/E_regen_azure_2026-10-30/gen.py sends it. Returns the cost estimate."""
    key, endpoint = env_value(AZURE_ENV, 'AZURE_MODELS_API_KEY'), env_value(AZURE_ENV, 'AZURE_MODELS_ENDPOINT')
    origin = endpoint.rstrip('/')
    origin = origin[:-len('/models')] if origin.endswith('/models') else origin.removesuffix('/openai/v1')
    png = base64.b64decode(b64_png(src))
    for _ in range(12):   # the deployment allows only a few requests a minute: a 429 was not taken, wait as told and send it then
        r = requests.post(f'{origin}/openai/v1/images/edits?api-version=preview', headers={'api-key': key}, timeout=300,
                          data={'model': 'gpt-image-2.5-sunburst', 'prompt': prompt, 'n': '1', 'size': '1024x1024', 'quality': quality,
                                'output_format': 'png'}, files={'image': ('image-0.png', png, 'image/png')})
        if r.status_code != 429:
            break
        wait = int(float(r.headers.get('retry-after', '30') or 30)) + 2
        print(f'{time.strftime("%H:%M:%S")} Azure busy (429, not taken): waiting {wait} s, then sending it', flush=True)
        time.sleep(wait)
    body = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    if not r.ok:
        raise RuntimeError(f'Azure answered {r.status_code}: {str(body.get("error", body))[:300]}')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'wb').write(base64.b64decode(body['data'][0]['b64_json']))
    u = body.get('usage') or {}
    di, do = u.get('input_tokens_details') or {}, u.get('output_tokens_details') or {}
    return round((di.get('text_tokens') or 0) * 5e-6 + (di.get('image_tokens') or 0) * 8e-6
                 + (do.get('image_tokens', u.get('output_tokens', 0)) or 0) * 30e-6, 5)


def gemini_make(m, prompt, src, out):
    """Nano Banana 2, sent the way the labs face generator sends it (gemini_one_call.py): picture first, then the words, 1:1 1K."""
    key = env_value(FAL_ENV, 'GEMINI_API_KEY')
    body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'image/png', 'data': b64_png(src)}}, {'text': prompt}]}],
            'generationConfig': {'responseModalities': ['TEXT', 'IMAGE'], 'imageConfig': {'aspectRatio': '1:1', 'imageSize': '1K'}}}
    r = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{m["model"]}:generateContent', json=body, timeout=300,
                      headers={'x-goog-api-key': key})
    if not r.ok:
        raise RuntimeError(f'Gemini answered {r.status_code}: {r.text[:300]}')
    cand = (r.json().get('candidates') or [{}])[0]
    parts = (cand.get('content') or {}).get('parts') or []
    img = next((p.get('inlineData') or p.get('inline_data') for p in parts if p.get('inlineData') or p.get('inline_data')), None)
    if not img:
        text = ' '.join(p['text'] for p in parts if 'text' in p)[:200]
        raise RuntimeError(f'Gemini gave no picture (finish {cand.get("finishReason")}): {text}')
    tmp = f'{out}.download'
    open(tmp, 'wb').write(base64.b64decode(img['data']))
    save_png(Image.open(tmp), out)
    os.remove(tmp)
    return m['usd']


def make_picture(av, st, key, model_id, prompt, src, out, standin=None):
    """One model call -> out (PNG). Logged before waiting; never sent twice under the same key. Returns fields for the try."""
    t0 = time.time()
    if os.path.exists(out):   # made earlier in this same run (Resume): no call
        prev = req_last(av, key) or {}
        return {'raw': out, 'request_id': prev.get('request_id'), 'usd': 0, 'reused': True}
    m = MODELS[model_id]
    if av.dry:
        if not standin or not os.path.exists(standin):
            raise StepError(f'dry run: no stand-in picture for {key}')
        time.sleep(0.8)
        save_png(Image.open(standin), out)
        rid = 'dry-' + uuid.uuid4().hex[:8]
        req_log(av, {'key': key, 'model': model_id, 'state': 'saved', 'request_id': rid, 'standin': standin, 'out': out, 'usd': 0})
        return {'raw': out, 'request_id': rid, 'usd': 0, 'standin': standin, 'seconds': round(time.time() - t0, 1)}
    prev = req_last(av, key)
    if m['kind'] == 'fal':
        if prev and prev.get('request_id'):
            rid = prev['request_id']
            st.log(f'{key}: sent before ({rid}); fetching it by id, not sending again')
        else:
            rid = fal_submit(av, m, prompt, src)
            req_log(av, {'key': key, 'model': model_id, 'state': 'submitted', 'request_id': rid, 'src': src, 'usd': m['usd']})
        download(av, fal_wait(rid), out)
        req_log(av, {'key': key, 'state': 'saved', 'request_id': rid, 'out': out})
        return {'raw': out, 'request_id': rid, 'usd': m['usd'], 'seconds': round(time.time() - t0, 1)}
    if prev:
        raise RuntimeError(f'sent at {prev["at"]} and no picture was saved; {m["group"]} gives no id to fetch it by, so it is not sent again')
    req_log(av, {'key': key, 'model': model_id, 'state': 'sent', 'src': src, 'usd': m['usd']})
    try:
        usd = azure_make(prompt, src, out, m['quality']) if m['kind'] == 'azure' else gemini_make(m, prompt, src, out)
    except Exception as e:
        req_log(av, {'key': key, 'state': 'failed', 'error': str(e)[:300]})
        raise
    req_log(av, {'key': key, 'state': 'saved', 'out': out, 'usd': usd})
    return {'raw': out, 'request_id': None, 'usd': usd, 'seconds': round(time.time() - t0, 1)}


# ---------------------------------------------------------------------------------------------------------------- the try loop
def tries_of(opts):
    """Tries per picture per model chosen on the page (1 = no re-tries: a failed first try stays failed), at most TRIES."""
    return max(1, min(TRIES, int(opts.get('tries') or TRIES)))


def attempts(opts, item, prompt_names=None):
    """[(model, prompt name)]: the chosen model's tries, then the fallback model's tries (only if none passed)."""
    model, fb = opts['models'][item], (opts.get('fallbacks') or {}).get(item)
    if model not in MODELS or (fb and fb not in MODELS):
        raise StepError(f'unknown model for {item}: {model} / {fb}')
    n = tries_of(opts)
    names = prompt_names or [None] * n
    return [(model, names[i]) for i in range(n)] + ([(fb, None)] * n if fb else [])


def try_loop(st, item, plan, make, check, min_tries=1, choose=None, judge=None, start=1, keep=True):
    """make(n, model, prompt name) -> try fields with 'raw'; check(try) -> {'pass', 'score', 'checks', ...}. A picture that never came
    back counts as a try and the next one is made; a check that cannot run stops the step (StepError) so no more money is spent."""
    it = st.item(item)
    for n, (model_id, pname) in enumerate(plan, start):
        if st.halt:
            raise StepError(st.halt)
        if n > min_tries and any(t.get('pass') for t in it['tries']):
            break
        e = {'try': n, 'model': model_id, 'label': f"{MODELS[model_id]['group']} · {MODELS[model_id]['label']}", 'prompt': pname,
             'status': 'making', 'started': now()}
        with st.lock:
            it['tries'].append(e)
        st.log(f'{item} try {n}: making it on {e["label"]}' + (f' ({pname} wording)' if pname else ''))
        try:
            fields = make(n, model_id, pname)
        except StepError as ex:
            st.halt = st.halt or str(ex)
            raise
        except Exception as ex:  # noqa: BLE001 - no picture came back: counted, shown, next try
            st.update(e, status='no picture', error=str(ex)[:400])
            st.log(f'{item} try {n}: no picture ({str(ex)[:200]})')
            continue
        st.add_usd(fields.get('usd'))
        st.update(e, status='checking', **fields)
        try:
            res = check(e)
        except StepError as ex:
            st.halt = st.halt or str(ex)
            raise
        if res['pass'] is None:   # the user judges this picture
            st.update(e, status='made: you judge', **res)
            st.log(f'{item} try {n}: made; ' + '; '.join(f"{c['name']} {c['value']}" for c in res['checks'][:2]))
            continue
        st.update(e, status='pass' if res['pass'] else 'fail', **res)
        bad = [f"{c['name']} {c['value']}" for c in res['checks'] if c['ok'] is False]
        st.log(f'{item} try {n}: ' + ('PASS' if res['pass'] else 'fail: ' + '; '.join(bad)))
    if keep:
        keep_best(st, item, choose, judge)


def keep_best(st, item, choose=None, judge=None):
    it = st.d['items'][item]
    checked = [t for t in it['tries'] if 'score' in t]
    if not checked:
        st.update(it, kept=None, passed=False)
        st.log(f'{item}: no try came back')
        return None
    if judge:   # no pass/fail: keep the lowest score as the default, the user decides
        best = min(checked, key=lambda t: t['score'])
        st.update(it, kept=best['try'], passed=None, judge=True)
        st.log(f'{item}: try {best["try"]} in use for now ({judge}); you judge it, "Use this one" changes it')
        return best
    passed = [t for t in checked if t['pass']]
    best = choose(passed, checked) if choose else min(passed or checked, key=lambda t: t['score'])
    st.update(it, kept=best['try'], passed=bool(best['pass']))
    st.log(f'{item}: keeping try {best["try"]} ' + ('(passed)' if best['pass'] else '(none passed: the best of them)'))
    return best


# ---------------------------------------------------------------------------------------------------------------- checks
def lab(rgb):
    c = np.asarray(rgb, float) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def forehead_de(a, b):
    """select.py's colour test: mean Lab of the forehead + temples band (rows 200-330, middle 40 %), CIE76."""
    band = lambda p: load_rgb(p)[200:330, int(0.30 * 1024):int(0.70 * 1024)].reshape(-1, 3).mean(0)
    return round(float(np.linalg.norm(lab(band(a)) - lab(band(b)))), 2)


def check_base(av, inp, pic):
    r = subprocess.run([CPY, f'{L}/plates/base_plates/check_base_body.py', inp, pic], cwd=f'{L}/plates/base_plates', capture_output=True, text=True)
    if r.returncode:
        raise StepError(f'check_base_body.py could not measure {os.path.basename(pic)}: {r.stderr.strip()[-400:]}')
    stem = os.path.splitext(pic)[0]
    j = jload(f'{stem}_check.json')
    el, er, ht = j['edge_left'], j['edge_right'], j['head_top']
    ov, nk = j['body_outline_overlap_below_neck'], j['neck_width_change_mean']
    checks = [chk('figure edge, left', f'{el:+d} px', 'within 1 px', abs(el) <= LIM['edge_px']),
              chk('figure edge, right', f'{er:+d} px', 'within 1 px', abs(er) <= LIM['edge_px']),
              chk('head top', f'{ht:+d} px', 'within 1 px', abs(ht) <= LIM['edge_px']),
              chk('body outline below the neck', ov, 'at least 0.995', ov >= LIM['overlap']),
              chk('neck width (average change)', f'{nk:+.1f} px', 'within 2 px', abs(nk) <= LIM['neck_px']),
              chk('neck width (widest row)', f'{j["neck_width_change_max"]:+d} px', '', None),
              chk('backdrop', f'{j["backdrop_new"]} (input {j["backdrop_input"]})', '', None),
              chk('forehead colour', f'{j["forehead_new"]} (input {j["forehead_input"]})', '', None)]
    score = max(abs(el), abs(er), abs(ht), abs(nk) / LIM['neck_px'], (1 - ov) / (1 - LIM['overlap']))
    return {'pass': all(c['ok'] for c in checks if c['ok'] is not None), 'score': round(float(score), 3), 'checks': checks,
            'views': [f'{stem}_check_sheet.png', f'{stem}_check_neck.png']}


def small_view(img_or_path, out, box=None, width=340):
    im = Image.open(img_or_path) if isinstance(img_or_path, str) else img_or_path
    im = im.convert('RGB')
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.LANCZOS)
    if box:
        im = im.crop(box)
    im = im.resize((width, max(1, round(width * im.size[1] / im.size[0]))), Image.LANCZOS)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, quality=88)
    return out


def check_master(av, pic):
    plain_lm = lm_px(f'{av.face}/master_landmarks.plain.json')
    view = small_view(pic, f'{os.path.splitext(pic)[0]}_view.jpg', width=420)
    try:
        lm, raw = face_points(pic)
    except NoFace as e:
        return {'pass': False, 'score': 99.0, 'checks': [chk('face found', str(e), 'a face', False)], 'views': [view]}
    lm = lm * (1024 / Image.open(pic).size[0])
    jsave(f'{os.path.splitext(pic)[0]}.points.json', {'landmarks': [[round(x, 3), round(y, 3)] for x, y in lm.tolist()],
                                                       'from': 'the master try (:3011 fit)'})
    d = np.hypot(*(lm - plain_lm).T)
    med = float(np.median(d))
    checks = [chk('face points moved (median)', f'{med:.2f} px', 'at most 2 px', med <= LIM['master_shift_px']),
              chk('face points moved (most)', f'{d.max():.1f} px', '', None),
              chk('forehead colour change', f'{forehead_de(pic, av.plain):.1f} ΔE', '', None)]
    return {'pass': med <= LIM['master_shift_px'], 'score': round(med / LIM['master_shift_px'], 3), 'checks': checks, 'views': [view]}


def crop_box(lm, mask_path):
    """race-gpt-gated.py's crops: both eyes, or the mouth down to below the chin."""
    if 'eyes' in os.path.basename(mask_path or ''):
        ex, ey = (lm[33][0] + lm[263][0]) / 2, (lm[33][1] + lm[263][1]) / 2
        return (int(ex - 220), int(ey - 110), int(ex + 220), int(ey + 110))
    mx, my, chin = (lm[61][0] + lm[291][0]) / 2, (lm[13][1] + lm[14][1]) / 2, lm[152][1]
    return (int(mx - 170), int(my - 130), int(mx + 170), int(min(1023, chin + 40)))


class Face:
    """The installed master, its points, its masks and plate_gate's feature mask (shared by the plate and mouth steps)."""

    def __init__(self, av):
        if not os.path.exists(av.master):
            raise StepError('No master yet: run step 2 first.')
        self.spec = jload(f'{av.face}/CHOSEN_run_spec.json')
        if not self.spec:
            raise StepError('No masks yet: make the masks in step 3 first.')
        self.rgb = load_rgb(av.master)
        self.lm = lm_px(f'{av.face}/master_landmarks.json')
        self.features = feature_mask(self.lm)
        self._masks = {}

    def mask(self, plate):
        p = self.spec[plate]['mask']
        if p not in self._masks:
            self._masks[p] = np.asarray(Image.open(p).convert('L').resize((1024, 1024)))
        return self._masks[p]


def gate(face, plate, raw):
    """race-gpt-gated.py's test: checked as returned, colour matched to the master (per-channel multiply), master pasted back
    outside the mask, checked again. Writes the pasted copy next to the try."""
    mask = face.mask(plate)
    pic = load_rgb(raw)
    as_ret, _ = gate_check(face.rgb, pic, mask, face.features)
    matched, gain = match_gain(face.rgb, pic, mask)
    final, pasted = gate_check(face.rgb, matched, mask, face.features)
    pasted_p = raw[:-4] + '_pasted.png'
    Image.fromarray(np.clip(pasted, 0, 255).round().astype(np.uint8)).save(pasted_p)
    checks = [chk('outline moved', f"{final['outline_moved_px']} px", f"at most {LIMITS['outline_moved_px']}", final['outline_moved_px'] <= LIMITS['outline_moved_px']),
              chk('edge skin colour', f"{final['edge_skin_de']} ΔE", f"at most {LIMITS['edge_skin_de']}", final['edge_skin_de'] <= LIMITS['edge_skin_de']),
              chk('join colour (seam)', f"{final['seam_de']} ΔE", f"at most {LIMITS['seam_de']}", final['seam_de'] <= LIMITS['seam_de']),
              chk('outline break at the join', f"{final['outline_kink_px']} px", f"at most {LIMITS['outline_kink_px']}", final['outline_kink_px'] <= LIMITS['outline_kink_px']),
              chk('inside skin colour', f"{final['inside_skin_de']} ΔE", f"at most {LIMITS['inside_skin_de']}", final['inside_skin_de'] <= LIMITS['inside_skin_de']),
              chk('skin detail (softness)', final['edge_detail_ratio'], f'at least {DETAIL_MIN}', final['edge_detail_ratio'] >= DETAIL_MIN),
              chk('colour outside the mask, as returned', f"{as_ret['outside_colour_de']} ΔE", '', None)]
    return {'pass': bool(final['pass_after_paste']), 'score': float(final['score']), 'checks': checks, 'pasted': pasted_p,
            'final': final, 'as_returned': as_ret, 'colour_gain_rgb': [round(float(g), 3) for g in gain]}


def teeth_gap_pct(pic):
    """nano-banana-E-batch.py's gap: middle third of the mouth, rows of bright low-colour pixels (teeth), largest break between them,
    as % of mouth width (Anna: E 6 %, teeth picture 11 %). Returns (gap or None, points)."""
    lm, _ = face_points(pic)
    lm = lm * (1024 / Image.open(pic).size[0])
    a = load_rgb(pic).astype(int)
    cx, w = (lm[13][0] + lm[14][0]) / 2, abs(lm[291][0] - lm[61][0])
    y0, y1 = int(min(lm[13][1], lm[0][1]) - 10), int(max(lm[14][1], lm[17][1]) + 10)
    gaps = []
    for x in range(int(cx - w / 6), int(cx + w / 6)):
        col = a[y0:y1, x]
        rows = np.nonzero((col.min(-1) > 140) & ((col.max(-1) - col.min(-1)) < 70))[0]
        if len(rows) < 4:
            continue
        d = np.diff(rows)
        gaps.append(int(d.max() - 1) if d.max() > 1 else 0)
    return (round(100 * float(np.median(gaps)) / float(w), 1) if gaps else None), lm


def corner_lines(face, pic_rgb, lm):
    """New thin dark lines running out of each mouth corner (the thin line two men's SS had across the cheeks): dark-line filter
    (black-hat, 9 px) of the picture minus the master's, so lines the master already has drop out. Longest thin line (px) per side."""
    L = lambda rgb: cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) * 100 / 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    new = np.clip(cv2.morphologyEx(L(pic_rgb), cv2.MORPH_BLACKHAT, k) - cv2.morphologyEx(L(face.rgb), cv2.MORPH_BLACKHAT, k), 0, None)
    out = {}
    for side, idx, sgn in (('left', 61, -1), ('right', 291, 1)):
        cx, cy = lm[idx]
        x0, x1 = (int(cx - 110), int(cx - 4)) if sgn < 0 else (int(cx + 4), int(cx + 110))
        y0 = int(cy - 45)
        reg = (new[y0:int(cy + 45), max(0, x0):min(1024, x1)] > 5).astype(np.uint8)
        n, _, stats, _ = cv2.connectedComponentsWithStats(reg, connectivity=8)
        best = 0
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            length = max(w, h)
            touches_corner = (x + w >= reg.shape[1] - 14) if sgn < 0 else (x <= 14)
            if touches_corner and area / max(length, 1) <= 4 and length > best:   # thin: about 4 px wide at most
                best = int(length)
        out[side] = best
    return out


# ---------------------------------------------------------------------------------------------------------------- steps that cost money
def run_base(av, st, opts):
    inp = INPUT[av.gender]
    prompt = (av.cfg.get('prompts') or {}).get('base', '').strip()
    if not prompt:
        raise StepError('Write the base body prompt first.')
    os.makedirs(f'{av.dir}/base', exist_ok=True)
    open(f'{av.dir}/base/run{st.run}_prompt.txt', 'w').write(prompt + '\n')
    st.item('base', input=inp)

    def make(n, model_id, _):
        out = f'{av.dir}/base/run{st.run}_try{n}_{model_id}.png'
        return make_picture(av, st, f'base/run{st.run}/try{n}', model_id, prompt, inp, out, DRY['base'][min(n, len(DRY['base'])) - 1])

    try_loop(st, 'base', attempts(opts, 'base'), make, lambda e: check_base(av, inp, e['raw']))


def run_master(av, st, opts):
    if not os.path.exists(av.plain):
        raise StepError('No head crop yet: press "Make the head crop" first.')
    st.item('master', input=av.plain)

    def make(n, model_id, _):
        out = f'{av.face}/master_tries/run{st.run}_try{n}_{model_id}.png'
        return make_picture(av, st, f'master/run{st.run}/try{n}', model_id, MASTER_PROMPT, av.plain, out, DRY['master'][0])

    try_loop(st, 'master', attempts(opts, 'master'), make, lambda e: check_master(av, e['raw']))
    it = st.d['items']['master']
    if it['kept']:
        install_master(av, next(t for t in it['tries'] if t['try'] == it['kept']), st)


def install_master(av, t, st=None):
    """Put the chosen master where the ComfyUI scripts read it, with its own face points (the guide: re-fit on the master)."""
    shutil.copy(t['raw'], av.master)
    shutil.copy(t['raw'], f'{av.face}/{av.slug}_face_area_neutral.png')
    pts = f'{os.path.splitext(t["raw"])[0]}.points.json'
    if not os.path.exists(pts):
        raise StepError(f'no face points saved for {os.path.basename(t["raw"])}; it cannot be the master')
    shutil.copy(pts, f'{av.face}/master_landmarks.json')
    jsave(f'{av.face}/gpt25_run.json', {'model': FAL_MODEL if MODELS[t['model']]['kind'] == 'fal' else t['model'], 'maker_model': t['model'],
                                        'request_id': t.get('request_id'), 'prompt': MASTER_PROMPT, 'input': os.path.basename(av.plain),
                                        'try': t['try'], 'dry_standin': t.get('standin')})
    if st:
        st.log(f'master: try {t["try"]} installed as {os.path.basename(av.master)} (+ its face points)')


def run_plates(av, st, opts):
    face = Face(av)
    prompts = jload(PLATE_PROMPTS[av.gender])['prompts']
    plates = [k for k in face.spec if k not in ('E', 'teeth_structure_sil')]   # E and the teeth picture come from step 5
    missing = [k for k in plates if k not in prompts]
    if missing:
        raise StepError(f'no wording for {missing} in {PLATE_PROMPTS[av.gender]}')
    run_dir = f'{av.face}_gpt_sunburst_gated_run{st.run}'
    os.makedirs(f'{run_dir}/tries', exist_ok=True)
    os.makedirs(f'{run_dir}/views', exist_ok=True)
    checked = [k for k in plates if face.spec[k]['mask']]
    turns = [k for k in plates if not face.spec[k]['mask']]
    with st.lock:
        st.d['run_dir'] = run_dir
    for k in plates:
        box = crop_box(face.lm, face.spec[k]['mask'])
        st.item(k, mask=face.spec[k]['mask'], box=box, master_view=small_view(av.master, f'{run_dir}/views/{k}_master.jpg', box, 260),
                head_turn=not face.spec[k]['mask'])

    standin = plate_standin

    def one(k):
        make, check = plate_tools(av, st, face, prompts, run_dir, k)
        try_loop(st, k, attempts(opts, 'plates'), make, check)

    def turn(k):   # the two head turns: made once, not checked (no mask), colour-fixed with the run's median fix afterwards
        it = st.d['items'][k]
        model_id = opts['models']['plates']
        e = {'try': 1, 'model': model_id, 'label': f"{MODELS[model_id]['group']} · {MODELS[model_id]['label']}", 'status': 'making', 'started': now()}
        with st.lock:
            it['tries'].append(e)
        try:
            fields = make_picture(av, st, f'plates/run{st.run}/{k}/try1', model_id, prompts[k], av.master,
                                  f'{run_dir}/tries/{av.slug}_{k}_try1.png', standin(k, 1))
        except StepError:
            raise
        except Exception as ex:  # noqa: BLE001
            st.update(e, status='no picture', error=str(ex)[:400])
            st.log(f'{k}: no picture ({str(ex)[:200]})')
            return
        st.add_usd(fields.get('usd'))
        st.update(e, status='made (head turn, not checked)', **fields, views=[small_view(fields['raw'], f'{run_dir}/views/{k}_try1.jpg', width=260)])
        st.log(f'{k}: made (head turn: whole picture, not checked)')

    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = [ex.submit(turn, k) for k in turns] + [ex.submit(one, k) for k in checked]
        for f in futures:
            f.result()   # re-raise a StepError from any plate
    finish_plates(av, st, run_dir, checked, turns, opts)


def plate_standin(k, n):
    """Dry avatar: bald Anna's own tries of that plate stand in."""
    tries = sorted(p for p in glob.glob(f'{BALD_ANNA}_gpt_sunburst_low_gated/tries/european_{k}_try*.png') if not p.endswith('_pasted.png'))
    return tries[min(n, len(tries)) - 1] if tries else None


def plate_tools(av, st, face, prompts, run_dir, k):
    """make(n, model, _) and check(try) for one checked plate (the run and "Make another" share them)."""
    def make(n, model_id, _):
        out = f'{run_dir}/tries/{av.slug}_{k}_try{n}.png'
        return make_picture(av, st, f'plates/run{st.run}/{k}/try{n}', model_id, prompts[k], av.master, out, plate_standin(k, n))

    def check(e):
        res = gate(face, k, e['raw'])
        res['views'] = [small_view(res['pasted'], f'{run_dir}/views/{k}_try{e["try"]}.jpg', st.d['items'][k]['box'], 260)]
        return res
    return make, check


def next_try(av, st, step, k):
    """A try number never used for this plate in this run, in the state OR in the request log (a lost request keeps its number)."""
    used = [t['try'] for t in st.d['items'][k]['tries']]
    p = f'{av.dir}/{"dry_requests" if av.dry else "requests"}.jsonl'
    prefix = f'{step}/run{st.run}/{k}/try'
    if os.path.exists(p):
        used += [int(r['key'][len(prefix):]) for r in map(json.loads, open(p)) if r.get('key', '').startswith(prefix) and r['key'][len(prefix):].isdigit()]
    return max(used or [0]) + 1


def run_plates_more(av, st, opts):
    """One new try for each named plate in the current step-4 run ("Make another" / "Remake the ones that did not come back"). The checks
    pick the kept try again for those plates; gate.json, the kept pictures and the sheet are rewritten."""
    names, mid = opts['more']['plates'], opts['more']['model']
    if mid not in MODELS:
        raise StepError(f'unknown model {mid}')
    bad = [k for k in names if k not in st.d['items'] or st.d['items'][k].get('head_turn')]
    if bad:
        raise StepError(f'cannot remake {bad} here (unknown, or a head turn)')
    face = Face(av)
    prompts = jload(PLATE_PROMPTS[av.gender])['prompts']
    run_dir = st.d['run_dir']
    st.log(f'remaking {", ".join(names)} once each on {MODELS[mid]["group"]} {MODELS[mid]["label"]}')

    def one(k):
        make, check = plate_tools(av, st, face, prompts, run_dir, k)
        try_loop(st, k, [(mid, None)], make, check, start=next_try(av, st, 'plates', k))

    with ThreadPoolExecutor(max_workers=4) as ex:
        for f in [ex.submit(one, k) for k in names]:
            f.result()
    items = st.d['items']
    finish_plates(av, st, run_dir, [k for k in items if not items[k].get('head_turn')], [k for k in items if items[k].get('head_turn')], st.d['options'])


def finish_plates(av, st, run_dir, checked, turns, opts):
    """Kept pasted try -> <run dir>/<slug>_<plate>.png, head turns with the median colour fix, gate.json and a sheet (race-gpt-gated.py's layout)."""
    gains, plates = [], {}
    for k in checked:
        it = st.d['items'][k]
        t = next((t for t in it['tries'] if t['try'] == it['kept']), None)
        if t:
            shutil.copy(t['pasted'], f'{run_dir}/{av.slug}_{k}.png')
            gains.append(t['colour_gain_rgb'])
        plates[k] = {'passed': bool(it['passed']), 'kept_try': it['kept'],
                     'tries': [{x: t[x] for x in ('try', 'request_id', 'usd', 'raw', 'pasted', 'as_returned', 'colour_gain_rgb', 'final', 'model') if x in t}
                               for t in it['tries']]}
    avg = np.median(gains, 0) if gains else np.ones(3)
    turned = {}
    for k in turns:
        t = next((t for t in st.d['items'][k]['tries'] if t.get('raw')), None)
        if not t:
            continue
        px = np.asarray(Image.open(t['raw']).convert('RGB'), float)
        Image.fromarray(np.clip(px * avg, 0, 255).round().astype(np.uint8)).save(f'{run_dir}/{av.slug}_{k}.png')
        turned[k] = {'raw': t['raw'], 'request_id': t.get('request_id'), 'colour_gain_rgb': [round(float(g), 3) for g in avg],
                     'note': 'no mask: not pasted or checked; same median per-channel multiply as the checked plates of this run'}
        st.update(st.d['items'][k], colour_gain_rgb=turned[k]['colour_gain_rgb'])
    jsave(f'{run_dir}/head_turns.json', turned)
    jsave(f'{run_dir}/gate.json', {'models': opts['models'], 'fallbacks': opts.get('fallbacks'), 'limits': LIMITS, 'detail_min': DETAIL_MIN,
                                   'list_price_usd': st.d['usd'], 'dry': av.dry, 'plates': plates})
    rows = []
    for k in checked + turns:
        it = st.d['items'][k]
        cells = [(it['master_view'], ['master'], (70, 70, 70))]
        for t in it['tries']:
            if not t.get('views'):
                cells.append((None, [f"try {t['try']}: {t['status']}"], (150, 150, 150)))
                continue
            bad = [c['name'] for c in t.get('checks', []) if c['ok'] is False]
            kept = ' KEPT' if t['try'] == it.get('kept') else ''
            cells.append((t['views'][0], [f"try {t['try']} {MODELS[t['model']]['quality'] if 'quality' in MODELS[t['model']] else t['model']}{kept}",
                                          'PASS' if t.get('pass') else ('not checked' if it.get('head_turn') else 'fail: ' + ', '.join(bad)[:46])],
                          (20, 130, 40) if t.get('pass') else (190, 30, 30) if t.get('pass') is False else (120, 100, 20)))
        rows.append((k, cells))
    make_sheet(rows, f'{run_dir}/_gate_sheet.png')
    with st.lock:
        st.d['sheet'] = f'{run_dir}/_gate_sheet.png'
    n_pass = sum(1 for k in checked if st.d['items'][k]['passed'])
    st.log(f'plates: {n_pass}/{len(checked)} passed, {len(turned)} head turns colour-fixed; sheet {run_dir}/_gate_sheet.png')


def calm_skin(lm):
    """Forehead, upper cheeks and nose bridge (no eyes, brows or anything below the nose tip): ss_compare_sheet.calm_skin."""
    OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58,
            132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
    EYEB = [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
            [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
            [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]]
    m = np.zeros((1024, 1024), np.uint8)
    cv2.fillPoly(m, [np.round(lm[OVAL]).astype(np.int32)], 1)
    m[int(lm[2, 1]):, :] = 0
    for idx in EYEB:
        e = np.zeros((1024, 1024), np.uint8)
        cv2.fillPoly(e, [cv2.convexHull(np.round(lm[idx]).astype(np.int32))], 1)
        m[cv2.dilate(e, np.ones((21, 21), np.uint8)) > 0] = 0
    return cv2.erode(m, np.ones((9, 9), np.uint8)) > 0


def mouth_prompt(name):
    f, k = MOUTH_PROMPTS[name]
    return jload(f)['prompts'][k]


def mouth_tools(av, st):
    """Step 5's makers and checks (the run and "Make another" share them). The teeth gap and the corner-line numbers are SHOWN only:
    the user judges E, SS and the teeth picture by eye (6 Nov), so nothing here re-tries or falls back on its own."""
    T = type('MouthTools', (), {})()
    T.face = face = Face(av)
    T.inp = inp = av.master   # the master close-up on its own screen, as plates/E_regen_azure_2026-10-30/inputs/
    T.dir = d = f'{av.dir}/mouth'
    os.makedirs(d, exist_ok=True)
    mbox = crop_box(face.lm, None)
    counts = {}

    def standin(kind):
        counts[kind] = counts.get(kind, 0) + 1
        lst = DRY[kind]
        return lst[min(counts[kind], len(lst)) - 1]

    def make(item, src):
        def fn(n, model_id, pname):
            pname = 'E_nb' if item == 'E' and MODELS[model_id]['kind'] == 'gemini' else (pname or item)
            out = f'{d}/run{st.run}_{item}_try{n}_{model_id}.png'
            return make_picture(av, st, f'mouth/run{st.run}/{item}/try{n}', model_id, mouth_prompt(pname), src, out,
                                standin('E' if pname == 'E_v1' else pname)) | {'prompt': pname}
        return fn

    def view(e, item):
        return small_view(e['raw'], f'{d}/views/run{st.run}_{item}_try{e["try"]}.jpg', mbox, 300)

    def gap_lines(g):
        try:
            gap, _ = teeth_gap_pct(g['pasted'])
            return gap, []
        except NoFace as ex:
            return None, [chk('face found', str(ex), 'a face', None)]

    def check_e(e):
        g = gate(face, 'E', e['raw'])
        gap, noface = gap_lines(g)
        de = forehead_de(e['raw'], inp)
        checks = noface + [chk('gap between the teeth rows (you judge)', 'no teeth found' if gap is None else f'{gap} % of mouth width', 'Anna 6.8 %; the 20 packs now 0-4.5 %', None),
                           chk('forehead colour change (picks between the two wordings)', f'{de} ΔE', 'lower = closer to the master', None)] \
            + [dict(c, ok=None) for c in g['checks']]
        return {'pass': None, 'score': de, 'checks': checks, 'gap_pct': gap, 'colour_de': de, 'pasted': g['pasted'], 'views': [view(e, 'E')]}

    def check_ss(e):
        g = gate(face, 'SS', e['raw'])
        try:
            lm, _ = face_points(e['raw'])
            lm = lm * (1024 / Image.open(e['raw']).size[0])
            matched, _ = match_gain(face.rgb, load_rgb(e['raw']), face.mask('SS'))
            lines = corner_lines(face, matched, lm)
            top = [chk('dark line from the mouth corner, left (you judge)', f"{lines['left']} px", 'the 19 now: 0-19 px', None),
                   chk('dark line from the mouth corner, right (you judge)', f"{lines['right']} px", 'the 19 now: 0-19 px', None)]
        except NoFace as ex:
            lines, top = None, [chk('face found', str(ex), 'a face', None)]
        return {'pass': None, 'score': 0.0, 'checks': top + [dict(c, ok=None) for c in g['checks']], 'corner_lines': lines,
                'pasted': g['pasted'], 'views': [view(e, 'SS')]}

    def check_teeth(e):
        g = gate(face, 'teeth_structure_sil', e['raw'])
        gap, noface = gap_lines(g)
        checks = noface + [chk('gap between the teeth rows (you judge)', 'no teeth found' if gap is None else f'{gap} % of mouth width', 'Anna 11.4 %; the 20 packs now 1.9-4.4 %', None)] \
            + [dict(c, ok=None) for c in g['checks']]
        return {'pass': None, 'score': 0.0, 'checks': checks, 'gap_pct': gap, 'pasted': g['pasted'], 'views': [view(e, 'TEETH')]}

    T.make, T.view, T.check = make, view, {'E': check_e, 'SS': check_ss, 'TEETH': check_teeth}
    T.mbox = mbox
    return T


def run_mouth(av, st, opts):
    """E (both wordings, prompt.json + prompt_v1.json; the one closer in skin colour is kept, as select.py), the narrow SS, the wide SS
    the teeth picture is drawn from, and the teeth picture: one picture each. The user judges them and can ask for more ("Make another")."""
    T = mouth_tools(av, st)
    m = opts['models']
    st.item('E', input=T.inp)
    try_loop(st, 'E', [(m['E'], 'E'), (m['E'], 'E_v1')], T.make('E', T.inp), T.check['E'], judge='closer skin colour (select.py)')
    st.item('SS', input=T.inp)
    try_loop(st, 'SS', [(m['SS'], 'SS')], T.make('SS', T.inp), T.check['SS'], judge='the only one')

    # the teeth picture: made from a WIDE SS (prompt.json's SS) as returned, colour-corrected to the master (make_teeth_inputs.py)
    wide = st.item('SS_wide', input=T.inp, note='only the input of the teeth picture')
    mid = m['TEETH']
    e = {'try': 1, 'model': mid, 'label': f"{MODELS[mid]['group']} · {MODELS[mid]['label']}", 'prompt': 'SS_wide', 'status': 'making'}
    with st.lock:
        wide['tries'].append(e)
    st.log('SS_wide: making the wide SS the teeth picture is drawn from')
    try:
        fields = T.make('SS_wide', T.inp)(1, mid, 'SS_wide')
    except StepError:
        raise
    except Exception as ex:  # noqa: BLE001
        st.update(e, status='no picture', error=str(ex)[:400])
        raise StepError(f'the wide SS did not come back ({str(ex)[:200]}), so the teeth picture cannot be made')
    st.add_usd(fields.get('usd'))
    X = load_rgb(fields['raw']).astype(np.float32)
    msk = calm_skin(T.face.lm)
    gain = np.median(T.face.rgb[msk], 0) / np.maximum(np.median(X[msk], 0), 1)
    Xn = np.clip(X * gain, 0, 255)
    scr = np.all(np.abs(X - X[5, 5]) < 40, -1)
    Xn[scr] = X[scr]
    teeth_in = f'{T.dir}/run{st.run}_teeth_input.png'
    Image.fromarray(Xn.astype(np.uint8)).save(teeth_in)
    st.update(e, status='made (input only)', **fields, colour_gain_rgb=[round(float(v), 3) for v in gain], teeth_input=teeth_in)
    st.update(e, views=[T.view(e, 'SS_wide')])
    st.update(wide, kept=1, passed=None)
    st.item('TEETH', input=teeth_in)
    try_loop(st, 'TEETH', [(mid, 'TEETH')], T.make('TEETH', teeth_in), T.check['TEETH'], judge='the only one')
    mouth_sheet(av, st, T)


def run_mouth_more(av, st, opts):
    """One more picture for E, SS or the teeth picture in the current step-5 run ("Make another"); the kept one stays until "Use this one"."""
    item, mid = opts['more']['item'], opts['more']['model']
    if item not in ('E', 'SS', 'TEETH') or mid not in MODELS:
        raise StepError(f'cannot make another {item} on {mid}')
    T = mouth_tools(av, st)
    it = st.d['items'][item]
    n = max([t['try'] for t in it['tries']] or [0]) + 1
    src = it['input']
    st.log(f'{item}: one more picture asked for (try {n})')
    pname = 'E_nb' if item == 'E' and MODELS[mid]['kind'] == 'gemini' else item
    try_loop(st, item, [(mid, pname)], T.make(item, src), T.check[item], judge='unchanged', start=n, keep=False)
    mouth_sheet(av, st, T)


def mouth_sheet(av, st, T):
    rows = []
    for item in ('E', 'SS', 'SS_wide', 'TEETH'):
        it = st.d['items'].get(item)
        if not it:
            continue
        cells = [(small_view(T.inp, f'{T.dir}/views/master_mouth.jpg', T.mbox, 300), ['master'], (70, 70, 70))]
        for t in it['tries']:
            mark = ' KEPT' if t['try'] == (it.get('picked') or it.get('kept')) else ''
            gap = f" gap {t['gap_pct']} %" if t.get('gap_pct') is not None else ''
            cells.append((t['views'][0] if t.get('views') else None, [f"try {t['try']} {MODELS[t['model']]['group']}{mark}", f"{t['status']}{gap}"], (120, 100, 20)))
        rows.append((item, cells))
    with st.lock:
        st.d['sheet'] = make_sheet(rows, f'{T.dir}/run{st.run}_sheet.png')


def make_sheet(rows, out, tile=260):
    """rows: [(title, [(picture or None, [caption lines], colour)])] -> one PNG for the record."""
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15)
    small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 12)
    th = max((round(tile * Image.open(p).size[1] / Image.open(p).size[0]) for _, cells in rows for p, _, _ in cells if p), default=tile)
    ncol = max(len(c) for _, c in rows)
    sheet = Image.new('RGB', (140 + ncol * (tile + 8), 10 + len(rows) * (th + 44)), 'white')
    dr = ImageDraw.Draw(sheet)
    for i, (title, cells) in enumerate(rows):
        y = 10 + i * (th + 44)
        dr.text((8, y + 6), title, fill='black', font=font)
        for c, (p, lines, col) in enumerate(cells):
            x = 140 + c * (tile + 8)
            if p:
                im = Image.open(p).convert('RGB')
                sheet.paste(im.resize((tile, round(tile * im.size[1] / im.size[0])), Image.LANCZOS), (x, y))
            for j, line in enumerate(lines[:2]):
                dr.text((x, y + th + 3 + 14 * j), line, fill=col, font=small)
    sheet.save(out)
    return out


# ---------------------------------------------------------------------------------------------------------------- free local steps
def run_cmd(st, label, cmd, cwd, env=None, logfile=None):
    st.log(f'{label}: {" ".join(cmd) if isinstance(cmd, list) else cmd}')
    r = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}, capture_output=True, text=True,
                       shell=isinstance(cmd, str), executable='/bin/zsh' if isinstance(cmd, str) else None)
    out = (r.stdout + r.stderr).replace('\r', '\n').strip().splitlines()
    if logfile:
        with open(logfile, 'a') as f:
            f.write(f'\n=== {now()} {label}\n' + '\n'.join(out) + '\n')
    for line in out[-6:]:
        st.log(f'  {line[:300]}')
    if r.returncode:
        raise StepError(f'{label} failed (exit {r.returncode}): ' + ' | '.join(out[-4:])[:600])
    return out


def free_crop(av, st, opts):
    """Head crop exactly as ComfyUI/prep-new-race-avatars.py: a square from the top of the base picture, centred on the face,
    570 px per 1254 (466 on a 1024), enlarged to 1024; face points of the enlargement."""
    t = av.chosen('base', 'base')
    if not t:
        raise StepError('No base body yet: run step 1 (or add a picture) first.')
    if os.path.exists(av.master):
        raise StepError('This avatar already has a master. Make a new avatar to start from another base picture.')
    os.makedirs(av.face, exist_ok=True)
    im = Image.open(t['raw']).convert('RGB')
    W, H = im.size
    lm, _ = face_points(t['raw'])
    cx = (lm[234][0] + lm[454][0]) / 2
    side = round(570 * W / 1254)
    x0 = round(cx - side / 2)
    crop = im.crop((x0, 0, x0 + side, side))
    crop.save(f'{av.face}/{av.slug}_in_02_head_crop.png')
    crop.resize((1024, 1024), Image.LANCZOS).save(av.plain)
    jsave(f'{av.face}/geometry.json', {'base': t['raw'], 'cx': round(cx, 1), 'side': side, 'x0': x0, 'y0': 0,
                                       'rule': 'square from the top, centred on the face, 570 px per 1254'})
    plm, _ = face_points(av.plain)
    pts = {'landmarks': [[round(x, 3), round(y, 3)] for x, y in plm.tolist()], 'from': 'plain enlargement (stand-in until the master)'}
    jsave(f'{av.face}/master_landmarks.plain.json', pts)
    jsave(f'{av.face}/master_landmarks.json', pts)
    st.item('crop', picture=av.plain, base=t['raw'], side=side, x0=x0)
    st.log(f'head crop: {side} px square at x {x0} from base try {t["try"]}, enlarged to 1024; face points saved')


def free_masks(av, st, opts):
    """Masks for OUR checks only (nothing is ever sent to GPT with a mask). Layla's mouth + eye masks moved onto this face
    (race-transfer-mask.py), the mouth mask grown up to the eye mask (extend-mouth-mask-to-eyes.py), then race-from-chosen-prep.py
    with JAW_SIDE=0 JAW_BELOW=60 (the user's smaller extended jaw) writes the other masks, the run list and _inputs_sheet.png."""
    if not os.path.exists(av.master):
        raise StepError('No master yet: run step 2 first.')
    f, s = av.face, av.slug
    mouth, eyes, before = f'{f}/{s}_mask.png', f'{f}/{s}_mask_eyes.png', f'{f}/{s}_mask.before-extend.png'
    for src, dst, kind in ((f'{ME}/middle-eastern_mask.png', before, 'mouth'), (f'{ME}/middle-eastern_mask_eyes.png', eyes, 'eyes')):
        if not os.path.exists(dst) and not (kind == 'mouth' and os.path.exists(mouth)):
            run_cmd(st, f'move Layla\'s {kind} mask onto this face', [CPY, f'{COMFY}/race-transfer-mask.py', src, f'{ME}/master_landmarks.json',
                                                                       f'{f}/master_landmarks.json', dst, kind], COMFY)
    if not os.path.exists(before):
        shutil.copy(mouth, before)
    run_cmd(st, 'grow the mouth mask up to the eye mask', [CPY, f'{COMFY}/extend-mouth-mask-to-eyes.py', before, eyes, mouth], COMFY)
    if 'eye_side_extra' in opts:   # the page's box: px more on each side of the no-brow and blink eye boxes, kept with the avatar
        av.cfg.setdefault('masks', {})['eye_side_extra'] = int(opts['eye_side_extra'])
        jsave(f'{av.dir}/maker.json', av.cfg)
    eye_x = int((av.cfg.get('masks') or {}).get('eye_side_extra', 0))
    run_cmd(st, f'other masks + run list + inputs sheet (eye boxes {eye_x:+d} px each side)', [CPY, f'{COMFY}/race-from-chosen-prep.py', s], COMFY,
            {'RACE_DIR': f, 'JAW_SIDE': '0', 'JAW_BELOW': '60', 'ME_DIR': ME, 'EYE_SIDE_EXTRA': str(eye_x)})
    painter = write_painter(av)
    st.item('masks', sheet=f'{f}/_inputs_sheet.png', painter=painter, mouth=mouth)
    st.log('masks ready: check the sheet; repaint the mouth mask in the painter if it needs it')


def write_painter(av):
    """ComfyUI/make-mask-editors.py for one avatar: the user's mask painter opening with this master and its mouth mask loaded."""
    import re
    du = lambda p: 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
    html = open(PAINTER).read()
    html = re.sub(r'const ANNA="data:image/png;base64,[A-Za-z0-9+/=]*";', lambda _: f'const ANNA="{du(av.master)}";', html, count=1)
    html = html.replace('value="mediterranean_mask.png"', f'value="{av.slug}_mask.png"')
    html = html.replace('<title>mediterranean master: mask painter</title>', f'<title>{av.cfg.get("label", av.id)}: mouth mask</title>')
    html = html.replace('move it into ~/Desktop/south_asian_face_plates_hpc/', f'then press "Use my painted mask" on the avatar maker page')
    auto = ('<script>(async function(){const M="' + du(f'{av.face}/{av.slug}_mask.png') + '";'
            'const f=await fetch(M).then(r=>r.blob()).then(b=>new File([b],"mask.png",{type:"image/png"}));'
            'const go=()=>{if(!document.getElementById("empty").hidden)return setTimeout(go,150);'
            'const dt=new DataTransfer();dt.items.add(f);const el=document.getElementById("fileMask");'
            'el.files=dt.files;el.dispatchEvent(new Event("change"));};go();})();</script>')
    out = f'{av.face}/mask-editor-{av.slug}.html'
    open(out, 'w').write(html.replace('</body>', auto + '\n</body>'))
    return out


def free_painted_mask(av, st, opts):
    """The newest <slug>_mask*.png in ~/Downloads (saved by the painter after it was made) becomes the mouth mask; masks re-made."""
    painter = f'{av.face}/mask-editor-{av.slug}.html'
    since = os.path.getmtime(painter) if os.path.exists(painter) else 0
    found = sorted((p for p in glob.glob(f'{HOME}/Downloads/{av.slug}_mask*.png') if os.path.getmtime(p) > since), key=os.path.getmtime)
    if not found:
        raise StepError(f'No {av.slug}_mask*.png in Downloads newer than the painter page. Paint, press Download, then try again.')
    p = found[-1]
    stamp = time.strftime('%Y%m%d-%H%M%S')
    shutil.copy(f'{av.face}/{av.slug}_mask.png', f'{av.face}/{av.slug}_mask.before-paint-{stamp}.png')
    m = np.asarray(Image.open(p).convert('L').resize((1024, 1024), Image.NEAREST))
    Image.fromarray(np.where(m > 127, 255, 0).astype(np.uint8)).save(f'{av.face}/{av.slug}_mask.before-extend.png')
    st.log(f'painted mask taken from {p}')
    free_masks(av, st, opts)


def free_addpic(av, st, opts):
    """A base picture made elsewhere (ChatGPT in the browser): copied in and given the same check, added to step 1's tries."""
    src = opts['path']
    if not os.path.exists(src):
        raise StepError(f'no such picture: {src}')
    os.makedirs(f'{av.dir}/base', exist_ok=True)
    out = f'{av.dir}/base/own_{time.strftime("%Y%m%d-%H%M%S")}.png'
    save_png(Image.open(src), out)
    bs = jload(av.state_path('base')) or {'step': 'base', 'run': 0, 'status': 'done', 'items': {}, 'log': [], 'usd': 0.0, 'dry': av.dry}
    it = bs['items'].setdefault('base', {'tries': [], 'kept': None, 'passed': None, 'picked': None, 'input': INPUT[av.gender]})
    n = max([t['try'] for t in it['tries']] or [0]) + 1
    e = {'try': n, 'model': 'own', 'label': f'made elsewhere ({os.path.basename(src)})', 'status': 'checking', 'raw': out, 'source': src, 'usd': 0}
    e.update(check_base(av, INPUT[av.gender], out))
    e['status'] = 'pass' if e['pass'] else 'fail'
    it['tries'].append(e)
    checked = [t for t in it['tries'] if 'score' in t]
    best = min([t for t in checked if t['pass']] or checked, key=lambda t: t['score'])
    it.update(kept=best['try'], passed=bool(best['pass']))
    bs['log'] = bs.get('log', []) + [f'{time.strftime("%H:%M:%S")} added {src} as try {n}: {"PASS" if e["pass"] else "fail"}']
    jsave(av.state_path('base'), bs)
    st.item('addpic', added=out, passed=e['pass'])
    st.log(f'added {os.path.basename(src)} as base try {n}: {"PASS" if e["pass"] else "fail"}')


LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 61, 291, 0, 17, 152]


def lip_crop(img, lm):
    (x0, y0), (x1, y1) = lm[LIPS].min(0), lm[LIPS].max(0)
    side = min(img.size[0], max(x1 - x0, y1 - y0, 1) * 1.42)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bx, by = max(0, min(img.size[0] - side, cx - side / 2)), max(0, min(img.size[1] - side, cy - side / 2))
    return img.crop((round(bx), round(by), round(bx + side), round(by + side))).resize((1024, 1024), Image.LANCZOS)


def free_set(av, st, opts):
    """The plate set the first pack build reads (<face>_gpt_low_set, as race-gpt-set.py + finish-new-avatars.py made it): every
    plate's kept (or picked) pasted try, the head turns, the chosen E and teeth picture (pasted), the master twice and the two
    lip crops; set.json in race-gpt-set.py's layout so the later raw-picture swap (raw_plates_azure.py) finds the tries.
    Also copies the chosen E / SS / teeth into plates/E_regen_azure_2026-10-30 where the 5b-5c chains read them (not for a dry avatar;
    a file already there is never replaced)."""
    ps, ms = jload(av.state_path('plates')), jload(av.state_path('mouth'))
    if not ps or ps['status'] != 'done':
        raise StepError('Step 4 (the 34 face pictures) has not finished.')
    if not ms or ms['status'] != 'done':
        raise StepError('Step 5 (E, SS, teeth) has not finished.')
    S, s = av.set_dir, av.slug
    if os.path.exists(S):
        os.replace(S, f'{S}.before-{time.strftime("%Y%m%d-%H%M%S")}')
    os.makedirs(f'{S}/fits', exist_ok=True)
    chosen = {}
    for k, it in ps['items'].items():
        n = it.get('picked') or it.get('kept') or (1 if it.get('head_turn') else None)
        t = next((t for t in it['tries'] if t['try'] == n), None)
        if not t or not t.get('raw'):
            raise StepError(f'plate {k} has no picture to use')
        if it.get('head_turn'):
            shutil.copy(f'{ps["run_dir"]}/{s}_{k}.png', f'{S}/{s}_{k}.png')
            chosen[k] = {'run': f'run {ps["run"]}', 'folder': ps['run_dir'], 'passed': None, 'note': 'head turn, colour fix only',
                         'colour_gain_rgb': it.get('colour_gain_rgb')}
        else:
            shutil.copy(t['pasted'], f'{S}/{s}_{k}.png')
            chosen[k] = {'run': f'run {ps["run"]}', 'folder': ps['run_dir'], 'try': t['try'], 'passed': bool(t['pass']), 'score': t['score'],
                         'check': {x: t['final'][x] for x in ('inside_skin_de', 'seam_de', 'edge_skin_de', 'edge_detail_ratio', 'outline_moved_px', 'outline_kink_px')},
                         'fails': [x for x in t['final']['fails'] if x != 'outside_colour_de'], 'request_id': t.get('request_id'), 'model': t['model']}
    mouth = {}
    for item in ('E', 'SS', 'SS_wide', 'TEETH'):
        it = ms['items'][item]
        n = it.get('picked') or it.get('kept')
        mouth[item] = next((t for t in it['tries'] if t['try'] == n), None)
        if not mouth[item]:
            raise StepError(f'step 5 has no {item} picture to use')
    shutil.copy(mouth['E']['pasted'], f'{S}/{s}_E.png')
    shutil.copy(mouth['TEETH']['pasted'], f'{S}/{s}_teeth_structure_sil.png')
    for k, item in (('E', 'E'), ('teeth_structure_sil', 'TEETH')):
        t = mouth[item]
        chosen[k] = {'run': f'mouth run {ms["run"]}', 'folder': os.path.dirname(t['raw']), 'raw': t['raw'], 'try': t['try'], 'passed': t.get('pass'),
                     'gap_pct': t.get('gap_pct'), 'model': t['model'], 'note': 'step 5 picture, master pasted back outside the mask'}
    master = Image.open(av.master).convert('RGB')
    for name in ('hd_face_area_neutral', 'face_area_neutral'):
        master.save(f'{S}/{s}_{name}.png')
    lip_crop(master, lm_px(f'{av.face}/master_landmarks.json')).save(f'{S}/{s}_mouth_detail_neutral.png')
    tp = f'{S}/{s}_teeth_structure_sil.png'
    with open(tp, 'rb') as fh:
        r = requests.post(FACE_POINTS, files={'file': fh}, data={'item_id': 'teeth_structure_sil'}, timeout=180).json()
    if r.get('status') != 'ok':
        raise StepError(f'no face points for the teeth picture ({r.get("status")})')
    jsave(f'{S}/fits/teeth_structure_sil.json', r)
    tlm = np.array(r['landmarks'], float)[:, :2] * 1024
    lip_crop(Image.open(tp).convert('RGB').resize((1024, 1024)), tlm).save(f'{S}/{s}_mouth_detail_E.png')
    jsave(f'{S}/set.json', {'runs': {'': f'run {ps["run"]}'}, 'plates': chosen, 'made_by': 'avatar-maker free_set', 'at': now()})
    n = len([f for f in os.listdir(S) if f.startswith(s + '_') and f.endswith('.png')])
    st.item('set', folder=S, plates=n)
    st.log(f'set ready: {n} pictures in {S}')
    copies = [(av.master, f'{EREG}/inputs/{av.id}_input.png'), (mouth['E']['raw'], f'{EREG}/selected/{av.id}_E.png'),
              (mouth['SS_wide']['raw'], f'{EREG}/selected/{av.id}_SS.png'), (mouth['SS']['raw'], f'{EREG}/raw_ss_narrow_v3/{av.id}_SS_try1.png'),
              (mouth['SS_wide']['teeth_input'], f'{EREG}/inputs_teeth/{av.id}_input.png'), (mouth['TEETH']['raw'], f'{EREG}/raw_teeth_open/{av.id}_TEETH_try1.png')]
    for src, dst in copies:
        if av.dry:
            st.log(f'dry avatar: not copied to {dst}')
        elif os.path.exists(dst):
            st.log(f'already there, not replaced: {dst}')
        else:
            shutil.copy(src, dst)
            st.log(f'copied for the later chains: {dst}')
    sheet_rows, row = [], []
    for k in sorted(chosen):
        row.append((f'{S}/{s}_{k}.png', [k, 'PASS' if chosen[k]['passed'] else ('your pick' if k in ('E', 'teeth_structure_sil') else 'not checked') if chosen[k]['passed'] is None else 'FAILED (best kept)'],
                    (20, 130, 40) if chosen[k]['passed'] else (120, 100, 20) if chosen[k]['passed'] is None else (190, 30, 30)))
        if len(row) == 6:
            sheet_rows.append(('', row)); row = []
    if row:
        sheet_rows.append(('', row))
    with st.lock:
        st.d['sheet'] = make_sheet(sheet_rows, f'{S}/_set_sheet.png', 200)


def blue_screen(path):
    r, g, b = Image.open(path).convert('RGB').getpixel((5, 5))
    return b > 80 and b > 2 * r and b > 2 * g


def pack_commands(av, opts):
    """build-new-avatar-packs.py's chain for one avatar, as (label, cmd, cwd, env)."""
    pid, s, g = av.id, av.slug, av.gender
    full_slug = f'{s.replace("-", "_")}_{g}_{pid}'
    B = f'{av.dir}/pack_build'
    cmds = []
    if opts.get('body', 'own') == 'own':
        base = av.chosen('base', 'base')
        keyer = 'key_biref_v4_blue.py' if blue_screen(base['raw']) else 'key_biref_v4.py'
        cmds.append(('cut out the base picture as the body', [CPY, f'{KEYERS}/{keyer}', f'{B}/body_in', f'{B}/body_keyed'], COMFY, {}))
        body = f'{B}/body_keyed/body.png'
    else:
        body = f'{L}/plates/outfits/outfit_plates_female/female_race_plates_v4/{s}/white_t_shirt_and_jeans.png'
    keyer_set = f'{KEYERS}/key_biref_v4_blue.py' if blue_screen(av.master) else f'{KEYERS}/key_biref_v4.py'
    env = {'RACE': s, 'AVATAR_ID': pid, 'SET_DIR': av.set_dir, 'RACE_DIR': av.face, 'FACE_AREA': f'{av.set_dir}/{s}_face_area_neutral.png',
           'MOUTH_INTERIOR': opts.get('mouth_interior', ''), 'BUILD': B, 'GENDER': g, 'BODY': body, 'KEYER': keyer_set}
    cmds += [('cut-out, mouth extras, face points, staging', [CPY, f'{NEWL}/.local-dev/prep_race_pack.py'], f'{NEWL}/.local-dev', env),
             ('labs batch through final_mesh (no generation)',
              f'npm run avatars:generate-batch -- --seeds-dir {NEWL}/source/avatar_seeds_{full_slug} --out-dir {SRC} --labs-url {LABS_GATE} '
              f'--models-url http://127.0.0.1:3011 --slug {full_slug} --through final_mesh --max-in-flight 2', LABS, {}),
             ('labs export', f'./node_modules/.bin/vite-node --config vite.scripts.config.ts scripts/export-pack-dir.ts {SRC}/{pid}', LABS,
              {'FIT_MESH_BASE': LABS_GATE}),
             ('render prep + pack fixes + local cdn build', [f'{L}/face_mesh_work/rebuild_pack.sh', pid], f'{L}/face_mesh_work',
              {'LIFORMA_SKIP_BLINK_NOSE_PIN': '1'})]
    return cmds, body


def free_pack(av, st, opts):
    """Step 4 of the guide (build-new-avatar-packs.py) for this avatar: local, no generation, nothing uploaded. ~3 min."""
    if not os.path.isdir(av.set_dir):
        raise StepError('No plate set yet: press "Make the plate set" first.')
    if not opts.get('mouth_interior') or not os.path.exists(opts['mouth_interior']):
        raise StepError('Choose the picture for the inside of the mouth first.')
    cmds, body = pack_commands(av, opts)
    if av.dry:
        st.log('DRY avatar: the pack build is not run. It would run:')
        for label, cmd, cwd, env in cmds:
            st.log(f'  {label}: (in {cwd}) {" ".join(cmd) if isinstance(cmd, list) else cmd}' + (f'  env {json.dumps(env)}' if env else ''))
        st.item('pack', commands=[c[0] for c in cmds], dry=True)
        return
    if os.path.exists(f'{SRC}/{av.id}'):
        raise StepError(f'{SRC}/{av.id} already exists; move it away to build again (nothing was changed)')
    if not labs_ok():
        raise StepError(f'OLD labs behind the no-generation gate ({LABS_GATE}) does not answer properly. If its labs on :3004 answers 500 '
                        f'(EPERM on its own folder), start a fresh one: cd Liforma/labs.liforma.ai && ./node_modules/.bin/vite dev --port 3104 '
                        f'--strictPort, a gate: PORT=3119 LABS_URL=http://localhost:3104 node NEW/liforma/.local-dev/labs_no_generation_gate.mjs, '
                        f'and start this page with LABS_GATE_URL=http://127.0.0.1:3119')
    if not points_ok(3011):
        raise StepError('The pack build scripts use face points on :3011, and :3011 cannot read a picture (the old process since 28 Sep '
                        'answered "Could not decode image" until 6 Nov). Start a fresh one: cd ~/Desktop/Liforma_LTD/Liforma/liforma/models.liforma.ai && '
                        'MODELS_PORT=3011 ./run   (NEW/liforma\'s ./start models fails: its models server misses app/models/birefnet_matting.py)')
    logf = f'{av.dir}/maker/pack_build.log'
    B = f'{av.dir}/pack_build'
    if opts.get('body', 'own') == 'own':
        os.makedirs(f'{B}/body_in', exist_ok=True)
        Image.open(av.chosen('base', 'base')['raw']).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(f'{B}/body_in/body.png')
    st.item('pack', log=logf, body=body)
    for label, cmd, cwd, env in cmds:
        run_cmd(st, label, cmd, cwd, env, logf)
    st.log(f'pack built: {SRC}/{av.id}. Next: guide section 5 (cut-outs and face dots), one avatar at a time.')


# ---------------------------------------------------------------------------------------------------------------- plan (sends nothing)
def plan(av, opts):
    step = opts['step']
    warn, inputs, prompts, lines = [], [], [], []
    usd_max = usd_min = 0.0
    sec = 0

    def add(item, n_pics_max, n_pics_min, model, fb, n_items=1, fb_pics=TRIES):
        nonlocal usd_max, usd_min, sec
        m = MODELS[model]
        usd_max += n_items * n_pics_max * m['usd'] + (n_items * fb_pics * MODELS[fb]['usd'] if fb else 0)
        usd_min += n_items * n_pics_min * m['usd']
        sec += n_items * n_pics_min * m['sec']
        lines.append(f"{item}: {n_items} x up to {n_pics_max} tries on {m['group']} {m['label']} (${m['usd']}: {m['price']})"
                     + (f"; if none passes, up to {fb_pics} more on {MODELS[fb]['group']} {MODELS[fb]['label']} (${MODELS[fb]['usd']})" if fb else ''))

    models, fbs = opts['models'], opts.get('fallbacks') or {}
    if step == 'base':
        inputs.append({'label': 'Anna' if av.gender == 'female' else 'Caleb', 'path': INPUT[av.gender]})
        p = (av.cfg.get('prompts') or {}).get('base', '').strip()
        prompts.append({'label': 'base body prompt', 'text': p})
        if not p:
            warn.append('The prompt box is empty.')
        add('base body', tries_of(opts), 1, models['base'], fbs.get('base'), fb_pics=tries_of(opts))
    elif step == 'master':
        inputs.append({'label': 'head crop, enlarged', 'path': av.plain})
        if not os.path.exists(av.plain):
            warn.append('Make the head crop first.')
        prompts.append({'label': 'master', 'text': MASTER_PROMPT})
        add('master', tries_of(opts), 1, models['master'], fbs.get('master'), fb_pics=tries_of(opts))
    elif step == 'plates':
        spec = jload(f'{av.face}/CHOSEN_run_spec.json') or {}
        if not spec:
            warn.append('Make the masks first (step 3).')
        inputs.append({'label': 'master', 'path': av.master})
        if os.path.exists(f'{av.face}/_inputs_sheet.png'):
            inputs.append({'label': 'masks (only for our checks; nothing is sent with a mask)', 'path': f'{av.face}/_inputs_sheet.png'})
        pr = jload(PLATE_PROMPTS[av.gender])['prompts']
        plates = [k for k in spec if k not in ('E', 'teeth_structure_sil')]
        checked = [k for k in plates if spec[k]['mask']]
        turns = [k for k in plates if not spec[k]['mask']]
        prompts += [{'label': k, 'text': pr.get(k, '(missing)')} for k in plates]
        add(f'{len(checked)} checked plates', tries_of(opts), 1, models['plates'], fbs.get('plates'), len(checked), fb_pics=tries_of(opts))
        add(f'{len(turns)} head turns (made once, not checked)', 1, 1, models['plates'], None, len(turns))
    elif step == 'mouth':
        inputs.append({'label': 'master (input of E, SS and the wide SS)', 'path': av.master})
        if not jload(f'{av.face}/CHOSEN_run_spec.json'):
            warn.append('Make the masks first (step 3).')
        for name in ('E', 'E_v1', 'SS', 'SS_wide', 'TEETH'):
            prompts.append({'label': f'{name} ({os.path.relpath(MOUTH_PROMPTS[name][0], L)})', 'text': mouth_prompt(name)})
        add('E (both wordings, one picture each; you judge)', 2, 2, models['E'], None)
        add('narrow SS (you judge)', 1, 1, models['SS'], None)
        add('wide SS (input of the teeth picture)', 1, 1, models['TEETH'], None)
        add('teeth picture, slightly open (you judge)', 1, 1, models['TEETH'], None)
    else:
        raise StepError(f'unknown step {step}')
    if av.dry:
        warn.insert(0, 'DRY avatar: nothing is sent and nothing is paid; old bald Anna pictures stand in for the answers.')
    kinds = {MODELS[m]['kind'] for m in list(models.values()) + [f for f in fbs.values() if f]}
    for kind, path, name in (('fal', FAL_ENV, 'FAL_KEY'), ('azure', AZURE_ENV, 'AZURE_MODELS_API_KEY'), ('gemini', FAL_ENV, 'GEMINI_API_KEY')):
        if kind in kinds and not av.dry:
            try:
                env_value(path, name)
            except (StepError, FileNotFoundError) as e:
                warn.append(f'{name}: {e}')
    needs_points = step in ('master', 'mouth')  # :4011
    return {'step': step, 'inputs': inputs, 'prompts': prompts, 'lines': lines, 'usd_max': round(usd_max, 3), 'usd_min': round(usd_min, 3),
            'minutes_min': round(sec / 60 / (4 if step == 'plates' else 1), 1), 'warnings': warn,
            'needs': [4011] if needs_points else [], 'dry': av.dry}


# ---------------------------------------------------------------------------------------------------------------- main
RUNS = {'base': run_base, 'master': run_master, 'plates': run_plates, 'mouth': run_mouth}
FREE = {'crop': free_crop, 'masks': free_masks, 'painted_mask': free_painted_mask, 'addpic': free_addpic, 'set': free_set, 'pack': free_pack}


def main():
    action = sys.argv[1]
    if action == 'config':
        print(json.dumps({'models': MODELS, 'steps': STEPS, 'tries': TRIES, 'limits': LIM, 'plate_limits': LIMITS, 'detail_min': DETAIL_MIN}))
        return
    av = Avatar(sys.argv[2])
    opts = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    if action == 'plan':
        print(json.dumps(plan(av, opts)))
        return
    if action == 'pick':
        sd = jload(av.state_path(opts['step']))
        it = sd['items'][opts['item']]
        t = next(t for t in it['tries'] if t['try'] == int(opts['try']))
        if not t.get('raw') or 'score' not in t:
            raise StepError('that try has no checked picture')
        it['picked'] = t['try']
        jsave(av.state_path(opts['step']), sd)
        if opts['step'] == 'master':
            install_master(av, t)
        print(json.dumps({'ok': True}))
        return
    step = opts['step']
    more = action == 'run' and step in ('mouth', 'plates') and opts.get('more')
    fn = (run_mouth_more if step == 'mouth' else run_plates_more) if more else RUNS.get(step) if action == 'run' else FREE.get(step)
    if not fn:
        raise StepError(f'unknown {action} step {step}')
    st = State(av, step, opts, resume=bool(opts.get('resume')), append=bool(more))
    try:
        if action == 'run' and av.dry:
            st.log('DRY RUN: nothing is sent; old bald Anna pictures stand in for the answers')
        fn(av, st, opts)
        st.finish('done')
        st.log(f'{step}: done' + (f' (about ${st.d["usd"]:.3f})' if action == 'run' and not av.dry else ''))
    except StepError as e:
        st.log(f'STOPPED: {e}')
        st.finish('failed', str(e))
        sys.exit(2)
    except Exception as e:  # noqa: BLE001 - show the real error on the page, then fail loudly
        import traceback
        st.log('ERROR: ' + traceback.format_exc()[-1500:])
        st.finish('failed', f'{type(e).__name__}: {e}')
        sys.exit(3)


if __name__ == '__main__':
    try:
        main()
    except StepError as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(2)
