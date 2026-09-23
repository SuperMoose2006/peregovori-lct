#!/usr/bin/env bash
# Run on the VM as root after unpacking the release and installing its venv.
set -euo pipefail
RELEASE="$(realpath "${1:?usage: activate-release.sh /opt/dialog/releases/ID}")"
case "$RELEASE" in /opt/dialog/releases/*) ;; *) echo 'Unexpected release path' >&2; exit 2;; esac
test -f "$RELEASE/frontend/dist/index.html"
test -x "$RELEASE/services/gateway/.venv/bin/uvicorn"
test -r /etc/dialog.env
PREVIOUS=""
if [ -L /opt/dialog/current ] && [ -d /opt/dialog/current ]; then
    PREVIOUS="$(readlink -f /opt/dialog/current)"
fi

rollback() {
    trap - ERR
    if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ]; then
        ln -sfn "$PREVIOUS" /opt/dialog/current.next
        mv -Tf /opt/dialog/current.next /opt/dialog/current
        install -m 644 "$PREVIOUS/deploy/dialog.service" /etc/systemd/system/dialog.service
        systemctl daemon-reload
        systemctl restart dialog
        echo "Rolled back to $PREVIOUS" >&2
    fi
    exit 1
}
trap rollback ERR

# The service's EnvironmentFile is read by systemd, never by the browser.
install -m 644 "$RELEASE/deploy/dialog.service" /etc/systemd/system/dialog.service
ln -sfn "$RELEASE" /opt/dialog/current.next
mv -Tf /opt/dialog/current.next /opt/dialog/current
systemd-analyze verify /etc/systemd/system/dialog.service
systemctl daemon-reload
systemctl enable dialog >/dev/null
systemctl restart dialog

for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:8010/api/health >/dev/null; then
        printf 'Healthy release: %s\nPrevious release: %s\n' "$RELEASE" "$PREVIOUS"
        exit 0
    fi
    sleep 1
done
echo 'Release failed its health check' >&2
rollback
