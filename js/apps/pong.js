/* pong — gegen den Computer, erster bis 7 gewinnt.
   "pong --2p": zwei Spieler an einer Tastatur (W/S gegen ↑/↓). */

OE.register({
  id: "pong",
  alias: ["tennis"],
  title: "pong.exe",
  desc: "Tischtennis von 1972. ↑/↓ oder Maus/Finger, bis 7.",
  start(ctx){
    const TWO = ctx.args.includes("--2p");
    const FW = 800, FH = 500, PW = 12, PH = 84, BALL = 12, WIN = 7;
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas" style="touch-action:none"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");

    let scale = 1;
    function size(){
      scale = Math.min(body.clientWidth / FW, body.clientHeight / FH);
      const dpr = window.devicePixelRatio || 1;
      cv.width = FW * scale * dpr; cv.height = FH * scale * dpr;
      cv.style.width = FW * scale + "px"; cv.style.height = FH * scale + "px";
      g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    }

    const L = { y: FH / 2 - PH / 2, score: 0 }, R = { y: FH / 2 - PH / 2, score: 0 };
    let ball, state = "ready", serveTimer = 0, rally = 0;

    function serve(dir){
      const a = (Math.random() * 0.8 - 0.4);
      ball = { x: FW / 2, y: FH / 2, vx: Math.cos(a) * 330 * dir, vy: Math.sin(a) * 330 };
      rally = 0; serveTimer = 0.8;
    }

    function reset(){ L.score = R.score = 0; L.y = R.y = FH / 2 - PH / 2; serve(Math.random() < 0.5 ? -1 : 1); }

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    function hitPaddle(p, isLeft){
      const px = isLeft ? 30 : FW - 30 - PW;
      if (ball.x + BALL < px || ball.x > px + PW || ball.y + BALL < p.y || ball.y > p.y + PH) return false;
      // Abprallwinkel hängt davon ab, wo der Ball den Schläger trifft
      const rel = ((ball.y + BALL / 2) - (p.y + PH / 2)) / (PH / 2);
      const speed = Math.min(900, Math.hypot(ball.vx, ball.vy) * 1.06);
      const ang = rel * 1.0;
      ball.vx = Math.cos(ang) * speed * (isLeft ? 1 : -1);
      ball.vy = Math.sin(ang) * speed;
      ball.x = isLeft ? px + PW : px - BALL;
      rally++;
      ctx.beep(isLeft ? 880 : 760, 40);
      return true;
    }

    function point(left){
      (left ? L : R).score++;
      ctx.beep(300, 200, "triangle", 0.05);
      if (L.score >= WIN || R.score >= WIN){
        state = "over";
        const youWin = L.score > R.score;
        overlay(`<div class="big">${TWO ? (youWin ? "LINKS GEWINNT" : "RECHTS GEWINNT") : (youWin ? "GEWONNEN" : "VERLOREN")}</div>
          <div>${L.score} : ${R.score}</div><div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
        if (!TWO && youWin) ctx.store.set("pong.wins", ctx.store.get("pong.wins", 0) + 1);
        ctx.log("OK", `pong: ${L.score}:${R.score}`);
        return;
      }
      serve(left ? 1 : -1);
    }

    function update(dt){
      const k = ctx.keys, sp = 520 * dt;
      if (TWO){
        if (k.has("w")) L.y -= sp; if (k.has("s")) L.y += sp;
        if (k.has("ArrowUp")) R.y -= sp; if (k.has("ArrowDown")) R.y += sp;
      } else {
        if (k.has("ArrowUp") || k.has("w")) L.y -= sp;
        if (k.has("ArrowDown") || k.has("s")) L.y += sp;
        // Computer: folgt dem Ball, wird mit jedem eigenen Rückstand flinker
        const target = ball.vx > 0 ? ball.y + BALL / 2 - PH / 2 : FH / 2 - PH / 2;
        const cpu = (260 + R.score * 10 + (L.score - R.score > 0 ? 40 : 0)) * dt;
        R.y += Math.max(-cpu, Math.min(cpu, target - R.y));
      }
      L.y = Math.max(0, Math.min(FH - PH, L.y)); R.y = Math.max(0, Math.min(FH - PH, R.y));

      if (serveTimer > 0){ serveTimer -= dt; return; }
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.y < 0){ ball.y = 0; ball.vy *= -1; ctx.beep(440, 20); }
      if (ball.y > FH - BALL){ ball.y = FH - BALL; ball.vy *= -1; ctx.beep(440, 20); }
      if (ball.vx < 0) hitPaddle(L, true); else hitPaddle(R, false);
      if (ball.x < -BALL * 2) point(false);
      else if (ball.x > FW + BALL) point(true);
    }

    function draw(){
      g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(0, 0, FW, FH);   // Nachleuchten
      g.fillStyle = "#33ff66"; g.shadowColor = "#33ff66"; g.shadowBlur = 10;
      for (let y = 8; y < FH; y += 28) g.fillRect(FW / 2 - 2, y, 4, 14);
      g.font = '600 64px "IBM Plex Mono", monospace'; g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(L.score, FW / 2 - 90, 20); g.fillText(R.score, FW / 2 + 90, 20);
      g.fillRect(30, L.y, PW, PH); g.fillRect(FW - 30 - PW, R.y, PW, PH);
      if (state !== "over" && (serveTimer <= 0 || Math.floor(serveTimer * 8) % 2)){
        g.fillStyle = "#c8ffd4"; g.fillRect(ball.x, ball.y, BALL, BALL);
      }
      g.shadowBlur = 0;
      g.strokeStyle = "rgba(51,255,102,.35)"; g.lineWidth = 2; g.strokeRect(1, 1, FW - 2, FH - 2);
      bar.innerHTML = `<span>${TWO ? "links <b>W/S</b> · rechts <b>↑/↓</b>" : "du <b>links</b> · cpu <b>rechts</b>"}</span>
        <span>ballwechsel <b>${rally}</b></span>${TWO ? "" : `<span>siege <b>${ctx.store.get("pong.wins", 0)}</b></span>`}
        <span class="right">P = pause · <b>pong --2p</b> für zwei</span>`;
    }

    // Maus / Finger: Schläger folgt der Höhe des Zeigers
    let dragging = false;
    const follow = e => {
      const r = cv.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height * FH - PH / 2;
      if (TWO && (e.clientX - r.left) > r.width / 2) R.y = y; else L.y = y;
    };
    cv.addEventListener("pointerdown", e => { dragging = true; cv.setPointerCapture(e.pointerId); follow(e); if (state !== "running") begin(); });
    cv.addEventListener("pointermove", e => { if (dragging || e.pointerType === "mouse") follow(e); });
    cv.addEventListener("pointerup", () => { dragging = false; });

    function begin(){
      if (state === "over") reset();
      state = "running"; overlay(null);
    }

    ctx.loop(dt => {
      const s = Math.min(dt, 50) / 1000;
      if (state === "running") update(s);
      draw();
    });

    size();
    addEventListener("resize", size);
    ctx.buttons(pad, [{ label: "▲", key: "ArrowUp" }, { label: "▼", key: "ArrowDown" }, { label: "⏯", key: "p", aria: "Pause" }]);
    reset();
    overlay(`<div class="big">P O N G</div><div>${TWO ? "W/S gegen ↑/↓" : "↑/↓, W/S oder Maus · bis " + WIN}</div>
      <div class="dim">${ctx.touch ? "tippen zum Start · Finger zieht den Schläger" : "ENTER = start"}</div>`);

    return {
      stop(){ removeEventListener("resize", size); },
      key(e){
        const k = e.key;
        if (k === "ArrowUp" || k === "ArrowDown"){ if (state === "ready") begin(); return true; }
        if (k === "Enter" || k === " "){ if (state !== "running") begin(); return true; }
        if (k === "p" || k === "P"){
          if (state === "running"){ state = "paused"; overlay(`<div class="big">PAUSE</div><div class="dim">P = weiter</div>`); }
          else if (state === "paused") begin();
          return true;
        }
        if (k === "q"){ ctx.exit(); return true; }
        return k === "w" || k === "s";
      },
    };
  },
});
