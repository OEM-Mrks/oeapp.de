# oeapp.de

Mini-Demo-Webseite im Terminal-Look. Rein statisch (HTML/CSS/JS, kein PHP,
kein Build-Schritt), gehostet über **GitHub Pages**. Alles läuft im Browser —
alle "Systemdaten", Logs und Hacks sind gespielt.

## Mini-Apps

Im Prompt den Namen eintippen, `apps` bzw. **F2** für die Auswahl, **ESC** zurück.

| App        | Was                                                         |
|------------|-------------------------------------------------------------|
| `snake`    | Nokia-Klassiker (`snake --walls` mit tödlichen Rändern)     |
| `blocks`   | Fallende Blöcke im ASCII-Look (Tetris-artig, eigener Code)  |
| `pong`     | Tischtennis gegen den Computer (`pong --2p` zu zweit)       |
| `chomp`    | Labyrinth mit vier Geistern (Pac-Man-artig, eigener Code)   |
| `race`     | Pseudo-3D-Autorennen im Vektor-Look mit Checkpoints         |
| `video`    | Videothek-Kasse von 1994 im DOS-Look: Verleih, Rückgabe, Bon   |
| `swan`     | 108-Minuten-Countdown aus „Lost“ (`swan --fast` ab 4:00)    |
| `atm`      | Taschencomputer am Geldautomaten (T2-Hommage, Animation)    |
| `fsociety` | Fake-Hacker-Shell im Stil von „Mr. Robot“, `/help`          |
| `life`     | Conways Game of Life zum Selberzeichnen                     |
| `matrix`   | Digitaler Regen                                             |

## Aufbau

- `index.html` – Layout (Topbar, Log, Zitat-Box, Anzeigen, Bottombar)
- `css/terminal.css` – der komplette Look
- `js/core.js` – Boot, Log, Zitate, Shell-Prompt und App-Manager
- `js/apps/*.js` – eine Datei pro Mini-App
- `fonts/` – IBM Plex Mono, lokal eingebunden (keine externen Requests)

Neue App: Datei in `js/apps/` anlegen, `OE.register({ id, title, desc, start(ctx) })`
aufrufen und in `index.html` einbinden. Sie taucht dann automatisch in `apps`
und `help` auf.

Lokal testen: `python3 -m http.server 8765` und http://localhost:8765 öffnen.

Änderungen: in `index.html` die Versionsnummer `?v=…` an CSS/JS hochzählen
(sonst laden Browser alte Dateien aus dem Cache), committen, nach `main` pushen — GitHub Pages veröffentlicht
automatisch nach ca. einer Minute.
