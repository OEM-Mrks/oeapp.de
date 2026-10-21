/* race — Pseudo-3D-Rennen im Neon-Look: OutRun trifft Synthwave, auf einem
   grünen Röhrenmonitor. Die Strecke besteht aus kurzen Segmenten mit Kurve
   und Höhe. Gezeichnet wird von hinten nach vorne (Maler-Prinzip): jedes
   Segment füllt seinen Boden über die volle Breite, dadurch verdecken nähere
   Kuppen automatisch alles dahinter – auch Palmen, Laternen und Gegner.
   Checkpoints bringen Zeit. Alles ist Canvas-Code, keine Bilddateien. */

OE.register({
  id: "race",
  alias: ["racer", "drive"],
  title: "race.exe",
  desc: "Autorennen in Pseudo-3D. Überholen, Checkpoints, Zeit.",
  start(ctx){
    const SEG = 200, ROAD = 2000, CAM_H = 1000, FOV = 100;
    const DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
    const MAX = SEG * 60, ACC = MAX / 5, BRAKE = -MAX, DECEL = -MAX / 5, OFF_DECEL = -MAX / 2, OFF_MAX = MAX / 4;
    const CHECK_EVERY = 700, BONUS = 12;   // Segmente zwischen zwei Checkpoints (ungefähr), Zeitbonus
    const KM = 154000;                      // Streckeneinheiten pro km (MAX entspricht 280 km/h)
    const CAR = 0.15;                       // halbe Autobreite in Straßenbreiten
    const LANES = 3, RUMBLE = 1.12;         // Fahrspuren, Straßenbreite inkl. Randstreifen
    const PLAYER_Z = CAM_H * DEPTH;         // Abstand Kamera → eigenes Auto
    const TAU = Math.PI * 2;
    const C = { green: "#33ff66", dim: "#1a8a36", pale: "#a6ffb8", bright: "#c8ffd4", amber: "#ffb454", red: "#ff5a5a", pink: "#ff7ad9" };
    const FONT = '"IBM Plex Mono", monospace';
    let DRAW = 160;                         // Sichtweite in Segmenten (sinkt bei schwacher Hardware)
    let lowQ = false;                       // Sparmodus: kein Leuchten, weniger Linien

    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lerp = (a, b, t) => a + (b - a) * t;
    const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    // kleiner Zufallsgenerator mit Startwert, damit Kulissen bei jeder Größe gleich aussehen
    const seeded = seed => () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas" style="width:100%;height:100%;touch-action:none"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");
    ov.style.background = "rgba(0,0,0,.5)";

    /* ---------- Strecke ---------- */
    const segs = [];
    const lastY = () => segs.length ? segs[segs.length - 1].p2.y : 0;
    function addSeg(curve, y){
      const n = segs.length;
      segs.push({ i: n, curve, p1: { y: lastY(), z: n * SEG }, p2: { y, z: (n + 1) * SEG }, sp: null, cp: false,
        ax: 0, ay: 0, aw: 0, bx: 0, by: 0, bw: 0, n: 0, fr: -1, fog: 0, fi: 0, road: false });
    }
    const ease = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
    function addRoad(enter, hold, leave, curve, height){
      const y0 = lastY(), y1 = y0 + height * SEG, total = enter + hold + leave;
      for (let n = 0; n < enter; n++) addSeg(ease(0, curve, n / enter), ease(y0, y1, n / total));
      for (let n = 0; n < hold; n++) addSeg(curve, ease(y0, y1, (enter + n) / total));
      for (let n = 0; n < leave; n++) addSeg(ease(curve, 0, n / leave), ease(y0, y1, (enter + hold + n) / total));
    }
    addRoad(30, 40, 30, 0, 0);
    const R = () => ctx.rint(0, 1) ? 1 : -1;
    for (let i = 0; i < 18; i++){
      const kind = i % 3;
      const curve = kind === 0 ? 0 : R() * (2 + Math.random() * 4);
      const hill = (Math.random() - 0.5) * (i % 2 ? 60 : 20);
      addRoad(25, 30 + ctx.rint(0, 50), 25, curve, hill);
    }
    addRoad(40, 40, 40, 0, -lastY() / SEG);   // zurück auf Höhe 0, damit die Runde nahtlos ist
    const N = segs.length, LEN = N * SEG;
    const segAt = z => segs[Math.floor((((z % LEN) + LEN) % LEN) / SEG)];

    /* ---------- Kulisse am Straßenrand ---------- */
    // Checkpoints gleichmäßig verteilen, damit nie zwei Tore direkt hintereinander stehen
    const nCp = Math.max(1, Math.round(N / CHECK_EVERY)), cpStep = N / nCp;
    const put = (s, sp) => (s.sp || (s.sp = [])).push(sp);
    for (let k = 0; k < nCp; k++){
      const s = segs[Math.floor(k * cpStep)];
      s.cp = true; put(s, { kind: "gate", off: 0, text: k ? "CHECKPOINT" : "START" });
    }
    // Segmente bis zum nächsten Checkpoint (für die Fortschrittsanzeige), zweimal wegen Rundenübergang
    const nextCp = new Int32Array(N);
    for (let pass = 0, d = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--){ d = segs[i].cp ? 0 : d + 1; nextCp[i] = d; }
    const nearGate = i => { for (let k = -4; k <= 4; k++) if (segs[(i + k + N) % N].cp) return true; return false; };
    const BOARDS = ["OEAPP.DE", "ESC = EXIT", "VOLLGAS", "sudo gas", "404 BREMSE", "NO SIGNAL", "> run race", "TURBO.EXE"];
    const SOLID = { palm: 0.06, lamp: 0.03, chev: 0.12, board: 0.72 };   // halbe Breite fürs Anfahren
    for (const s of segs){
      const i = s.i;
      if (nearGate(i)) continue;
      const zone = Math.floor(i / 160) % 4;   // 0 Palmenstrand · 1 Stadtrand · 2 Wüste · 3 gemischt
      const lampEvery = zone === 1 ? 12 : 30;
      if (i % lampEvery === 0) put(s, { kind: "lamp", off: (i / lampEvery) % 2 ? 1.28 : -1.28 });
      else if (Math.abs(s.curve) > 1.2 && i % 6 === 0) put(s, { kind: "chev", off: s.curve > 0 ? -1.36 : 1.36, dir: s.curve > 0 ? 1 : -1 });
      if (i % 70 === 35 && zone !== 1) put(s, { kind: "board", off: Math.random() < 0.5 ? -2.2 : 2.2, text: BOARDS[ctx.rint(0, BOARDS.length - 1)] });
      else if (Math.random() < [0.24, 0.05, 0.03, 0.12][zone]){
        const side = Math.random() < 0.5 ? -1 : 1;
        put(s, { kind: "palm", off: side * (1.55 + Math.random() * 2.6), lean: side * (0.08 + Math.random() * 0.2), hgt: 0.95 + Math.random() * 0.45 });
      }
    }

    /* ---------- Farben mit Nebel (vorberechnet, damit pro Bild keine Strings entstehen) ---------- */
    const FL = 24, FOG = [5, 34, 15];
    const lut = c => Array.from({ length: FL }, (_, k) => rgb(mix(c, FOG, k / (FL - 1))));
    const L = {
      groundA: lut([2, 9, 4]), groundB: lut([4, 15, 7]),
      roadA: lut([13, 21, 16]), roadB: lut([18, 28, 21]),
      rumbleA: lut([36, 190, 80]), rumbleB: lut([5, 26, 12]),
      lane: lut([166, 255, 184]), edge: lut([90, 255, 140]), grid: lut([18, 105, 44]), check: lut([255, 180, 84]),
    };
    const GRID_X = [1.6, 2.4, 3.5, 5, 7.2, 10.5];   // Längslinien des Bodengitters (in halben Straßenbreiten)

    // Verläufe in Einheiten-Koordinaten: gelten für jedes skalierte Auto/Objekt
    const glassGrad = g.createLinearGradient(0, -0.8, 0, -0.45);
    glassGrad.addColorStop(0, "rgba(166,255,184,.30)"); glassGrad.addColorStop(1, "rgba(166,255,184,.04)");
    const lightGrad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    lightGrad.addColorStop(0, "rgba(255,90,90,1)"); lightGrad.addColorStop(1, "rgba(255,90,90,0)");
    const underGrad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    underGrad.addColorStop(0, "rgba(51,255,102,.45)"); underGrad.addColorStop(1, "rgba(51,255,102,0)");
    const coneGrad = g.createLinearGradient(0, -1.05, 0, 0);
    coneGrad.addColorStop(0, "rgba(255,180,84,.22)"); coneGrad.addColorStop(1, "rgba(255,180,84,0)");

    /* ---------- Größe und vorgezeichnete Hintergründe ---------- */
    let w = 0, h = 0, dpr = 1, HZ = 0, HY = 0;
    let skyC = null, sunC = null, mtnC = null, cityC = null, groundGrad = null, hazeGrad = null;
    let sunR = 0, mtnW = 0, mtnH = 0, cityW = 0, cityH = 0;

    function layer(lw, lh){
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(lw * dpr)); c.height = Math.max(1, Math.ceil(lh * dpr));
      const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [c, x];
    }

    function size(force){
      const nd = Math.min(window.devicePixelRatio || 1, lowQ ? 1.25 : 2);
      const nw = Math.max(1, body.clientWidth), nh = Math.max(1, body.clientHeight);
      if (!force && nw === w && nh === h && nd === dpr) return;
      w = nw; h = nh; dpr = nd;
      // Höhenmaßstab der Projektion: im Hochformat begrenzt, sonst wirkt die Straße steil wie eine Rampe
      HY = Math.min(h / 2, w * 0.7); HZ = h - HY;   // HZ = Horizont, das eigene Auto steht unten am Rand
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop();
    }

    function backdrop(){
      const rnd = seeded(7);
      // Himmel: Schwarz oben, grünes Leuchten am Horizont, ein paar Sterne
      let x;
      [skyC, x] = layer(w, HZ + 2);
      const sky = x.createLinearGradient(0, 0, 0, HZ);
      sky.addColorStop(0, "#000000"); sky.addColorStop(0.55, "#020b05"); sky.addColorStop(0.86, "#06260f"); sky.addColorStop(1, "#11502a");
      x.fillStyle = sky; x.fillRect(0, 0, w, HZ + 2);
      const stars = Math.min(160, (w * HZ / 2500) | 0);
      for (let k = 0; k < stars; k++){
        const sx = rnd() * w, sy = rnd() * HZ * 0.7, b = rnd();
        x.fillStyle = `rgba(200,255,212,${0.15 + b * 0.6})`;
        x.fillRect(sx, sy, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1);
      }

      // Retro-Sonne mit Streifen und Hof
      sunR = Math.max(26, Math.min(w * 0.17, HZ * 0.55));
      const S2 = sunR * 1.9;
      [sunC, x] = layer(S2 * 2, S2 * 2);
      const sg = x.createLinearGradient(0, S2 - sunR, 0, S2 + sunR);
      sg.addColorStop(0, "#fff0b8"); sg.addColorStop(0.45, C.amber); sg.addColorStop(1, C.red);
      x.fillStyle = sg; x.beginPath(); x.arc(S2, S2, sunR, 0, TAU); x.fill();
      x.globalCompositeOperation = "destination-out";
      for (let k = 0; k < 7; k++){
        const yy = S2 + sunR * (0.02 + k * 0.14), th = sunR * (0.025 + k * 0.017);
        x.fillRect(0, yy, S2 * 2, th);
      }
      x.globalCompositeOperation = "destination-over";
      const halo = x.createRadialGradient(S2, S2, sunR * 0.7, S2, S2, S2);
      halo.addColorStop(0, "rgba(255,180,84,.32)"); halo.addColorStop(1, "rgba(255,90,90,0)");
      x.fillStyle = halo; x.fillRect(0, 0, S2 * 2, S2 * 2);
      x.globalCompositeOperation = "source-over";

      // Gebirge als nahtlos kachelbarer Streifen (nur ganzzahlige Frequenzen)
      mtnW = Math.ceil(Math.max(w, 320) * 1.5); mtnH = Math.max(20, Math.min(HZ * 0.42, w * 0.24));
      [mtnC, x] = layer(mtnW, mtnH);
      const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU];
      const ridge = px => {
        const t = px / mtnW * TAU;
        return clamp(0.42 + 0.28 * (1 - Math.abs(Math.sin(t * 2 + ph[0]))) + 0.16 * Math.sin(t * 5 + ph[1])
          + 0.08 * (1 - Math.abs(Math.sin(t * 11 + ph[2]))) + 0.04 * Math.sin(t * 29 + ph[3]), 0.08, 1);
      };
      x.beginPath(); x.moveTo(0, mtnH);
      for (let px = 0; px <= mtnW; px += 3) x.lineTo(px, mtnH - ridge(px) * mtnH * 0.95);
      x.lineTo(mtnW, mtnH); x.closePath();
      const mg = x.createLinearGradient(0, 0, 0, mtnH);
      mg.addColorStop(0, "#031408"); mg.addColorStop(1, "#010603");
      x.fillStyle = mg; x.fill();
      x.save(); x.clip();
      const hatch = x.createLinearGradient(0, 0, 0, mtnH);
      hatch.addColorStop(0, "rgba(51,255,102,.22)"); hatch.addColorStop(1, "rgba(51,255,102,0)");
      x.strokeStyle = hatch; x.lineWidth = 1; x.beginPath();
      for (let px = 0; px < mtnW; px += 14){ x.moveTo(px, mtnH - ridge(px) * mtnH * 0.95); x.lineTo(px, mtnH); }
      x.stroke(); x.restore();
      x.beginPath();
      for (let px = 0; px <= mtnW; px += 3){ const yy = mtnH - ridge(px) * mtnH * 0.95; px ? x.lineTo(px, yy) : x.moveTo(px, yy); }
      x.strokeStyle = "rgba(51,255,102,.75)"; x.lineWidth = 1.3; x.shadowColor = C.green; x.shadowBlur = 6; x.stroke();

      // Skyline in Gruppen, damit dazwischen das Gebirge sichtbar bleibt
      cityW = Math.ceil(Math.max(w, 320) * 1.2); cityH = Math.max(14, Math.min(HZ * 0.3, w * 0.17));
      [cityC, x] = layer(cityW, cityH);
      for (let px = 4; px < cityW - 40;){
        if (Math.sin(px / cityW * TAU * 3 + 1.3) < -0.1){ px += 24; continue; }
        const bw = 10 + rnd() * 26, bh = cityH * (0.2 + rnd() * 0.75), y0 = cityH - bh;
        x.fillStyle = "#000"; x.fillRect(px, y0, bw, bh);
        x.strokeStyle = "rgba(51,255,102,.55)"; x.lineWidth = 1; x.strokeRect(px + 0.5, y0 + 0.5, bw - 1, bh);
        for (let wy = y0 + 4; wy < cityH - 3; wy += 4) for (let wx = px + 3; wx < px + bw - 3; wx += 4){
          if (rnd() < 0.2){ x.fillStyle = rnd() < 0.6 ? "rgba(255,180,84,.7)" : "rgba(166,255,184,.6)"; x.fillRect(wx, wy, 1.6, 1.6); }
        }
        if (rnd() < 0.25){ x.beginPath(); x.moveTo(px + bw / 2, y0); x.lineTo(px + bw / 2, y0 - 8); x.stroke(); x.fillStyle = C.red; x.fillRect(px + bw / 2 - 1, y0 - 10, 2, 2); }
        px += bw + rnd() * 5;
      }

      groundGrad = g.createLinearGradient(0, HZ, 0, h);
      groundGrad.addColorStop(0, rgb(FOG)); groundGrad.addColorStop(1, "#010402");
      hazeGrad = g.createLinearGradient(0, HZ - 16, 0, HZ + 6);
      hazeGrad.addColorStop(0, "rgba(51,255,102,0)"); hazeGrad.addColorStop(0.75, "rgba(51,255,102,.16)"); hazeGrad.addColorStop(1, "rgba(51,255,102,0)");
    }

    /* ---------- Zustand ---------- */
    const COLS = [C.red, C.amber, C.pale, C.pink];
    let pos, px, speed, time, dist, lastSeg, cars, state = "ready", pausedFrom = "running";
    let shake = 0, flash = 0, checkFlash = 0, goT = 0, countT = 0, hitCool = 0, overAt = 0, clock = 0;
    let skyOff = 0, sunDrift = 0, steerVis = 0, passed = 0, cpCount = 0, vmax = 0, gasOn = false, braking = false;
    let gear = 1, rpm = 0.12;
    let best = +ctx.store.get("race.best", 0) || 0;
    let muted = !!ctx.store.get("race.mute", false);
    const parts = [];   // Funken und Staub

    function reset(){
      pos = LEN - SEG * 14;   // kurz vor dem Starttor
      px = 0; speed = 0; time = 30; dist = 0; shake = 0; flash = 0; checkFlash = 0; goT = 0; hitCool = 0;
      passed = 0; cpCount = 0; vmax = 0; steerVis = 0; sunDrift = 0; gear = 1; rpm = 0.12;
      lastSeg = segAt(pos + PLAYER_Z).i;
      parts.length = 0;
      cars = Array.from({ length: 22 }, (_, i) => {
        const col = COLS[i % COLS.length], c3 = hex(col);
        return {
          z: (i + 1) * (LEN / 23), off: (ctx.rint(0, 2) - 1) * 0.62 + (Math.random() - 0.5) * 0.12,
          speed: MAX * (0.25 + Math.random() * 0.4), ahead: undefined,
          look: { col, type: ctx.rint(0, 2), body: rgb(mix(c3, [0, 0, 0], 0.84)), cab: rgb(mix(c3, [0, 0, 0], 0.92)) },
          n: 0, t: 0, X: 0, Y: 0, S: 0, fog: 0,
        };
      });
    }
    const PLAYER_LOOK = { col: C.bright, type: 0, body: "#06200d", cab: "#031207" };

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }
    const sfx = (f, ms, type, vol) => { if (!muted) ctx.beep(f, ms, type, vol); };

    let barKey = "";
    function updBar(){
      const key = best + "|" + muted;
      if (key === barKey) return;
      barKey = key;
      bar.innerHTML = `<span>rekord <b>${best.toFixed(2)} km</b></span>
        <span data-mute style="cursor:pointer">ton <b>${muted ? "aus" : "an"}</b>${ctx.touch ? "" : " (M)"}</span>
        <span class="right">${ctx.touch ? "▼ bremst · ⏯ pause" : "↑ gas · ↓ bremse · ← → lenken · P pause"}</span>`;
    }
    bar.addEventListener("click", e => { if (e.target.closest("[data-mute]")) toggleMute(); });

    /* ---------- Motorgeräusch: ein Dauerton, Tonhöhe folgt der Drehzahl ---------- */
    let ac = null, eng = null, audT = 0, quietT = 0;
    function audioInit(){
      if (ac || muted) return;
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const o1 = ac.createOscillator(), o2 = ac.createOscillator(), sub = ac.createGain(), lp = ac.createBiquadFilter(), vol = ac.createGain();
        o1.type = "sawtooth"; o2.type = "square"; o1.frequency.value = 45; o2.frequency.value = 22.5;
        sub.gain.value = 0.4; lp.type = "lowpass"; lp.frequency.value = 400; lp.Q.value = 3; vol.gain.value = 0;
        o1.connect(lp); o2.connect(sub); sub.connect(lp); lp.connect(vol); vol.connect(ac.destination);
        o1.start(); o2.start();
        eng = { o1, o2, lp, vol };
      } catch(e){ ac = null; eng = null; }
    }
    function audioTick(dt){
      if (!eng) return;
      const on = !muted && (state === "running" || state === "count");
      quietT = on ? 0 : quietT + dt;
      audT -= dt;
      if (audT > 0) return;
      audT = 0.05;   // nicht jedes Bild neue Automationspunkte setzen
      try{
        if (on && ac.state === "suspended") ac.resume().catch(() => {});
        if (!on && quietT > 0.3 && ac.state === "running"){ ac.suspend().catch(() => {}); return; }
        const t = ac.currentTime, f = 34 + rpm * 110 + gear * 5;
        eng.o1.frequency.setTargetAtTime(f, t, 0.05);
        eng.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
        eng.lp.frequency.setTargetAtTime(240 + rpm * 900 + (gasOn ? 350 : 0), t, 0.08);
        eng.vol.gain.setTargetAtTime(on ? 0.016 + rpm * 0.014 : 0, t, on ? 0.08 : 0.03);
      } catch(e){}
    }
    function audioClose(){
      try{ if (eng){ eng.o1.stop(); eng.o2.stop(); } } catch(e){}
      try{ if (ac) ac.close(); } catch(e){}
      ac = null; eng = null;
    }
    function toggleMute(){
      muted = !muted; ctx.store.set("race.mute", muted);
      if (!muted) audioInit();
      updBar();
    }

    // Gänge: Anteil der Höchstgeschwindigkeit, ab dem hochgeschaltet ist
    const GEARS = [0, 0.16, 0.33, 0.52, 0.74, 1.001];
    function engine(dt, gas){
      let target;
      if (state === "count"){ gear = 0; target = gas ? 0.92 : 0.13; }   // im Leerlauf aufheulen lassen
      else {
        const r = speed / MAX; let gi = 0;
        while (gi < 4 && r >= GEARS[gi + 1]) gi++;
        gear = gi + 1;
        target = speed < 1 ? 0.13 : 0.2 + 0.78 * clamp((r - GEARS[gi]) / (GEARS[gi + 1] - GEARS[gi]), 0, 1);
      }
      rpm += (target - rpm) * Math.min(1, dt * 9);
    }

    /* ---------- Effekte ---------- */
    function sparks(x, y, n){
      for (let k = 0; k < n && parts.length < 180; k++){
        const life = 0.3 + Math.random() * 0.45;
        parts.push({ x, y, vx: (Math.random() - 0.5) * 700, vy: -60 - Math.random() * 460, life, max: life, grav: 1300, col: Math.random() < 0.55 ? C.amber : "#fff2c8", spark: true });
      }
    }
    function dust(x, y){
      if (parts.length > 170) return;
      parts.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 50, life: 0.55, max: 0.55, grav: -20, col: C.dim, spark: false });
    }
    function crash(strength){
      shake = Math.max(shake, 6 + strength * 8); flash = Math.max(flash, 0.35 + strength * 0.4); hitCool = 0.45;
      const s = carSize();
      sparks(w / 2 + (Math.random() - 0.5) * s, h - s * 0.45, 18 + (strength * 22 | 0));
    }
    function fx(dt){
      for (let k = parts.length - 1; k >= 0; k--){
        const p = parts[k];
        p.life -= dt;
        if (p.life <= 0){ parts.splice(k, 1); continue; }
        p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      shake *= Math.pow(0.02, dt); flash = Math.max(0, flash - dt * 2.5);
      checkFlash = Math.max(0, checkFlash - dt); goT = Math.max(0, goT - dt); hitCool = Math.max(0, hitCool - dt);
    }

    /* ---------- Spiellogik ---------- */
    function update(dt){
      const k = ctx.keys;
      const gas = k.has("ArrowUp") || k.has("w") || (ctx.touch && !k.has("ArrowDown"));
      const brake = k.has("ArrowDown") || k.has("s");
      const left = k.has("ArrowLeft") || k.has("a"), right = k.has("ArrowRight") || k.has("d");
      gasOn = gas; braking = brake && speed > 0;
      const ratio = speed / MAX;
      const steer = dt * 2.2 * ratio;

      const seg = segAt(pos + PLAYER_Z);
      if (left) px -= steer;
      if (right) px += steer;
      px -= steer * ratio * seg.curve * 0.06;   // Fliehkraft in Kurven
      steerVis += (((right ? 1 : 0) - (left ? 1 : 0)) * Math.min(1, ratio * 2) - steerVis) * Math.min(1, dt * 8);

      speed += (gas ? ACC : brake ? BRAKE : DECEL) * dt;
      const offroad = Math.abs(px) > 1;
      if (offroad){
        if (speed > OFF_MAX) speed += OFF_DECEL * dt;
        if (Math.random() < 0.3) sfx(60 + Math.random() * 40, 30, "sawtooth", 0.02);
        shake = Math.max(shake, 1 + ratio * 2);
        if (speed > 200){ const s = carSize(); dust(w / 2 - s * 0.85, h - 4); dust(w / 2 + s * 0.85, h - 4); }
        // Palmen, Laternen und Schilder sind hart
        if (hitCool <= 0){
          const prev = segs[(seg.i - 1 + N) % N];
          for (const sg of [seg, prev]) if (sg.sp) for (const sp of sg.sp){
            const hw = SOLID[sp.kind];
            if (hw && Math.abs(px - sp.off) < CAR + hw){
              crash(Math.min(1, ratio * 3)); speed *= 0.25; px += px > sp.off ? 0.08 : -0.08;
              sfx(90, 160, "sawtooth", 0.06);
              break;
            }
          }
        }
      } else if (Math.abs(px) > 1 - CAR && ratio > 0.3 && Math.random() < 0.15) sfx(80, 20, "square", 0.012);   // Rüttelstreifen
      px = clamp(px, -2.2, 2.2);
      speed = clamp(speed, 0, MAX);

      // Gegner bewegen, Überholen zählen, Auffahren
      for (const c of cars){
        c.z = (c.z + c.speed * dt) % LEN;
        const gap = ((c.z - (pos + PLAYER_Z)) % LEN + LEN) % LEN;
        const ahead = gap < LEN / 2;
        if (c.ahead === true && !ahead && gap > LEN - SEG * 30){ passed++; sfx(1400, 25, "square", 0.015); }
        else if (c.ahead === false && ahead && gap < SEG * 30) passed = Math.max(0, passed - 1);
        c.ahead = ahead;
        if (gap < SEG * 1.2 && Math.abs(c.off - px) < CAR * 2 && speed > c.speed){
          const hard = (speed - c.speed) / MAX;
          speed = c.speed * 0.6;
          if (hitCool <= 0){ crash(Math.min(1, hard * 2.5)); sfx(110, 220, "square", 0.06); }
        }
      }

      const move = speed * dt;
      pos = (pos + move) % LEN;
      dist += move;
      skyOff += seg.curve * ratio * dt * 0.05;
      sunDrift = clamp((sunDrift - seg.curve * ratio * dt * 0.012) * (1 - Math.min(1, dt * 0.4)), -0.3, 0.3);

      // Checkpoint: alle überfahrenen Segmente prüfen, auch wenn ein Bild mehrere überspringt
      const si = segAt(pos + PLAYER_Z).i;
      for (let j = lastSeg, guard = 0; j !== si && guard < 64; guard++){
        j = (j + 1) % N;
        if (segs[j].cp && dist > SEG * 30){   // das Starttor zählt erst nach einer Runde
          time += BONUS; checkFlash = 1.8; cpCount++;
          sfx(988, 90); ctx.after(110, () => sfx(1318, 160));
          ctx.log("OK", `race: Checkpoint — <span class="num">${(dist / KM).toFixed(2)} km</span>`);
        }
      }
      lastSeg = si;
      const before = Math.ceil(time);
      time -= dt;
      if (time < 5 && Math.ceil(time) < before && time > 0) sfx(660, 50, "square", 0.03);
      vmax = Math.max(vmax, Math.round(speed / MAX * 280));
      engine(dt, gas);
      if (time <= 0){ time = 0; over(); }
    }

    function countdown(dt){
      const k = ctx.keys;
      gasOn = k.has("ArrowUp") || k.has("w");   // auch auf dem Handy erst nach GO automatisch
      const before = Math.ceil(countT);
      countT -= dt;
      engine(dt, gasOn);
      if (countT <= 0){ state = "running"; goT = 1; sfx(880, 280, "square", 0.05); }
      else if (Math.ceil(countT) < before) sfx(440, 120, "square", 0.05);
    }

    function over(){
      state = "over"; overAt = clock; gasOn = false;
      const km = dist / KM, rec = km > best && km > 0;
      if (rec){ best = +km.toFixed(2); ctx.store.set("race.best", best); updBar(); }
      sfx(392, 160, "sawtooth"); ctx.after(170, () => sfx(294, 180, "sawtooth")); ctx.after(360, () => sfx(196, 420, "sawtooth"));
      const glow = col => `color:${col};text-shadow:0 0 10px ${col}`;
      overlay(`<div class="big" style="${glow(C.amber)}">ZEIT ABGELAUFEN</div>
        <div style="font-size:28px;margin:4px 0;${glow(C.bright)}">${km.toFixed(2)} km</div>
        <div style="color:${rec ? C.amber : C.dim}">${rec ? "★ neuer Rekord" : `Rekord ${best.toFixed(2)} km`}</div>
        <div style="color:${C.dim}">${cpCount} Checkpoint${cpCount === 1 ? "" : "s"} · ${passed} überholt</div>
        <div style="color:${C.dim}">Spitze ${vmax} km/h</div>
        <div style="margin-top:10px">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
    }

    /* ---------- Projektion ---------- */
    let frame = 0;
    const vis = [], carList = [];
    function project(){
      frame++;
      const base = segAt(pos), basePct = (pos % SEG) / SEG;
      const pz = pos + PLAYER_Z, pSeg = segAt(pz), pPct = (pz % SEG) / SEG;
      const camY = CAM_H + lerp(pSeg.p1.y, pSeg.p2.y, pPct);   // Kamera folgt dem Boden unter dem Auto
      const camX = px * ROAD, hw = w / 2, hh = HY;
      let x = 0, dx = -(base.curve * basePct), maxy = h;
      vis.length = 0;
      for (let n = 0; n < DRAW; n++){
        const idx = base.i + n, seg = segs[idx % N], lz = idx >= N ? LEN : 0;   // nach dem Rundenende weiterzählen
        const z1 = seg.p1.z + lz - pos, z2 = seg.p2.z + lz - pos;
        const x1 = x, x2 = x + dx;
        x += dx; dx += seg.curve;
        if (z1 <= 0) continue;   // hinter der Kamera
        const s1 = DEPTH / z1, s2 = DEPTH / z2;
        seg.ax = hw + s1 * (x1 - camX) * hw; seg.ay = HZ - s1 * (seg.p1.y - camY) * hh; seg.aw = s1 * ROAD * hw;
        seg.bx = hw + s2 * (x2 - camX) * hw; seg.by = HZ - s2 * (seg.p2.y - camY) * hh; seg.bw = s2 * ROAD * hw;
        seg.n = n; seg.fr = frame;
        const f = Math.pow(n / DRAW, 1.3);
        seg.fog = f; seg.fi = Math.min(FL - 1, (f * FL) | 0);
        // Fahrbahn nur zeichnen, wenn sie über die bisher höchste Kante hinausragt
        seg.road = seg.by < maxy && seg.by < seg.ay;
        if (seg.road) maxy = seg.by;
        vis.push(seg);
      }
      // Gegner auf ihren Segmenten verorten, entfernte zuerst
      carList.length = 0;
      for (const c of cars){
        const ci = Math.floor(c.z / SEG) % N, n = (ci - base.i + N) % N;
        if (n < 1 || n >= DRAW) continue;
        const seg = segs[ci];
        if (seg.fr !== frame) continue;
        const t = (c.z % SEG) / SEG, W = lerp(seg.aw, seg.bw, t);
        c.n = n; c.t = t; c.S = W * CAR; c.fog = seg.fog;
        c.X = lerp(seg.ax, seg.bx, t) + W * c.off; c.Y = lerp(seg.ay, seg.by, t);
        carList.push(c);
      }
      carList.sort((p, q) => q.n - p.n || q.t - p.t);
    }

    /* ---------- Zeichnen ---------- */
    let A = 1;   // Deckkraft des aktuell gezeichneten Objekts (Nebel)
    // Neonlinie: breit und blass, darüber schmal und hell (billiger als shadowBlur)
    function neon(col, lw){
      g.strokeStyle = col;
      if (!lowQ){ g.globalAlpha = A * 0.22; g.lineWidth = lw * 4; g.stroke(); }
      g.globalAlpha = A; g.lineWidth = lw; g.stroke();
    }
    const quad = (x1, y1, x2, y2, x3, y3, x4, y4) => { g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.closePath(); };
    function txt(s, x, y, size, col, align = "left", weight = 500, glow = 0){
      g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.fillStyle = col;
      if (glow){ g.shadowColor = col; g.shadowBlur = glow; }
      g.fillText(s, x, y);
      if (glow) g.shadowBlur = 0;
    }
    const carSize = () => Math.min(w * CAR, h * 0.42);

    function drawSeg(seg){
      const { ax, ay, aw, bx, by, bw, fi } = seg, alt = ((seg.i / 3) | 0) & 1;
      g.globalAlpha = 1;
      // Boden über die volle Breite: verdeckt alles, was weiter hinten liegt
      g.fillStyle = alt ? L.groundA[fi] : L.groundB[fi];
      g.fillRect(0, by, w, Math.min(ay, h) - by + 1);
      // Synthwave-Gitter auf dem Boden
      g.beginPath();
      if (seg.i % 8 === 0){ g.moveTo(0, ay); g.lineTo(w, ay); }
      if (!lowQ) for (let k = 0; k < GRID_X.length * 2; k++){
        const o = k & 1 ? -GRID_X[k >> 1] : GRID_X[k >> 1];
        const x1 = ax + aw * o, x2 = bx + bw * o;
        if ((x1 < 0 && x2 < 0) || (x1 > w && x2 > w)) continue;
        g.moveTo(x1, ay); g.lineTo(x2, by);
      }
      g.strokeStyle = L.grid[fi]; g.lineWidth = 1; g.stroke();
      // Randstreifen
      const ar = aw * RUMBLE, br = bw * RUMBLE;
      g.fillStyle = alt ? L.rumbleA[fi] : L.rumbleB[fi];
      g.beginPath();
      quad(ax - ar, ay, ax - aw, ay, bx - bw, by, bx - br, by);
      quad(ax + aw, ay, ax + ar, ay, bx + br, by, bx + bw, by);
      g.fill();
      // Fahrbahn
      g.fillStyle = alt ? L.roadA[fi] : L.roadB[fi];
      g.beginPath(); quad(ax - aw, ay, ax + aw, ay, bx + bw, by, bx - bw, by); g.fill();
      // Leitlinien, gestrichelt
      if (alt){
        g.fillStyle = L.lane[fi]; g.beginPath();
        for (let k = 1; k < LANES; k++){
          const o = -1 + 2 * k / LANES, la = aw * 0.015, lb = bw * 0.015;
          quad(ax + aw * o - la, ay, ax + aw * o + la, ay, bx + bw * o + lb, by, bx + bw * o - lb, by);
        }
        g.fill();
      }
      // Schachbrettlinie an Start und Checkpoints
      if (seg.cp){
        g.fillStyle = L.check[fi]; g.beginPath();
        for (let k = 0; k < 10; k += 2){
          const o1 = -1 + k * 0.2, o2 = o1 + 0.2;
          quad(ax + aw * o1, ay, ax + aw * o2, ay, bx + bw * o2, by, bx + bw * o1, by);
        }
        g.fill();
      }
      // leuchtende Fahrbahnkante
      g.beginPath(); g.moveTo(ax - aw, ay); g.lineTo(bx - bw, by); g.moveTo(ax + aw, ay); g.lineTo(bx + bw, by);
      g.strokeStyle = L.edge[fi]; g.lineWidth = Math.max(1, aw * 0.01); g.stroke();
    }

    // Objekte am Rand: Koordinaten in halben Straßenbreiten, y nach oben negativ
    function drawSprite(sp, seg){
      const S = seg.aw, X = seg.ax + S * sp.off, Y = seg.ay;
      const reach = S * (sp.kind === "gate" ? 1.4 : sp.kind === "board" ? 0.8 : 0.6);
      if (S < 0.6 || X + reach < 0 || X - reach > w || Y - S * 1.5 > h || Y < 0) return;
      A = 1 - seg.fog * 0.8;
      const lw = p => Math.max(1, p) / S;   // Linienbreite in Pixeln → Einheiten
      g.save(); g.translate(X, Y); g.scale(S, S);
      let label = null, ly = 0, lsize = 0, lcol = C.bright;
      switch (sp.kind){
        case "palm": {
          const L2 = sp.lean, top = -sp.hgt;
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L2 * 0.1, top * 0.55, L2, top);
          neon(C.dim, lw(S * 0.035));
          g.beginPath();
          for (const d of [-0.62, -0.44, -0.24, 0.24, 0.44, 0.62]){
            const ad = Math.abs(d);
            g.moveTo(L2, top); g.quadraticCurveTo(L2 + d * 0.55, top - 0.16 + ad * 0.05, L2 + d, top + 0.06 + ad * 0.34);
          }
          g.moveTo(L2, top); g.lineTo(L2 + 0.03, top - 0.12);
          neon(C.green, lw(S * 0.022));
          break;
        }
        case "lamp": {
          const d = sp.off > 0 ? -1 : 1, hx = d * 0.3;   // Arm zeigt zur Fahrbahn
          if (!lowQ){
            g.globalAlpha = A; g.fillStyle = coneGrad; g.beginPath();
            quad(hx - 0.05, -1.05, hx + 0.05, -1.05, hx + 0.34, 0, hx - 0.34, 0); g.fill();
          }
          g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -0.95); g.quadraticCurveTo(0, -1.08, d * 0.12, -1.08); g.lineTo(hx, -1.08);
          neon(C.dim, lw(S * 0.018));
          g.globalAlpha = A; g.fillStyle = C.amber;
          g.beginPath(); g.ellipse(hx, -1.07, 0.07, 0.022, 0, 0, TAU); g.fill();
          if (!lowQ){ g.globalAlpha = A * 0.3; g.beginPath(); g.ellipse(hx, -1.07, 0.16, 0.06, 0, 0, TAU); g.fill(); }
          break;
        }
        case "chev": {
          g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -0.3); neon(C.dim, lw(S * 0.015));
          g.globalAlpha = A; g.fillStyle = "#000"; g.fillRect(-0.22, -0.6, 0.44, 0.3);
          g.beginPath(); g.rect(-0.22, -0.6, 0.44, 0.3); neon(C.amber, lw(S * 0.012));
          g.beginPath();
          for (const x0 of [-0.11, 0.03]){ g.moveTo((x0) * sp.dir, -0.54); g.lineTo((x0 + 0.08) * sp.dir, -0.45); g.lineTo(x0 * sp.dir, -0.36); }
          neon(C.amber, lw(S * 0.025));
          break;
        }
        case "board": {
          g.beginPath(); g.moveTo(-0.5, 0); g.lineTo(-0.5, -0.6); g.moveTo(0.5, 0); g.lineTo(0.5, -0.6); neon(C.dim, lw(S * 0.02));
          g.globalAlpha = A; g.fillStyle = "#010a04"; g.fillRect(-0.72, -1.1, 1.44, 0.5);
          g.beginPath(); g.rect(-0.72, -1.1, 1.44, 0.5); neon(C.green, lw(S * 0.012));
          label = sp.text; lsize = S * Math.min(0.2, 1.2 / (sp.text.length * 0.62)); ly = Y - 0.85 * S + lsize * 0.36;
          break;
        }
        case "gate": {
          for (const sd of [-1, 1]){
            g.globalAlpha = A; g.fillStyle = "#000"; g.fillRect(sd * 1.24 - 0.04, -1.0, 0.08, 1.0);
            g.beginPath(); g.rect(sd * 1.24 - 0.04, -1.0, 0.08, 1.0); neon(C.amber, lw(S * 0.01));
          }
          g.globalAlpha = A; g.fillStyle = "rgba(0,0,0,.85)"; g.fillRect(-1.3, -1.17, 2.6, 0.25);
          g.beginPath(); g.rect(-1.3, -1.17, 2.6, 0.25); neon(C.amber, lw(S * 0.012));
          const blink = (clock * 3 | 0) & 1;   // Lauflichter an den Enden
          g.globalAlpha = A; g.fillStyle = blink ? C.red : C.amber;
          g.fillRect(-1.25, -1.1, 0.1, 0.1); g.fillStyle = blink ? C.amber : C.red; g.fillRect(1.15, -1.1, 0.1, 0.1);
          label = sp.text; lsize = S * 0.15; ly = Y - 1.045 * S + lsize * 0.36; lcol = C.amber;
          break;
        }
      }
      g.restore();
      // Schrift ungeskaliert, sonst rendern Browser winzige Schriftgrößen unsauber
      if (label && lsize >= 6){
        g.globalAlpha = A;
        txt(label, X, ly, lsize, lcol, "center", 600, lowQ ? 0 : Math.min(12, lsize * 0.5));
      }
      g.globalAlpha = 1;
    }

    // Auto von hinten. look: Farben/Typ, o: Bremse, Neigung, Perspektive, eigenes Auto, Gas
    function drawCar(x, y, s, alpha, look, o){
      if (s < 0.7) return;
      A = alpha;
      if (s < 5){   // weit weg: nur noch zwei Rücklichter
        g.globalAlpha = alpha; g.fillStyle = C.red;
        const r = Math.max(1, s * 0.3);
        g.fillRect(x - s * 0.75 - r / 2, y - s * 0.45, r, r * 0.7);
        g.fillRect(x + s * 0.75 - r / 2, y - s * 0.45, r, r * 0.7);
        g.globalAlpha = 1;
        return;
      }
      const tall = look.type === 1, low = look.type === 2;
      const belt = tall ? -0.56 : -0.48, top = tall ? -1.1 : low ? -0.7 : -0.8;
      const lw = Math.max(1, s / 50) / s;
      g.save(); g.translate(x, y); g.scale(s, s);
      // Unterbodenleuchten und Schatten
      if (o.mine && !lowQ){
        g.save(); g.scale(1, 0.16); g.globalAlpha = alpha; g.fillStyle = underGrad;
        g.beginPath(); g.arc(0, 0, 1.4, 0, TAU); g.fill(); g.restore();
      }
      g.globalAlpha = alpha; g.fillStyle = "rgba(0,0,0,.6)";
      g.beginPath(); g.ellipse(0, 0, 1.12, 0.08, 0, 0, TAU); g.fill();
      // Räder (drehen sich nicht mit der Karosserie)
      g.fillStyle = "#020502"; g.fillRect(-1.02, -0.3, 0.32, 0.3); g.fillRect(0.7, -0.3, 0.32, 0.3);
      if (o.mine){
        const ph = ((dist * 0.0004) % 1) * 0.1;
        g.beginPath();
        for (let yy = -0.28 + ph; yy < 0; yy += 0.1){ g.moveTo(-1.0, yy); g.lineTo(-0.72, yy); g.moveTo(0.72, yy); g.lineTo(1.0, yy); }
        g.strokeStyle = "rgba(51,255,102,.35)"; g.lineWidth = 1 / s; g.stroke();
      }
      g.rotate(o.roll);
      const yaw = o.yaw;
      // Karosserie
      g.beginPath();
      g.moveTo(-1, -0.1); g.lineTo(-1.04, belt + 0.1); g.lineTo(-0.94, belt); g.lineTo(0.94, belt); g.lineTo(1.04, belt + 0.1); g.lineTo(1, -0.1); g.closePath();
      g.globalAlpha = alpha; g.fillStyle = look.body; g.fill(); neon(look.col, lw);
      // Kabine, oben leicht zum Fluchtpunkt versetzt
      const cw = tall ? 0.94 : 0.7, tw = tall ? 0.9 : low ? 0.5 : 0.54;
      g.beginPath(); g.moveTo(-cw, belt); g.lineTo(-tw + yaw, top); g.lineTo(tw + yaw, top); g.lineTo(cw, belt); g.closePath();
      g.globalAlpha = alpha; g.fillStyle = look.cab; g.fill(); neon(look.col, lw);
      if (!tall){
        g.beginPath(); g.moveTo(-cw + 0.1, belt - 0.03); g.lineTo(-tw + yaw + 0.06, top + 0.05); g.lineTo(tw + yaw - 0.06, top + 0.05); g.lineTo(cw - 0.1, belt - 0.03); g.closePath();
        g.globalAlpha = alpha; g.fillStyle = glassGrad; g.fill();
      } else {
        g.globalAlpha = alpha; g.fillStyle = glassGrad;
        g.fillRect(-0.72 + yaw, top + 0.08, 0.6, 0.16); g.fillRect(0.12 + yaw, top + 0.08, 0.6, 0.16);
        g.beginPath(); g.moveTo(yaw, top + 0.04); g.lineTo(0, belt); neon(look.col, lw * 0.8);
      }
      if (low){   // Heckflügel
        g.beginPath(); g.moveTo(-1.02, belt - 0.13); g.lineTo(1.02, belt - 0.13);
        g.moveTo(-0.7, belt - 0.13); g.lineTo(-0.7, belt); g.moveTo(0.7, belt - 0.13); g.lineTo(0.7, belt);
        neon(look.col, lw * 1.4);
      }
      // Rücklichter, beim Bremsen hell mit Leuchthof
      g.globalAlpha = alpha * (o.brake ? 1 : 0.6); g.fillStyle = o.brake ? "#ff8a8a" : C.red;
      g.fillRect(-0.92, belt + 0.1, 0.3, 0.09); g.fillRect(0.62, belt + 0.1, 0.3, 0.09);
      if (!lowQ || o.mine){
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = alpha * (o.brake ? 0.7 : 0.25); g.fillStyle = lightGrad;
        const rx = o.brake ? 0.55 : 0.32, ry = o.brake ? 0.28 : 0.15;
        for (const sx of [-0.77, 0.77]){
          g.save(); g.translate(sx, belt + 0.145); g.scale(rx, ry); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
        }
        g.globalCompositeOperation = "source-over";
      }
      // Nummernschild
      g.globalAlpha = alpha; g.fillStyle = "#0b1f10"; g.fillRect(-0.17, -0.3, 0.34, 0.12);
      g.strokeStyle = look.col; g.lineWidth = 1 / s; g.strokeRect(-0.17, -0.3, 0.34, 0.12);
      // Auspuffflackern beim Gasgeben
      if (o.gas && Math.random() < 0.6){
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillStyle = C.amber;
        g.beginPath(); g.ellipse(-0.55, -0.12, 0.05 + Math.random() * 0.05, 0.035, 0, 0, TAU); g.fill();
        g.globalCompositeOperation = "source-over";
      }
      g.restore();
      g.globalAlpha = 1;
    }

    function background(){
      g.globalAlpha = 1;
      g.drawImage(skyC, 0, 0, w, HZ + 2);
      const S2 = sunR * 1.9;
      g.drawImage(sunC, w / 2 + sunDrift * w - S2, HZ - sunR * 0.5 - S2, S2 * 2, S2 * 2);
      // Gebirge und Skyline wandern in Kurven unterschiedlich schnell (Parallaxe)
      const tile = (img, tw, th, off) => {
        const o = ((off % tw) + tw) % tw;
        for (let x = -o; x < w; x += tw) g.drawImage(img, x, HZ - th + 1, tw, th);
      };
      tile(mtnC, mtnW, mtnH, skyOff * w * 0.5);
      tile(cityC, cityW, cityH, skyOff * w);
      g.fillStyle = groundGrad; g.fillRect(0, HZ, w, h - HZ);
      g.fillStyle = hazeGrad; g.fillRect(0, HZ - 16, w, 22);
      g.fillStyle = "rgba(166,255,184,.55)"; g.fillRect(0, HZ, w, 1);
    }

    function drawParts(){
      if (!parts.length) return;
      g.globalCompositeOperation = "lighter";
      for (const p of parts){
        g.globalAlpha = p.life / p.max;
        if (p.spark){
          g.strokeStyle = p.col; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); g.stroke();
        } else {
          const r = 2 + (1 - p.life / p.max) * 5;
          g.fillStyle = p.col; g.fillRect(p.x - r / 2, p.y - r / 2, r, r);
        }
      }
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    }

    function drawHud(){
      const u = clamp(Math.min(w / 720, h / 420), 0.6, 1.3), m = Math.max(8, 12 * u);
      const fsL = Math.max(9, 10 * u), fsV = Math.max(13, 17 * u), fsT = Math.max(24, 38 * u);
      g.textBaseline = "alphabetic"; g.globalAlpha = 1;
      // links: Strecke, Überholt · rechts: Rekord
      txt("STRECKE", m, m + fsL, fsL, C.dim);
      txt(`${(dist / KM).toFixed(2)} km`, m, m + fsL + fsV + 2, fsV, C.bright, "left", 600, 6);
      txt("ÜBERHOLT", m, m + fsL * 2 + fsV + 10, fsL, C.dim);
      txt(String(passed), m, m + fsL * 2 + fsV * 2 + 12, fsV, C.bright, "left", 600, 6);
      txt("REKORD", w - m, m + fsL, fsL, C.dim, "right");
      txt(`${best.toFixed(2)} km`, w - m, m + fsL + fsV + 2, fsV, C.amber, "right", 600, 6);
      // Mitte: Restzeit und Weg zum nächsten Checkpoint
      const low = time < 10, blink = time < 5 && (clock * 4 | 0) & 1;
      txt("ZEIT", w / 2, m + fsL, fsL, C.dim, "center");
      txt(String(Math.ceil(time)), w / 2, m + fsL + fsT, fsT, blink ? C.red : low ? C.amber : C.bright, "center", 700, 10);
      const bw = Math.max(70, 110 * u), by = m + fsL + fsT + 8;
      const prog = dist < SEG * 30 ? 0 : clamp(1 - nextCp[segAt(pos + PLAYER_Z).i] / cpStep, 0, 1);
      g.fillStyle = "rgba(51,255,102,.18)"; g.fillRect(w / 2 - bw / 2, by, bw, 4);
      g.fillStyle = C.amber; g.fillRect(w / 2 - bw / 2, by, bw * prog, 4);
      txt("CP", w / 2 - bw / 2 - 5, by + 5, fsL * 0.9, C.dim, "right");

      // Drehzahlmesser unten rechts: LED-Bogen, Tempo digital, Gang
      const Rr = Math.max(36, 56 * u), cx = w - m - Rr, cy = h - m - Rr * 0.8;
      g.fillStyle = "rgba(0,10,4,.65)"; g.beginPath(); g.arc(cx, cy, Rr, 0, TAU); g.fill();
      g.strokeStyle = "rgba(51,255,102,.35)"; g.lineWidth = 1; g.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, NS = 22;
      g.lineWidth = Rr * 0.13;
      for (let i = 0; i < NS; i++){
        const f = i / NS, on = f < rpm;
        g.strokeStyle = on ? (f > 0.86 ? C.red : f > 0.68 ? C.amber : C.green) : "rgba(51,255,102,.12)";
        g.beginPath(); g.arc(cx, cy, Rr * 0.8, a0 + (a1 - a0) * (i + 0.12) / NS, a0 + (a1 - a0) * (i + 0.88) / NS); g.stroke();
      }
      txt(String(Math.round(speed / MAX * 280)), cx, cy + Rr * 0.14, Rr * 0.46, C.bright, "center", 700, 6);
      txt("km/h", cx, cy + Rr * 0.38, Rr * 0.17, C.dim, "center");
      txt(gear ? String(gear) : "N", cx, cy + Rr * 0.8, Rr * 0.26, C.amber, "center", 700, 4);
    }

    function drawBanners(){
      const big = Math.max(34, Math.min(w, h) * 0.2);
      if (state === "count" || (state === "paused" && pausedFrom === "count")){
        const n = Math.max(1, Math.ceil(countT)), f = countT - Math.floor(countT);
        g.globalAlpha = 0.35 + 0.65 * f;
        txt(String(n), w / 2, h * 0.42, big * (1 + 0.45 * f), C.amber, "center", 700, 22);
      } else if (goT > 0){
        g.globalAlpha = Math.min(1, goT * 1.5);
        txt("GO!", w / 2, h * 0.42, big * (1.6 - goT * 0.5), C.green, "center", 700, 24);
      }
      if (checkFlash > 0 && (checkFlash < 1.2 || (clock * 8 | 0) & 1)){
        const fs = Math.max(18, Math.min(w / 16, 40));
        g.globalAlpha = Math.min(1, checkFlash * 1.5);
        txt("CHECKPOINT", w / 2, h * 0.3, fs, C.amber, "center", 700, 16);
        txt(`+${BONUS} s`, w / 2, h * 0.3 + fs * 1.1, fs * 0.8, C.bright, "center", 600, 10);
      }
      g.globalAlpha = 1;
    }

    function draw(){
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.shadowBlur = 0;
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      g.save();
      if (shake > 0.2) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      g.lineCap = "round"; g.lineJoin = "round";

      background();
      project();
      // von hinten nach vorne: Fahrbahn, dann Gegner auf dem Segment, dann Randobjekte vorne am Segment
      let ci = 0;
      for (let k = vis.length - 1; k >= 0; k--){
        const seg = vis[k];
        if (seg.road) drawSeg(seg);
        while (ci < carList.length && carList[ci].n >= seg.n){
          const c = carList[ci++];
          if (c.n === seg.n) drawCar(c.X, c.Y, c.S, 1 - c.fog * 0.7, c.look, { brake: false, roll: 0, yaw: clamp((w / 2 - c.X) / w, -1, 1) * 0.25, mine: false, gas: false });
        }
        if (seg.sp) for (const sp of seg.sp) drawSprite(sp, seg);
      }

      // eigenes Auto: Neigung beim Lenken, Rütteln auf Randstreifen und Wiese
      const s = carSize(), ratio = speed / MAX, pSeg = segAt(pos + PLAYER_Z);
      const rough = Math.abs(px) > 1 ? 1 : Math.abs(px) > 1 - CAR ? 0.5 : 0;
      const bounce = state === "running" ? (Math.sin(clock * 47) * rough * 0.035 + Math.sin(clock * 23) * 0.006 * ratio) * s : 0;
      const roll = steerVis * 0.06 + pSeg.curve * ratio * 0.008;
      drawCar(w / 2 + steerVis * s * 0.1, h - Math.max(8, h * 0.03) + bounce, s, 1, PLAYER_LOOK,
        { brake: braking || state !== "running", roll, yaw: -steerVis * 0.08, mine: true, gas: gasOn && ratio < 0.97 && (state === "running" || state === "count") });
      drawParts();
      g.restore();

      // Aufprall-Blitz und Warnung bei knapper Zeit
      if (flash > 0){ g.fillStyle = `rgba(255,225,200,${(flash * 0.45).toFixed(3)})`; g.fillRect(0, 0, w, h); }
      if (state === "running" && time < 5){
        const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, "rgba(255,90,90,0)"); vg.addColorStop(1, `rgba(255,90,90,${(0.12 + 0.12 * Math.sin(clock * 10)).toFixed(3)})`);
        g.fillStyle = vg; g.fillRect(0, 0, w, h);
      }
      if (state !== "ready") drawHud();
      drawBanners();
    }

    /* ---------- Ablauf ---------- */
    function startRace(){
      reset(); state = "count"; countT = 3; overlay(null);
      audioInit(); sfx(440, 120, "square", 0.05);
    }
    function pause(){
      if (state !== "running" && state !== "count") return;
      pausedFrom = state; state = "paused";
      overlay(`<div class="big">PAUSE</div><div style="color:${C.dim}">${ctx.touch ? "⏯ oder tippen" : "P"} = weiter</div>`);
    }
    function resume(){
      if (state !== "paused") return;
      state = pausedFrom; overlay(null); audioInit();
    }
    const canRestart = () => state === "ready" || (state === "over" && clock - overAt > 0.8);

    // Bildrate beobachten: wenn es dauerhaft ruckelt, auf Sparmodus schalten
    let ft = 16, slow = 0;
    function quality(ms){
      if (lowQ || ms > 200) return;
      ft += (ms - ft) * 0.05;
      if (ft > 25){ slow += ms; if (slow > 2000){ lowQ = true; DRAW = 110; size(true); } }
      else slow = 0;
    }

    ctx.loop(ms => {
      const dt = Math.min(ms, 50) / 1000;
      if (state !== "paused"){
        clock += dt;
        if (state === "running") update(dt);
        else if (state === "count") countdown(dt);
        fx(dt);
      }
      audioTick(dt);
      draw();
      quality(ms);
    });

    const onResize = () => size();
    const onVis = () => {
      if (!document.hidden) return;
      pause();
      try{ if (ac) ac.suspend().catch(() => {}); } catch(e){}
    };
    size();
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    const ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(body);
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "▶", key: "ArrowRight" },
      { label: "▼", key: "ArrowDown", aria: "Bremse" }, { label: "⏯", key: "p", aria: "Pause" },
    ]);
    body.addEventListener("pointerdown", () => { if (canRestart()) startRace(); else if (state === "paused") resume(); });
    reset();
    updBar();
    const sub = `color:${C.dim}`;
    overlay(`<div class="big" style="font-size:30px;letter-spacing:.5em;color:${C.bright};text-shadow:0 0 14px ${C.green}">RACE</div>
      <div style="color:${C.amber}">überholen · Checkpoint = +${BONUS} s</div>
      <div style="${sub}">${ctx.touch ? "Gas geht von allein · ▼ bremst" : "← → lenken · ↑ gas · ↓ bremse"}</div>
      <div style="${sub}">${ctx.touch ? "◀ ▶ lenken · ⏯ pause" : "P pause · M ton · Q exit"}</div>
      <div style="margin-top:10px">${ctx.touch ? "tippen zum Start" : "ENTER = start"}</div>`);

    return {
      stop(){
        removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        if (ro) ro.disconnect();
        audioClose();
      },
      key(e){
        const k = e.key;
        if (k.startsWith("Arrow")){ if (k === "ArrowUp" && state === "ready") startRace(); return true; }
        if (k === "Enter" || k === " "){ if (canRestart()) startRace(); else if (state === "paused") resume(); return true; }
        if (k === "p" || k === "P"){ if (state === "paused") resume(); else pause(); return true; }
        if (k === "m" || k === "M"){ toggleMute(); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return ["w", "a", "s", "d"].includes(k.toLowerCase());
      },
    };
  },
});
