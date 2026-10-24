/* tron — Lichtrad-Duell wie im Arcade-Spiel von 1982: jedes Rad zieht eine
   Lichtwand hinter sich her, wer eine Wand trifft, ist raus. Runde 1 gegen
   einen Gegner, danach zwei, ab Runde 3 drei. Die Gegner schauen voraus
   (wie viel Platz bleibt mir?) und schneiden dir gern den Weg ab.
   Gelenkt wird mit zwei Flächen: linke = abbiegen aus Sicht des Fahrers nach
   links, rechte = nach rechts. Fährt das Rad nach unten, tauschen die beiden
   still ihre Funktion, damit die linke Fläche auch dann zum linken Bildrand führt.
   Drei Stufen (leicht / normal / schwer): ändern Tempo und wie weit die Gegner
   vorausdenken. Auf leicht ist das Tempo gemütlich und du hast 5 Extraleben:
   ein Crash löst dein Rad samt Lichtwand auf und setzt es an einer freien
   Stelle neu zusammen. Die Gegner fahren dabei klug, haben aber nur ein Leben.
   Nach drei gewonnenen Runden ist das Raster befreit. Wahl auf dem Startbildschirm mit
   1/2/3, S oder ↑↓, per Tippen auf die Stufe oder mit tron --leicht / --schwer
   (alt: --langsam / --schnell). Rekord je Stufe getrennt. */

