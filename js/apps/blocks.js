/* blocks — fallende Blöcke. Standard ist eine Canvas-Ansicht mit
   leuchtenden Phosphor-Blöcken; "V" schaltet zurück auf den ASCII-Look
   der allerersten Version auf dem Elektronika 60 (<! . . !>).
   Eigene Umsetzung, kein fremder Code. */

OE.register({
  id: "blocks",
  alias: ["tetris"],
  title: "blocks.exe",
  desc: "Fallende Blöcke, volle Reihen verschwinden (Tetris-artig).",
  start(ctx){
    const W = 10, H = 20, HID = 2, ROWS = H + HID;   // HID = unsichtbare Pufferreihen über dem Brett
    const DAS = 150, ARR = 40;        // Verzögerung / Wiederholrate beim Halten von ← →
    const SOFT = 30;                  // ms pro Reihe beim Halten von ↓
    const LOCK = 500, RESETS = 15;    // Liegezeit am Boden, max. Neustarts durch Bewegen
    const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const GREEN = "#33ff66", DIM = "#1a8a36", BRIGHT = "#a6ffb8", AMBER = "#ffb454", RED = "#ff5a5a";
    // Jede Form bekommt einen eigenen Farbton aus der CRT-Palette
    const COL = { I: "#4df0ff", O: "#ffd35a", T: "#a6ffb8", S: "#33ff66", Z: "#ff5a5a", J: "#3fa9ff", L: "#ffa040" };

    const BASE = {
      I: [[0,1],[1,1],[2,1],[3,1]],
      O: [[1,0],[2,0],[1,1],[2,1]],
      T: [[1,0],[0,1],[1,1],[2,1]],
      S: [[1,0],[2,0],[0,1],[1,1]],
      Z: [[0,0],[1,0],[1,1],[2,1]],
      J: [[0,0],[0,1],[1,1],[2,1]],
      L: [[2,0],[0,1],[1,1],[2,1]],
    };
    const TYPES = Object.keys(BASE);
    // Alle vier Drehlagen vorberechnen (im Uhrzeigersinn, Drehbox 3x3 bzw. 4x4)
    const ROT = {};
    for (const t of TYPES){
      const n = t === "I" || t === "O" ? 4 : 3, r = [BASE[t]];
      for (let i = 1; i < 4; i++) r.push(t === "O" ? BASE.O : r[i - 1].map(([x, y]) => [n - 1 - y, x]));
      ROT[t] = r;
    }
    // Wandsprünge beim Drehen (SRS-Tabellen, notiert mit y nach oben → hier umgedreht)
    const K = s => s.split(" ").map(p => { const [x, y] = p.split(",").map(Number); return [x, -y]; });
    const KICK = {
      "01": K("0,0 -1,0 -1,1 0,-2 -1,-2"), "10": K("0,0 1,0 1,-1 0,2 1,2"),
      "12": K("0,0 1,0 1,-1 0,2 1,2"),     "21": K("0,0 -1,0 -1,1 0,-2 -1,-2"),
      "23": K("0,0 1,0 1,1 0,-2 1,-2"),    "32": K("0,0 -1,0 -1,-1 0,2 -1,2"),
      "30": K("0,0 -1,0 -1,-1 0,2 -1,2"),  "03": K("0,0 1,0 1,1 0,-2 1,-2"),
    };
    const KICK_I = {
      "01": K("0,0 -2,0 1,0 -2,-1 1,2"), "10": K("0,0 2,0 -1,0 2,1 -1,-2"),
      "12": K("0,0 -1,0 2,0 -1,2 2,-1"), "21": K("0,0 1,0 -2,0 1,-2 -2,1"),
      "23": K("0,0 2,0 -1,0 2,1 -1,-2"), "32": K("0,0 -2,0 1,0 -2,-1 1,2"),
      "30": K("0,0 1,0 -2,0 1,-2 -2,1"), "03": K("0,0 -1,0 2,0 -1,2 2,-1"),
    };

    // Startlevel optional: "blocks 5"
    const argLv = parseInt(ctx.args.find(a => /^\d+$/.test(a)), 10);
    const START_LV = Math.max(1, Math.min(15, argLv || 1));

    /* ---------- Aufbau ---------- */
    const { bar, body, pad } = ctx.layout();
    pad.classList.add("blocks-pad");
    // Eigene Styles nur für diese App (werden in stop() wieder entfernt)
    const css = document.createElement("style");
    css.textContent = `
      .pad.blocks-pad{ gap:6px; flex-wrap:nowrap; }
      .pad.blocks-pad button{ min-width:0; flex:1 1 0; max-width:72px; padding:0; }
      .pad.blocks-pad button:last-child{ font-size:13px; letter-spacing:.05em; }
      .app-overlay .blocks-view{ font:inherit; font-size:12px; margin-top:8px; padding:4px 12px; cursor:pointer;
        background:#000; color:${GREEN}; border:1px dashed rgba(51,255,102,.5); text-shadow:inherit; }
      .app-overlay .blocks-view:hover{ background:${GREEN}; color:#000; text-shadow:none; }`;
    document.head.appendChild(css);

    body.innerHTML = `<canvas class="app-canvas" style="width:100%;height:100%"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");
    const bgCv = document.createElement("canvas"), bg = bgCv.getContext("2d");

    /* ---------- Zustand ---------- */
    let view = ctx.store.get("blocks.view", "phosphor") === "ascii" ? "ascii" : "phosphor";
    let grid, cur, queue, hold, canHold, score, shown, lines, level, combo, b2b;
    let best = ctx.store.get("blocks.best", 0);
    let state = "ready", gen = 0, overT = 0, now = 0;
    let acc = 0, lockT = 0, resets = 0, lowY = 0, lastRot = false;
    let clearing = null;                                   // laufende Reihen-Animation
    const das = { dir: 0, last: 0, t: 0, r: 0 };
    let fx;                                                // Effekte (Funken, Texte, Wackeln …)
    let L = { c: 0 }, SP = null, dpr = 1;                  // Layout und vorgerenderte Blöcke

    const held = (...ks) => ks.some(k => ctx.keys.has(k));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
    const font = (px, w = 500) => `${w} ${Math.round(px)}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;

    /* ---------- Spiellogik ---------- */
    function newBag(){
      const b = TYPES.slice();
      for (let i = b.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      return b;
    }
    function take(){ while (queue.length < 7) queue.push(...newBag()); return queue.shift(); }

    function cellsOf(p, dx = 0, dy = 0, r = p.r){ return ROT[p.t][r].map(([x, y]) => [p.x + x + dx, p.y + y + dy]); }
    function blocked(x, y){ return x < 0 || x >= W || y >= ROWS || (y >= 0 && !!grid[y][x]); }
    function collides(p, dx = 0, dy = 0, r = p.r){ return cellsOf(p, dx, dy, r).some(([x, y]) => blocked(x, y)); }
    const grounded = () => collides(cur, 0, 1);

    // Neues Teil oben ins Brett setzen; wenn kein Platz, notfalls in den Puffer
    function spawn(t){
      const p = { t, r: 0, x: 3, y: t === "I" ? HID - 1 : HID };
      for (let up = 0; collides(p); up++, p.y--) if (up === 2) return null;
      acc = 0; lockT = 0; resets = 0; lowY = p.y; lastRot = false;
      return p;
    }
    function spawnNext(t){
      cur = spawn(t || take()); canHold = true;
      if (!cur) over();
    }

    // Nach erfolgreichem Bewegen/Drehen am Boden: Liegezeit neu starten (begrenzt)
    function touched(){
      if ((lockT > 0 || grounded()) && resets < RESETS){ lockT = 0; resets++; }
    }
    function tryMove(dx){
      if (!cur || collides(cur, dx, 0)) return false;
      cur.x += dx; lastRot = false; touched();
      return true;
    }
    function fall(){
      if (!cur || collides(cur, 0, 1)) return false;
      cur.y++; lastRot = false;
      if (cur.y > lowY){ lowY = cur.y; resets = 0; }
      return true;
    }
    function rotate(dir){
      if (!cur || cur.t === "O") return;
      const from = cur.r, to = (from + dir + 4) % 4;
      for (const [kx, ky] of (cur.t === "I" ? KICK_I : KICK)["" + from + to]){
        if (!collides(cur, kx, ky, to)){
          cur.x += kx; cur.y += ky; cur.r = to; lastRot = true; touched();
          ctx.beep(dir > 0 ? 620 : 560, 18, "square", 0.02);
          return;
        }
      }
    }
    function holdPiece(){
      if (!cur || !canHold) return;
      const t = cur.t;
      cur = spawn(hold || take()); hold = t; canHold = false;
      ctx.beep(520, 40, "triangle", 0.03);
      if (!cur) over();
    }
    function dropDist(){ let d = 0; while (!collides(cur, 0, d + 1)) d++; return d; }
    function hardDrop(){
      const d = dropDist();
      if (d > 0){
        // Leuchtspur von der alten zur neuen Position, je Spalte
        const cols = {};
        for (const [x, y] of cellsOf(cur)) cols[x] = Math.min(cols[x] ?? 99, y);
        for (const x in cols) fx.trail.push({ x: +x, y0: cols[x], y1: cols[x] + d, col: COL[cur.t], t: 0 });
        cur.y += d; lastRot = false; score += 2 * d;
      }
      fx.shake = Math.max(fx.shake, 2.5);
      ctx.beep(140, 60, "triangle", 0.045);
      lock();
    }

    function lock(){
      const cs = cellsOf(cur);
      // Teil liegt komplett im Puffer (oder darüber) = Spielende
      if (cs.some(([, y]) => y < 0) || cs.every(([, y]) => y < HID)) return over();
      // T-Spin: T-Teil, zuletzt gedreht, drei der vier Ecken belegt
      let tspin = false;
      if (cur.t === "T" && lastRot){
        let n = 0;
        for (const [cx, cy] of [[0,0],[2,0],[0,2],[2,2]]) if (blocked(cur.x + cx, cur.y + cy)) n++;
        tspin = n >= 3;
      }
      for (const [x, y] of cs) grid[y][x] = cur.t;
      fx.flash = { cells: cs, t: 0 };

      const full = [];
      for (let y = 0; y < ROWS; y++) if (grid[y].every(Boolean)) full.push(y);
      const n = full.length;

      // Punkte (angelehnt an die üblichen Regeln)
      let pts = tspin ? [400, 800, 1200, 1600][n] : [0, 100, 300, 500, 800][n];
      const tags = [];
      if (tspin) tags.push("T-SPIN");
      if (n){
        const hardOne = n === 4 || tspin;
        if (hardOne && b2b){ pts *= 1.5; tags.push("B2B"); }
        b2b = hardOne;
        combo++;
        if (combo > 0){ pts += 50 * combo; tags.push(`COMBO ×${combo + 1}`); }
      } else combo = -1;
      pts = Math.round(pts * level);
      score += pts;

      if (n){
        const midY = full.reduce((a, b) => a + b, 0) / n;
        if (pts) popup("+" + pts, midY, n === 4 ? AMBER : BRIGHT, 0.8);
        const name = ["", "", "DOPPEL", "TRIPEL", "QUAD"][n];
        if (name && n < 4) tags.unshift(name);
        if (tags.length) popup(tags.join(" · "), midY + 1.1, tspin ? COL.T : GREEN, 0.5);
        clearing = { rows: full, set: new Set(full), t: 0, dur: n === 4 ? 520 : 340 };
        sparks(full);
        if (n === 4){
          banner("Q U A D", "4 Reihen auf einmal", AMBER);
          fx.shake = 7; fx.pulse = 1;
          [1046, 1318, 1568].forEach((f, i) => ctx.after(i * 70, () => ctx.beep(f, 140, "square", 0.03)));
          ctx.log("OK", `blocks: <span class="ok">QUAD</span> — 4 Reihen auf einmal`);
        } else ctx.beep(tspin ? 740 : 880 + n * 110, 90, "square", 0.03);

        lines += n;
        const nl = Math.max(START_LV, 1 + Math.floor(lines / 10));
        if (nl > level){
          level = nl;
          if (n < 4) banner(`L E V E L  ${level}`, "schneller!", AMBER);
          fx.pulse = 1;
          ctx.after(160, () => { ctx.beep(880, 60, "square", 0.025); ctx.after(70, () => ctx.beep(1320, 90, "square", 0.025)); });
        }
        cur = null;
      } else {
        if (tspin){ popup("T-SPIN +" + pts, cur.y + 1, COL.T, 0.6); ctx.beep(740, 60, "square", 0.025); }
        else ctx.beep(180, 35, "triangle", 0.035);
        spawnNext();
      }
    }

    // Nach der Animation: Reihen entfernen, Rest rutscht nach
    function finishClear(){
      for (const y of clearing.rows.slice().sort((a, b) => a - b)){ grid.splice(y, 1); grid.unshift(Array(W).fill(0)); }
      clearing = null;
      if (grid.every(r => r.every(v => !v))){
        const bonus = 1000 * level; score += bonus;
        banner("A L L  C L E A R", "+" + bonus, BRIGHT);
      }
      spawnNext();
    }

    function gravity(){
      // klassische Kurve: Sekunden pro Reihe = (0.8 − (L−1)·0.007)^(L−1)
      const l = level - 1;
      return Math.max(16, 1000 * Math.pow(0.8 - l * 0.007, l));
    }

    function update(dt){
      autoShift(dt);
      if (clearing){
        clearing.t += dt;
        if (clearing.t >= clearing.dur) finishClear();
        return;
      }
      if (!cur) return;
      const soft = held("ArrowDown", "s");
      const step = soft ? Math.min(gravity(), SOFT) : gravity();
      if (grounded()){
        acc = 0; lockT += dt;
        if (lockT >= LOCK) lock();
      } else {
        lockT = 0; acc += dt;
        while (acc >= step){
          acc -= step;
          if (!fall()){ acc = 0; break; }
          if (soft) score += 1;
        }
      }
    }

    // Gedrückt halten: nach DAS ms läuft das Teil mit ARR ms pro Feld weiter
    function autoShift(dt){
      const l = held("ArrowLeft", "a"), r = held("ArrowRight", "d");
      const dir = l && r ? das.last : l ? -1 : r ? 1 : 0;
      if (dir !== das.dir){ das.dir = dir; das.t = 0; das.r = 0; return; }
      if (!dir) return;
      das.t += dt;
      if (das.t < DAS) return;
      das.r += dt;
      while (das.r >= ARR){ das.r -= ARR; if (!tryMove(dir)){ das.r = 0; break; } }
    }

    function reset(){
      grid = Array.from({ length: ROWS }, () => Array(W).fill(0));
      queue = []; hold = null;
      score = 0; shown = 0; lines = 0; level = START_LV; combo = -1; b2b = false;
      clearing = null; overT = 0;
      fx = { pop: [], spark: [], trail: [], flash: null, shake: 0, pulse: 0, banner: null };
      spawnNext();
    }

    function over(){
      state = "over"; overT = 0; clearing = null;
      const my = ++gen;
      const record = score > best;
      if (record){ best = score; ctx.store.set("blocks.best", best); ctx.log("OK", `blocks: neuer Highscore <span class="ok">${score}</span>`); }
      [392, 330, 262, 196].forEach((f, i) => ctx.after(i * 130, () => ctx.beep(f, 160, "sawtooth", 0.022)));
      ctx.after(800, () => {
        if (state !== "over" || gen !== my) return;
        overlay(`<div class="big">GAME OVER</div><div>score ${score} · ${lines} reihen · level ${level}</div>` +
          (record ? `<div class="ok">neuer Highscore!</div>` : `<div class="dim">best ${best}</div>`) +
          `<div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
      });
    }

    function begin(){
      if (state === "over"){ if (overT < 600) return; reset(); }
      if (state !== "running"){ state = "running"; overlay(null); }
    }
    function pause(){
      if (state !== "running") return;
      state = "paused";
      overlay(`<div class="big">PAUSE</div><div class="dim">${ctx.touch ? "tippen = weiter" : "P = weiter · V = ansicht"}</div>` + viewBtn());
    }

    /* ---------- Effekte ---------- */
    function popup(text, row, col, scale){
      fx.pop.push({ text, row, col, scale, t: 0, dur: 1100 });
    }
    function banner(text, sub, col){ fx.banner = { text, sub, col, t: 0, dur: 1300 }; }
    function sparks(rows){
      if (RM) return;
      for (const y of rows){
        const n = rows.length === 4 ? 14 : 8;
        for (let i = 0; i < n; i++){
          const x = Math.random() * W;
          fx.spark.push({
            x, y: y - HID + 0.5, vx: (Math.random() - 0.5) * 0.02, vy: -Math.random() * 0.018 - 0.002,
            col: COL[grid[y][Math.min(W - 1, Math.floor(x))]] || GREEN, t: 0, dur: 450 + Math.random() * 400,
          });
        }
      }
      if (fx.spark.length > 300) fx.spark.splice(0, fx.spark.length - 300);
    }
    function tickFx(dt){
      for (const p of fx.pop) p.t += dt;
      fx.pop = fx.pop.filter(p => p.t < p.dur);
      for (const s of fx.spark){ s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 0.00006 * dt; }
      fx.spark = fx.spark.filter(s => s.t < s.dur);
      for (const tr of fx.trail) tr.t += dt;
      fx.trail = fx.trail.filter(tr => tr.t < 240);
      if (fx.flash && (fx.flash.t += dt) > 140) fx.flash = null;
      if (fx.banner && (fx.banner.t += dt) > fx.banner.dur) fx.banner = null;
      fx.shake *= Math.pow(0.5, dt / 60);
      fx.pulse *= Math.pow(0.5, dt / 260);
      shown += (score - shown) * Math.min(1, dt / 120);
      if (Math.abs(score - shown) < 1) shown = score;
    }

    /* ---------- Layout & vorgerenderte Grafik ---------- */
    function size(){
      const w = body.clientWidth, h = body.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      bgCv.width = cv.width; bgCv.height = cv.height;
      const A = view === "ascii";
      // Ränder ums Brett in Zellen: ASCII braucht Platz für <! !> und die zwei Bodenzeilen
      const mx = A ? 1 : 0.35, mt = A ? 0.4 : 0.35, mb = A ? 2.2 : 0.35, side = 5.6, gap = 0.9;
      const need = H + mt + mb;
      const c3 = Math.min(h / need, w / (W + 2 * mx + 2 * (side + gap)));   // Halten links, Rest rechts
      const c2 = Math.min(h / need, w / (W + 2 * mx + side + gap));         // alles rechts (schmale Schirme)
      const cT = Math.min(h / (need + TOP), w / (W + 2 * mx));              // Halten/Vorschau als Leiste oben (Handy hochkant)
      const mode = c3 >= c2 * 0.96 && c3 >= cT ? "three" : c2 >= cT ? "two" : "top";
      const c = clamp(Math.floor(mode === "three" ? c3 : mode === "two" ? c2 : cT), 8, 42);
      let bx, by, ox = 0;
      if (mode === "top"){
        bx = Math.round((w - (W + 2 * mx) * c) / 2 + mx * c);
        by = Math.round((h - (need + TOP) * c) / 2 + (TOP + mt) * c);
      } else {
        const total = (W + 2 * mx + (mode === "three" ? 2 : 1) * (side + gap)) * c;
        ox = Math.round((w - total) / 2);
        bx = ox + (mode === "three" ? (side + gap) * c : 0) + mx * c;
        by = Math.round((h - need * c) / 2 + mt * c);
      }
      L = { w, h, c, mode, bx, by, mb, side: side * c, lx: ox, rx: bx + (W + mx + gap) * c, sy: by - (TOP + mt) * c };
      buildSprites(); buildBg(); drawBar();
    }

    // Kleine Leinwand in Gerätepixeln
    function mk(wpx, draw){
      const s = document.createElement("canvas");
      s.width = s.height = Math.max(1, Math.ceil(wpx * dpr));
      const x = s.getContext("2d"); x.scale(dpr, dpr); draw(x);
      return s;
    }
    function buildSprites(){
      const c = L.c, A = view === "ascii";
      SP = { core: {}, live: {}, ghost: {}, glow: A ? null : {} };
      if (A){
        // ASCII: "[]"-Glyphen mit eigenem schwarzen Grund (verdeckt die Punkte darunter)
        const p = Math.ceil(c * 0.3), fs = c / 1.2;
        const txt = (s, col, blur) => ({ pad: p, cv: mk(c + 2 * p, x => {
          x.fillStyle = "#000"; x.fillRect(p, p, c, c);
          x.font = font(fs, 500); x.textAlign = "center"; x.textBaseline = "middle";
          x.fillStyle = col; x.shadowColor = col; x.shadowBlur = blur;
          x.fillText(s, p + c / 2, p + c / 2 + c * 0.03);
        }) });
        const lockS = txt("[]", GREEN, 4), liveS = txt("[]", BRIGHT, 7), ghostS = txt("::", DIM, 0);
        for (const t of TYPES){ SP.core[t] = lockS; SP.live[t] = liveS; SP.ghost[t] = ghostS; }
        SP.core.X = txt("[]", "#1f5a30", 0);
        SP.core.F = txt("[]", "#eaffef", 10);
        return;
      }
      // Phosphor: getönter Block mit hellem Rand, Glanzkante und Kern
      const block = (col, flat) => ({ pad: 0, cv: mk(c, x => {
        const i = Math.max(1, c * 0.06), s = c - 2 * i, lw = Math.max(1, c * 0.07);
        const gr = x.createLinearGradient(i, i, c - i, c - i);
        gr.addColorStop(0, rgba(col, flat ? 0.35 : 0.62)); gr.addColorStop(1, rgba(col, flat ? 0.15 : 0.2));
        x.fillStyle = gr; x.fillRect(i, i, s, s);
        x.lineWidth = lw; x.strokeStyle = flat ? rgba(col, 0.6) : col;
        x.strokeRect(i + lw / 2, i + lw / 2, s - lw, s - lw);
        if (flat) return;
        x.fillStyle = "rgba(255,255,255,.5)"; x.fillRect(i + lw, i + lw, s - 2 * lw, Math.max(1, c * 0.07));
        x.fillStyle = "rgba(255,255,255,.22)"; x.fillRect(i + lw, i + lw, Math.max(1, c * 0.07), s - 2 * lw);
        x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(i + lw, c - i - lw - Math.max(1, c * 0.07), s - 2 * lw, Math.max(1, c * 0.07));
        const k = c * 0.3; x.fillStyle = rgba(col, 0.55); x.fillRect((c - k) / 2, (c - k) / 2, k, k);
      }) });
      const glow = col => { const p = Math.ceil(c * 0.6); return { pad: p, cv: mk(c + 2 * p, x => {
        x.shadowColor = col; x.shadowBlur = c * 0.55; x.fillStyle = rgba(col, 0.5);
        x.fillRect(p + c * 0.15, p + c * 0.15, c * 0.7, c * 0.7);
      }) }; };
      const ghost = col => ({ pad: 0, cv: mk(c, x => {
        const i = Math.max(1, c * 0.1);
        x.fillStyle = rgba(col, 0.07); x.fillRect(i, i, c - 2 * i, c - 2 * i);
        x.strokeStyle = rgba(col, 0.45); x.lineWidth = 1; x.setLineDash([Math.max(2, c * 0.15), Math.max(2, c * 0.1)]);
        x.strokeRect(i + 0.5, i + 0.5, c - 2 * i - 1, c - 2 * i - 1);
      }) });
      for (const t of TYPES){ SP.core[t] = SP.live[t] = block(COL[t]); SP.glow[t] = glow(COL[t]); SP.ghost[t] = ghost(COL[t]); }
      SP.core.X = block("#2c6b3e", true);
      SP.core.F = block("#eaffef"); SP.glow.F = glow("#d8ffe0");
    }

    // Brett-Hintergrund (Rahmen, Raster bzw. <! . . !>) nur bei Größenänderung zeichnen
    function buildBg(){
      const { c, bx, by } = L, b = bg;
      b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, L.w, L.h);
      if (view === "ascii"){
        b.font = font(c / 1.2, 500); b.textAlign = "center"; b.textBaseline = "middle";
        const put = (s, cx, row, col, blur) => { b.fillStyle = col; b.shadowColor = col; b.shadowBlur = blur; b.fillText(s, cx, by + row * c + c / 2 + c * 0.03); };
        for (let y = 0; y < H; y++){
          put("<!", bx - c / 2, y, DIM, 3); put("!>", bx + W * c + c / 2, y, DIM, 3);
          for (let x = 0; x < W; x++) put(" .", bx + x * c + c / 2, y, rgba(GREEN, 0.35), 0);
        }
        put("<!", bx - c / 2, H, DIM, 3); put("!>", bx + W * c + c / 2, H, DIM, 3);
        for (let x = 0; x < W; x++){ put("==", bx + x * c + c / 2, H, DIM, 3); put("\\/", bx + x * c + c / 2, H + 1, DIM, 3); }
        return;
      }
      b.fillStyle = "rgba(51,255,102,.035)"; b.fillRect(bx, by, W * c, H * c);
      b.strokeStyle = "rgba(51,255,102,.06)"; b.lineWidth = 1; b.beginPath();
      for (let x = 1; x < W; x++){ b.moveTo(Math.round(bx + x * c) + 0.5, by); b.lineTo(Math.round(bx + x * c) + 0.5, by + H * c); }
      for (let y = 1; y < H; y++){ b.moveTo(bx, Math.round(by + y * c) + 0.5); b.lineTo(bx + W * c, Math.round(by + y * c) + 0.5); }
      b.stroke();
      const f = c * 0.2;
      b.shadowColor = GREEN; b.shadowBlur = 10; b.strokeStyle = "rgba(51,255,102,.55)"; b.lineWidth = 1.5;
      b.strokeRect(bx - f, by - f, W * c + 2 * f, H * c + 2 * f);
      // Eckmarken wie bei einem Sucher
      b.strokeStyle = BRIGHT; b.lineWidth = 2; const m = c * 0.7;
      for (const [x0, y0, sx, sy] of [[bx - f, by - f, 1, 1], [bx + W * c + f, by - f, -1, 1], [bx - f, by + H * c + f, 1, -1], [bx + W * c + f, by + H * c + f, -1, -1]]){
        b.beginPath(); b.moveTo(x0, y0 + sy * m); b.lineTo(x0, y0); b.lineTo(x0 + sx * m, y0); b.stroke();
      }
    }

    /* ---------- Zeichnen ---------- */
    function drawSpr(s, px, py, sz, a){
      if (!s || a <= 0) return;
      const p = s.pad * sz / L.c, d = sz + 2 * p;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(s.cv, px - p, py - p, d, d);
    }

    function render(){
      const { c, bx, by } = L;
      if (!c || !SP) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1; g.shadowBlur = 0;
      g.clearRect(0, 0, L.w, L.h);
      const sh = RM ? 0 : fx.shake;
      g.save();
      if (sh > 0.3) g.translate((Math.random() - 0.5) * 2 * sh, (Math.random() - 0.5) * 2 * sh);
      g.drawImage(bgCv, 0, 0, L.w, L.h);

      // Rahmen leuchtet bei Level-Up / QUAD, rot pulsierend wenn es eng wird
      const danger = state === "running" && grid.slice(HID, HID + 4).some(r => r.some(Boolean));
      const f = view === "ascii" ? c * 0.05 : c * 0.2;
      if (fx.pulse > 0.02 || danger){
        g.lineWidth = 2;
        if (danger){ g.strokeStyle = rgba(RED, 0.25 + 0.2 * Math.sin(now / 180)); g.shadowColor = RED; g.shadowBlur = 12; g.strokeRect(bx - f, by - f, W * c + 2 * f, H * c + 2 * f); }
        if (fx.pulse > 0.02){ g.strokeStyle = rgba(AMBER, fx.pulse); g.shadowColor = AMBER; g.shadowBlur = 24 * fx.pulse; g.strokeRect(bx - f, by - f, W * c + 2 * f, H * c + 2 * f); }
        g.shadowBlur = 0;
      }

      // Alle Zellen sammeln, dann erst Leuchten, dann Blöcke zeichnen
      const ops = [];
      const curtain = state === "over" ? Math.floor(overT / 26) : 0;
      for (let y = HID; y < ROWS; y++){
        const py = by + (y - HID) * c;
        if (y >= ROWS - curtain){ for (let x = 0; x < W; x++) ops.push({ t: "X", px: bx + x * c, py, sz: c, a: 1, kind: "core" }); continue; }
        for (let x = 0; x < W; x++){
          const v = grid[y][x];
          if (!v) continue;
          const px = bx + x * c;
          if (clearing && clearing.set.has(y)){
            // erst aufblitzen, dann von der Mitte nach außen auflösen
            const p = clearing.t / clearing.dur;
            if (p < 0.35) ops.push({ t: Math.floor(clearing.t / 55) % 2 ? v : "F", px, py, sz: c, a: 1, kind: "core" });
            else {
              const q = clamp(((p - 0.35) / 0.65) * 1.7 - (Math.abs(x - 4.5) / 4.5) * 0.7, 0, 1);
              const sz = c * (1 - q);
              ops.push({ t: "F", px: px + (c - sz) / 2, py: py + (c - sz) / 2, sz, a: 1 - q * 0.6, kind: "core" });
            }
          } else ops.push({ t: v, px, py, sz: c, a: 0.92, kind: "core" });
        }
      }
      if (cur && state !== "over"){
        if (state === "running"){
          const d = dropDist();
          if (d > 0) for (const [x, y] of cellsOf(cur, 0, d)) if (y >= HID) ops.push({ t: cur.t, px: bx + x * c, py: by + (y - HID) * c, sz: c, a: 1, kind: "ghost" });
        }
        // kurz vor dem Einrasten leicht flackern
        const blink = lockT > LOCK * 0.6 && Math.floor(now / 60) % 2 ? 0.7 : 1;
        for (const [x, y] of cellsOf(cur)) if (y >= HID) ops.push({ t: cur.t, px: bx + x * c, py: by + (y - HID) * c, sz: c, a: blink, kind: "live" });
      }
      if (SP.glow){
        for (const o of ops) if (o.kind !== "ghost") drawSpr(SP.glow[o.t], o.px, o.py, o.sz, o.a * (o.kind === "live" ? 0.6 : 0.35));
      }
      for (const o of ops) drawSpr(SP[o.kind][o.t], o.px, o.py, o.sz, o.a);
      // frisch eingerastete Teile blitzen kurz auf
      if (fx.flash && state !== "over"){
        const a = (1 - fx.flash.t / 140) * 0.7;
        for (const [x, y] of fx.flash.cells) if (y >= HID && grid[y][x]) drawSpr(SP.core.F, bx + x * c, by + (y - HID) * c, c, a);
      }
      g.globalAlpha = 1;

      // Leuchtspur vom harten Fallenlassen
      for (const tr of fx.trail){
        const a = 1 - tr.t / 240, top = by + Math.max(0, tr.y0 - HID) * c, bot = by + (tr.y1 - HID) * c;
        if (bot <= top) continue;
        const gr = g.createLinearGradient(0, top, 0, bot);
        gr.addColorStop(0, rgba(tr.col, 0)); gr.addColorStop(1, rgba(view === "ascii" ? GREEN : tr.col, 0.35 * a));
        g.fillStyle = gr; g.fillRect(bx + tr.x * c + c * 0.2, top, c * 0.6, bot - top);
      }
      // Funken
      for (const s of fx.spark){
        g.globalAlpha = 1 - s.t / s.dur; g.fillStyle = view === "ascii" ? BRIGHT : s.col;
        const z = Math.max(1.5, c * 0.12);
        g.fillRect(bx + s.x * c - z / 2, by + s.y * c - z / 2, z, z);
      }
      g.globalAlpha = 1;
      // aufsteigende Punkte/Texte
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const p of fx.pop){
        const k = p.t / p.dur, a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        const tx = bx + W * c / 2, ty = by + (p.row - HID + 0.5) * c - k * c * 1.6;
        g.globalAlpha = a; g.font = font(c * p.scale, 600);
        // dunkler Rand, damit die Zahl auch über bunten Blöcken lesbar bleibt
        g.shadowBlur = 0; g.lineWidth = Math.max(2, c * 0.14); g.lineJoin = "round"; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(p.text, tx, ty);
        g.fillStyle = p.col; g.shadowColor = p.col; g.shadowBlur = 8; g.fillText(p.text, tx, ty);
      }
      // großes Banner (QUAD, LEVEL …)
      if (fx.banner){
        const B = fx.banner, k = B.t / B.dur;
        const a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25, sc = k < 0.12 ? 1.35 - (k / 0.12) * 0.35 : 1;
        const cx = bx + W * c / 2, cy = by + H * c * 0.38;
        g.globalAlpha = a * 0.6; g.fillStyle = "#000"; g.fillRect(bx, cy - c * 1.3, W * c, c * 2.6);
        g.globalAlpha = a; g.font = font(Math.min(c * 1.1, (W * c) / (B.text.length * 0.62)) * sc, 600);
        g.fillStyle = B.col; g.shadowColor = B.col; g.shadowBlur = 18; g.fillText(B.text, cx, cy - c * 0.25);
        g.font = font(c * 0.5, 400); g.shadowBlur = 6; g.fillText(B.sub, cx, cy + c * 0.75);
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
      g.restore();

      // Seitenleisten (wackeln nicht mit)
      if (L.mode === "three"){ panel(L.lx, ["hold", "stats"]); panel(L.rx, ["next", "keys"]); }
      else if (L.mode === "two") panel(L.rx, ["hold", "next", "stats", "keys"]);
      else {
        // Leiste oben: Halten links, Vorschau rechts, Punkte in der Statuszeile
        const c = L.c;
        PANEL.hold(L.bx, L.sy, 3.2 * c, c);
        PANEL.nextRow(L.bx + W * c - 6.2 * c, L.sy, 6.2 * c, c);
        drawBar();
      }
    }

    /* ---------- Seitenleiste ---------- */
    const PH = { hold: 3.05, next: 5.65, stats: 4.2, keys: 5.6 };   // Höhen in Zellen
    const TOP = 3.4;                                                  // Höhe der Leiste oben (Modus "top")
    const HELP = [["← →", "bewegen"], ["↑ X", "drehen ↻"], ["Z Y", "drehen ↺"], ["↓", "schneller"], ["SPACE", "fallen"], ["C ⇧", "halten"], ["P", "pause"], ["V", "ansicht"]];

    function panel(x, items){
      const c = L.c, bottom = L.by + (H + L.mb) * c;
      let y = L.by;
      for (const it of items){
        if (it === "keys" && (ctx.touch || c < 15)) continue;
        if (y + PH[it] * c > bottom) break;
        PANEL[it](x, y, L.side, c);
        y += (PH[it] + 0.5) * c;
      }
    }
    function label(s, x, y, c){
      g.font = font(clamp(c * 0.5, 9, 13), 400); g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = DIM; g.shadowColor = GREEN; g.shadowBlur = 0; g.globalAlpha = 1;
      g.fillText(s, x, y);
    }
    function box(x, y, w, h){
      g.globalAlpha = 1; g.strokeStyle = "rgba(51,255,102,.35)"; g.lineWidth = 1;
      g.setLineDash([3, 3]); g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1); g.setLineDash([]);
    }
    function mini(t, cx, cy, m, a){
      const cs = ROT[t][0];
      const x0 = Math.min(...cs.map(p => p[0])), x1 = Math.max(...cs.map(p => p[0]));
      const y0 = Math.min(...cs.map(p => p[1])), y1 = Math.max(...cs.map(p => p[1]));
      const ox = cx - (x1 - x0 + 1) * m / 2 - x0 * m, oy = cy - (y1 - y0 + 1) * m / 2 - y0 * m;
      if (SP.glow) for (const [x, y] of cs) drawSpr(SP.glow[t], ox + x * m, oy + y * m, m, a * 0.45);
      for (const [x, y] of cs) drawSpr(SP.live[t], ox + x * m, oy + y * m, m, a);
      g.globalAlpha = 1;
    }
    const PANEL = {
      hold(x, y, w, c){
        label("HOLD", x, y, c);
        const by = y + 0.75 * c, h = 2.3 * c;
        box(x, by, w, h);
        if (hold) mini(hold, x + w / 2, by + h / 2, c * 0.6, canHold ? 1 : 0.3);
      },
      next(x, y, w, c){
        label("NEXT", x, y, c);
        const by = y + 0.75 * c;
        box(x, by, w, 4.9 * c);
        queue.slice(0, 3).forEach((t, i) => {
          const cy = i === 0 ? by + 0.95 * c : by + 1.9 * c + (i - 0.5) * 1.5 * c;
          mini(t, x + w / 2, cy, c * (i ? 0.46 : 0.62), i ? 0.75 : 1);
        });
      },
      nextRow(x, y, w, c){
        label("NEXT", x, y, c);
        const by = y + 0.75 * c, h = 2.3 * c, sw = w / 3;
        box(x, by, w, h);
        queue.slice(0, 3).forEach((t, i) => mini(t, x + sw * (i + 0.5), by + h / 2, c * (i ? 0.4 : 0.48), i ? 0.75 : 1));
      },
      stats(x, y, w, c){
        label("SCORE", x, y, c);
        g.font = font(clamp(c * 0.85, 12, 26), 600); g.fillStyle = BRIGHT; g.shadowColor = GREEN; g.shadowBlur = 8;
        g.fillText(String(Math.round(shown)).padStart(6, "0"), x, y + 0.65 * c);
        g.shadowBlur = 0;
        const rows = [["LINES", lines], ["LEVEL", level], ["BEST", Math.max(best, score)]];
        rows.forEach(([k, v], i) => {
          const ry = y + (1.85 + i * 0.8) * c;
          label(k, x, ry, c);
          g.font = font(clamp(c * 0.55, 10, 15), 500); g.textAlign = "right";
          g.fillStyle = k === "LEVEL" && fx.pulse > 0.05 ? AMBER : GREEN; g.shadowBlur = 4;
          g.fillText(String(v), x + w, ry - 1);
          g.textAlign = "left"; g.shadowBlur = 0;
        });
      },
      keys(x, y, w, c){
        label("TASTEN", x, y, c);
        const fs = clamp(c * 0.44, 9, 12);
        HELP.forEach(([k, v], i) => {
          const ry = y + (0.75 + i * 0.6) * c;
          g.font = font(fs, 500); g.fillStyle = GREEN; g.textAlign = "left"; g.fillText(k, x, ry);
          g.font = font(fs, 400); g.fillStyle = DIM; g.fillText(v, x + fs * 3.9, ry);
        });
      },
    };

    /* ---------- Overlay, Statuszeile, Ansicht ---------- */
    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }
    const viewBtn = () => `<button type="button" class="blocks-view">ansicht: ${view === "ascii" ? "ascii (1984)" : "phosphor"} ⇄</button>`;
    let barHtml = "";
    function drawBar(){
      let html;
      if (L.mode === "top" && grid){
        // schmaler Schirm: Punkte stehen oben in der Statuszeile
        html = `<span>score <b>${String(Math.round(shown)).padStart(6, "0")}</b></span><span>lines <b>${lines}</b></span>` +
          `<span>lv <b>${level}</b></span><span class="right">best <b>${Math.max(best, score)}</b></span>`;
      } else {
        html = `<span>blocks <b>v2.0</b></span>` + (ctx.touch
          ? `<span class="right">tippen = drehen · wischen = bewegen</span>`
          : `<span>ansicht <b>${view}</b></span><span class="right">V = ansicht · P = pause · ESC = exit</span>`);
      }
      if (html !== barHtml) bar.innerHTML = barHtml = html;
    }
    function toggleView(){
      view = view === "ascii" ? "phosphor" : "ascii";
      ctx.store.set("blocks.view", view);
      size();
      const b = ov.querySelector(".blocks-view");
      if (b) b.outerHTML = viewBtn();
    }
    // Knopf im Overlay: darf nicht als "Tippen = Start" durchgehen
    ov.addEventListener("pointerdown", e => { if (e.target.closest(".blocks-view")) e.stopPropagation(); });
    ov.addEventListener("click", e => { if (e.target.closest(".blocks-view")){ e.stopPropagation(); toggleView(); } });

    drawBar();
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft", aria: "Links" }, { label: "↻", key: "ArrowUp", aria: "Drehen" },
      { label: "▶", key: "ArrowRight", aria: "Rechts" }, { label: "▼", key: "ArrowDown", aria: "Schneller" },
      { label: "⤓", key: " ", aria: "Fallen lassen" }, { label: "hold", key: "c", aria: "Halten" },
    ]);
    ctx.swipe(body, () => { if (state === "running") rotate(1); else begin(); });

    const onResize = () => size();
    addEventListener("resize", onResize);
    const ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(body);
    // Tab im Hintergrund = Pause
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVis);
    // Schrift für die ASCII-Ansicht erst nach dem Laden sicher verfügbar
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ctx.alive) size(); });

    ctx.loop((dt, t) => {
      dt = Math.min(dt, 50); now = t;
      if (state === "running") update(dt);
      if (state !== "paused") tickFx(dt); else shown = score;
      if (state === "over") overT += dt;
      render();
    });

    reset();
    size();
    overlay(`<div class="big">B L O C K S</div><div>volle Reihen verschwinden</div><div>4 auf einmal = QUAD</div>` +
      (ctx.touch
        ? `<div class="dim">tippen = drehen · wischen/◀ ▶ = bewegen</div><div class="dim">⤓ = fallen · hold = halten</div><div>tippen zum Start</div>`
        : `<div class="dim">← → bewegen · ↑ drehen · ↓ schneller · SPACE fallen · C halten</div><div class="dim">ENTER = start · P = pause · V = ansicht</div>`) +
      viewBtn());

    return {
      stop(){
        removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        if (ro) ro.disconnect();
        css.remove();
      },
      key(e){
        const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
        if (lk === "v"){ if (!e.repeat) toggleView(); return true; }
        if (lk === "q"){ ctx.exit(); return true; }
        if (state !== "running"){
          if (k === "Enter" || k === " " || (state === "ready" && k.startsWith("Arrow")) || (state === "paused" && lk === "p")){
            if (!e.repeat) begin();
            return true;
          }
          return false;
        }
        if (lk === "p"){ pause(); return true; }
        const act = {
          ArrowLeft: "L", a: "L", ArrowRight: "R", d: "R",
          ArrowUp: "CW", w: "CW", x: "CW", z: "CCW", y: "CCW",
          ArrowDown: "SD", s: "SD", " ": "HD", c: "HOLD", Shift: "HOLD",
        }[lk];
        if (!act) return false;
        if (e.repeat) return true;          // Wiederholung macht die Schleife (DAS)
        if (act === "L" || act === "R"){
          const d = act === "L" ? -1 : 1;
          das.dir = das.last = d; das.t = 0; das.r = 0;
          tryMove(d);
          return true;
        }
        if (!cur || clearing) return true;
        if (act === "CW") rotate(1);
        else if (act === "CCW") rotate(-1);
        else if (act === "SD"){ if (fall()){ score += 1; acc = 0; } }
        else if (act === "HD") hardDrop();
        else if (act === "HOLD") holdPiece();
        return true;
      },
    };
  },
});
