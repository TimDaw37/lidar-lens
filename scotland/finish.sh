#!/bin/bash
# waits for run_loop.sh, then overviews + outline, viewer upload (index.html last), then removes the temporary upload route + secret
cd /workspace/lidar-scotland; exec >> finish.log 2>&1
echo "start $(date)"
while pgrep -f run_loop.sh >/dev/null; do sleep 30; done
grep -q LOOP_END build.log || { echo "build loop missing LOOP_END"; exit 1; }
export UPLOAD_URL=https://lidar-lens-scotland.tim-daw.workers.dev/__bulk_upload UPLOAD_SECRET_FILE=deploy/.upload_secret
[ -f .ov_done ] || { python3 scripts/overview_scot.py && touch .ov_done; } || exit 1
(cd /workspace/lidar-orkney/viewer && node scripts/build_site.mjs configs/scotland.js) || exit 1
[ -f .site_done ] || { python3 scripts/upload_site.py && touch .site_done; } || exit 1
cd deploy && export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN"
sed -i 's#"main": "src/index.upload.js"#"main": "src/index.js"#' wrangler.jsonc && npx wrangler deploy && echo y | npx wrangler secret delete UPLOAD_SECRET
echo "FINISHED $(date)"
