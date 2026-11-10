# Nitro Strikers

A 3D rocket-car soccer game for the (mobile) browser: boost, jumps, flips, wall driving, bots, online play with friends, seven arenas, a garage and procedurally generated music. Everything — cars, ball, arenas, UI, sound and music — is original and generated in code, so no asset downloads are needed.

## Play

It's a static website. Serve this folder and open `index.html`:

```bash
python3 -m http.server 8080
# then open http://localhost:8080 (or http://<your-computer-ip>:8080 on your phone)
```

Opening the file directly via `file://` does not work because browsers only load ES modules over http(s).

### Put it online

- **GitHub Pages:** Settings → Pages → deploy from your branch, folder `/ (root)`.
- **Netlify:** drag the folder onto app.netlify.com/drop, or import the repository (no build command, publish directory `.`).

On a phone you can then use *Share → Add to Home Screen* to install it as a full-screen landscape app. After the first visit it also works offline.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Steer | left thumb anywhere on the left | A / D or ← → | left stick |
| Throttle / brake | automatic throttle; pull the stick down to brake / reverse | W / S | RT / LT |
| Jump (twice = double jump) | tap **JUMP** | Space | A |
| Flip | **swipe across JUMP** in the flip direction (up = forward) | direction + Space twice | stick + A twice |
| Boost | hold **BOOST** | Shift or left mouse | B |
| Powerslide / air roll | **DRIFT** | Ctrl, Q / E | X, LB / RB |
| Ball cam on/off | **BALL CAM** | C | Y |
| Pause | pause button | Esc / P | Start |

Tips:
- One swipe over JUMP does jump + flip in a single motion. In the air it becomes a flip straight away.
- Slide your right thumb from BOOST onto JUMP to use both at once.
- With *Assists* on (Settings → Controls), the car lands on its wheels by itself. A stick you were already holding when you took off won't keep spinning the car until you let go of it — no more endless flipping while you hold forward.

## Features

- **Modes:** quick match 1v1 / 2v2 / 3v3 against Casual, Skilled or Elite bots; 2-, 3- or 5-minute matches; practice with unlimited boost; online play.
- **Online:** create a room, share the 5-letter code (or link), choose teams, mode, bot level, length and arena in the lobby. Empty slots are bots; if someone leaves, a bot takes over their car.
- **Arenas:** Neon Coliseum (night), Greenfield Park (sunny), Sunset Dunes (desert), Glacier Bowl (snowfall), Skyline Rooftop (rainy city), Starport Zero (space), Coral Bay (beach) — or Random.
- **Garage:** 5 bodies, 12 paints, 6 wheel designs, 6 boost colours and 5 decals.
- **Driving:** throttle, brake, powerslide, jump with hold, double jump, flips in every direction, air control, boost in the air, driving on curved walls and the ceiling, automatic recovery when upside down, demolitions at top speed.
- **Rules:** countdown kickoffs, boost pads (big 100, small 12) that respawn, a goal counts when the ball is fully over the line, time up ends the match when the ball touches the ground, overtime (next goal wins).
- **Presentation:** goal explosions, slow motion and replays, scoreboard with team indicators, point callouts (shot on target, save, goal, assist, demolition), minimap, name tags with boost bars, end-of-match stats with MVP.
- **Audio:** synthesized engine with gears, boost, hits, crowd, goal horn, plus two original music loops (menu and match). Separate music and effects volume.
- **Graphics:** Fast / Nice / Ultra presets (shadows, light beams, clearcoat paint, bloom), automatic resolution scaling when the frame rate drops, smooth rendering between physics steps.

## Tech

- [three.js](https://threejs.org) r170 plus its bloom post-processing (MIT, bundled in `vendor/`), no build step.
- [PeerJS](https://peerjs.com) 1.5 (MIT) for online play: players connect directly via WebRTC; the free public PeerJS server is only used to find each other. The host runs the simulation; guests send input and predict their own car locally.
- Custom physics at a fixed 120 Hz. The arena is a signed distance field (rounded box plus two goal boxes) shared by the ball, cars and camera, so every curve is drivable.

| File | Contents |
| --- | --- |
| `js/config.js` | Dimensions and tuning values |
| `js/sdf.js` | Arena shape (distance field + normals) |
| `js/ball.js` | Ball physics and prediction |
| `js/car.js` | Driving, jumps, flips, air control, wall collisions |
| `js/game.js` | Match flow, car/ball collisions, scoring, replays, networking state |
| `js/ai.js` | Bots |
| `js/maps.js`, `js/arenaView.js`, `js/scenery.js` | Arena themes, stadium, scenery and weather |
| `js/models.js` | Cars, wheels and ball (procedural) |
| `js/camera.js`, `js/effects.js`, `js/audio.js` | Camera, particles, synthesized sound and music |
| `js/net.js` | Online rooms and connections |
| `js/input.js`, `js/hud.js`, `js/main.js` | Controls, HUD, menus, garage and lobby |
