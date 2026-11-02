#!/usr/bin/env bash
# 用真实 profile 启动 Zen，并自动把 MARGIN 扩展临时装进去。
# 用法：先彻底关闭 Zen，再执行 ~/DSH/youtube-margin/zen-load.sh
set -u
PROFILE="/home/Hbuli/.config/zen/kq2vj39y.Default (release)"
DIST="/home/Hbuli/DSH/youtube-margin/dist/firefox"
XPI="/tmp/margin-ff.xpi"

if pgrep -x zen-browser >/dev/null || pgrep -f '/zen/zen' >/dev/null; then
  echo "Zen 还在运行，请先完全退出（包括后台进程）。"; exit 1
fi

rm -f "$XPI"
python3 - "$DIST" "$XPI" <<'PY'
import sys, os, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src))
PY

WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}" XDG_RUNTIME_DIR="/run/user/1001" \
  nohup zen-browser --profile "$PROFILE" --remote-debugging-port 9223 > /tmp/zen.log 2>&1 &

for i in $(seq 1 20); do
  sleep 1
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:9223/)" = "200" ] && break
done

node "/home/Hbuli/DSH/youtube-margin/zen-install.mjs"
