"""Loopback-only rehearsal using the stand's configuration and local ASR.

Read-only SSH; credentials remain in child-process memory. No deployment,
registry, service restart, or changes to /etc. Stop with Ctrl-C.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time

SSH = ["ssh", "-i", str(Path.home() / ".ssh/jarvis_vm_ed25519"),
       "-o", "IdentityAgent=none", "-o", "IdentitiesOnly=yes",
       "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]
HOST = "root@2.26.49.28"
REMOTE = '''import json, pathlib, shlex
d = {}
for line in pathlib.Path('/etc/dialog.env').read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'): continue
    k, v = line.split('=', 1)
    k = k.strip()
    if k in ('OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'OPENAI_REALTIME_KEY',
             'NEGO_AI', 'NEGO_JUDGE', 'NEGO_VOICE', 'NEGO_ASR', 'NEGO_TURN_DETECT') or k.startswith('NEGO_MODEL_'):
        parts = shlex.split(v)
        d[k] = parts[0] if parts else ''
print(json.dumps(d))
'''

if __name__ == "__main__":
    values = json.loads(subprocess.check_output(
        SSH + [HOST, "python3 -c " + shlex.quote(REMOTE)], text=True, timeout=20))
    if values.get("NEGO_VOICE") != "classic" or values.get("NEGO_ASR") != "parakeet":
        raise SystemExit("Stand configuration changed; inspect before rehearsal")
    for key in list(os.environ):
        if key.startswith("NEGO_") or key in {"OPENROUTER_API_KEY", "OPENAI_API_KEY", "OPENAI_REALTIME_KEY"}:
            os.environ.pop(key)
    os.environ.update(values)
    os.environ.update(NEGO_ASR_URL="http://127.0.0.1:18220", NEGO_HTTP_PASSWORD="",
                      NEGO_ATTESTATION_KEY="", NEGO_ATTESTATION_DB="")
    tunnel = subprocess.Popen(SSH + ["-o", "ExitOnForwardFailure=yes", "-N",
        "-L", "127.0.0.1:18220:127.0.0.1:8020", HOST])
    try:
        time.sleep(1)
        if tunnel.poll() is not None:
            raise SystemExit("ASR tunnel did not start")
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import uvicorn
        uvicorn.run("app.main:app", host="127.0.0.1", port=18208,
                    access_log=False, log_level="error")
    finally:
        tunnel.terminate()
        tunnel.wait(timeout=10)
