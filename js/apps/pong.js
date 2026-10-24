/* pong — gegen den Computer, erster bis 7 gewinnt.
   "pong --2p": zwei Spieler an einer Tastatur (W/S gegen ↑/↓).
   Stufen: leicht (bis 3, langsamer Ball, träger Computer, größerer Schläger),
   normal (wie früher), schwer (schneller Ball, Computer rechnet voraus). */

OE.register({
  id: "pong",
  alias: ["tennis"],
  title: "pong.exe",
  desc: "Tischtennis von 1972. ↑/↓ oder Maus/Finger, bis 7.",
  demo: true,
  start(ctx){
    const TWO = ctx.args.includes("--2p");
    const FW = 800, FH = 500, PW = 12, PH = 84, BALL = 12;
    const lv = ctx.levels();
    const stufe = () => ctx.demo || TWO ? "normal" : lv.value;
    // Stufen: bis wie viel, Ballstart, Höchsttempo, Größe eigener Schläger, Computer-Tempo
    const LV = {
      leicht: { win: 3, ball: 250, max: 560, ph: 116, cpu: 175 },
      normal: { win: 7, ball: 330, max: 900, ph: PH,  cpu: 260 },
      schwer: { win: 7, ball: 390, max: 1050, ph: 72, cpu: 420 },
    };
    const S = () => LV[stufe()];
    const winsKey = () => stufe() === "normal" ? "pong.wins" : "pong.wins." + stufe();
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
      const v = S().ball;
      ball = { x: FW / 2, y: FH / 2, vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v };
      rally = 0; serveTimer = ctx.demo ? 0.3 : 0.8; aimMiss();
    }

    function reset(){ L.score = R.score = 0; L.y = FH / 2 - S().ph / 2; R.y = FH / 2 - PH / 2; serve(Math.random() < 0.5 ? -1 : 1); }

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    function hitPaddle(p, isLeft){
      const px = isLeft ? 30 : FW - 30 - PW, ph = isLeft ? S().ph : PH;
      if (ball.x + BALL < px || ball.x > px + PW || ball.y + BALL < p.y || ball.y > p.y + ph) return false;
      // Abprallwinkel hängt davon ab, wo der Ball den Schläger trifft
      const rel = ((ball.y + BALL / 2) - (p.y + ph / 2)) / (ph / 2);
      const speed = Math.min(S().max, Math.hypot(ball.vx, ball.vy) * (stufe() === "leicht" ? 1.03 : 1.06));
      const ang = rel * 1.0;
      ball.vx = Math.cos(ang) * speed * (isLeft ? 1 : -1);
      ball.vy = Math.sin(ang) * speed;
      ball.x = isLeft ? px + PW : px - BALL;
      rally++;
      if (ctx.demo) aim[isLeft ? "R" : "L"] = (Math.random() * 2 - 1) * PH * 0.38;
      // leicht: Computer verschätzt sich, schwer: zielt fast genau
      if (isLeft) aimMiss();
      ctx.beep(isLeft ? 880 : 760, 40);
      return true;
    }

    function point(left){
      (left ? L : R).score++;
      ctx.beep(300, 200, "triangle", 0.05);
      if (L.score >= S().win || R.score >= S().win){
        state = "over";
        const youWin = L.score > R.score;
        overlay(`<div class="big">${TWO ? (youWin ? "LINKS GEWINNT" : "RECHTS GEWINNT") : (youWin ? "G E W O N N E N" : "VERLOREN")}</div>
          <div>${L.score} : ${R.score}</div>${lvBtn()}<div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ${youWin && stufe() !== "schwer" && !ctx.touch && !TWO ? (lv.index + 2) + " = " + lv.names[lv.index + 1] + " · " : ""}ESC = exit</div>`);
        if (!TWO && youWin){
          ctx.store.set(winsKey(), ctx.store.get(winsKey(), 0) + 1);
          [1046, 1318, 1568, 2093].forEach((f, i) => ctx.after(i * 110, () => ctx.beep(f, 120, "square", 0.04)));
          confetti();
        }
        ctx.log("OK", `pong: ${L.score}:${R.score}`);
        return;
      }
      serve(left ? 1 : -1);
    }

    /* Vorführung: beide Seiten rechnen aus, wo der Ball ankommt (mit Banden),
       und treffen ihn absichtlich außermittig, damit es schräge Wechsel gibt */
    let aim = { L: 0, R: 0 }, miss = 0;
    function aimMiss(){ miss = (Math.random() * 2 - 1) * PH * ({ leicht: 0.85, schwer: 0.4 }[stufe()] || 0); }
    function landY(px){
      if (!ball.vx) return ball.y;
      const t = (px - ball.x) / ball.vx;
      if (t < 0) return FH / 2;
      const span = FH - BALL;
      let y = (ball.y + ball.vy * t) % (2 * span);
      if (y < 0) y += 2 * span;
      return y > span ? 2 * span - y : y;
    }
    function demoMove(p, isLeft, dt){
      const coming = isLeft ? ball.vx < 0 : ball.vx > 0;
      const target = coming ? landY(isLeft ? 30 + PW : FW - 30 - PW - BALL) + BALL / 2 - PH / 2 + aim[isLeft ? "L" : "R"] : FH / 2 - PH / 2;
      const v = 560 * dt;
      p.y += Math.max(-v, Math.min(v, target - p.y));
    }

    function update(dt){
      const k = ctx.keys, sp = 520 * dt;
      if (ctx.demo){ demoMove(L, true, dt); demoMove(R, false, dt); }
      else if (TWO){
        if (k.has("w")) L.y -= sp; if (k.has("s")) L.y += sp;
        if (k.has("ArrowUp")) R.y -= sp; if (k.has("ArrowDown")) R.y += sp;
      } else {
        if (k.has("ArrowUp") || k.has("w")) L.y -= sp;
        if (k.has("ArrowDown") || k.has("s")) L.y += sp;
        // Computer: folgt dem Ball, wird mit jedem eigenen Rückstand flinker.
        // leicht: reagiert erst ab der Mitte und verschätzt sich; schwer: rechnet die Banden voraus
        const st = stufe(), late = st === "leicht" && ball.x < FW * 0.45;
        const aimY = st === "schwer" && ball.x > FW * 0.3 ? landY(FW - 30 - PW - BALL) : ball.y;
        const target = ball.vx > 0 && !late ? aimY + BALL / 2 - PH / 2 + miss : FH / 2 - PH / 2;
        const cpu = (S().cpu + R.score * 10 + (L.score - R.score > 0 ? 40 : 0)) * dt;
        R.y += Math.max(-cpu, Math.min(cpu, target - R.y));
      }
      L.y = Math.max(0, Math.min(FH - S().ph, L.y)); R.y = Math.max(0, Math.min(FH - PH, R.y));

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
      g.fillRect(30, L.y, PW, S().ph); g.fillRect(FW - 30 - PW, R.y, PW, PH);
      if (state !== "over" && (serveTimer <= 0 || Math.floor(serveTimer * 8) % 2)){
        g.fillStyle = "#c8ffd4"; g.fillRect(ball.x, ball.y, BALL, BALL);
      }
      g.shadowBlur = 0;
      g.strokeStyle = "rgba(51,255,102,.35)"; g.lineWidth = 2; g.strokeRect(1, 1, FW - 2, FH - 2);
      bar.innerHTML = `<span>${TWO ? "links <b>W/S</b> · rechts <b>↑/↓</b>" : "du <b>links</b> · cpu <b>rechts</b>"}</span>
        <span>ballwechsel <b>${rally}</b></span>${TWO ? "" : `<span>siege <b>${ctx.store.get(winsKey(), 0)}</b></span>
        <span class="lv" style="cursor:pointer">stufe <b>${stufe()}</b> · bis ${S().win}</span>`}
        <span class="right">P = pause · <b>pong --2p</b> für zwei</span>`;
    }

    // Maus / Finger: Schläger folgt der Höhe des Zeigers
    let dragging = false;
    const follow = e => {
      const r = cv.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height * FH;
      if (TWO && (e.clientX - r.left) > r.width / 2) R.y = y - PH / 2; else L.y = y - S().ph / 2;
    };
    cv.addEventListener("pointerdown", e => { dragging = true; cv.setPointerCapture(e.pointerId); follow(e); if (state !== "running") begin(); });
    cv.addEventListener("pointermove", e => { if (dragging || e.pointerType === "mouse") follow(e); });
    cv.addEventListener("pointerup", () => { dragging = false; });

    function begin(){
      if (state === "over") reset();
      state = "running"; overlay(null);
    }
    // Tippen aufs Overlay startet auch (es liegt über der Leinwand)
    ov.addEventListener("pointerdown", e => {
      if (e.target.closest(".lv-pick")){ e.stopPropagation(); return; }
      if (state !== "running"){ e.preventDefault(); begin(); }
    });
    ov.addEventListener("click", e => { if (e.target.closest(".lv-pick")) setLevel(lv.names[(lv.index + 1) % 3]); });
    bar.addEventListener("click", e => { if (e.target.closest(".lv")) setLevel(lv.names[(lv.index + 1) % 3]); });

    /* Stufe wählen: 1/2/3 oder Knopf im Overlay / Statuszeile, nur außerhalb des Spiels */
    const lvBtn = () => ctx.demo || TWO ? "" : `<button type="button" class="lv-pick" style="font:inherit;color:#a6ffb8;background:rgba(51,255,102,.08);` +
      `border:1px solid rgba(51,255,102,.5);padding:6px 14px;margin:6px 0;cursor:pointer;touch-action:manipulation">stufe ‹ <b>${stufe()}</b> ›</button>` +
      `<div class="dim">${{ leicht: "bis 3 · langsamer ball · müder gegner", normal: "bis 7 · klassisch", schwer: "bis 7 · schnell · gegner rechnet voraus" }[stufe()]}</div>`;
    const titleHtml = () => `<div class="big">P O N G</div><div>${TWO ? "W/S gegen ↑/↓" : "↑/↓, W/S oder Maus · bis " + S().win}</div>${lvBtn()}
      <div class="dim">${ctx.touch ? "tippen zum Start · Finger zieht den Schläger" : "ENTER = start" + (TWO ? "" : " · 1 2 3 = stufe")}</div>`;
    function setLevel(v){
      if (state === "running" || ctx.demo || TWO || v === lv.value) return;
      lv.set(v); reset(); state = "ready";
      ctx.beep(520 + lv.index * 180, 60, "square", 0.03);
      overlay(titleHtml());
    }

    // Jubel: kleine Bälle regnen übers Feld
    function confetti(){
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      body.style.overflow = "hidden";
      const h = body.clientHeight + 40;
      for (let i = 0; i < 70; i++){
        const s = document.createElement("span"), z = 6 + Math.random() * 10;
        s.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-24px;width:${z}px;height:${z}px;pointer-events:none;z-index:3;` +
          `background:${["#33ff66", "#c8ffd4", "#ffb454"][i % 3]};box-shadow:0 0 10px currentColor`;
        body.appendChild(s);
        s.animate([{ transform: "translate(0,0) rotate(0)", opacity: 1 },
          { transform: `translate(${(Math.random() - 0.5) * 160}px,${h}px) rotate(${Math.random() * 540}deg)`, opacity: 0.3 }],
          { duration: 1600 + Math.random() * 1800, delay: Math.random() * 900, easing: "cubic-bezier(.3,.5,.6,1)", fill: "both" }).onfinish = () => s.remove();
      }
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
    if (ctx.demo){ state = "running"; overlay(null); }
    else overlay(titleHtml());

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
        if (k === "1" || k === "2" || k === "3"){ setLevel(lv.names[k - 1]); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return k === "w" || k === "s";
      },
    };
  },
});
