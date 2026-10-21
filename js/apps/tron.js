/* tron — Lichtrad-Duell wie im Arcade-Spiel von 1982: jedes Rad zieht eine
   Lichtwand hinter sich her, wer eine Wand trifft, ist raus. Runde 1 gegen
   einen Gegner, danach zwei, ab Runde 3 drei. Die Gegner schauen voraus
   (wie viel Platz bleibt mir?) und schneiden dir gern den Weg ab. */

OE.register({
  id: "tron",
  alias: ["lightcycle", "lichtrad"],
  title: "tron.exe",
  desc: "Lichtrad-Duell: nicht in die Wände fahren (Tron, 1982).",
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

    let C = 8, cols = 60, rows = 40, w = 0, h = 0, bg = null;
    let occ, bikes, state = "ready", round = 1, wins = 0, losses = 0, acc = 0, rate = 18, clock = 0, flash = 0, endT = 0;
    let best = ctx.store.get("tron.best", 0);
    const parts = [];

    function size(){
      w = body.clientWidth; h = body.clientHeight;
      if (!w || !h) return;
      C = Math.max(5, Math.min(10, Math.floor(Math.min(w, h) / 46)));
      cols = Math.floor(w / C); rows = Math.floor(h / C);
      const dpr = window.devicePixelRatio || 1;
      cv.width = cols * C * dpr; cv.height = rows * C * dpr;
      cv.style.width = cols * C + "px"; cv.style.height = rows * C + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Boden: dunkles Raster wie das Spielfeld im Film, einmal vorgezeichnet
      bg = document.createElement("canvas");
      bg.width = cv.width; bg.height = cv.height;
      const b = bg.getContext("2d"); b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grad = b.createRadialGradient(cols * C / 2, rows * C / 2, 0, cols * C / 2, rows * C / 2, Math.max(cols, rows) * C * 0.7);
      grad.addColorStop(0, "#04121a"); grad.addColorStop(1, "#000");
      b.fillStyle = grad; b.fillRect(0, 0, cols * C, rows * C);
      const step = C * 4;
      for (let x = 0; x <= cols * C; x += step){ b.fillStyle = x % (step * 4) ? "rgba(90,232,255,.07)" : "rgba(90,232,255,.16)"; b.fillRect(x, 0, 1, rows * C); }
      for (let y = 0; y <= rows * C; y += step){ b.fillStyle = y % (step * 4) ? "rgba(90,232,255,.07)" : "rgba(90,232,255,.16)"; b.fillRect(0, y, cols * C, 1); }
      b.strokeStyle = "rgba(90,232,255,.55)"; b.lineWidth = 2; b.strokeRect(1, 1, cols * C - 2, rows * C - 2);
      // neue Feldgröße: laufende Runde neu aufsetzen, sonst passt das Raster nicht mehr
      newRound();
      if (state === "running" || state === "count"){ state = "count"; endT = 0; lastCount = 0; }
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
        wiggle: Math.random() }));
      for (const k of bikes){ k.trail.push([k.x, k.y]); occ[idx(k.x, k.y)] = 1; }
      parts.length = 0; acc = 0; flash = 0;
      rate = 16 + Math.min(8, round);   // Felder pro Sekunde, wird mit jeder Runde etwas schneller
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
      const me = bikes[0];
      let best = k.d, bestScore = -Infinity;
      for (const turn of [0, -1, 1]){
        const d = (k.d + turn + 4) % 4, [dx, dy] = DIRS[d];
        const nx = k.x + dx, ny = k.y + dy;
        if (!free(nx, ny)) continue;
        let s = room(nx, ny, 400) * 10;
        // freie Strecke geradeaus
        let run = 0; while (run < 12 && free(nx + dx * run, ny + dy * run)) run++;
        s += run * 4;
        // auf einen Punkt vor dem Spieler zielen, um ihn abzuschneiden
        if (me.alive){
          const [mx, my] = DIRS[me.d];
          const tx = me.x + mx * 6, ty = me.y + my * 6;
          s -= Math.hypot(tx - nx, ty - ny) * (1.2 + Math.min(round, 4) * 0.3);
        }
        if (turn === 0) s += 6;              // lieber geradeaus als zappeln
        s += (Math.random() - 0.5) * 8;      // etwas Unberechenbarkeit
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
      for (const k of bikes) if (k.alive && !k.cpu){
        if ((k.next + 2) % 4 !== k.d) k.d = k.next;   // keine Kehrtwende in die eigene Wand
      } else if (k.alive) k.d = k.next;
      // erst alle Ziele bestimmen, dann gleichzeitig ziehen (Frontalcrash = beide raus)
      const moves = bikes.map(k => k.alive ? [k.x + DIRS[k.d][0], k.y + DIRS[k.d][1]] : null);
      bikes.forEach((k, i) => {
        if (!k.alive) return;
        const [nx, ny] = moves[i];
        const headOn = moves.some((m, j) => j !== i && m && m[0] === nx && m[1] === ny);
        if (!free(nx, ny) || headOn){ crash(k); return; }
        const last = k.trail[k.trail.length - 1], prev = k.trail[k.trail.length - 2];
        // gerade Strecken nur verlängern, Knickpunkte speichern
        if (prev && (prev[0] === last[0] && last[0] === nx || prev[1] === last[1] && last[1] === ny)) last[0] = nx, last[1] = ny;
        else k.trail.push([nx, ny]);
        k.x = nx; k.y = ny;
      });
      for (const k of bikes) if (k.alive) occ[idx(k.x, k.y)] = 1;
      checkEnd();
    }

    function checkEnd(){
      const me = bikes[0], rivals = bikes.slice(1).filter(k => k.alive).length;
      if (me.alive && rivals) return;
      state = "end"; endT = 0;
      if (me.alive){
        wins++; round++;
        if (wins > best){ best = wins; ctx.store.set("tron.best", best); }
        ctx.beep(988, 120); ctx.after(140, () => ctx.beep(1318, 260));
        ctx.log("OK", `tron: Runde gewonnen <span class="dim">(${wins} Siege)</span>`);
        overlay(`<div class="big" style="color:#5ae8ff">RUNDE GEWONNEN</div><div>Siege ${wins} · weiter mit ${Math.min(3, round)} Gegner${Math.min(3, round) > 1 ? "n" : ""}</div>
          <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nächste Runde</div>`);
      } else {
        losses++;
        ctx.log("WARN", `tron: Lichtrad zerstört nach ${wins} Siegen`);
        overlay(`<div class="big" style="color:#ff9a3c">DEREZZED</div><div>${wins} ${wins === 1 ? "Sieg" : "Siege"} · Rekord ${best}</div>
          <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = neues Spiel · ESC = exit</div>`);
        state = "over";
      }
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
        const a = k.alive ? 1 : 0.35;
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
      if (flash > 0){ g.fillStyle = `rgba(255,255,255,${flash * 0.5})`; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2.5); }

      const alive = bikes.slice(1).filter(k => k.alive).length;
      bar.innerHTML = `<span>runde <b>${round}</b></span><span>siege <b>${wins}</b></span><span>rekord <b>${best}</b></span>
        <span>gegner <b>${alive}</b>/${bikes.length - 1}</span><span class="right">P = pause</span>`;
    }

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    /* ---------- Steuerung ---------- */
    function steerAbs(d){
      const me = bikes[0];
      if (state === "ready"){ begin(); }
      if (state !== "running") return;
      if ((d + 2) % 4 !== me.d && d !== me.d){ me.next = d; ctx.beep(660, 20, "square", 0.02); }
    }
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
      if (state === "over"){ round = 1; wins = 0; newRound(); }
      else if (state === "end") newRound();
      else if (state === "paused"){ state = "running"; overlay(null); return; }
      state = "count"; endT = 0; lastCount = 0; overlay(null);
    }

    // Handy: linke Bildhälfte = links abbiegen, rechte = rechts (wie die Arcade-Lenkung); wischen = Richtung
    let sx = 0, sy = 0, down = false;
    cv.addEventListener("pointerdown", e => { down = true; sx = e.clientX; sy = e.clientY; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointerup", e => {
      if (!down) return; down = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 18){
        steerAbs(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
        return;
      }
      const r = cv.getBoundingClientRect();
      if (state !== "running"){ begin(); return; }
      steerRel(e.clientX - r.left < r.width / 2 ? -1 : 1);
    });
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
      if (state === "running"){
        acc += dt;
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
      { label: "⟲", key: "z", aria: "links abbiegen" }, { label: "◀", key: "ArrowLeft" }, { label: "▲", key: "ArrowUp" },
      { label: "▼", key: "ArrowDown" }, { label: "▶", key: "ArrowRight" }, { label: "⟳", key: "x", aria: "rechts abbiegen" },
    ]);
    size();
    overlay(`<div class="big" style="color:#5ae8ff;letter-spacing:.5em">T R O N</div><div>Lichtrad-Duell · nicht in die Wände fahren</div>
      <div class="dim">${ctx.touch ? "links/rechts tippen = abbiegen · wischen = Richtung" : "Pfeiltasten = Richtung · Z/X = links/rechts abbiegen"}</div>
      <div>${ctx.touch ? "tippen zum Start" : "ENTER = start"}</div>`);

    return {
      stop(){ removeEventListener("resize", onResize); },
      key(e){
        const k = e.key;
        const abs = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 }[k];
        if (abs !== undefined){ steerAbs(abs); return true; }
        if (k === "z" || k === "Z"){ steerRel(-1); return true; }
        if (k === "x" || k === "X"){ steerRel(1); return true; }
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
