"""Merge seabed/index.json files (16 Nov 2026, Ireland tidy): the main 11W-9E build plus the strip west of 11.25W built on its own
(gb/make_seabed.py with SEABED_WSEN=-16.0,49.0,-11.26,61.5). Zoom lists and open10 are unioned; the two builds share no tile.
usage: python3 gb/ireland/merge_seabed_index.py OUT.json IN1.json IN2.json ..."""
import sys, json
out, ins = sys.argv[1], sys.argv[2:]; m = {}
for p in ins:
    for k, v in json.load(open(p)).items():
        if isinstance(v, list): m.setdefault(k, set()).update(v)
        else: m.setdefault(k, v)
r = {k: (sorted(v) if isinstance(v, set) else v) for k, v in sorted(m.items(), key=lambda kv: (not kv[0].isdigit(), int(kv[0]) if kv[0].isdigit() else 0, kv[0]))}
json.dump(r, open(out, 'w'), separators=(',', ':')); print({k: len(v) for k, v in r.items() if isinstance(v, list)})
