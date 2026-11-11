"""LOCAL DEV ONLY (2026-10-02): image steps for the Studio's two-step new-outfit flow
(app.liforma.ai src/lib/server/raceOutfitGeneration.ts). No network, no model calls except the BiRefNet keyer.

  source <light white-tee plate> <out.png>   the bald base the European plate is drawn from: the pair's light endpoint
                                              in its white tee and jeans, in the 1024 frame (the maker's load_rgba), on
                                              the live working plate's green (0,180,0)
  key <in rgb.png> <out rgba.png>             BiRefNet "v4" (key_biref_v4.py, the user's chosen keyer)
  on-green <in rgba> <out.png>                a keyed plate or a cut-out reference on flat (0,255,0), the backdrop the
                                              Precious/Malik identity edits were sent on

Run with the ComfyUI venv (numpy, scipy, pillow, torch, safetensors)."""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.abspath(os.path.join(HERE, '..', '..'))  # NEW/liforma
MAKER = os.environ.get('RACE_MAKER_DIR', os.path.join(WS, 'sandbox', 'race-plates', 'maker'))
KEYER = os.environ.get(
    'KEYER_SCRIPTS_DIR',
    '/Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma/liforma/tools/image-to-image/scripts')
SIZE = 1024
SOURCE_GREEN = (0, 180, 0)
REF_GREEN = (0, 255, 0)


def on_flat(rgba, colour):
    a = rgba[..., 3:4].astype(np.float64) / 255.
    out = rgba[..., :3].astype(np.float64) * a + np.array(colour, np.float64) * (1 - a)
    return np.round(out).astype(np.uint8)


def frame(path):
    sys.path.insert(0, MAKER)
    from make_race_plates import load_rgba  # the maker's own reader, so the source sits in the maker's frame
    return load_rgba(path)


def main():
    cmd, src, dst = sys.argv[1:4]
    if cmd == 'source':
        Image.fromarray(on_flat(frame(src), SOURCE_GREEN), 'RGB').save(dst)
    elif cmd == 'on-green':
        im = Image.open(src).convert('RGBA')
        if im.size != (SIZE, SIZE):
            im = Image.fromarray(frame(src), 'RGBA')
        Image.fromarray(on_flat(np.asarray(im), REF_GREEN), 'RGB').save(dst)
    elif cmd == 'key':
        sys.path.insert(0, KEYER)
        import key_biref_v4 as K
        m, dev = K.model()
        im = Image.open(src).convert('RGB')
        Image.fromarray(K.v4(np.asarray(im), K.alpha(m, dev, im)), 'RGBA').save(dst)
    else:
        raise SystemExit(f'unknown command {cmd}')
    print('ok', cmd, dst)


if __name__ == '__main__':
    main()
