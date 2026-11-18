# ลอยกระทง 2569 · Loy Krathong Idle (three.js, 2.5HD, 9:16)

Idle game driven by your TikTok LIVE. Viewers become little painted characters at a riverside temple on Loy Krathong night.

## Run
Needs Node.js 20+ (the connector requires it).

```bash
npm install
node server.js <your_tiktok_username>      # e.g. node server.js mychannel   (no @)
# open http://localhost:8080/
```
Windows: double-click `start.bat`. No username → demo mode (fake viewers).
Other options: `--port 8081`, `--demo`, env `EULER_API_KEY` (sign-server key, only if TikTok signing rate-limits you).

The relay (`server.js`) uses `tiktok-live-connector` (zerodytrash/TikTok-Live-Connector, v2 API) and pushes simplified JSON events to the page over `ws://localhost:8080/ws`.
You must be LIVE for it to connect; while offline it retries every 20 s and the dot in the HUD is yellow (green = LIVE).

## What viewers do
| TikTok event | In the game |
|---|---|
| **chat** | their character appears (male/female + outfit picked from their user id, always the same) and shows a **chat bubble** |
| **follow** | the character walks to the pier (ท่าน้ำ), kneels and **floats a krathong** (×10 merit) + sky lantern |
| **join** (watching) | character walks in, hops, waves |
| **gift** | **golden krathong** + burst of sky lanterns, merit scales with diamonds |
| **share** | krathong + 3 sky lanterns |
| **like** | heart pop on their character, sky lantern, small merit |

## Idle loop
Villagers (NPCs) stroll to the pier and float krathongs by themselves -> **บุญ (merit)**. Spend merit on 4 upgrades:
ศรัทธา (merit per krathong), ชาวบ้าน (more villagers), เทียนหอม (merit per second), ฤกษ์ดี (multiplier for viewer events).
Tap the **water** to float your own krathong, tap the **sky** to release a khom loi, tap a **character** to make them cheer.
Progress is saved in localStorage, with offline earnings (max 8 h).

## URL options
- `?hud=0` clean overlay (for OBS / TikTok LIVE Studio window capture)
- `?demo=1` local fake events, no relay needed
- `?ws=ws://host:port/ws` custom relay
- `?dtmax=0.5` allow bigger time steps on very slow machines
- Settings (⚙) has relay address and buttons to fire test events.

## Files
- `public/` game (`game.js` three.js scene, `style.css`, `assets/` painted sprites, `lib/three.module.min.js` r160)
- `server.js` static server + TikTok relay
- `tools/process_assets.py` cuts the Image Gen sprite sheets (magenta background) into transparent PNGs

## Art notes
Background, characters, krathongs and lanterns are painted 2D (Ghibli-like + chibi). They live inside a real 3D scene:
perspective camera drift gives parallax, the river is a shader, lamps/candles/moon are additive glows, characters are billboarded sprites with
moonlight/lamp tinting. Characters use 4 male + 4 female painted sprites with procedural walk/hop/bend/pray animation (no frame-by-frame animation yet).
