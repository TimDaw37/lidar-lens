# Shape heuristics — lessons from a training round against recorded features

These general lessons come from testing the LiDAR Lens "What is it?" best guess (since replaced in the public build by *Shape & records*, which shows measurements and records only) against about 1,700 recorded monuments across one English county (Wiltshire). The records used were the Wiltshire and Swindon Historic Environment Record and Historic England's open data (scheduled monuments and Aerial Investigation & Mapping). No HER records, IDs or locations are published here; ask your own HER for access to its data. Credit: contains information from the Wiltshire and Swindon Historic Environment Record, © Wiltshire Council.

## How it was tested
- Each recorded feature became one test "click" at its recorded point, or at its centroid if it was mapped as a shape. Linear features like lynchets were clicked on the line, and enclosures and hillforts on their boundary. We also added random "nothing recorded" points.
- The best guess was run on the 1 m Environment Agency DTM exactly as the website runs it. 30% of the points were held back for testing and never used for tuning.

## What we learnt
1. **Record points are noisy as LiDAR labels.** Many recorded barrows, pits and enclosures leave no surface trace (ploughed out, infilled, or known only from cropmarks or excavation). Points are often 10–30 m off the earthwork. Even a fitted statistical model scored only about 35% on held-out clicks. Expect modest scores, and don't over-tune to records.
2. **Check whether the click is in a depression before anything else.** Large flat-floored pits (marl, clay and chalk pits, quarries) have a raised rim or spoil heap, and the old seed step would latch onto the rim and report a "mound". We now test whether the centre sits below a plane fitted to rings 8–55 m out, with higher ground in most directions, or whether it is negative in the 12 m and 24 m relief models. If so, we treat the spot as a hollow. On clicks inside measurable depressions, mound misreads fell from about 12% to 0%.
3. **Dew ponds and extraction pits are separable, roughly.** Dew ponds tend to be round (length/width under 1.6), 8–45 m across, deep for their size, often rimmed, and on high chalk (in Wiltshire, mostly above about 120 m OD). Marl and clay pits are on lower ground. Quarries and chalk pits are larger (over 45 m), irregular, or cut into a slope with one open side. With these splits, correct dew pond calls on clicks inside depressions roughly doubled (25% to 47%).
4. **Round barrows that survive are low and broad.** The middle half were about 0.4–1.6 m high and 17–37 m across, with gentle-to-moderate edges. Many are slightly oval (length/width up to about 1.75), so a strict "round" cut-off misses them.
5. **Slope matters.** Mounds on slopes over about 6° are more often lynchet ends, quarry spoil or natural knolls than barrows. We still offer "barrow", but at low confidence with a warning.
6. **Lynchets** are long features (over 30 m) on slopes over about 5°, lying along the contour or with a clear step across them. Many are wider than a "linear" shape test expects.
7. **Pillow mounds** are small (10–45 m long), elongated (length/width about 1.8–4.5), low (0.2–1.3 m), usually on slopes over about 3°. They are easily confused with small long mounds and lynchet fragments, and remain hard.
8. **Enclosures and hillforts can't be identified from a single click.** One click sees only part of a bank or ditch. They need a whole-outline analysis, which this tool doesn't attempt, so it says "linear bank/ditch" instead.
9. **Long barrows** overlap with modern mounds and spoil banks. Crisp, steep sides are a sign that a mound is modern or very well preserved. Always check the records.

## Overall
On held-out test clicks with LiDAR coverage, the share of best guesses matching the recorded class went from 27% to 29%. Round barrows went from 38% to 41% and dew ponds from 20% to 37%. Hollows are no longer misread as mounds. The guess is still an aid to looking, not an identification.


## Outcome

At ~29% agreement with recorded classes, an automatic guess is not reliable enough to show the public. The public build therefore shows only what the DTM measures, a neutral description of it, and nearby records. The heuristic survives only as an optional, collapsed "pointer" (`showGuess:true`) for private use.
