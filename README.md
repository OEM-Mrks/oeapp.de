# oeapp.de

Mini-Demo-Webseite im Terminal-Look. Rein statisch (HTML/CSS/JS, kein PHP,
kein Build-Schritt), gehostet über **GitHub Pages**. Alles läuft im Browser —
alle "Systemdaten", Logs und Hacks sind gespielt.

## Mini-Apps

Im Prompt den Namen eintippen, `apps` bzw. **F2** für die Auswahl, **ESC** zurück.
Nach dem Boot ist das Terminal still; wer nichts tippt, bekommt vom „Server“ nach und nach
Nachrichten mit Tipp-Animation und App-Vorschläge. Das Fake-System-Log startet mit `log` (`log off` stoppt es).
„♪ musik“ in der Fußleiste schaltet Synthwave-Musik in den Spielen ein (`js/music.js`,
live erzeugt, je Spiel ein eigener Track).

| App        | Was                                                         |
|------------|-------------------------------------------------------------|
| `snake`    | Nokia-Klassiker (`snake --walls` mit tödlichen Rändern)     |
| `blocks`   | Fallende Blöcke im ASCII-Look (Tetris-artig, eigener Code)  |
| `pong`     | Tischtennis gegen den Computer (`pong --2p` zu zweit)       |
| `chomp`    | Labyrinth mit vier Geistern (Pac-Man-artig, eigener Code)   |
| `fixit`    | Fenster flicken, Ziegeln ausweichen (Hommage an Fix-It Felix Jr.) |
| `tron`     | Lichtrad-Duell gegen 1–3 Computergegner (Tron, 1982), Stufen `--langsam`/`--schnell` |
| `race`     | Pseudo-3D-Autorennen: 2 Runden ins Ziel, Stage 2 bei Nacht, Hupe (H), Polizei (C) |
| `ttt`      | Tic-Tac-Toe gegen den Computer (3 Stufen) oder `--2p`       |
| `ssp`      | Schnick, Schnack, Schnuck im Takt gegen eine lernende KI    |
| `dilemma`  | Gefangenendilemma: Verhör über viele Runden, `--turnier` (Axelrod) |
| `pille`    | Rot oder Blau? Das Umfrage-Dilemma mit Stimme, Quelle: Prof. Rieck |
| `video`    | Videothek-Kasse von 1994 im DOS-Look: Verleih, Rückgabe, Bon   |
| `swan`     | 108-Minuten-Countdown aus „Lost“ mit Finale bei 0:00 (`skip` = letzte 15 s, `--fast` ab 4:00, `--pomodoro` = 25/5) |
| `atm`      | PIN-Programm knackt den Geldautomaten (T2-Hommage)          |
| `fsociety` | Fake-Hacker-Shell im Stil von „Mr. Robot“, `/help`          |
| `life`     | Conways Game of Life zum Selberzeichnen, `?` erklärt per Stimme |
| `matrix`   | Digitaler Regen                                             |

## Aufbau

- `index.html` – Layout (Topbar, Log, Zitat-Box, Anzeigen, Bottombar)
- `css/terminal.css` – der komplette Look
- `js/core.js` – Boot, Log, Zitate, Shell-Prompt und App-Manager
- `js/music.js` – Synthwave-Musik (WebAudio-Sequencer), hört auf das Ereignis `oe:app`
- `js/apps/*.js` – eine Datei pro Mini-App
- `fonts/` – IBM Plex Mono, lokal eingebunden (keine externen Requests)
- `favicon.*`, `apple-touch-icon.png`, `icons/`, `manifest.webmanifest` – Icons für Browser-Tab,
  Home-Bildschirm (iPhone/Android) und App-Modus

Neue App: Datei in `js/apps/` anlegen, `OE.register({ id, title, desc, start(ctx) })`
aufrufen und in `index.html` einbinden. Sie taucht dann automatisch in `apps`
und `help` auf.

Lokal testen: `python3 -m http.server 8765` und http://localhost:8765 öffnen.

Änderungen: in `index.html` die Versionsnummer `?v=…` an CSS/JS hochzählen
(sonst laden Browser alte Dateien aus dem Cache), committen, nach `main` pushen — GitHub Pages veröffentlicht
automatisch nach ca. einer Minute.
