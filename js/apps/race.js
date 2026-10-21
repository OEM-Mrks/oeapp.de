/* race — Pseudo-3D-Rennen im Vektor-Look (Night Driver trifft OutRun).
   Die Strecke besteht aus kurzen Segmenten mit Kurve und Höhe; jedes
   Bild wird von hinten nach vorne projiziert, verdeckte Teile hinter
   Kuppen werden weggelassen. Checkpoints bringen Zeit. */

OE.register({
  id: "race",
  alias: ["racer", "drive"],
  title: "race.exe",
  desc: "Autorennen in Pseudo-3D. Überholen, Checkpoints, Zeit.",
  start(ctx){
    const SEG = 200, ROAD = 2000, DRAW = 160, CAM_H = 1000, FOV = 100;
    const DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
    const MAX = SEG * 60, ACC = MAX / 5, BRAKE = -MAX, DECEL = -MAX / 5, OFF_DECEL = -MAX / 2, OFF_MAX = MAX / 4;
    const CHECK_EVERY = 700, BONUS = 12;   // Segmente zwischen zwei Checkpoints, Zeitbonus
    const KM = 154000;                      // Streckeneinheiten pro km (MAX entspricht 280 km/h)
    const CAR = 0.15;                       // halbe Autobreite in Straßenbreiten

    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas" style="width:100%;height:100%"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");

    let w = 0, h = 0;
    function size(){
      const dpr = window.devicePixelRatio || 1;
      w = body.clientWidth; h = body.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ---------- Strecke ---------- */
    const segs = [];
    const lastY = () => segs.length ? segs[segs.length - 1].p2.y : 0;
    function addSeg(curve, y){
      const n = segs.length;
      segs.push({ i: n, curve, p1: { x: 0, y: lastY(), z: n * SEG }, p2: { x: 0, y, z: (n + 1) * SEG } });
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
    const LEN = segs.length * SEG;
    const segAt = z => segs[Math.floor(((z % LEN) + LEN) % LEN / SEG)];

    /* ---------- Zustand ---------- */
    const PLAYER_Z = CAM_H * DEPTH;
    let pos, px, speed, time, dist, lastSeg, cars, state = "ready", shake = 0, checkFlash = 0, skyOff = 0;
    let best = ctx.store.get("race.best", 0);

    function reset(){
      pos = 0; px = 0; speed = 0; time = 30; dist = 0; lastSeg = 0; shake = 0;
      cars = Array.from({ length: 22 }, (_, i) => ({
        z: (i + 1) * (LEN / 23), off: (Math.random() * 1.6 - 0.8), speed: MAX * (0.25 + Math.random() * 0.4),
      }));
    }

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    /* ---------- Spiellogik ---------- */
    function update(dt){
      const k = ctx.keys;
      const gas = k.has("ArrowUp") || k.has("w") || (ctx.touch && !k.has("ArrowDown"));
      const brake = k.has("ArrowDown") || k.has("s");
      const left = k.has("ArrowLeft") || k.has("a"), right = k.has("ArrowRight") || k.has("d");
      const ratio = speed / MAX;
      const steer = dt * 2.2 * ratio;

      const seg = segAt(pos + PLAYER_Z);
      if (left) px -= steer;
      if (right) px += steer;
      px -= steer * ratio * seg.curve * 0.06;   // Fliehkraft in Kurven

      speed += (gas ? ACC : brake ? BRAKE : DECEL) * dt;
      if (Math.abs(px) > 1){
        if (speed > OFF_MAX) speed += OFF_DECEL * dt;
        if (Math.random() < 0.3) ctx.beep(60 + Math.random() * 40, 30, "sawtooth", 0.02);
        shake = 2;
      }
      px = Math.max(-2.2, Math.min(2.2, px));
      speed = Math.max(0, Math.min(MAX, speed));

      // Gegner
      for (const c of cars){
        c.z = (c.z + c.speed * dt) % LEN;
        const gap = ((c.z - (pos + PLAYER_Z)) % LEN + LEN) % LEN;
        if (gap < SEG * 1.2 && Math.abs(c.off - px) < CAR * 2 && speed > c.speed){
          speed = c.speed * 0.6; shake = 8;
          ctx.beep(110, 220, "square", 0.06);
        }
      }

      const move = speed * dt;
      pos = (pos + move) % LEN;
      dist += move;
      skyOff += seg.curve * ratio * dt * 0.02;
      // Checkpoint, sobald man durch ein Tor fährt (auch die Startlinie zählt)
      const si = segAt(pos + PLAYER_Z).i;
      if (si !== lastSeg && si % CHECK_EVERY === 0 && dist > SEG * 10){
        time += BONUS; checkFlash = 1.6;
        ctx.beep(988, 90); setTimeout(() => ctx.beep(1318, 160), 110);
        ctx.log("OK", `race: Checkpoint — <span class="num">${(dist / KM).toFixed(2)} km</span>`);
      }
      lastSeg = si;
      time -= dt;
      if (time <= 0){ time = 0; over(); }
      shake *= 0.85; checkFlash = Math.max(0, checkFlash - dt);
    }

    function over(){
      state = "over";
      const km = dist / KM;
      if (km > best){ best = km; ctx.store.set("race.best", +km.toFixed(2)); }
      ctx.beep(196, 500, "sawtooth");
      overlay(`<div class="big">TIME UP</div><div>${km.toFixed(2)} km${km >= best && km > 0 ? "  ★ rekord" : ""}</div>
        <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
    }

    /* ---------- Zeichnen ---------- */
    function project(p, camX, camY, camZ){
      const s = DEPTH / (p.z - camZ);
      return { x: w / 2 + s * (p.x - camX) * w / 2, y: h / 2 - s * (p.y - camY) * h / 2, wd: s * ROAD * w / 2, s };
    }

    const GREEN = "#33ff66", BRIGHT = "#c8ffd4", DIM = "rgba(51,255,102,.35)";

    function draw(){
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      g.save(); g.translate(sx, sy);
      g.lineCap = "round"; g.shadowColor = GREEN;

      const base = segAt(pos), basePct = (pos % SEG) / SEG;
      const camY = CAM_H + ease(base.p1.y, base.p2.y, basePct);
      const horizon = h / 2;

      // Gebirge am Horizont, wandert in Kurven seitlich
      g.strokeStyle = DIM; g.lineWidth = 1.5; g.shadowBlur = 4;
      g.beginPath();
      for (let x = 0; x <= w + 40; x += 20){
        const t = (x / w + skyOff) * 6;
        const yy = horizon - 18 - Math.abs(Math.sin(t) * 40 + Math.sin(t * 2.7) * 18);
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
      g.beginPath(); g.moveTo(0, horizon); g.lineTo(w, horizon); g.stroke();

      // Straße von vorne nach hinten projizieren, merken wie hoch sie schon reicht
      let maxy = h, x = 0, dx = -(base.curve * basePct);
      const pts = [];
      for (let n = 0; n < DRAW; n++){
        const seg = segs[(base.i + n) % segs.length];
        const loop = seg.i < base.i ? LEN : 0;
        const camX = px * ROAD;
        const a = project({ ...seg.p1, z: seg.p1.z + loop }, camX - x, camY, pos);
        const b = project({ ...seg.p2, z: seg.p2.z + loop }, camX - x - dx, camY, pos);
        x += dx; dx += seg.curve;
        seg.clip = maxy;
        if (seg.p1.z + loop <= pos || b.y >= maxy || b.y >= a.y){ seg.vis = null; continue; }
        seg.vis = { a, b, n };
        maxy = b.y;
        pts.push(seg);
      }

      // hinten zuerst zeichnen, vorne heller
      for (let k = pts.length - 1; k >= 0; k--){
        const seg = pts[k], { a, b, n } = seg.vis;
        const fade = 1 - n / DRAW;
        g.globalAlpha = 0.25 + fade * 0.75;
        g.strokeStyle = GREEN; g.lineWidth = 1 + fade * 2; g.shadowBlur = 6;
        g.beginPath();
        g.moveTo(a.x - a.wd, a.y); g.lineTo(b.x - b.wd, b.y);
        g.moveTo(a.x + a.wd, a.y); g.lineTo(b.x + b.wd, b.y);
        g.stroke();
        // Mittelstreifen und Leitpfosten
        if (seg.i % 4 < 2){
          g.strokeStyle = DIM; g.lineWidth = 1 + fade * 1.5;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
        if (seg.i % 6 === 0){
          const ph = a.wd * 0.12;
          g.strokeStyle = BRIGHT; g.lineWidth = 1 + fade * 2;
          g.beginPath();
          g.moveTo(a.x - a.wd * 1.15, a.y); g.lineTo(a.x - a.wd * 1.15, a.y - ph);
          g.moveTo(a.x + a.wd * 1.15, a.y); g.lineTo(a.x + a.wd * 1.15, a.y - ph);
          g.stroke();
        }
        // Checkpoint-Tor
        if (seg.i % CHECK_EVERY === 0){
          g.strokeStyle = "#ffb454"; g.shadowColor = "#ffb454"; g.lineWidth = 1 + fade * 3;
          const top = a.y - a.wd * 0.9;
          g.beginPath(); g.moveTo(a.x - a.wd * 1.2, a.y); g.lineTo(a.x - a.wd * 1.2, top); g.lineTo(a.x + a.wd * 1.2, top); g.lineTo(a.x + a.wd * 1.2, a.y); g.stroke();
          g.shadowColor = GREEN;
        }
      }

      // Gegner, entfernte zuerst
      const visibleCars = cars.map(c => {
        const seg = segAt(c.z);
        if (!seg.vis) return null;
        const t = (c.z % SEG) / SEG, { a, b } = seg.vis;
        const X = a.x + (b.x - a.x) * t, Y = a.y + (b.y - a.y) * t, WD = a.wd + (b.wd - a.wd) * t;
        if (Y > seg.clip + 2) return null;
        return { X: X + WD * c.off, Y, size: WD * CAR, n: seg.vis.n };
      }).filter(Boolean).sort((p, q) => q.n - p.n);
      for (const c of visibleCars) drawCar(c.X, c.Y, c.size, 1 - c.n / DRAW, false, 0);

      g.globalAlpha = 1;
      // eigenes Auto
      const steerDir = (ctx.keys.has("ArrowLeft") || ctx.keys.has("a") ? -1 : 0) + (ctx.keys.has("ArrowRight") || ctx.keys.has("d") ? 1 : 0);
      // auf Höhe des Spielers ist die halbe Straße genau w breit
      drawCar(w / 2, h - Math.max(18, h * 0.06), w * CAR, 1, true, steerDir);
      g.restore();

      if (checkFlash > 0 && Math.floor(checkFlash * 6) % 2){
        g.fillStyle = "#ffb454"; g.font = `600 ${Math.max(18, w / 26)}px "IBM Plex Mono", monospace`;
        g.textAlign = "center"; g.fillText(`CHECKPOINT  +${BONUS}s`, w / 2, h * 0.25);
      }

      const kmh = Math.round(speed / MAX * 280);
      bar.innerHTML = `<span>speed <b>${String(kmh).padStart(3, " ")} km/h</b></span>
        <span>strecke <b>${(dist / KM).toFixed(2)} km</b></span>
        <span>zeit <b class="${time < 10 ? "warn" : ""}">${Math.ceil(time)}s</b></span>
        <span>rekord <b>${(+best).toFixed(2)} km</b></span>
        <span class="right">${ctx.touch ? "gas automatisch · ▼ bremst" : "↑ gas · ↓ bremse · ← → lenken"}</span>`;
    }

    // Auto von hinten als Drahtgitter
    function drawCar(x, y, s, fade, mine, steer){
      if (s < 1.5) return;
      g.globalAlpha = mine ? 1 : 0.3 + fade * 0.7;
      g.strokeStyle = mine ? BRIGHT : "#ff5a5a"; g.shadowColor = mine ? GREEN : "#ff5a5a";
      g.lineWidth = Math.max(1, s / 30); g.shadowBlur = 6;
      const W2 = s, H1 = s * 0.42, H2 = s * 0.72, tilt = steer * s * 0.08;
      g.beginPath();
      // Karosserie
      g.moveTo(x - W2, y); g.lineTo(x - W2, y - H1); g.lineTo(x - W2 * 0.62 + tilt, y - H2); g.lineTo(x + W2 * 0.62 + tilt, y - H2);
      g.lineTo(x + W2, y - H1); g.lineTo(x + W2, y); g.closePath();
      // Heckscheibe, Rücklichter, Räder
      g.moveTo(x - W2 * 0.5 + tilt, y - H2 * 0.92); g.lineTo(x + W2 * 0.5 + tilt, y - H2 * 0.92); g.lineTo(x + W2 * 0.7, y - H1 * 1.05); g.lineTo(x - W2 * 0.7, y - H1 * 1.05); g.closePath();
      g.rect(x - W2 * 0.9, y - H1 * 0.75, W2 * 0.3, H1 * 0.25); g.rect(x + W2 * 0.6, y - H1 * 0.75, W2 * 0.3, H1 * 0.25);
      g.rect(x - W2 * 1.05, y - s * 0.05, W2 * 0.34, s * 0.16); g.rect(x + W2 * 0.71, y - s * 0.05, W2 * 0.34, s * 0.16);
      g.stroke();
    }

    function begin(){
      if (state === "over") reset();
      if (state !== "running"){ state = "running"; overlay(null); }
    }

    ctx.loop(dt => {
      const s = Math.min(dt, 50) / 1000;
      if (state === "running") update(s);
      draw();
    });

    size();
    addEventListener("resize", size);
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "▶", key: "ArrowRight" },
      { label: "▼", key: "ArrowDown", aria: "Bremse" }, { label: "⏯", key: "p", aria: "Pause" },
    ]);
    body.addEventListener("pointerdown", () => { if (state !== "running" && state !== "paused") begin(); });
    reset();
    overlay(`<div class="big">R A C E</div><div>überholen · Checkpoints bringen Zeit</div>
      <div class="dim">${ctx.touch ? "tippen zum Start · Gas geht von allein" : "↑ gas · ← → lenken · ENTER = start"}</div>`);

    return {
      stop(){ removeEventListener("resize", size); },
      key(e){
        const k = e.key;
        if (k.startsWith("Arrow")){ if (state === "ready" && k === "ArrowUp") begin(); return true; }
        if (k === "Enter" || k === " "){ if (state !== "running") begin(); return true; }
        if (k === "p" || k === "P"){
          if (state === "running"){ state = "paused"; overlay(`<div class="big">PAUSE</div><div class="dim">P = weiter</div>`); }
          else if (state === "paused") begin();
          return true;
        }
        if (k === "q"){ ctx.exit(); return true; }
        return ["w", "a", "s", "d"].includes(k);
      },
    };
  },
});
