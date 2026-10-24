/* race — Pseudo-3D-Rennen im Neon-Look: OutRun trifft Synthwave, auf einem
   grünen Röhrenmonitor. Die Strecke besteht aus kurzen Segmenten mit Kurve
   und Höhe. Gezeichnet wird von hinten nach vorne (Maler-Prinzip): jedes
   Segment füllt seinen Boden über die volle Breite, dadurch verdecken nähere
   Kuppen automatisch alles dahinter – auch Palmen, Laternen und Gegner.
   Checkpoints bringen Zeit. Ein Rennen geht über zwei Runden bis ins Ziel,
   danach wartet Stage 2 bei Nacht. Alles ist Canvas-Code, keine Bilddateien.
   Stufen: leicht (viel Zeit, wenig Verkehr, Rempler bremsen nur kurz), normal,
   schwer (knappere Zeit, dichter Verkehr). L oder Knopf auf Start-/Endbildschirm. */

OE.register({
  id: "race",
  alias: ["racer", "drive"],
  title: "race.exe",
  desc: "Autorennen in Pseudo-3D. Zwei Stages, Checkpoints, Ziel auf Zeit.",
  demo: true,
  start(ctx){
    const SEG = 200, ROAD = 2000, CAM_H = 1000, FOV = 100;
    const DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
    const MAX = SEG * 60, ACC = MAX / 5, BRAKE = -MAX, DECEL = -MAX / 5, OFF_DECEL = -MAX / 2, OFF_MAX = MAX / 4;
    let LIMIT = 90;                         // harte Obergrenze je Stage in Sekunden
    /* Stufen: Zeit (Start, Bonus, Obergrenze), Verkehr als Faktor, wie stark Auffahren
       und Hindernisse bremsen (Anteil vom Tempo, der bleibt) */
    const LV = {
      leicht: { t0: 80, bonus: 25, limit: 120, cars: 0.35, bump: 0.8, hit: 0.65 },
      normal: { t0: 0, bonus: 0, limit: 90, cars: 1, bump: 0, hit: 0.25 },
      schwer: { t0: -3, bonus: -3, limit: 80, cars: 1.4, bump: 0, hit: 0.2 },
    };
    const lvs = ctx.levels();
    let lv = ctx.demo ? "normal" : lvs.value, LC = LV[lv];
    // Stages: Runden, Segmente pro Runde, Startzeit, Bonus je Checkpoint, Verkehr, Kurven, Hügel,
    // Wertung (Sekunden für S/A/B, langsamer = C). Startzeit + 3 Boni bleibt unter LIMIT.
    const STAGES = [
      { name: "STAGE 1", sub: "SUNSET DRIVE", laps: 2, segs: 1500, t0: 25, bonus: 18, cars: 22, curve: 6, hill: 60, night: false, rank: [58, 65, 72] },
      { name: "STAGE 2", sub: "NIGHT CITY", laps: 2, segs: 1300, t0: 22, bonus: 16, cars: 34, curve: 8.5, hill: 90, night: true, rank: [54, 60, 67] },
    ];
    const RANKS = [["S", "TURBO-LEGENDE"], ["A", "ASPHALT-PROFI"], ["B", "SONNTAGSFAHRER"], ["C", "GERADE SO"]];
    let stage = 0, ST = STAGES[0];
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
    // wird je Stage neu gebaut; Länge genau ST.segs, damit Runden und Wertung vergleichbar bleiben
    const segs = [];
    let N = 0, LEN = 0, nCp = 2, cpStep = 0, nextCp = null;
    const lastY = () => segs.length ? segs[segs.length - 1].p2.y : 0;
    function addSeg(curve, y){
      const n = segs.length;
      segs.push({ i: n, curve, p1: { y: lastY(), z: n * SEG }, p2: { y, z: (n + 1) * SEG }, sp: null, cp: false, fin: n < 3,
        ax: 0, ay: 0, aw: 0, bx: 0, by: 0, bw: 0, n: 0, fr: -1, fog: 0, fi: 0, road: false });
    }
    const ease = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
    function addRoad(enter, hold, leave, curve, height){
      const y0 = lastY(), y1 = y0 + height * SEG, total = enter + hold + leave;
      for (let n = 0; n < enter; n++) addSeg(ease(0, curve, n / enter), ease(y0, y1, n / total));
      for (let n = 0; n < hold; n++) addSeg(curve, ease(y0, y1, (enter + n) / total));
      for (let n = 0; n < leave; n++) addSeg(ease(curve, 0, n / leave), ease(y0, y1, (enter + hold + n) / total));
    }
    const segAt = z => segs[Math.floor((((z % LEN) + LEN) % LEN) / SEG)];
    const R = () => ctx.rint(0, 1) ? 1 : -1;
    const BOARDS = ["OEAPP.DE", "ESC = EXIT", "VOLLGAS", "sudo gas", "404 BREMSE", "NO SIGNAL", "> run race", "TURBO.EXE"];
    const SOLID = { palm: 0.06, lamp: 0.03, chev: 0.12, board: 0.72 };   // halbe Breite fürs Anfahren
    const put = (s, sp) => (s.sp || (s.sp = [])).push(sp);

    function build(){
      segs.length = 0;
      addRoad(30, 40, 30, 0, 0);
      for (let i = 0; segs.length + 130 <= ST.segs - 120; i++){
        const kind = i % 3;
        const curve = kind === 0 ? 0 : R() * (2 + Math.random() * (ST.curve - 2));
        const hill = (Math.random() - 0.5) * (i % 2 ? ST.hill : 20);
        addRoad(25, 30 + ctx.rint(0, 50), 25, curve, hill);
      }
      addRoad(40, ST.segs - segs.length - 80, 40, 0, -lastY() / SEG);   // zurück auf Höhe 0, damit die Runde nahtlos ist
      N = segs.length; LEN = N * SEG;

      /* Kulisse am Straßenrand */
      // Checkpoints gleichmäßig verteilen: Start/Ziel und einer zur Rundenhälfte
      cpStep = N / nCp;
      for (let k = 0; k < nCp; k++){
        const s = segs[Math.floor(k * cpStep)];
        s.cp = true; put(s, k ? { kind: "gate", off: 0, text: "CHECKPOINT" } : { kind: "gate", off: 0, fin: true });
      }
      // Segmente bis zum nächsten Checkpoint (für die Fortschrittsanzeige), zweimal wegen Rundenübergang
      nextCp = new Int32Array(N);
      for (let pass = 0, d = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--){ d = segs[i].cp ? 0 : d + 1; nextCp[i] = d; }
      const nearGate = i => { for (let k = -4; k <= 4; k++) if (segs[(i + k + N) % N].cp) return true; return false; };
      for (const s of segs){
        const i = s.i;
        if (nearGate(i)) continue;
        let zone = Math.floor(i / 160) % 4;   // 0 Palmenstrand · 1 Stadtrand · 2 Wüste · 3 gemischt
        if (ST.night && zone === 3) zone = 1;  // nachts mehr Stadt mit Laternen
        const lampEvery = zone === 1 ? 12 : 30;
        if (i % lampEvery === 0) put(s, { kind: "lamp", off: (i / lampEvery) % 2 ? 1.28 : -1.28 });
        else if (Math.abs(s.curve) > 1.2 && i % 6 === 0) put(s, { kind: "chev", off: s.curve > 0 ? -1.36 : 1.36, dir: s.curve > 0 ? 1 : -1 });
        if (i % 70 === 35 && zone !== 1) put(s, { kind: "board", off: Math.random() < 0.5 ? -2.2 : 2.2, text: BOARDS[ctx.rint(0, BOARDS.length - 1)] });
        else if (Math.random() < [0.24, 0.05, 0.03, 0.12][zone]){
          const side = Math.random() < 0.5 ? -1 : 1;
          put(s, { kind: "palm", off: side * (1.55 + Math.random() * 2.6), lean: side * (0.08 + Math.random() * 0.2), hgt: 0.95 + Math.random() * 0.45 });
        }
      }
    }

    /* ---------- Farben mit Nebel (vorberechnet, damit pro Bild keine Strings entstehen) ---------- */
    const FL = 24;
    let FOG = [5, 34, 15], L = null;
    const lut = c => Array.from({ length: FL }, (_, k) => rgb(mix(c, FOG, k / (FL - 1))));
    function palette(){   // nachts dunklerer Nebel, die Ferne verschwindet im Schwarz
      FOG = ST.night ? [2, 12, 6] : [5, 34, 15];
      L = {
        groundA: lut([2, 9, 4]), groundB: lut([4, 15, 7]),
        roadA: lut([13, 21, 16]), roadB: lut([18, 28, 21]),
        rumbleA: lut([36, 190, 80]), rumbleB: lut([5, 26, 12]),
        lane: lut([166, 255, 184]), edge: lut([90, 255, 140]), grid: lut([18, 105, 44]), check: lut([255, 180, 84]),
        fin: lut([235, 255, 240]),
      };
    }
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
      if (ST.night){ sky.addColorStop(0, "#000000"); sky.addColorStop(0.7, "#010503"); sky.addColorStop(1, "#05200d"); }
      else { sky.addColorStop(0, "#000000"); sky.addColorStop(0.55, "#020b05"); sky.addColorStop(0.86, "#06260f"); sky.addColorStop(1, "#11502a"); }
      x.fillStyle = sky; x.fillRect(0, 0, w, HZ + 2);
      const stars = Math.min(ST.night ? 320 : 160, (w * HZ / (ST.night ? 1100 : 2500)) | 0);
      for (let k = 0; k < stars; k++){
        const sx = rnd() * w, sy = rnd() * HZ * 0.7, b = rnd();
        x.fillStyle = `rgba(200,255,212,${0.15 + b * 0.6})`;
        x.fillRect(sx, sy, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1);
      }

      // Retro-Sonne mit Streifen und Hof
      sunR = Math.max(26, Math.min(w * 0.17, HZ * 0.55));
      const S2 = sunR * 1.9;
      [sunC, x] = layer(S2 * 2, S2 * 2);
      if (ST.night){   // Mond statt Sonne: blasse Scheibe mit Kratern und Hof
        const mr = sunR * 0.26;
        const halo2 = x.createRadialGradient(S2, S2, mr, S2, S2, mr * 3);
        halo2.addColorStop(0, "rgba(166,255,184,.22)"); halo2.addColorStop(1, "rgba(166,255,184,0)");
        x.fillStyle = halo2; x.fillRect(0, 0, S2 * 2, S2 * 2);
        x.fillStyle = "#8fdca0"; x.beginPath(); x.arc(S2, S2, mr, 0, TAU); x.fill();
        x.fillStyle = "rgba(26,138,54,.45)";
        for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.3], [-0.1, 0.45, 0.14], [0.4, -0.4, 0.12]]){ x.beginPath(); x.arc(S2 + cx * mr, S2 + cy * mr, cr * mr, 0, TAU); x.fill(); }
      } else {
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
      }

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
          if (rnd() < (ST.night ? 0.32 : 0.2)){ x.fillStyle = rnd() < 0.6 ? "rgba(255,180,84,.7)" : "rgba(166,255,184,.6)"; x.fillRect(wx, wy, 1.6, 1.6); }
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
    let raceT = 0, startGap = 0, goal = 1, finAt = 0, lastT = [0, 0], cpText = "CHECKPOINT";   // Fahrzeit, Weg bis Startlinie, Weg bis Ziel
    let shake = 0, flash = 0, checkFlash = 0, goT = 0, countT = 0, hitCool = 0, overAt = 0, clock = 0;
    let skyOff = 0, sunDrift = 0, steerVis = 0, passed = 0, cpCount = 0, vmax = 0, gasOn = false, braking = false;
    let gear = 1, rpm = 0.12;
    // Bestzeiten in Sekunden: Stage 1, Stage 2, beide zusammen (0 = noch keine)
    // je Stufe getrennt, normal behält die alten Schlüssel
    const bestKeys = () => ["race.t1", "race.t2", "race.tot"].map(k => lv === "normal" ? k : k + "." + lv);
    const best = bestKeys().map(k => +ctx.store.get(k, 0) || 0);
    let muted = ctx.demo || !!ctx.store.get("race.mute", false);
    let police = !ctx.demo && !!ctx.store.get("race.police", false);
    let cop = null, caughtT = 0, squeal = 0, horn = false;   // Polizeiauto, Banner "angehalten", Quietschen 0..1, Hupe gedrückt
    const parts = [];   // Funken und Staub

    function reset(){
      pos = LEN - SEG * 14;   // kurz vor dem Starttor
      LIMIT = LC.limit;
      px = 0; speed = 0; time = LC.t0 > 0 ? LC.t0 : ST.t0 + LC.t0; dist = 0; raceT = 0; shake = 0; flash = 0; checkFlash = 0; goT = 0; hitCool = 0;
      passed = 0; cpCount = 0; vmax = 0; steerVis = 0; sunDrift = 0; gear = 1; rpm = 0.12;
      lastSeg = segAt(pos + PLAYER_Z).i;
      startGap = LEN - (pos + PLAYER_Z) % LEN; goal = startGap + ST.laps * LEN;
      parts.length = 0;
      const nc = Math.round(ST.cars * LC.cars), fast = ST.night ? 0.5 : 0.4;
      cars = Array.from({ length: nc }, (_, i) => {
        const col = COLS[i % COLS.length], c3 = hex(col);
        return {
          z: (i + 1) * (LEN / (nc + 1)), off: (ctx.rint(0, 2) - 1) * 0.62 + (Math.random() - 0.5) * 0.12,
          speed: MAX * (0.25 + Math.random() * fast), ahead: undefined, offT: null,
          look: { col, type: ctx.rint(0, 2), body: rgb(mix(c3, [0, 0, 0], 0.84)), cab: rgb(mix(c3, [0, 0, 0], 0.92)) },
          n: 0, t: 0, X: 0, Y: 0, S: 0, fog: 0,
        };
      });
      cop = police ? { z: ((pos + PLAYER_Z - SEG * 90) % LEN + LEN) % LEN, off: 0, wait: 6 } : null;
      caughtT = 0;
    }
    const PLAYER_LOOK = { col: C.bright, type: 0, body: "#06200d", cab: "#031207" };

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }
    const sfx = (f, ms, type, vol) => { if (!muted) ctx.beep(f, ms, type, vol); };

    // Zeit als m:ss.s
    const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
    const bonus = () => ST.bonus + LC.bonus;
    const lapNo = () => dist < startGap ? 1 : Math.min(ST.laps, Math.floor((dist - startGap) / LEN) + 1);
    const rankOf = (t, lim) => RANKS[lim.findIndex(v => t <= v) < 0 ? 3 : lim.findIndex(v => t <= v)];

    let barKey = "";
    function updBar(){
      const key = best + "|" + muted + "|" + police + "|" + lv;
      if (key === barKey) return;
      barKey = key;
      bar.innerHTML = `<span data-level style="cursor:pointer">stufe <b>${lv}</b>${ctx.touch ? "" : " (L)"}</span><span>bestzeit <b>${best[0] ? fmtT(best[0]) : "–"}</b>${best[2] ? ` · gesamt <b>${fmtT(best[2])}</b>` : ""}</span>
        <span data-mute style="cursor:pointer">ton <b>${muted ? "aus" : "an"}</b>${ctx.touch ? "" : " (M)"}</span>
        <span data-police style="cursor:pointer">polizei <b style="color:${police ? "#7ab8ff" : ""}">${police ? "an" : "aus"}</b>${ctx.touch ? "" : " (C)"}</span>
        <span class="right">${ctx.touch ? "▼ bremst · HUP hupt · ⏯ pause" : "↑ gas · ↓ bremse · ← → lenken · H hupe · P pause"}</span>`;
    }
    bar.addEventListener("click", e => {
      if (e.target.closest("[data-mute]")) toggleMute();
      if (e.target.closest("[data-police]")) togglePolice();
      if (e.target.closest("[data-level]")) setLevel();
    });
    function togglePolice(){
      police = !police; ctx.store.set("race.police", police);
      if (police && !cop) cop = { z: ((pos + PLAYER_Z - SEG * 90) % LEN + LEN) % LEN, off: px, wait: 4 };
      if (!police) cop = null;
      updBar();
    }

    /* ---------- Ton: Motor aus mehreren Schichten, Reifen, Hupe, Martinshorn ----------
       Motor: Grundton (Säge) + halbe Frequenz (Rechteck) + Oberton, durch einen Tiefpass,
       dazu gefiltertes Rauschen (Auspuff) und ein Zündtakt, der die Lautstärke pulsieren
       lässt. Alles folgt Drehzahl und Gaspedal, mit etwas Zufall, damit es lebt. */
    let ac = null, eng = null, audT = 0, quietT = 0, lastGear = 1, wob = 0, popT = 0;
    function audioInit(){
      if (ac || muted) return;
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const o = (type, f) => { const x = ac.createOscillator(); x.type = type; x.frequency.value = f; x.start(); return x; };
        const gn = v => { const x = ac.createGain(); x.gain.value = v; return x; };
        const flt = (type, f, q = 1) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
        const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        const noiseSrc = () => { const x = ac.createBufferSource(); x.buffer = noiseBuf; x.loop = true; x.start(); return x; };
        const out = gn(1); out.connect(ac.destination);

        // Motor
        const o1 = o("sawtooth", 45), o2 = o("square", 22.5), o3 = o("triangle", 90);
        const sub = gn(0.45), harm = gn(0.0), lp = flt("lowpass", 400, 3), pulse = gn(1), vol = gn(0);
        o1.connect(lp); o2.connect(sub); sub.connect(lp); o3.connect(harm); harm.connect(lp);
        lp.connect(pulse); pulse.connect(vol); vol.connect(out);
        const fire = o("sine", 11), fireAmt = gn(0.0);   // Zündtakt: moduliert die Lautstärke
        fire.connect(fireAmt); fireAmt.connect(pulse.gain);
        const ex = noiseSrc(), exBp = flt("bandpass", 500, 1.2), exVol = gn(0);   // Auspuffrauschen
        ex.connect(exBp); exBp.connect(exVol); exVol.connect(out);

        // Reifen: schmalbandiges Rauschen, Tonhöhe wackelt
        const ti = noiseSrc(), tiBp = flt("bandpass", 1700, 9), tiBp2 = flt("bandpass", 2300, 12), tiVol = gn(0);
        ti.connect(tiBp); ti.connect(tiBp2); tiBp.connect(tiVol); tiBp2.connect(tiVol); tiVol.connect(out);

        // Hupe: zwei Töne im Abstand einer Terz, leicht verzerrt
        const h1 = o("square", 415), h2 = o("square", 523), hLp = flt("lowpass", 1800, 1), hVol = gn(0);
        h1.connect(hLp); h2.connect(hLp); hLp.connect(hVol); hVol.connect(out);

        // Martinshorn: Tatütata, Lautstärke nach Abstand
        const sir = o("sawtooth", 466), sirLp = flt("lowpass", 1600, 1), sirVol = gn(0);
        sir.connect(sirLp); sirLp.connect(sirVol); sirVol.connect(out);

        eng = { o1, o2, o3, harm, lp, vol, fire, fireAmt, exBp, exVol, tiBp, tiBp2, tiVol, hVol, sir, sirVol, out };
      } catch(e){ ac = null; eng = null; }
    }
    function audioTick(dt){
      if (!eng) return;
      const on = !muted && (state === "running" || state === "count" || state === "finish");
      quietT = on ? 0 : quietT + dt;
      audT -= dt;
      if (audT > 0) return;
      audT = 0.04;   // nicht jedes Bild neue Automationspunkte setzen
      try{
        if (on && ac.state === "suspended") ac.resume().catch(() => {});
        if (!on && quietT > 0.3 && ac.state === "running"){ ac.suspend().catch(() => {}); return; }
        const t = ac.currentTime, ratio = speed / MAX;
        // langsames Schwanken + kleines Zittern: kein Motor läuft wie ein Sinuston
        wob += dt * (2 + rpm * 3);
        const wobble = Math.sin(wob * 2.3) * 1.2 + Math.sin(wob * 5.1) * 0.6 + (Math.random() - 0.5) * 1.5;
        const f = 34 + rpm * 110 + gear * 5 + wobble;
        eng.o1.frequency.setTargetAtTime(f, t, 0.05);
        eng.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
        eng.o3.frequency.setTargetAtTime(f * 2.01, t, 0.05);
        eng.harm.gain.setTargetAtTime(gasOn ? 0.15 + rpm * 0.35 : 0.05, t, 0.1);          // bei Last mehr Obertöne
        eng.fire.frequency.setTargetAtTime(f / 4, t, 0.05);
        eng.fireAmt.gain.setTargetAtTime(gasOn ? 0.18 : 0.38, t, 0.1);                   // im Schiebebetrieb blubbert es
        eng.lp.frequency.setTargetAtTime(220 + rpm * 950 + (gasOn ? 420 : 0), t, 0.08);
        eng.exBp.frequency.setTargetAtTime(260 + rpm * 900, t, 0.08);
        eng.exVol.gain.setTargetAtTime(on ? (gasOn ? 0.012 + rpm * 0.02 : 0.006) : 0, t, 0.08);
        eng.vol.gain.setTargetAtTime(on ? 0.016 + rpm * 0.014 : 0, t, on ? 0.08 : 0.03);

        // Schalten: kurz Leistung weg, dann wieder da
        if (gear > lastGear && state === "running"){
          eng.vol.gain.setTargetAtTime(0.006, t, 0.02);
          eng.vol.gain.setTargetAtTime(0.016 + rpm * 0.014, t + 0.09, 0.05);
          sfx(120, 40, "sawtooth", 0.025);
        }
        lastGear = gear;
        // Gas weg bei hoher Drehzahl: Fehlzündungen im Auspuff
        popT -= 0.04;
        if (!gasOn && rpm > 0.55 && state === "running" && popT <= 0 && Math.random() < 0.25){
          popT = 0.15 + Math.random() * 0.3;
          sfx(70 + Math.random() * 60, 25, "square", 0.03);
        }

        // Reifen
        const sq = on ? squeal : 0;
        eng.tiVol.gain.setTargetAtTime(sq * 0.05, t, sq > 0.05 ? 0.05 : 0.12);
        eng.tiBp.frequency.setTargetAtTime(1500 + Math.sin(wob * 9) * 250 + ratio * 300, t, 0.03);
        eng.tiBp2.frequency.setTargetAtTime(2100 + Math.sin(wob * 13) * 300, t, 0.03);

        // Hupe
        eng.hVol.gain.setTargetAtTime(horn && on ? 0.05 : 0, t, 0.015);

        // Martinshorn: je näher, desto lauter; Ton wechselt alle 0,65 s
        let sv = 0;
        if (cop && on){
          const back = copGap();
          sv = back < SEG * 140 ? 0.035 * Math.pow(1 - back / (SEG * 140), 1.5) + 0.004 : 0;
          eng.sir.frequency.setValueAtTime((clock / 0.65 | 0) % 2 ? 622 : 466, t);
        }
        eng.sirVol.gain.setTargetAtTime(sv, t, 0.1);
      } catch(e){}
    }
    function audioClose(){
      try{ if (ac) ac.close(); } catch(e){}
      ac = null; eng = null;
    }
    function toggleMute(){
      muted = !muted; ctx.store.set("race.mute", muted);
      if (!muted) audioInit();
      updBar();
    }

    // Abstand der Polizei hinter dem eigenen Auto (Streckeneinheiten)
    const copGap = () => cop ? (((pos + PLAYER_Z) - cop.z) % LEN + LEN) % LEN : Infinity;

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
    /* ---------- Vorführung: Vollgas, Spur wählen, an Verkehr vorbei ---------- */
    const LANE = [-0.62, 0, 0.62];
    let aiLane = 1;
    function pilot(){
      const k = new Set(["ArrowUp"]), me = pos + PLAYER_Z;
      // freie Strecke je Spur: Abstand zum nächsten Auto vor uns, das in der Spur fährt
      const room = LANE.map(o => {
        let gap = LEN;
        for (const c of cars){
          const d = ((c.z - me) % LEN + LEN) % LEN;
          if (d < SEG * 60 && Math.abs(c.off - o) < CAR * 2 + 0.08) gap = Math.min(gap, d);
        }
        return gap;
      });
      // neben uns (knapp hinter bis knapp vor) darf keiner sein, sonst kein Wechsel
      const side = o => cars.some(c => { const d = ((c.z - me) % LEN + LEN) % LEN; return (d < SEG * 3 || d > LEN - SEG * 2) && Math.abs(c.off - o) < CAR * 2 + 0.04; });
      if (room[aiLane] < SEG * 28){
        let pickL = aiLane;
        for (const l of [aiLane - 1, aiLane + 1].sort(() => Math.random() - 0.5)){
          if (l < 0 || l > 2 || side(LANE[l]) || (l !== aiLane && Math.abs(l - aiLane) > 1)) continue;
          if (room[l] > room[pickL] + SEG * 4) pickL = l;
        }
        aiLane = pickL;
        if (room[aiLane] < SEG * 8 && speed > MAX * 0.5) k.delete("ArrowUp");   // eng: Gas weg
      }
      // lenken mit etwas Vorhalt gegen die Fliehkraft
      const seg = segAt(me), err = LANE[aiLane] - px + seg.curve * 0.01 * (speed / MAX);
      if (err > 0.05) k.add("ArrowRight"); else if (err < -0.05) k.add("ArrowLeft");
      return k;
    }

    function update(dt){
      const k = ctx.demo ? pilot() : ctx.keys, auto = state === "finish";   // nach dem Ziel rollt das Auto von allein aus
      const gas = !auto && (k.has("ArrowUp") || k.has("w") || (ctx.touch && !k.has("ArrowDown")));
      const brake = !auto && (k.has("ArrowDown") || k.has("s"));
      const left = !auto && (k.has("ArrowLeft") || k.has("a")), right = !auto && (k.has("ArrowRight") || k.has("d"));
      gasOn = gas; braking = brake && speed > 0;
      const ratio = speed / MAX;
      const steer = dt * 2.2 * ratio;

      const seg = segAt(pos + PLAYER_Z);
      if (left) px -= steer;
      if (right) px += steer;
      px -= steer * ratio * seg.curve * 0.06;   // Fliehkraft in Kurven
      steerVis += (((right ? 1 : 0) - (left ? 1 : 0)) * Math.min(1, ratio * 2) - steerVis) * Math.min(1, dt * 8);
      // Reifen quietschen: scharf lenken bei Tempo, enge Kurven, Vollbremsung
      const sqT = clamp(Math.max(
        (Math.abs(steerVis) - 0.55) * 2.2 * clamp((ratio - 0.4) * 2.5, 0, 1),
        (Math.abs(seg.curve) * ratio - 2.6) * 0.45,
        brake && ratio > 0.35 ? (ratio - 0.35) * 1.6 : 0), 0, 1) * (Math.abs(px) > 1 ? 0.2 : 1);
      squeal += (sqT - squeal) * Math.min(1, dt * 10);
      // Hupe: Auto vor dir auf deiner Spur wechselt die Spur
      horn = !auto && k.has("h");
      if (horn) for (const c of cars){
        const gap = ((c.z - (pos + PLAYER_Z)) % LEN + LEN) % LEN;
        if (gap < SEG * 30 && Math.abs(c.off - px) < 0.45 && c.offT == null){
          c.offT = clamp(c.off + (c.off > px ? 0.62 : -0.62), -0.7, 0.7);
          if (Math.abs(c.offT - c.off) < 0.3) c.offT = c.off > 0 ? c.off - 0.62 : c.off + 0.62;
        }
      }

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
              crash(Math.min(1, ratio * (LC.bump ? 1 : 3))); speed *= LC.hit; px += px > sp.off ? 0.08 : -0.08;
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
        if (c.offT != null){ c.off += clamp(c.offT - c.off, -dt * 0.9, dt * 0.9); if (Math.abs(c.offT - c.off) < 0.01) c.offT = null; }
        const gap = ((c.z - (pos + PLAYER_Z)) % LEN + LEN) % LEN;
        const ahead = gap < LEN / 2;
        if (c.ahead === true && !ahead && gap > LEN - SEG * 30){ passed++; sfx(1400, 25, "square", 0.015); }
        else if (c.ahead === false && ahead && gap < SEG * 30) passed = Math.max(0, passed - 1);
        c.ahead = ahead;
        if (gap < SEG * 1.2 && Math.abs(c.off - px) < CAR * 2 && speed > c.speed){
          const hard = (speed - c.speed) / MAX;
          speed = LC.bump ? Math.max(c.speed, speed * LC.bump) : c.speed * 0.6;   // leicht: nur kurz gebremst
          if (LC.bump) c.offT = clamp(c.off + (c.off > px ? 0.62 : -0.62), -0.7, 0.7);   // und der andere weicht aus
          if (hitCool <= 0){ crash(Math.min(1, hard * 2.5)); sfx(110, 220, "square", 0.06); }
        }
      }

      // Polizei: knapp langsamer als Vollgas, holt aber jede Schwäche auf
      if (cop && !auto){
        if (cop.wait > 0) cop.wait -= dt;
        else {
          const back = copGap();
          const want = back > SEG * 250 ? MAX * 1.15 : MAX * 0.95;
          cop.z = (cop.z + want * dt) % LEN;
          cop.off += (px - cop.off) * Math.min(1, dt * 1.5);
          if (copGap() > LEN / 2){   // überholt = erwischt
            caughtT = 2.4; time = Math.max(0, time - 8); speed *= 0.1; crash(0.3);
            sfx(988, 120, "square", 0.05); ctx.after(150, () => sfx(740, 260, "square", 0.05));
            ctx.log("WARN", "race: von der Polizei angehalten — <span class=\"num\">−8 s</span>");
            cop.z = ((pos + PLAYER_Z - SEG * 120) % LEN + LEN) % LEN; cop.wait = 3;
          }
        }
      }
      caughtT = Math.max(0, caughtT - dt);

      const move = speed * dt;
      pos = (pos + move) % LEN;
      dist += move;
      skyOff += seg.curve * ratio * dt * 0.05;
      sunDrift = clamp((sunDrift - seg.curve * ratio * dt * 0.012) * (1 - Math.min(1, dt * 0.4)), -0.3, 0.3);

      // Checkpoint: alle überfahrenen Segmente prüfen, auch wenn ein Bild mehrere überspringt
      const si = segAt(pos + PLAYER_Z).i;
      for (let j = lastSeg, guard = 0; j !== si && guard < 64; guard++){
        j = (j + 1) % N;
        if (segs[j].cp && dist > SEG * 30 && dist < goal - SEG * 5 && !auto){   // Starttor zählt erst nach einer Runde, das Ziel gar nicht
          time += bonus(); checkFlash = 1.8; cpCount++;
          cpText = j === 0 ? (lapNo() === ST.laps ? "LETZTE RUNDE" : `RUNDE ${lapNo()}`) : "CHECKPOINT";
          sfx(988, 90); ctx.after(110, () => sfx(1318, 160));
          ctx.log("OK", `race: ${cpText.toLowerCase()} — <span class="num">${fmtT(raceT)}</span>`);
        }
      }
      lastSeg = si;
      vmax = Math.max(vmax, Math.round(speed / MAX * 280));
      engine(dt, gas);
      if (auto) return;
      const before = Math.ceil(time);
      raceT += dt;
      time = Math.min(time - dt, LIMIT - raceT);   // nie länger als LIMIT, egal wie viele Boni
      if (time < 5 && Math.ceil(time) < before && time > 0) sfx(660, 50, "square", 0.03);
      if (dist >= goal) finish();
      else if (time <= 0){ time = 0; over(); }
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

    const glow = col => `color:${col};text-shadow:0 0 10px ${col}`;
    // Knöpfe im Overlay (für Maus und Finger); ohne Leerraum dazwischen, das Overlay ist white-space:pre
    const btn = (act, label, main) => `<button type="button" data-act="${act}" style="font:inherit;font-size:14px;letter-spacing:.12em;cursor:pointer;padding:9px 16px;margin:4px;background:rgba(0,16,6,.85);color:${main ? C.amber : C.pale};border:1px solid ${main ? C.amber : C.dim};box-shadow:0 0 10px ${main ? "rgba(255,180,84,.35)" : "transparent"}">${label}</button>`;
    const btns = (...b) => `<div style="margin-top:12px;white-space:normal">${b.join("")}</div>`;
    const lvBtn = () => btn("lvl", `STUFE ‹ ${lv.toUpperCase()} ›`);
    const keyHint = s2 => ctx.touch ? "" : `<div style="color:${C.dim};margin-top:2px">${s2} · ESC = exit</div>`;

    function over(){
      state = "over"; overAt = clock; gasOn = false;
      const km = dist / KM, done = clamp(dist / goal, 0, 1);
      sfx(392, 160, "sawtooth"); ctx.after(170, () => sfx(294, 180, "sawtooth")); ctx.after(360, () => sfx(196, 420, "sawtooth"));
      ctx.log("WARN", `race: ${ST.name.toLowerCase()} — Zeit abgelaufen nach <span class="num">${km.toFixed(2)} km</span>`);
      overlay(`<div class="big" style="${glow(C.red)}">GAME OVER</div>
        <div style="${glow(C.amber)}">ZEIT ABGELAUFEN · ${ST.name}</div>
        <div style="font-size:28px;margin:4px 0;${glow(C.bright)}">${km.toFixed(2)} / ${(goal / KM).toFixed(2)} km</div>
        <div style="color:${C.pale}">${Math.floor(done * 100)} % geschafft · Runde ${lapNo()}/${ST.laps}</div>
        <div style="color:${C.dim}">${cpCount} Checkpoint${cpCount === 1 ? "" : "s"} · ${passed} überholt · Spitze ${vmax} km/h</div>
        ${stage ? `<div style="color:${C.dim}">Stage 1 bleibt gewertet: ${fmtT(lastT[0])}</div>` : ""}
        ${btns(btn("again", "↻ NOCHMAL", true), stage ? btn("s1", "VON VORN") : "", lvBtn())}
        ${keyHint(stage ? "ENTER = nochmal · R = von vorn" : "ENTER = nochmal")}`);
    }

    // Zieleinlauf: Zeit sichern, Konfetti, Fanfare – das Ergebnis kommt nach dem Ausrollen
    let res = null;
    function finish(){
      state = "finish"; finAt = clock; checkFlash = 0;
      const t = +raceT.toFixed(1); lastT[stage] = t;
      const rec = !best[stage] || t < best[stage];
      if (rec){ best[stage] = t; ctx.store.set(bestKeys()[stage], t); }
      let tot = 0, recTot = false;
      if (stage === 1 && lastT[0]){
        tot = +(lastT[0] + t).toFixed(1); recTot = !best[2] || tot < best[2];
        if (recTot){ best[2] = tot; ctx.store.set(bestKeys()[2], tot); }
      }
      res = { t, rec, tot, recTot, rest: Math.max(0, time) };
      updBar();
      [523, 659, 784, 1046].forEach((f, i) => ctx.after(i * 120, () => sfx(f, i === 3 ? 420 : 110, "square", 0.05)));
      ctx.log("OK", `race: ${ST.name.toLowerCase()} im Ziel — <span class="num">${fmtT(t)}</span>${rec ? " ★ Bestzeit" : ""}`);
      confetti(60);
    }
    function confetti(n){
      const cols = [C.amber, C.pink, C.bright, C.green, C.red];
      for (let k = 0; k < n && parts.length < 180; k++){
        const life = 1.8 + Math.random() * 1.4;
        parts.push({ x: Math.random() * w, y: -10 - Math.random() * h * 0.3, vx: (Math.random() - 0.5) * 90, vy: 50 + Math.random() * 120,
          life, max: life, grav: 40, col: cols[k % cols.length], spark: false, conf: true, ph: Math.random() * TAU });
      }
    }
    function results(){
      state = "done"; overAt = clock;
      const { t, rec, tot, recTot, rest } = res;
      const [rk, rname] = rankOf(t, ST.rank);
      const stats = `<div style="color:${C.dim}">${passed} überholt · Spitze ${vmax} km/h · Rest ${Math.floor(rest)} s</div>`;
      const head = `<div class="big" style="font-size:30px;${glow(C.green)}">ZIEL!</div>
        <div style="color:${C.dim}">${ST.name} · ${ST.sub}</div>
        <div style="font-size:34px;margin:2px 0;${glow(C.bright)}">${fmtT(t)}</div>
        <div style="color:${rec ? C.amber : C.dim}">${rec ? "★ neue Bestzeit" : `Bestzeit ${fmtT(best[stage])}`}</div>`;
      if (stage === 0){
        overlay(`${head}
          <div style="margin-top:6px">Wertung <b style="font-size:22px;${glow(C.amber)}">${rk}</b> <span style="color:${C.pale}">${rname}</span></div>
          ${stats}
          <div style="color:#7ab8ff;margin-top:6px">als Nächstes: STAGE 2 · NIGHT CITY</div>
          ${btns(btn("next", "STAGE 2 ▸", true), btn("again", "↻ NOCHMAL"), lvBtn())}
          ${keyHint("ENTER = Stage 2 · R = nochmal")}`);
      } else {
        const lim = STAGES[0].rank.map((v, i) => v + STAGES[1].rank[i]);
        const [rk2, rname2] = rankOf(tot, lim);
        overlay(`${head}
          <div style="margin-top:6px;color:${C.dim}">Stage 1 ${fmtT(lastT[0])} + Stage 2 ${fmtT(t)}</div>
          <div style="font-size:22px;${glow(C.amber)}">GESAMT ${fmtT(tot)}</div>
          <div style="color:${recTot ? C.amber : C.dim}">${recTot ? "★ neue Gesamtbestzeit" : `Bestzeit gesamt ${fmtT(best[2])}`}</div>
          <div style="margin-top:6px">Wertung <b style="font-size:22px;${glow(C.amber)}">${rk2}</b> <span style="color:${C.pale}">${rname2}</span></div>
          ${stats}
          ${btns(btn("s1", "↻ NOCHMAL", true), btn("again", "STAGE 2 NOCHMAL"), lvBtn())}
          ${keyHint("ENTER = nochmal · 2 = Stage 2 nochmal")}`);
      }
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
      // Schachbrettlinie an Checkpoints (orange) und an Start/Ziel (weiß, drei Reihen)
      if (seg.cp || seg.fin){
        g.fillStyle = seg.fin ? L.fin[fi] : L.check[fi]; g.beginPath();
        for (let k = seg.fin ? seg.i & 1 : 0; k < 10; k += 2){
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
          if (sp.fin){
            const l = lapNo(), last = dist > startGap + SEG * 30 && l === ST.laps;
            label = dist < startGap + SEG * 30 ? "START" : last ? "ZIEL" : `RUNDE ${l + 1}/${ST.laps}`;
            if (last){   // Zielbanner: Schachbrett obendrauf, Fahnen an den Pfosten
              lcol = C.bright; g.globalAlpha = A;
              for (let c = 0; c < 26; c++) for (let r = 0; r < 2; r++){
                g.fillStyle = (c + r) & 1 ? "#000" : "#e8ffee"; g.fillRect(-1.3 + c * 0.1, -1.37 + r * 0.1, 0.1, 0.1);
              }
              for (const sd of [-1, 1]) for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++){
                const wv = Math.sin(clock * 7 + c * 0.9) * 0.025;
                g.fillStyle = (c + r) & 1 ? "#000" : "#e8ffee";
                g.fillRect(sd * 1.24 + (sd > 0 ? 0.04 : -0.04 - 0.36) + c * 0.09, -0.9 + r * 0.09 + wv, 0.09, 0.09);
              }
            }
          }
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
      g.drawImage(sunC, w / 2 + sunDrift * w - S2 + (ST.night ? w * 0.22 : 0), HZ - sunR * (ST.night ? 1.3 : 0.5) - S2, S2 * 2, S2 * 2);
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
        if (p.conf){   // Konfetti: flatternde Plättchen
          const fl = Math.abs(Math.sin(p.ph + p.life * 9));
          g.fillStyle = p.col; g.fillRect(p.x - 2.5, p.y - 3.5 * fl, 5, 1 + 7 * fl);
        } else if (p.spark){
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
      // links: Runde, Weg bis Ziel, Überholt · rechts: Stage, Fahrzeit, Bestzeit
      const row = n => m + fsL + n * (fsL + fsV + 10);
      txt("RUNDE", m, row(0), fsL, C.dim);
      txt(`${lapNo()}/${ST.laps}`, m, row(0) + fsV + 2, fsV, C.bright, "left", 600, 6);
      txt("ZIEL IN", m, row(1), fsL, C.dim);
      txt(`${(Math.max(0, goal - dist) / KM).toFixed(2)} km`, m, row(1) + fsV + 2, fsV, C.bright, "left", 600, 6);
      txt("ÜBERHOLT", m, row(2), fsL, C.dim);
      txt(String(passed), m, row(2) + fsV + 2, fsV, C.bright, "left", 600, 6);
      txt(ST.name, w - m, row(0), fsL, C.dim, "right");
      txt(fmtT(raceT), w - m, row(0) + fsV + 2, fsV, C.bright, "right", 600, 6);
      txt("BESTZEIT", w - m, row(1), fsL, C.dim, "right");
      txt(best[stage] ? fmtT(best[stage]) : "–", w - m, row(1) + fsV + 2, fsV, C.amber, "right", 600, 6);
      // Mitte: Restzeit und Fortschritt bis zum Ziel (Striche = Checkpoints, Schachbrett = Ziel)
      const low = time < 10, blink = time < 5 && (clock * 4 | 0) & 1;
      txt("ZEIT", w / 2, m + fsL, fsL, C.dim, "center");
      txt(String(Math.ceil(time)), w / 2, m + fsL + fsT, fsT, blink ? C.red : low ? C.amber : C.bright, "center", 700, 10);
      const bw = Math.max(90, 150 * u), by = m + fsL + fsT + 8, bx = w / 2 - bw / 2;
      g.fillStyle = "rgba(51,255,102,.18)"; g.fillRect(bx, by, bw, 4);
      g.fillStyle = C.amber; g.fillRect(bx, by, bw * clamp(dist / goal, 0, 1), 4);
      g.fillStyle = C.pale;
      for (let k = 1; k < ST.laps * nCp; k++) g.fillRect(bx + bw * (startGap + k * LEN / nCp) / goal - 0.5, by - 2, 1, 8);
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++){ g.fillStyle = (c + r) & 1 ? "#000" : "#e8ffee"; g.fillRect(bx + bw + 3 + c * 3, by - 3 + r * 3, 3, 3); }

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
        const fs = Math.max(16, Math.min(w / 18, 32)), ly2 = h * 0.62;   // Stage-Name auf dunklem Band unter der Zahl
        g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, ly2 - fs * 1.1, w, fs * 2.1);
        txt(ST.name, w / 2, ly2, fs, C.bright, "center", 700, 12);
        txt(`${ST.sub} · ${ST.laps} RUNDEN`, w / 2, ly2 + fs * 0.8, fs * 0.6, C.pale, "center", 600);
        g.globalAlpha = 0.35 + 0.65 * f;
        txt(String(n), w / 2, h * 0.42, big * (1 + 0.45 * f), C.amber, "center", 700, 22);
      } else if (goT > 0){
        g.globalAlpha = Math.min(1, goT * 1.5);
        txt("GO!", w / 2, h * 0.42, big * (1.6 - goT * 0.5), C.green, "center", 700, 24);
      }
      if (checkFlash > 0 && (checkFlash < 1.2 || (clock * 8 | 0) & 1)){
        const fs = Math.max(18, Math.min(w / 16, 40));
        g.globalAlpha = Math.min(1, checkFlash * 1.5);
        txt(cpText, w / 2, h * 0.3, fs, C.amber, "center", 700, 16);
        txt(`+${bonus()} s`, w / 2, h * 0.3 + fs * 1.1, fs * 0.8, C.bright, "center", 600, 10);
      }
      if (state === "finish"){   // Zieleinlauf: ZIEL! wächst ein, Fahnen wehen, Zeit darunter
        const t = clock - finAt, fs = Math.max(34, Math.min(w / 7, h * 0.2)) * Math.min(1, 0.4 + t * 2.5);
        g.globalAlpha = Math.min(1, t * 3);
        txt("ZIEL!", w / 2, h * 0.36, fs, C.bright, "center", 700, 24);
        txt(fmtT(res.t), w / 2, h * 0.36 + fs * 0.7, fs * 0.45, C.amber, "center", 700, 12);
        const fw = fs * 0.9, fh = fs * 0.6, cell = fw / 6;
        for (const sd of [-1, 1]){
          const x0 = w / 2 + sd * (fs * 1.55) - (sd < 0 ? fw : 0), y0 = h * 0.36 - fs * 0.9;
          g.fillStyle = C.dim; g.fillRect(sd < 0 ? x0 + fw : x0 - 2, y0, 2, fh * 2.2);
          for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++){
            const wv = Math.sin(clock * 8 + c * 0.8 * sd) * cell * 0.35;
            g.fillStyle = (c + r) & 1 ? "#000" : "#e8ffee";
            g.fillRect(x0 + c * cell, y0 + r * (fh / 4) + wv, cell + 0.5, fh / 4 + 0.5);
          }
        }
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
      if (ST.night){   // Scheinwerferkegel auf der Fahrbahn
        const cx = w / 2 + steerVis * s * 0.1, y0 = h - s * 0.2, y1 = HZ + (h - HZ) * 0.35;
        const hg = g.createLinearGradient(0, y0, 0, y1);
        hg.addColorStop(0, "rgba(200,255,212,.16)"); hg.addColorStop(1, "rgba(200,255,212,0)");
        g.globalCompositeOperation = "lighter"; g.fillStyle = hg; g.beginPath();
        quad(cx - s * 0.7, y0, cx + s * 0.7, y0, cx + s * 1.6 + steerVis * s * 0.6, y1, cx - s * 1.6 + steerVis * s * 0.6, y1); g.fill();
        g.globalCompositeOperation = "source-over";
      }
      drawCar(w / 2 + steerVis * s * 0.1, h - Math.max(8, h * 0.03) + bounce, s, 1, PLAYER_LOOK,
        { brake: braking || state !== "running", roll, yaw: -steerVis * 0.08, mine: true, gas: gasOn && ratio < 0.97 && (state === "running" || state === "count") });
      drawParts();
      g.restore();

      // Polizei hinter dir: Blaulicht spiegelt sich in den unteren Ecken, Abstand im HUD
      if (cop && (state === "running" || state === "count" || state === "paused")){
        const back = copGap();
        if (back < SEG * 140){
          const near = 1 - back / (SEG * 140), ph = (clock * 6 | 0) % 2;
          for (const [sx, col] of [[0, ph ? "70,140,255" : "255,60,80"], [w, ph ? "255,60,80" : "70,140,255"]]){
            const rg = g.createRadialGradient(sx, h, 0, sx, h, Math.max(w, h) * (0.35 + near * 0.35));
            rg.addColorStop(0, `rgba(${col},${(0.15 + near * 0.45).toFixed(3)})`); rg.addColorStop(1, `rgba(${col},0)`);
            g.globalCompositeOperation = "lighter"; g.fillStyle = rg; g.fillRect(0, 0, w, h); g.globalCompositeOperation = "source-over";
          }
          const fs = Math.max(11, Math.min(w / 40, 16));
          txt(`POLIZEI ${Math.round(back / KM * 1000)} m HINTER DIR`, w / 2, h - fs * 1.2, fs, ph ? "#7ab8ff" : "#ff5a6a", "center", 700, 8);
        }
      }
      if (caughtT > 0 && state === "running"){
        const fs = Math.max(20, Math.min(w / 14, 46));
        g.globalAlpha = Math.min(1, caughtT * 1.5);
        txt("ANGEHALTEN!", w / 2, h * 0.36, fs, "#7ab8ff", "center", 700, 18);
        txt("−8 s", w / 2, h * 0.36 + fs * 1.1, fs * 0.75, C.red, "center", 600, 10);
        g.globalAlpha = 1;
      }

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
    function setStage(n){
      const night = ST.night;
      stage = n; ST = STAGES[n];
      build(); palette();
      if (night !== ST.night) size(true);   // Himmel, Sonne/Mond neu malen
    }
    function startRace(n = stage){
      setStage(n); reset(); state = "count"; countT = 3; overlay(null);
      audioInit(); sfx(440, 120, "square", 0.05);
      if (n) ctx.log("INFO", "race: STAGE 2 · NIGHT CITY");
    }
    // Knöpfe und ENTER: next = Stage 2, again = Stage wiederholen, s1 = von vorn
    function act(a){
      if (a === "lvl") return setLevel();
      if (a === "go") a = "s1";
      if (!canRestart()) return;
      if (a === "next" && !(state === "done" && stage === 0)) a = "again";
      startRace(a === "next" ? 1 : a === "s1" ? 0 : stage);
    }
    // Stufe nur auf Start- und Endbildschirmen; danach wieder der Start (Stage 1)
    function setLevel(){
      if (ctx.demo || !canRestart()) return;
      lv = lvs.next(); LC = LV[lv];
      bestKeys().forEach((k, i) => { best[i] = +ctx.store.get(k, 0) || 0; });
      lastT = [0, 0];
      if (stage) setStage(0);
      reset(); state = "ready"; updBar(); title();
      sfx(lv === "leicht" ? 660 : lv === "normal" ? 880 : 1100, 60, "square", 0.04);
    }
    const enterAct = () => state === "done" ? (stage === 0 ? "next" : "s1") : state === "ready" ? "s1" : "again";
    function pause(){
      if (state !== "running" && state !== "count") return;
      pausedFrom = state; state = "paused";
      overlay(`<div class="big">PAUSE</div><div style="color:${C.dim}">${ctx.touch ? "⏯ oder tippen" : "P"} = weiter</div>`);
    }
    function resume(){
      if (state !== "paused") return;
      state = pausedFrom; overlay(null); audioInit();
    }
    const canRestart = () => state === "ready" || ((state === "over" || state === "done") && clock - overAt > 0.8);

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
        if (state === "running" || state === "finish") update(dt);
        else if (state === "count") countdown(dt);
        if (state === "finish"){
          if (clock - finAt < 1.6 && Math.random() < 0.6) confetti(2);
          if (clock - finAt > 2.8) results();
        }
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
      { label: "▼", key: "ArrowDown", aria: "Bremse" }, { label: "HUP", key: "h", aria: "Hupe" }, { label: "⏯", key: "p", aria: "Pause" },
    ]);
    body.addEventListener("pointerdown", e => {
      const b = e.target.closest("[data-act]");
      if (b){ e.preventDefault(); act(b.dataset.act); return; }
      if (state === "ready") act("s1");
      else if (state === "over" || state === "done") act(enterAct());
      else if (state === "paused") resume();
    });
    build(); palette();
    reset();
    updBar();
    function title(){
      const sub = `color:${C.dim}`;
      overlay(`<div class="big" style="font-size:30px;letter-spacing:.5em;color:${C.bright};text-shadow:0 0 14px ${C.green}">RACE</div>
        <div style="color:${C.amber}">2 Runden bis ins Ziel · Checkpoint = +${bonus()} s</div>
        <div style="color:${C.pale}">${lv === "leicht" ? "viel Zeit, wenig Verkehr · danach STAGE 2 bei Nacht" : "danach STAGE 2 bei Nacht"}</div>
        <div style="${sub}">${ctx.touch ? "Gas geht von allein · ▼ bremst" : "← → lenken · ↑ gas · ↓ bremse"}</div>
        <div style="${sub}">${ctx.touch ? "◀ ▶ lenken · HUP hupt · ⏯ pause" : "H hupe · P pause · M ton · Q exit"}</div>
        <div style="color:#7ab8ff">Polizei ${police ? "ist an" : "zuschalten"}: ${ctx.touch ? "oben auf „polizei“ tippen" : "Taste C"}</div>
        ${btns(btn("go", "▸ START", true), lvBtn())}
        ${keyHint("ENTER = start · L = stufe")}`);
    }
    if (ctx.demo){   // Vorführung: kein Titel, kein Countdown – fliegender Start
      state = "running"; speed = MAX * 0.7; gear = 4; rpm = 0.6;
    } else title();

    // nur zum Testen: race --debug
    if (ctx.args.includes("--debug")) window.OE_RACE = {
      get s(){ return { state, stage, lv, px, speed: speed / MAX, time, raceT, dist, goal, curve: segAt(pos + PLAYER_Z).curve,
        cars: cars.map(c => ({ gap: ((c.z - (pos + PLAYER_Z)) % LEN + LEN) % LEN / SEG, off: c.off })) }; },
    };

    return {
      stop(){
        delete window.OE_RACE;
        removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        if (ro) ro.disconnect();
        audioClose();
      },
      key(e){
        const k = e.key;
        if (k.startsWith("Arrow")){ if (k === "ArrowUp" && state === "ready") startRace(0); return true; }
        if (k === "Enter" || k === " "){ if (canRestart()) act(enterAct()); else if (state === "paused") resume(); return true; }
        if (k === "r" || k === "R"){ act(state === "done" && stage === 0 ? "again" : "s1"); return true; }
        if (k === "2"){ if (state === "done" && stage === 1) act("again"); return true; }
        if (k === "p" || k === "P"){ if (state === "paused") resume(); else pause(); return true; }
        if (k === "m" || k === "M"){ toggleMute(); return true; }
        if (k === "c" || k === "C"){ togglePolice(); return true; }
        if (k === "l" || k === "L"){ setLevel(); return true; }
        if (k === "h" || k === "H") return true;   // Hupe läuft über ctx.keys (gedrückt halten)
        if (k === "q"){ ctx.exit(); return true; }
        return ["w", "a", "s", "d"].includes(k.toLowerCase());
      },
    };
  },
});