OE.register({
  id: "tron",
  alias: ["lightcycle", "lichtrad"],
  title: "tron.exe",
  desc: "Lichtrad-Duell: nicht in die Wände fahren (Tron, 1982).",
  demo: true,
  start(ctx){
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas" style="touch-action:none"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");

    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // hoch, rechts, runter, links (im Uhrzeigersinn)
    const BIKES = [
      { name: "DU",   col: "#5ae8ff", glow: "rgba(90,232,255," },
      { name: "SARK", col: "#ff9a3c", glow: "rgba(255,154,60," },
      { name: "CLU",  col: "#ff4f6a", glow: "rgba(255,79,106," },
      { name: "RINZ", col: "#ffe45a", glow: "rgba(255,228,90," },
    ];

    // tempo: Faktor aufs Grundtempo; look/noise/aim: wie gründlich die Gegner planen;
    // oops: Chance je Schritt, dass ein Gegner blind abbiegt; doze: nach so vielen Sekunden
    // döst er ein und fährt stur geradeaus; goal: Siege bis zum Gesamtsieg; lives: Extraleben
    const LEVELS = [
      { id: "leicht", tempo: 0.55, look: 400, noise: 8,  aim: 0.7,  oops: 0, goal: 3, lives: 5 },
      { id: "normal", tempo: 1,    look: 400, noise: 8,  aim: 1,    oops: 0 },
      { id: "schwer", tempo: 1.35, look: 600, noise: 6,  aim: 1.15, oops: 0 },
    ];
    const OLD = { "--langsam": "leicht", "--slow": "leicht", "--schnell": "schwer", "--fast": "schwer" };
    const lvs = ctx.levels(LEVELS.map(l => l.id));
    const old = ctx.args.map(a => OLD[a]).find(Boolean);
    if (old) lvs.set(old);
    let lv = ctx.demo ? 1 : lvs.index;
    const L = () => LEVELS[lv];
    // Rekord je Stufe; "normal" und "schwer" (früher "schnell") behalten die alten Schlüssel
    const bestKey = () => "tron.best" + [".leicht", "", ".schnell"][lv];

    let C = 8, cols = 60, rows = 40, w = 0, h = 0, bg = null;
    let lives = 0, rez = null;   // Extraleben (leicht) und laufende Wiederbelebung
    let occ, bikes, state = "ready", round = 1, wins = 0, losses = 0, acc = 0, rate = 18, clock = 0, flash = 0, endT = 0;
    let best = ctx.store.get(bestKey(), 0);
    if (ctx.demo) round = 3;   // Vorführung: gleich gegen drei Gegner
    const parts = [];
    let play = 0;   // Fahrzeit der Runde (ohne Countdown und Pause)

    function size(){
      w = body.clientWidth; h = body.clientHeight;
      if (!w || !h) return;
      C = Math.max(5, Math.min(10, Math.floor(Math.min(w, h) / 46)));
      const nc = Math.floor(w / C), nr = Math.floor(h / C), changed = nc !== cols || nr !== rows;
      cols = nc; rows = nr;
      const dpr = window.devicePixelRatio || 1;
      cv.width = cols * C * dpr; cv.height = rows * C * dpr;
      cv.style.width = cols * C + "px"; cv.style.height = rows * C + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Boden: dunkles Raster wie das Spielfeld im Film, einmal vorgezeichnet
      bg = document.createElement("canvas");
      bg.width = cols * C * dpr; bg.height = rows * C * dpr;
      const b = bg.getContext("2d"); b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grad = b.createRadialGradient(cols * C / 2, rows * C / 2, 0, cols * C / 2, rows * C / 2, Math.max(cols, rows) * C * 0.7);
      grad.addColorStop(0, "#04121a"); grad.addColorStop(1, "#000");
      b.fillStyle = grad; b.fillRect(0, 0, cols * C, rows * C);
      const step = C * 4;
      for (let x = 0; x <= cols * C; x += step){ b.fillStyle = x % (step * 4) ? "rgba(90,232,255,.07)" : "rgba(90,232,255,.16)"; b.fillRect(x, 0, 1, rows * C); }
      for (let y = 0; y <= rows * C; y += step){ b.fillStyle = y % (step * 4) ? "rgba(90,232,255,.07)" : "rgba(90,232,255,.16)"; b.fillRect(0, y, cols * C, 1); }
      b.strokeStyle = "rgba(90,232,255,.55)"; b.lineWidth = 2; b.strokeRect(1, 1, cols * C - 2, rows * C - 2);
      // neue Feldgröße: Runde neu aufsetzen, sonst passt das Raster nicht mehr
      if (!bikes || changed){
        newRound();
        if (["running", "count", "respawn"].includes(state)){ state = "count"; endT = 0; lastCount = 0; rez = null; }
      }
    }

    const idx = (x, y) => y * cols + x;
    const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !occ[idx(x, y)];

    function newRound(){
      occ = new Uint8Array(cols * rows);
      const n = Math.min(3, round);   // Gegner
      const my = Math.floor(rows * 0.75), ty = Math.floor(rows * 0.25), cx = Math.floor(cols / 2);
      const starts = [
        { x: cx, y: my, d: 0 },
        { x: cx, y: ty, d: 2 },
        { x: Math.floor(cols * 0.2), y: Math.floor(rows / 2), d: 1 },
        { x: Math.floor(cols * 0.8), y: Math.floor(rows / 2), d: 3 },
      ];
      bikes = BIKES.slice(0, n + 1).map((b, i) => ({ ...b, ...starts[i], alive: true, cpu: i > 0, trail: [], next: starts[i].d,
        wiggle: Math.random(), doze: L().doze ? L().doze[0] + Math.random() * (L().doze[1] - L().doze[0]) : Infinity }));
      bikes.forEach((k, i) => { k.trail.push([k.x, k.y]); occ[idx(k.x, k.y)] = i + 1; });   // Feld merkt sich, wessen Wand es ist
      parts.length = 0; acc = 0; flash = 0; play = 0;
      rate = (16 + Math.min(8, round)) * L().tempo;   // Felder pro Sekunde, wird mit jeder Runde etwas schneller
    }

    /* ---------- Computergegner: Platz zählen, Gegner abschneiden ---------- */
    function room(sx, sy, limit){
      // Flutfüllung ab (sx, sy): wie viele freie Felder sind erreichbar?
      if (!free(sx, sy)) return 0;
      const seen = new Uint8Array(cols * rows), q = [sx, sy];
      seen[idx(sx, sy)] = 1;
      let n = 0;
      while (q.length && n < limit){
        const y = q.pop(), x = q.pop(); n++;
        for (const [dx, dy] of DIRS){
          const nx = x + dx, ny = y + dy;
          if (free(nx, ny) && !seen[idx(nx, ny)]){ seen[idx(nx, ny)] = 1; q.push(nx, ny); }
        }
      }
      return n;
    }
    function think(k){
      if (play > k.doze){ k.next = k.d; return; }   // leicht: eingedöst, fährt stur geradeaus
      const me = bikes[0];
      let best = k.d, bestScore = -Infinity;
      for (const turn of [0, -1, 1]){
        const d = (k.d + turn + 4) % 4, [dx, dy] = DIRS[d];
        const nx = k.x + dx, ny = k.y + dy;
        if (!free(nx, ny)) continue;
        let s = room(nx, ny, L().look) * 10;
        // freie Strecke geradeaus
        let run = 0; while (run < 12 && free(nx + dx * run, ny + dy * run)) run++;
        s += run * 4;
        // auf einen Punkt vor dem Spieler zielen, um ihn abzuschneiden
        if (me.alive){
          const [mx, my] = DIRS[me.d];
          const tx = me.x + mx * 6, ty = me.y + my * 6;
          s -= Math.hypot(tx - nx, ty - ny) * (1.2 + Math.min(round, 4) * 0.3) * L().aim;
        }
        if (turn === 0) s += 6;              // lieber geradeaus als zappeln
        s += (Math.random() - 0.5) * L().noise;   // etwas Unberechenbarkeit
        if (s > bestScore){ bestScore = s; best = d; }
      }
      // leicht: ab und zu ein Schlenker ohne hinzuschauen (oder stur geradeaus)
      if (L().oops && play > 1 && Math.random() < L().oops) best = (k.d + [0, -1, 1][ctx.rint(0, 2)] + 4) % 4;
      k.next = best;
    }
    // Vorführung: das eigene Rad plant wie die Gegner (viel Platz, lange Geraden)
    // und hält auf den nächsten Gegner zu, nur etwas vorsichtiger
    function pilot(k){
      const rivals = bikes.filter(b => b.cpu && b.alive);
      let best = k.d, bestScore = -Infinity;
      for (const turn of [0, -1, 1]){
        const d = (k.d + turn + 4) % 4, [dx, dy] = DIRS[d];
        const nx = k.x + dx, ny = k.y + dy;
        if (!free(nx, ny)) continue;
        let s = room(nx, ny, 700) * 10;
        let run = 0; while (run < 12 && free(nx + dx * run, ny + dy * run)) run++;
        s += run * 5;
        let near = null, nd = Infinity;
        for (const r of rivals){ const q = Math.hypot(r.x - k.x, r.y - k.y); if (q < nd){ nd = q; near = r; } }
        if (near){
          const [mx, my] = DIRS[near.d];
          s -= Math.hypot(near.x + mx * 5 - nx, near.y + my * 5 - ny) * 0.8;
        }
        if (turn === 0) s += 8;
        s += (Math.random() - 0.5) * 4;
        if (s > bestScore){ bestScore = s; best = d; }
      }
      k.next = best;
    }

    function crash(k){
      k.alive = false;
      flash = Math.max(flash, k.cpu ? 0.25 : 0.6);
      ctx.beep(k.cpu ? 160 : 90, 380, "sawtooth", 0.06);
      const px = k.x * C + C / 2, py = k.y * C + C / 2;
      for (let i = 0; i < 46; i++){
        const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 260, life = 0.4 + Math.random() * 0.7;
        parts.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col: k.col });
      }
    }

    function tick(){
      for (const k of bikes) if (k.alive && k.cpu) think(k);
      if (ctx.demo && bikes[0].alive) pilot(bikes[0]);
      for (const k of bikes) if (k.alive && !k.cpu){
        if ((k.next + 2) % 4 !== k.d) k.d = k.next;   // keine Kehrtwende in die eigene Wand
      } else if (k.alive) k.d = k.next;
      // erst alle Ziele bestimmen, dann gleichzeitig ziehen (Frontalcrash = beide raus)
      const moves = bikes.map(k => k.alive ? [k.x + DIRS[k.d][0], k.y + DIRS[k.d][1]] : null);
      bikes.forEach((k, i) => {
        if (!k.alive) return;
        const [nx, ny] = moves[i];
        // Frontalcrash; auf leicht hat der Spieler Vorfahrt, nur der Gegner fliegt raus
        const headOn = moves.some((m, j) => j !== i && m && m[0] === nx && m[1] === ny) && !(L().goal && !k.cpu);
        if (!free(nx, ny) || headOn){
          if (ctx.demo && !k.cpu){   // Vorführung: Spieler hat einen Schutzengel, wartet notfalls einen Schritt
            const d = [0, 1, 2, 3].find(d => free(k.x + DIRS[d][0], k.y + DIRS[d][1]) && !moves.some((m, j) => j !== i && m && m[0] === k.x + DIRS[d][0] && m[1] === k.y + DIRS[d][1]));
            if (d === undefined) return;
            k.d = k.next = d; moves[i] = [k.x + DIRS[d][0], k.y + DIRS[d][1]];
            const [ax, ay] = moves[i]; k.trail.push([ax, ay]); k.x = ax; k.y = ay;
            return;
          }
          crash(k); return;
        }
        const last = k.trail[k.trail.length - 1], prev = k.trail[k.trail.length - 2];
        // gerade Strecken nur verlängern, Knickpunkte speichern
        if (prev && (prev[0] === last[0] && last[0] === nx || prev[1] === last[1] && last[1] === ny)) last[0] = nx, last[1] = ny;
        else k.trail.push([nx, ny]);
        k.x = nx; k.y = ny;
      });
      bikes.forEach((k, i) => { if (k.alive) occ[idx(k.x, k.y)] = i + 1; });
      checkEnd();
    }

    function checkEnd(){
      const me = bikes[0], rivals = bikes.slice(1).filter(k => k.alive).length;
      if (!me.alive && lives > 0 && !ctx.demo){   // leicht: ein Leben weg statt Spielende
        lives--;
        if (rivals){ respawn(); return; }
        me.alive = true;   // letzter Gegner im selben Moment raus: zählt als Sieg
      }
      if (me.alive && rivals) return;
      if (ctx.demo){ newRound(); return; }   // Vorführung: gleich die nächste Runde, ohne Bildschirm
      state = "end"; endT = 0;
      if (me.alive){
        wins++; round++;
        if (wins > best){ best = wins; ctx.store.set(bestKey(), best); }
        ctx.beep(988, 120); ctx.after(140, () => ctx.beep(1318, 260));
        ctx.log("OK", `tron: Runde gewonnen <span class="dim">(${wins} Siege)</span>`);
        if (L().goal && wins >= L().goal){   // leicht: klares Ende mit Gesamtsieg
          state = "champ";
          [784, 988, 1175, 1568].forEach((f, i) => ctx.after(300 + i * 130, () => ctx.beep(f, 160, "square", 0.04)));
          ctx.log("OK", `tron: Raster befreit <span class="dim">(${wins} Siege, ${L().id})</span>`);
        }
      } else {
        losses++;
        ctx.log("WARN", `tron: Lichtrad zerstört nach ${wins} Siegen <span class="dim">(${L().id})</span>`);
        state = "over";
      }
      screen();
    }

    /* ---------- Extraleben: Rad auflösen, Wand weg, an freier Stelle neu bauen ---------- */
    const DISSOLVE = 0.7, BUILD = 0.9;
    function respawn(){
      state = "respawn";
      rez = { t: 0, x: 0, y: 0, built: false };
      ctx.beep(220, 160, "sawtooth", 0.05); ctx.after(180, () => ctx.beep(147, 260, "sawtooth", 0.05));
      ctx.log("WARN", `tron: Lichtrad zerstört, noch ${lives} Leben`);
    }
    // sicherste Stelle: viel erreichbarer Platz, lange Gerade, weit weg von den Gegnern
    function spawnSpot(){
      const rivals = bikes.filter(b => b.cpu && b.alive);
      let best = null, bestScore = -Infinity;
      for (let y = 3; y < rows - 3; y += 3) for (let x = 3; x < cols - 3; x += 3){
        if (!free(x, y)) continue;
        const near = Math.min(...rivals.map(r => Math.hypot(r.x - x, r.y - y)));
        if (near < 8) continue;
        for (let d = 0; d < 4; d++){
          let run = 0; while (run < 30 && free(x + DIRS[d][0] * (run + 1), y + DIRS[d][1] * (run + 1))) run++;
          if (run < 4) continue;
          const s = run * 6 + Math.min(near, 25) * 3 + Math.random() * 4;
          if (s > bestScore){ bestScore = s; best = { x, y, d }; }
        }
      }
      return best || { x: bikes[0].x, y: bikes[0].y, d: bikes[0].d };
    }
    function rezTick(dt){
      rez.t += dt;
      const me = bikes[0];
      if (!rez.built && rez.t >= DISSOLVE){
        // eigene Lichtwand ist weg: Felder freigeben, neuen Platz suchen
        for (let i = 0; i < occ.length; i++) if (occ[i] === 1) occ[i] = 0;
        const s = spawnSpot();
        Object.assign(me, { x: s.x, y: s.y, d: s.d, next: s.d, trail: [[s.x, s.y]], alive: true });
        occ[idx(s.x, s.y)] = 1;
        rez.x = s.x * C + C / 2; rez.y = s.y * C + C / 2; rez.built = true;
        [523, 659, 784, 1047].forEach((f, i) => ctx.after(i * 120, () => ctx.beep(f, 110, "square", 0.035)));
      }
      if (rez.t >= DISSOLVE + BUILD){ rez = null; state = "running"; acc = 0; }
    }
    function drawRez(){
      const W = cols * C, H = rows * C;
      g.font = `600 ${Math.max(18, C * 3.2)}px "IBM Plex Mono", monospace`; g.textAlign = "center"; g.textBaseline = "middle";
      if (!rez.built){
        // Störung: verschobene Bildstreifen, Text flackert
        const f = rez.t / DISSOLVE;
        for (let i = 0; i < 6; i++){
          const y = Math.random() * H, hh = 2 + Math.random() * C * 2;
          g.drawImage(cv, 0, y * (cv.height / H), cv.width, hh * (cv.height / H), (Math.random() - 0.5) * C * 3 * (1 - f), y, W, hh);
        }
        if (Math.random() < 0.8){ g.fillStyle = "#ff9a3c"; g.fillText("DEREZZED", W / 2, H / 2); }
        return;
      }
      // Wiederaufbau: Ringe ziehen sich zum neuen Rad zusammen, Fadenkreuz
      const f = Math.min(1, (rez.t - DISSOLVE) / BUILD), me = bikes[0];
      for (let i = 0; i < 3; i++){
        const q = Math.max(0, 1 - f - i * 0.15);
        g.strokeStyle = me.glow + (0.8 * (1 - q)) + ")"; g.lineWidth = 2;
        g.beginPath(); g.arc(rez.x, rez.y, C * 1.5 + q * Math.max(W, H) * 0.5, 0, Math.PI * 2); g.stroke();
      }
      g.strokeStyle = me.glow + "0.5)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(rez.x, 0); g.lineTo(rez.x, H); g.moveTo(0, rez.y); g.lineTo(W, rez.y); g.stroke();
      g.fillStyle = "#5ae8ff";
      g.fillText(`REZZ · noch ${"♥".repeat(lives) || "0"}`, W / 2, rez.y > H / 2 ? H * 0.25 : H * 0.75);
    }
    const hearts = () => L().lives ? `<span>leben <b style="color:#ff4f6a">${"♥".repeat(lives)}</b><span class="dim">${"♡".repeat(L().lives - lives)}</span></span>` : "";

    /* ---------- Bildschirme zwischen den Runden, mit Stufenwahl ---------- */
    function screen(){
      const go = ctx.touch ? "tippen" : "ENTER";
      const pick = `<button type="button" class="tron-lv" style="font:inherit;color:#5ae8ff;background:rgba(90,232,255,.08);border:1px solid rgba(90,232,255,.5);padding:6px 14px;margin:4px 0;cursor:pointer;touch-action:manipulation">stufe ‹ <b>${L().id}</b> ›</button>`
        + `<div class="dim">${ctx.touch ? "stufe antippen = wechseln" : "1 2 3 / ↑↓ = stufe"}</div>`;
      if (state === "ready") overlay(`<div class="big" style="color:#5ae8ff;letter-spacing:.5em">T R O N</div><div>Lichtrad-Duell · nicht in die Wände fahren</div>
        <div class="dim">${ctx.touch ? "linke/rechte Fläche = abbiegen" : "← → = abbiegen"}</div>${L().lives ? `<div>du hast <b style="color:#ff4f6a">${L().lives} Extraleben</b> · die Gegner nur eins</div>` : ""}${pick}
        <div>${ctx.touch ? "tippen zum Start" : "ENTER = start"}</div>`);
      else if (state === "end") overlay(`<div class="big" style="color:#5ae8ff">RUNDE GEWONNEN</div><div>Siege ${wins} · weiter mit ${Math.min(3, round)} Gegner${Math.min(3, round) > 1 ? "n" : ""}${L().lives ? ` · ${lives} Leben übrig` : ""}</div>
        ${pick}<div class="dim">${go} = nächste Runde · stufe wechseln = neue Serie</div>`);
      else if (state === "champ") overlay(`<div class="big" style="color:#5ae8ff">RASTER BEFREIT!</div><div>${wins} Runden gewonnen · alle Gegner derezzed</div>
        <div class="dim">bereit für mehr? stufe <b>normal</b> wartet</div>${pick}<div class="dim">${go} = neue Serie · ESC = exit</div>`);
      else if (state === "over") overlay(`<div class="big" style="color:#ff9a3c">DEREZZED</div><div>${wins} ${wins === 1 ? "Sieg" : "Siege"} · Rekord ${best}</div>
        ${pick}<div class="dim">${go} = neues Spiel · ESC = exit</div>`);
      const b = ov.querySelector(".tron-lv");
      if (b){
        b.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); });
        b.addEventListener("pointerup", e => { e.stopPropagation(); setLevel(lv + 1); });
      }
    }
    // nur außerhalb der Fahrt; nach einer Runde beginnt dann eine neue Serie (Rekord je Stufe)
    function setLevel(n){
      if (ctx.demo || !["ready", "end", "over", "champ"].includes(state)) return false;
      n = (n + LEVELS.length) % LEVELS.length;
      if (n === lv) return true;
      lv = n; lvs.set(L().id);
      best = ctx.store.get(bestKey(), 0);
      if (state !== "ready"){ state = "ready"; round = 1; wins = 0; }
      lives = L().lives || 0;
      newRound();   // setzt auch das Tempo neu
      ctx.beep(520 + lv * 180, 60, "square", 0.03);
      screen(); draw(0);
      return true;
    }

    /* ---------- Zeichnen ---------- */
    function trailPath(k){
      g.beginPath();
      k.trail.forEach(([x, y], i) => i ? g.lineTo(x * C + C / 2, y * C + C / 2) : g.moveTo(x * C + C / 2, y * C + C / 2));
      if (k.alive && state === "running"){   // Kopf gleitet zwischen den Feldern weiter
        const f = Math.min(1, acc * rate);
        if (free(k.x + DIRS[k.d][0], k.y + DIRS[k.d][1])) g.lineTo((k.x + DIRS[k.d][0] * f) * C + C / 2, (k.y + DIRS[k.d][1] * f) * C + C / 2);
      }
    }
    function head(k){
      const f = k.alive && state === "running" && free(k.x + DIRS[k.d][0], k.y + DIRS[k.d][1]) ? Math.min(1, acc * rate) : 0;
      return [(k.x + DIRS[k.d][0] * f) * C + C / 2, (k.y + DIRS[k.d][1] * f) * C + C / 2];
    }

    function draw(dt){
      const W = cols * C, H = rows * C;
      if (bg) g.drawImage(bg, 0, 0, W, H);
      g.lineCap = "round"; g.lineJoin = "round";
      for (const k of bikes){
        let a = k.alive ? 1 : 0.35;
        if (rez && !rez.built && !k.cpu){   // eigene Wand löst sich flackernd auf
          a = (1 - rez.t / DISSOLVE) * (Math.random() < 0.3 ? 0.2 : 1);
          if (a <= 0.02) continue;
        }
        trailPath(k);
        g.strokeStyle = k.glow + (0.12 * a) + ")"; g.lineWidth = C * 1.6; g.stroke();
        g.strokeStyle = k.glow + (0.35 * a) + ")"; g.lineWidth = C * 0.75; g.stroke();
        g.strokeStyle = k.alive ? "#fff" : k.col; g.globalAlpha = k.alive ? 0.85 : 0.5; g.lineWidth = Math.max(1, C * 0.22); g.stroke();
        g.globalAlpha = 1;
      }
      // Räder: heller Kopf mit Lichtkegel
      for (const k of bikes){
        if (!k.alive) continue;
        const [x, y] = head(k), [dx, dy] = DIRS[k.d];
        const rg = g.createRadialGradient(x, y, 0, x, y, C * 3.2);
        rg.addColorStop(0, k.glow + ".55)"); rg.addColorStop(1, k.glow + "0)");
        g.fillStyle = rg; g.fillRect(x - C * 3.2, y - C * 3.2, C * 6.4, C * 6.4);
        g.save(); g.translate(x, y); g.rotate(Math.atan2(dy, dx));
        g.fillStyle = k.col; g.fillRect(-C * 1.3, -C * 0.55, C * 1.9, C * 1.1);
        g.fillStyle = "#fff"; g.fillRect(C * 0.2, -C * 0.3, C * 0.45, C * 0.6);
        g.restore();
      }
      // Trümmer
      g.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--){
        const p = parts[i];
        p.life -= dt; if (p.life <= 0){ parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
        g.globalAlpha = p.life / p.max; g.fillStyle = p.col;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      if (rez) drawRez();
      if (flash > 0){ g.fillStyle = `rgba(255,255,255,${flash * 0.5})`; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2.5); }

      const alive = bikes.slice(1).filter(k => k.alive).length;
      const html = `<span>runde <b>${round}</b></span><span>siege <b>${wins}</b></span><span>rekord <b>${best}</b></span><span class="tron-bar-lv" style="cursor:pointer">stufe <b>${L().id}</b></span>${L().goal ? `<span>ziel <b>${L().goal}</b> siege</span>` : ""}${hearts()}
        <span>gegner <b>${alive}</b>/${bikes.length - 1}</span><span class="right">P = pause</span>`;
      if (html !== barHtml){ barHtml = html; bar.innerHTML = html; }   // nur bei Änderung, sonst trifft das Antippen ins Leere
    }

    let barHtml = "";
    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    /* ---------- Steuerung: zwei Flächen ---------- */
    // side: -1 = linke Fläche/Taste, 1 = rechte; bei Fahrt nach unten vertauscht
    const press = side => steerRel(bikes[0].d === 2 ? -side : side);
    function steerRel(turn){
      if (state !== "running"){ begin(); return; }
      const me = bikes[0];
      // relativ zur geplanten Richtung, damit schnelles Doppeltippen eine Kehre fährt
      me.next = (me.next + turn + 4) % 4;
      if ((me.next + 2) % 4 === me.d) me.next = me.d;
      ctx.beep(660, 20, "square", 0.02);
    }
    let lastCount = 0;
    function begin(){
      if (state === "running" || state === "count") return;
      if (state === "respawn") return;
      if (state === "over" || state === "champ"){ round = 1; wins = 0; lives = L().lives || 0; newRound(); }
      else if (state === "end") newRound();
      else if (state === "paused"){ state = "running"; overlay(null); return; }
      state = "count"; endT = 0; lastCount = 0; overlay(null);
    }

    // Handy: linke oder rechte Bildhälfte antippen, wirkt wie die beiden Tasten
    let sx = 0, down = false;
    cv.addEventListener("pointerdown", e => {
      down = true; sx = e.clientX; cv.setPointerCapture(e.pointerId);
      if (state !== "running"){ begin(); down = false; return; }
      const r = cv.getBoundingClientRect();
      press(e.clientX - r.left < r.width / 2 ? -1 : 1);   // sofort beim Berühren, nicht erst beim Loslassen
    });
    cv.addEventListener("pointerup", () => { down = false; });
    ov.addEventListener("pointerup", () => { if (state !== "running") begin(); });

    ctx.loop(ms => {
      const dt = Math.min(ms, 50) / 1000;
      clock += dt;
      if (state === "count"){
        endT += dt;
        const n = 3 - Math.floor(endT / 0.6);
        if (n !== lastCount){ lastCount = n; if (n > 0) ctx.beep(440, 90, "square", 0.04); }
        if (endT >= 1.8){ state = "running"; acc = 0; ctx.beep(880, 220, "square", 0.05); }
      }
      if (state === "respawn") rezTick(dt);
      if (state === "running"){
        acc += Math.min(ms, 100) / 1000; play += dt;   // Spielzeit: erst ab <10 fps gekappt, sonst unabhängig von der Bildrate
        while (acc >= 1 / rate && state === "running"){ acc -= 1 / rate; tick(); }
      }
      draw(dt);
      if (state === "count"){
        const n = 3 - Math.floor(endT / 0.6);
        g.font = `600 ${Math.max(28, C * 7)}px "IBM Plex Mono", monospace`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = "#5ae8ff"; g.fillText(n > 0 ? n : "LOS", cols * C / 2, rows * C / 2);
      }
    });

    const onResize = () => size();
    addEventListener("resize", onResize);
    ctx.buttons(pad, [
      { label: "", key: "ArrowLeft", aria: "linke Taste" }, { label: "", key: "ArrowRight", aria: "rechte Taste" },
    ]);
    lives = ctx.demo ? 0 : L().lives || 0;
    size();
    if (ctx.demo){ state = "running"; acc = 0; } else screen();
    // Stufe in der Statuszeile antippen/klicken = wechseln (zwischen den Runden)
    bar.addEventListener("click", e => { if (e.target.closest(".tron-bar-lv")) setLevel(lv + 1); });

    // nur zum Testen: tron --debug
    if (ctx.args.includes("--debug")) window.OE_TRON = {
      get s(){ return { state, round, wins, lives, lv: L().id, cols, rows, bikes: bikes.map(k => ({ x: k.x, y: k.y, d: k.d, alive: k.alive })) }; },
      free: (x, y) => free(x, y),
    };

    return {
      stop(){ removeEventListener("resize", onResize); delete window.OE_TRON; },
      key(e){
        const k = e.key;
        if (["ArrowLeft", "a", "A", "z", "Z"].includes(k)){ press(-1); return true; }
        if (["ArrowRight", "d", "D", "x", "X"].includes(k)){ press(1); return true; }
        if (k === "ArrowUp" || k === "ArrowDown"){ setLevel(lv + (k === "ArrowUp" ? 1 : -1)); return true; }
        if (k === "1" || k === "2" || k === "3"){ setLevel(+k - 1); return true; }
        if (k === "s" || k === "S"){ setLevel(lv + 1); return true; }
        if (k === "Enter" || k === " "){ begin(); return true; }
        if (k === "p" || k === "P"){
          if (state === "running"){ state = "paused"; overlay(`<div class="big">PAUSE</div><div class="dim">P = weiter</div>`); }
          else if (state === "paused") begin();
          return true;
        }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
