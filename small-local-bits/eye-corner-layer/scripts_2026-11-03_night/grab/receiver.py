# Local drop box for player frame grabs (port 3062): POST /<path> saves the body under ./frames/<path>;
# POST /switch/<avatarId> points the local test experience (exp_9bo7234l) at that avatar through the local API
# (plates/pack_builds/indigenous_pack_build/edge_check_set_avatar.py) and returns its output. Loopback only.
import os, re, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frames')
SWITCH_DIR = os.path.expanduser('~/Desktop/Liforma_LTD/plates/pack_builds/indigenous_pack_build')


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def _reply(self, code, text):
        body = text.encode()
        self.send_response(code); self._cors(); self.send_header('Content-Type', 'text/plain'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n) if n else b''
        m = re.match(r'^/switch/([0-9a-f]{8})$', self.path)
        if m:
            r = subprocess.run(['/usr/bin/python3', '-I', 'edge_check_set_avatar.py', m.group(1)], cwd=SWITCH_DIR,
                               capture_output=True, text=True, timeout=120)
            return self._reply(200 if r.returncode == 0 else 500, (r.stdout + r.stderr).strip())
        rel = os.path.normpath(self.path.lstrip('/')).replace('..', '')
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f: f.write(data)
        self._reply(200, 'ok')

    def log_message(self, *a): pass


ThreadingHTTPServer(('127.0.0.1', 3062), H).serve_forever()
