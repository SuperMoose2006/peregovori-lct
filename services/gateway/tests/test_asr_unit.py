"""Проверяем readiness-команду юнита настоящими HTTP-ответами, без модели."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shlex
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[3]
UNIT = ROOT / 'deploy/dialog-asr.service'


def test_model_has_writable_cache_without_relaxing_service_isolation():
    text = UNIT.read_text()
    assert 'ProtectSystem=strict' in text
    assert 'User=dialog' in text
    assert 'MemoryMax=10G' in text
    assert 'CacheDirectory=dialog-asr' in text
    assert 'Environment=NUMBA_CACHE_DIR=/var/cache/dialog-asr/numba' in text


def test_gateway_start_order_waits_for_real_readiness():
    text = UNIT.read_text()
    assert 'Before=dialog.service' in text
    assert 'WantedBy=multi-user.target' in text
    command = next(line.split('=', 1)[1] for line in text.splitlines()
                   if line.startswith('ExecStartPost='))
    requested, ready = threading.Event(), threading.Event()

    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            requested.set()
            self.send_response(200 if ready.is_set() else 503)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Health)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    command = command.replace('127.0.0.1:8020', f'127.0.0.1:{server.server_port}')
    process = subprocess.Popen(shlex.split(command), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert requested.wait(5), 'readiness must query the sidecar'
        assert process.poll() is None, '503 must not release gateway startup'
        ready.set()
        assert process.wait(timeout=5) == 0
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
