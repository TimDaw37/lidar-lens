#!/bin/bash
cd /workspace/lidar-scotland
while pgrep -f "scripts/build_scot.py" >/dev/null; do sleep 20; done
export UPLOAD_URL=https://lidar-lens-scotland.tim-daw.workers.dev/__bulk_upload UPLOAD_SECRET_FILE=deploy/.upload_secret WORKERS=5
for i in 1 2 3 4 5; do
  python3 scripts/build_scot.py >> build.log 2>&1
  python3 -c "import json;m=json.load(open('manifest.json'));import sys;sys.exit(0 if len(m['batches'])>=18 and all(b['status']=='done' for b in m['batches'].values()) else 1)" && break
done
echo LOOP_END >> build.log
