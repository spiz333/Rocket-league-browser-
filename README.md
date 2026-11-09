# Nitro Strikers

Een 3D auto-voetbalspel voor de (mobiele) browser: raketauto's, een grote bal, boost, sprongen, flips en rijden over muren — speelbaar op je telefoon met aanraakbediening, of op de computer met toetsenbord of controller. Speel tegen bots of **online met vrienden**.

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
| Springen (2× = dubbele sprong) | tik op **SPRING** | Spatie | A |
| Flip | **veeg over SPRING** in de flip-richting (omhoog = voorwaarts) | richting + 2× Spatie | stick + 2× A |
| Boost | **BOOST** vasthouden | Shift of linkermuisknop | B |
| Drift / rollen in de lucht | **DRIFT** | Ctrl, Q / E | X, LB / RB |
| Bal-camera aan/uit | **BAL CAM** | C | Y |
| Pauze | ❚❚ | Esc / P | Start |

Tips:
- Een veeg over SPRING doet in één beweging een sprong + flip. Ben je al in de lucht, dan wordt het meteen een flip.
- Schuif met je rechterduim van BOOST naar SPRING (of leg je duim ertussen) om beide tegelijk te gebruiken.
- In de instellingen kun je de stuurgevoeligheid, knopgrootte en landingshulp aanpassen. De landingshulp draait je auto vlak voor de landing op zijn wielen.

## Online spelen

1. Kies **🌐 ONLINE SPELEN**, vul je naam in en druk op **KAMER MAKEN**.
2. Deel de code van 5 tekens (of de link via **LINK DELEN**) met je vrienden.
3. Zij vullen de code in bij **MEEDOEN**. In de lobby kies je teams, de modus (1v1 / 2v2 / 3v3), het niveau van de bots en de speeltijd. Lege plekken worden bots.
4. De host drukt op **START**.

Hoe het werkt: spelers verbinden rechtstreeks met elkaar via WebRTC (met [PeerJS](https://peerjs.com), MIT, meegeleverd in `vendor/`). Alleen voor het vinden van elkaar wordt de gratis publieke PeerJS-server gebruikt; er is dus geen eigen server nodig. De host rekent de wedstrijd uit; gasten sturen hun invoer en zien hun eigen auto direct reageren (voorspelling met correctie).

Goed om te weten:
- Houd als host het spel open en op de voorgrond. Gaat de app van de host naar de achtergrond, dan staat de wedstrijd stil.
- Op sommige mobiele of bedrijfsnetwerken lukt een directe verbinding niet. Probeer dan een ander netwerk (bijvoorbeeld wifi in plaats van 4G).
- Wil je een eigen signalling-server gebruiken? Voeg `?peerhost=jouw.server&peerport=443&peerpath=/` toe aan de URL.

## Wat zit erin

- **Modi:** 1 tegen 1, 2 tegen 2 en 3 tegen 3 tegen bots (makkelijk / normaal / moeilijk), wedstrijden van 2, 3 of 5 minuten, en vrij oefenen met oneindig boost.
- **Rijden en vliegen:** gas, remmen, driften, springen met vasthouden, dubbele sprong, flips in alle richtingen, besturing in de lucht (kantelen, draaien, rollen), boosten in de lucht, rijden over de gebogen muren en het plafond, en automatisch terugdraaien als je op je dak ligt.
- **Regels:** aftellen bij elke aftrap, boostcellen (groot 100, klein 12) die na een tijdje terugkomen, demolities op topsnelheid, een doelpunt telt pas als de bal helemaal over de lijn is, en na tijd op eindigt de wedstrijd zodra de bal de grond raakt. Bij gelijkspel volgt verlenging (golden goal).
- **Presentatie:** goal-explosies met schokgolf, slow motion, een herhaling na elk doelpunt (tik om over te slaan), een publiek dat juicht, een scorebord boven de middencirkel, naamlabels, en een eindscherm met punten, goals, assists, reddingen, schoten en MVP.
- **Bots:** die rouleren tussen aanvallen, ondersteunen en keepen, voorspellen waar de bal heen gaat, maken flips en (op moeilijk) luchtaanvallen.
- **Garage:** drie automodellen (Raptor, Brute, Dart) en acht lakkleuren.
- **Instellingen:** geluid, automatisch gas, pitch omkeren, stuurgevoeligheid, knopgrootte, landingshulp, trillen, graphics (Snel / Mooi / Ultra), herhalingen en camera-afstand. Alles wordt lokaal opgeslagen.
- **Graphics:** *Mooi* voegt echte schaduwen, lichtbundels en glanzende lak toe; *Ultra* daarbovenop een bloom-gloed en scherpere weergave.

## Techniek

- [three.js](https://threejs.org) r170 en de bloom-postprocessing (MIT, meegeleverd in `vendor/`), zonder build-stap.
- [PeerJS](https://peerjs.com) 1.5 (MIT) voor online spelen.
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
| `js/net.js` | Online verbindingen (kamers, codes) |
| `js/input.js`, `js/hud.js`, `js/main.js` | Besturing, HUD, menu's en lobby |
