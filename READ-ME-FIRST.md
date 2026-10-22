# Read me first: make a LiDAR Lens for your own area

**You do not need to be a programmer.** An AI helper does the technical work. You make a few choices and open one free account.

## What you get

A free map in your web browser that takes away the trees and crops, so the shape of the ground shows: old banks, barrows, field systems, hollow ways. You drag a round "lens" over an old Ordnance Survey map and the bare ground appears inside it. It works on a phone.

Two examples:
- **Wiltshire:** https://lidar-lens-public.tim-daw.workers.dev/
- **The Ure and Swale henges, North Yorkshire** (Thornborough to the Devil's Arrows, 700 km²): https://lidar-lens-ure.tim-daw.workers.dev/ An AI helper (Grok) built this one in about an hour, from the idea alone, without asking a single technical question.

## Four steps

**1. Get an AI helper that can do work on a computer for you,** not just chat. Claude and Grok have both built a Lens. For most people, the paid AI plan is the only cost.

**2. Send it this message,** with your area filled in:

> Please read the instructions at https://github.com/TimDaw37/lidar-lens and build me a LiDAR Lens for **[your area]**. I am not a programmer: explain each step in plain English, and ask me before anything that costs money or needs an account.

**3. Make a few choices.** It may ask you, or choose for you:
- **Which area?** A county, a valley, or just your parish.
- **Open to everyone, or behind a password?**
- **Which old maps underneath?** The six-inch Ordnance Survey maps (about 1890–1910) work well.

**4. Open one free account.** To put your map on the internet, it will ask you to open a **Cloudflare** account. Cloudflare asks for a card when you switch on its storage, but a county-sized map fits in the free allowance.

Then let it work. The 700 km² Yorkshire map took about an hour. A whole county takes longer, most of a day, mostly unattended. **Start small.**

If it gets stuck, tell it what went wrong and let it try again.

## What it costs

| | Cost |
| --- | --- |
| The AI helper | A paid plan. Prices vary and change. |
| Cloudflare (putting the map online) | Usually nothing. Free: 10 GB of storage (a county is about 3–4 GB) and 100,000 requests a day, plenty for a club, a society or a village. A busy public map might need the paid plan, about $5 a month. |
| Your computer | Nothing extra, but a whole county needs about 30 GB of free space and a good internet connection. Some of the work can be done on the AI's own computer instead. |
| The LiDAR and the old maps | Free (Environment Agency, Open Government Licence; National Library of Scotland, CC-BY). |

## Not in England?

The Environment Agency's 1 m LiDAR covers England. Wales has its own free LiDAR from Natural Resources Wales (DataMapWales), and Scotland from the Scottish Remote Sensing Portal. The instructions tell your AI helper how to use them.

## Two rules

- **Open records only.** National records from Historic England and OpenStreetMap are open. Your county's own archaeology records (its Historic Environment Record) are not: don't put them on a public map without the county's permission. Linking to them is fine.
- **Report, don't publish.** If you spot something new, tell your county's Historic Environment Record. Don't post maps of possible new sites: they help illegal metal detectorists. Most land is private, and scheduled monuments are protected by law.

## A few words you may meet

- **GitHub:** the website this page is on, where the code is kept. You don't need an account to use it.
- **Repository (repo):** this collection of files.
- **Hosting:** putting your map on the internet so others can open it. Cloudflare does that here.
- **Tiles:** the map is cut into thousands of small squares so it loads quickly.

---

*For your AI helper:* the build guide is [PROTOCOL.md](PROTOCOL.md); the technical overview is [README.md](README.md); `configs/example.js` is the template and `configs/wiltshire.js` a worked example. Use open data only, and keep `showGuess:false` on a public site.

By Tim Daw, sarsen.org. Code under the MIT licence: free to copy and change.
