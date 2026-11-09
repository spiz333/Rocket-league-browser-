# Nitro Strikers

Een 3D auto-voetbalspel voor de (mobiele) browser: raketauto's, een grote bal, boost, sprongen, flips en rijden over muren — speelbaar op je telefoon met aanraakbediening, of op de computer met toetsenbord of controller.

Alles is eigen werk: de auto's, de arena, de bal, de interface en de geluiden (die worden live gegenereerd met WebAudio). Er zijn geen externe assets nodig.

## Spelen

Het spel is een statische website. Start een webserver in deze map en open `index.html`:

```bash
python3 -m http.server 8080
# open http://localhost:8080 (of http://<ip-van-je-computer>:8080 op je telefoon)
```

> Openen via `file://` werkt niet, omdat browsers ES-modules alleen via http(s) laden.

### Online zetten met GitHub Pages

1. Ga naar **Settings → Pages** van deze repository.
2. Kies bij *Source* de branch en de map `/ (root)`.
3. Na een minuut staat het spel op `https://<gebruiker>.github.io/<repository>/`.

Op je telefoon kun je het daarna via *Delen → Zet op beginscherm* als app installeren (volledig scherm, liggend). Na het eerste bezoek werkt het ook offline.

## Besturing

| Actie | Telefoon / tablet | Toetsenbord | Controller |
| --- | --- | --- | --- |
| Sturen | linkerduim ergens links op het scherm | A / D of ← → | linker stick |
| Gas / remmen | automatisch gas; stick omlaag = remmen/achteruit | W / S | RT / LT |
| Springen (2× = dubbele sprong) | **SPRING** | Spatie | A |
| Flip | spring, stick een kant op, nog eens **SPRING** | richting + Spatie | stick + A |
| Boost | **BOOST** vasthouden | Shift of linkermuisknop | B |
| Drift / rollen in de lucht | **DRIFT** | Ctrl, Q / E | X, LB / RB |
| Bal-camera aan/uit | **BAL CAM** | C | Y |
| Pauze | ❚❚ | Esc / P | Start |

Tip: schuif met je rechterduim van BOOST naar SPRING (of leg je duim ertussen) om beide tegelijk te gebruiken.

## Wat zit erin

- **Modi:** 1 tegen 1, 2 tegen 2 en 3 tegen 3 tegen bots (makkelijk / normaal / moeilijk), wedstrijden van 2, 3 of 5 minuten, en vrij oefenen met oneindig boost.
- **Rijden en vliegen:** gas, remmen, driften, springen met vasthouden, dubbele sprong, flips in alle richtingen, besturing in de lucht (kantelen, draaien, rollen), boosten in de lucht, rijden over de gebogen muren en het plafond, en automatisch terugdraaien als je op je dak ligt.
- **Regels:** aftellen bij elke aftrap, boostcellen (groot 100, klein 12) die na een tijdje terugkomen, demolities op topsnelheid, een doelpunt telt pas als de bal helemaal over de lijn is, en na tijd op eindigt de wedstrijd zodra de bal de grond raakt. Bij gelijkspel volgt verlenging (golden goal).
- **Presentatie:** goal-explosies met schokgolf, slow motion, een herhaling na elk doelpunt (tik om over te slaan), een publiek dat juicht, een scorebord boven de middencirkel, naamlabels, en een eindscherm met punten, goals, assists, reddingen, schoten en MVP.
- **Bots:** die rouleren tussen aanvallen, ondersteunen en keepen, voorspellen waar de bal heen gaat, maken flips en (op moeilijk) luchtaanvallen.
- **Garage:** drie automodellen (Raptor, Brute, Dart) en acht lakkleuren.
- **Instellingen:** geluid, automatisch gas, pitch omkeren, trillen, grafische kwaliteit, herhalingen en camera-afstand. Alles wordt lokaal opgeslagen.

## Techniek

- [three.js](https://threejs.org) r170 (MIT, meegeleverd in `vendor/`), zonder build-stap.
- Eigen natuurkunde met een vaste stap van 120 Hz. De arena is een *signed distance field* (een afgeronde doos plus twee doelboxen), dus bal, auto's en camera gebruiken allemaal dezelfde vorm. Daardoor kun je overal over de bochten heen rijden.

| Bestand | Inhoud |
| --- | --- |
| `js/config.js` | Alle afmetingen en instelwaarden |
| `js/sdf.js` | Vorm van de arena (afstandsveld en normalen) |
| `js/ball.js` | Balfysica en balvoorspelling |
| `js/car.js` | Rijden, springen, flips, besturing in de lucht, botsingen met de muren |
| `js/game.js` | Wedstrijdverloop, botsingen tussen auto's en bal, scores, herhalingen |
| `js/ai.js` | Bots |
| `js/arenaView.js`, `js/models.js` | Stadion, auto's en bal (procedureel) |
| `js/camera.js`, `js/effects.js`, `js/audio.js` | Camera, deeltjes, gegenereerd geluid |
| `js/input.js`, `js/hud.js`, `js/main.js` | Besturing, HUD en menu's |
