# Brief: presets, an opposite-light check, and idle prefetch

Tim Daw, 4 November 2026. For whoever builds it (Grok or Claude).

Four changes were drawn from a review of NTRIGUE Terrain Lab (https://ntrigue-terrain-lab.vercel.app/). Item 3 was dropped by Tim on 4 Nov 2026 (see *Not doing*). The rule for the rest: **nothing new on screen unless something old goes**. The Lens is already busy; these should leave it simpler than they found it.

Order of work: 1 and 2 together (about a day), then 4 separately. Build and check on the test Lens (https://lidar-lens-test.tim-daw.workers.dev/) before any public Lens.

---

## 1. Presets: four named looks that replace most of the controls

**What.** Four buttons at the top of *Visualisation*. One tap sets the mode, sun, exaggeration, radius, contrast and colour ramp together. Everything else in Visualisation and Lens & appearance (the mode list, ramps, gamma, contrast, radius, opacity) moves into a collapsed *Advanced* section. The sun dial and sun elevation stay visible, because turning the sun is the point of the hillshade looks.

**Settings.** Checked on 4 Nov 2026 at Great Ridge Wood (51.130, -2.095) and Stonehenge (51.179, -1.826), zoom 16, with auto contrast on. Mode numbers are those in `site/index.html` and `MODE_RAMP` in `site/lens.js`.

| Button | Shows best | mode | az | el | ve | rad (m) | ct | ramp |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Overview** (default) | the general lie of the land | 1 multi-direction hillshade | 315 | 35 | 2 | 10 | 1.0 | grey |
| **Earthworks** | banks, ditches, barrows, enclosures | 6 red relief | 315 | 35 | 2 | 10 | 1.2 | rdbu |
| **Low sun** | faint banks and lynchets | 0 hillshade | 315 | 20 | 3 | 10 | 1.0 | grey |
| **Banks and hollows** | what is raised (red) and what is sunk (blue) | 3 local relief | 315 | 35 | 2 | 20 | 1.2 | rdbu |

Sky-view (mode 4) was tried for hollows and dropped: at radius 15 m it is speckled under trees.

**Behaviour.**
- The active preset is highlighted. Changing anything by hand clears the highlight; the settings stay.
- *Reset to defaults* returns to Overview.
- Share links keep working as now (the hash still carries the individual values). Optionally add `p=earthworks` so a shared link highlights the preset.
- Phones: the 1–8 number strip becomes the four preset buttons, labelled. This also fixes the numbers-only strip, whose names phones never show. The full mode list stays under Advanced.

**Code.** `DEF`, `MODE_RAMP`, `syncUI`, `resetDefaults` and the `ctl` listeners in `site/lens.js`; panel markup in `site/index.html`; the phone strip where it is built. Keep presets in one table (`PRESETS = {overview: {...}, ...}`) so a county config can override it with an optional `presets` key.

**Done when.** A first-time visitor can get all four looks without opening Advanced. Visualisation, with Advanced closed, is shorter than it is now. Each preset matches the table at the two check sites above.

---

## 2. *What's here?*: an opposite-light button and three questions

**What.** In the *What's here?* card, under the measurements:

1. A button, **Light from the other side**, that turns the sun 180° (az ± 180) and back on a second tap. If the current mode does not use the sun (red relief, local relief, slope, sky-view), it switches to hillshade first and says so in the button's tooltip.
2. Three short questions, as plain text:
   - Does it still show with the light from the other side?
   - Does an old map show a boundary, track or pit here?
   - Does it follow the slope or the geology?

**Make room for it.** Replace the current footer sentence (`'Measurements from the … at the spot you clicked; … not a field identification. Records: …'` in `wiRender`, `site/tools.js`) with one short line: *"Measurements, not an identification. Sources: About / data."* The full records note moves to About / data, where it is already partly repeated. The card must end up no longer than it is now.

**Done when.** The button turns the lens sun and the dial with it, both ways. The card height on the Stonehenge disc barrow (SU 12003 41997) is no greater than before.

---

## 3. *Report to the HER* link: DROPPED

Dropped by Tim on 4 Nov 2026. See *Not doing*.

---

## 4. Idle prefetch for the live England & Wales Lens (no visible change)

**What.** When the lens has been still for about 750 ms, `site/live-sw.js` fetches the LiDAR blocks in a ring round the lens (half a lens-width beyond it), nearest first, at low priority. Dragging into new ground is then instant.

**Budgets** (one constants block at the top of `live-sw.js`):
- prefetch at most 8 blocks a minute and 24 MB a session;
- never more than one prefetch download at a time, and it yields at once to a real request;
- stop entirely when the page reports `navigator.connection.saveData` or `effectiveType` of `2g`/`slow-2g`. The page sends these to the worker with the existing `focus` message.

**Fit with what is there.** The nearest-first queue and `dropFar()` (commit 7045982) already do most of this. Prefetch jobs go in the same queue with a distance penalty, so a real request always runs first. Blocks fetched through the relay also warm the relay's cache for the next visitor, which helps the Environment Agency too.

**Done when.** After 2 s still at a place nobody has visited, dragging the lens one width in any direction shows LiDAR in under 1 s. With Save-data on, no prefetch requests are made. The relay sees no more than 8 prefetch blocks a minute from one visitor.

---

## Not doing (and why)

- **Swipe mode** (a divider instead of a lens): possibly later. It would replace the *LiDAR full screen* checkbox with a Lens / Swipe / Full switch.
- **Survey-year picker / provenance panel:** the England Lens uses the single EA composite; year-by-year surveys are different sources. Belongs in the separate barrow-height work, not the Lens.
- **Saved discoveries:** conflicts with not publishing lists of possible sites.
- **Report to the HER link** (was item 3): DROPPED by Tim on 4 Nov 2026. We don't want to have to find each county HER's email address. The *Report a fault* link stays as it is.
