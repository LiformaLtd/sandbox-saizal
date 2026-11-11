"""run.py - the 7 Japanese/Chinese styles (../prompts_asian.json) on Liforma's GPU orchestrator (i2i = Krea 2 identity edit), with the
15 Oct settings (../../../../../orch_remaining_2026-10-15/run_orch.py): one picture (no reference), ref_boost 4, ref_boost_a 1, grounding 768,
10 steps, cfg 1, LoRA 1.0, 1024x1024, no background removal. User 2026-10-23: "use gpu orchestrator" (instead of fal GPT low).
Women (gpt_ASIA_W*) on Anna's bald picture, men (gpt_ASIA_M*) on Caleb's (m-e05b0001). Seeds 303 and 202. ~$0.004 a picture.
Submitted one after another, polled together; job ids in jobs.json; a picture already saved is never sent again. Each saved picture gets
the face check (clear blue inside the face mask, eyebrows not counted)."""
import json, os, sys, time, uuid, urllib.request, urllib.error
import numpy as np
from PIL import Image
BASE = "https://liforma-gpu-orchestrator.fly.dev"; HW = "/Users/saizalpreetkaur./Desktop/Liforma_LTD/hair_work"; HERE = os.path.dirname(os.path.abspath(__file__))
KEY = [l.split("=", 1)[1].strip().strip('"').split(",")[0] for l in open("/Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma/.env") if l.startswith("ORCH_DEVELOPER_KEYS=")][0]
def call(method, path, body=None, ctype="application/json", retries=4):
	data = body if isinstance(body, (bytes, bytearray)) else (json.dumps(body).encode() if body is not None else None)
	for i in range(retries):
		try:
			r = urllib.request.Request(BASE + path, data=data, method=method, headers={"Authorization": f"Bearer {KEY}", "Content-Type": ctype, "Idempotency-Key": str(uuid.uuid4())})
			with urllib.request.urlopen(r, timeout=60) as x: return json.loads(x.read())
		except urllib.error.HTTPError as e: raise SystemExit(f"{path} {e.code}: {e.read()[:400]}")
		except Exception:
			if i == retries - 1: raise
			time.sleep(3 * (i + 1))
P = json.load(open(f"{HERE}/../prompts_asian.json"))
JOBS = [("women" if "_W" in k else "men", k, v) for k, v in P.items() if not k.startswith("_")]
PIC = {"men": f"{HW}/races/m-e05b0001/base_1024.png", "women": f"{HW}/races/anna/base_1024.png"}
PINK = {"women": f"{HW}/new_styles/blue_test/masked_pink", "men": f"{HW}/male_hair"}
PINK = {g: np.load(f"{d}/pink.npy") & ~np.load(f"{d}/brows.npy") for g, d in PINK.items()}
def face_px(g, path):
	R = np.asarray(Image.open(path).convert("RGB").resize((1024, 1024))).astype(int)
	return int((((R[..., 2] > R[..., 0] + 40) & (R[..., 2] > 90)) & PINK[g]).sum())
SEEDS = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else "303,202").split(",")]
for g in PIC: os.makedirs(f"{HERE}/{g}", exist_ok=True)
JF = f"{HERE}/jobs.json"; jobs = json.load(open(JF)) if os.path.exists(JF) else {}
dig = {g: call("POST", "/v1/source-images", open(p, "rb").read(), "image/png")["digest"] for g, p in PIC.items()}; print("digests", {g: d[:12] for g, d in dig.items()}, flush=True)
for seed in SEEDS:
	for g, name, prompt in JOBS:
		key = f"{g}/{name}_s{seed}"
		if key in jobs or os.path.exists(f"{HERE}/{key}.png"): continue
		payload = dict(prompt=prompt, source_image_digest=dig[g], width=1024, height=1024, cfg=1, num_inference_steps=10, ref_boost=4.0, ref_boost_a=1.0,
			grounding_px=768, lora_scale=1, output_format="png", seed=seed, remove_background=False)
		j = call("POST", "/v1/jobs", dict(modality="i2i", payload=payload)); jobs[key] = j["job_id"]; json.dump(jobs, open(JF, "w"), indent=1)
		print("sent", key, j["job_id"], j.get("status"), flush=True)
done, cost, t0 = {}, 0.0, time.time()
while len(done) < len(jobs):
	time.sleep(8)
	for key, jid in jobs.items():
		if key in done or os.path.exists(f"{HERE}/{key}.png"): done.setdefault(key, "saved"); continue
		j = call("GET", f"/v1/jobs/{jid}")
		if j["status"] == "succeeded":
			urllib.request.urlretrieve(j["result"]["url"], f"{HERE}/{key}.png"); c = (j.get("cost") or {}).get("cost_usd", 0) or 0; cost += c
			done[key] = "saved"; print(f"{key}: saved ({c:.4f} USD) after {round(time.time() - t0)} s, {face_px(key.split('/')[0], f'{HERE}/{key}.png')} px on the face", flush=True)
		elif j["status"] in ("failed", "cancelled"):
			done[key] = j["status"]; print(f"{key}: {j['status']} {json.dumps(j.get('error') or j.get('message'))[:300]}", flush=True)
	if time.time() - t0 > 3600: print("still waiting after an hour - stopping the poll (jobs keep running; re-run to collect)", flush=True); break
print(f"ORCH_DONE saved {sum(1 for v in done.values() if v == 'saved')}/{len(jobs)}, cost {cost:.3f} USD", flush=True)
