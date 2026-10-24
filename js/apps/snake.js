/* snake — wie früher auf dem Nokia. Ränder sind offen (man kommt auf der
   anderen Seite wieder raus), "snake --walls" macht sie tödlich.
   Stufen: leicht (langsam, 10 Futter = gewonnen, Biss kostet nur den Schwanz),
   normal (endlos wie früher), schwer (schneller, Ränder tödlich). */

OE.register({
  id: "snake",
  title: "snake.exe",
  desc: "Nokia-Klassiker. Pfeiltasten / WASD, auf dem Handy wischen.",
  demo: true,
  start(ctx){
    const lv = ctx.levels();
    const stufe = () => ctx.demo ? "normal" : lv.value;
    // Tempo in ms pro Schritt: Start, Minimum, Beschleunigung je Futter
    const TEMPO = { leicht: [190, 130, 3], normal: [130, 58, 3], schwer: [100, 48, 4] };
    const GOAL = 10;                                   // leicht: so viel Futter bis zum Sieg
    const walls = () => ctx.args.includes("--walls") || stufe() === "schwer";
    // Rekord je Stufe; "normal" behält den alten Schlüssel, "leicht" zählt die Bestzeit
    const bestKey = () => stufe() === "normal" ? "snake.best" : "snake.best." + stufe();
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d");
    const ov = body.querySelector(".app-overlay");

    const GREEN = "#33ff66", DIM = "rgba(51,255,102,.14)", BRIGHT = "#a6ffb8";
    let cols, rows, cell;
    let snake, dir, queue, food, bonus, score, best = ctx.store.get(bestKey(), 0);
    let state = "ready", acc = 0, speed, eaten, playT = 0;

    function size(){
      const w = body.clientWidth, h = body.clientHeight;
      cell = w < 500 ? 14 : 16;
      cols = Math.max(12, Math.min(40, Math.floor(w / cell)));
      rows = Math.max(10, Math.min(28, Math.floor(h / cell)));
      const dpr = window.devicePixelRatio || 1;
      cv.width = cols * cell * dpr; cv.height = rows * cell * dpr;
      cv.style.width = cols * cell + "px"; cv.style.height = rows * cell + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function reset(){
      size();
      const y = Math.floor(rows / 2), x = Math.floor(cols / 3);
      snake = [{x, y}, {x: x-1, y}, {x: x-2, y}, {x: x-3, y}];
      dir = {x: 1, y: 0}; queue = [];
      score = 0; eaten = 0; speed = TEMPO[stufe()][0]; bonus = null; playT = 0;
      best = ctx.store.get(bestKey(), 0);
      placeFood();
      updateBar();
      draw();
    }

    function free(){
      let p, tries = 0;
      do { p = {x: ctx.rint(0, cols-1), y: ctx.rint(0, rows-1)}; tries++; }
      while (tries < 500 && (snake.some(s => s.x === p.x && s.y === p.y) || (food && food.x === p.x && food.y === p.y)));
      return p;
    }
    function placeFood(){ food = free(); }

    const secs = t => (t / 1000).toFixed(1) + " s";
    function updateBar(){
      const easy = stufe() === "leicht";
      bar.innerHTML = `<span>score <b>${String(score).padStart(4, "0")}</b></span>
        ${easy ? `<span>ziel <b>${eaten}/${GOAL}</b></span>` : `<span>länge <b>${snake.length}</b></span>`}
        <span>${easy ? `bestzeit <b>${best ? secs(best) : "–"}</b>` : `best <b>${String(best).padStart(4, "0")}</b>`}</span>
        <span class="lv" style="cursor:pointer">stufe <b>${stufe()}</b></span>
        <span class="right">${walls() ? "walls" : "wrap"} · P = pause</span>`;
    }

    function overlay(text){
      if (!text){ ov.hidden = true; return; }
      ov.hidden = false; ov.innerHTML = text;
    }

    function turn(x, y){
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (last.x === -x && last.y === -y) return;   // keine 180°-Wende
      if (last.x === x && last.y === y) return;
      if (queue.length < 3) queue.push({x, y});
    }

    /* Vorführung: kürzester Weg zum Futter (BFS), aber nur wenn danach noch
       genug Platz bleibt; sonst dorthin, wo am meisten frei ist */
    function wrapP(x, y){ return walls() ? (x < 0 || y < 0 || x >= cols || y >= rows ? null : {x, y}) : {x: (x + cols) % cols, y: (y + rows) % rows}; }
    function room(sx, sy, occ){
      const seen = new Set(occ), st = [sx + "," + sy]; let n = 0;
      seen.add(st[0]);
      while (st.length && n < snake.length * 2){
        const [x, y] = st.pop().split(",").map(Number); n++;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const q = wrapP(x + dx, y + dy); if (!q) continue;
          const k = q.x + "," + q.y; if (!seen.has(k)){ seen.add(k); st.push(k); }
        }
      }
      return n;
    }
    function aiDir(){
      const occ = snake.slice(0, -1).map(s => s.x + "," + s.y), occS = new Set(occ);
      const opts = [[1,0],[-1,0],[0,1],[0,-1]].filter(([x, y]) => !(x === -dir.x && y === -dir.y)).map(([x, y]) => {
        const q = wrapP(snake[0].x + x, snake[0].y + y);
        return q && !occS.has(q.x + "," + q.y) ? { d: {x, y}, q } : null;
      }).filter(Boolean);
      if (!opts.length) return dir;
      // Abstand zum Futter per Breitensuche ab dem Futter
      const dist = new Map([[food.x + "," + food.y, 0]]), qu = [food];
      while (qu.length){
        const c = qu.shift(), dc = dist.get(c.x + "," + c.y);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const q = wrapP(c.x + dx, c.y + dy); if (!q) continue;
          const k = q.x + "," + q.y; if (occS.has(k) || dist.has(k)) continue;
          dist.set(k, dc + 1); qu.push(q);
        }
      }
      for (const o of opts){ o.room = room(o.q.x, o.q.y, occ); o.dist = dist.get(o.q.x + "," + o.q.y) ?? 1e9; }
      const safe = opts.filter(o => o.room >= snake.length + 2);
      const pool = safe.length ? safe : opts;
      pool.sort((a, b) => safe.length ? a.dist - b.dist : b.room - a.room);
      return pool[0].d;
    }

    function step(){
      if (ctx.demo) dir = aiDir();
      else if (queue.length) dir = queue.shift();
      const head = snake[0];
      let nx = head.x + dir.x, ny = head.y + dir.y;
      if (walls()){
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return die();
      } else {
        nx = (nx + cols) % cols; ny = (ny + rows) % rows;
      }
      const grow = nx === food.x && ny === food.y;
      const body_ = grow ? snake : snake.slice(0, -1);
      const bite = body_.findIndex(s => s.x === nx && s.y === ny);
      if (bite >= 0){
        if (stufe() !== "leicht") return die();
        // leicht: Biss kostet nur das Schwanzstück ab der Bissstelle
        snake.splice(Math.max(3, bite));
        ctx.beep(330, 90, "triangle", 0.04);
      }
      snake.unshift({x: nx, y: ny});
      if (grow){
        score += 10; eaten++;
        const [t0, tMin, dec] = TEMPO[stufe()];
        speed = Math.max(tMin, (ctx.demo ? 80 : t0) - eaten * dec);
        ctx.beep(1320, 40);
        if (stufe() === "leicht" && eaten >= GOAL){ snake.pop(); updateBar(); return win(); }
        placeFood();
        if (!bonus && eaten % 5 === 0) bonus = { ...free(), ttl: 40 };
      } else {
        snake.pop();
      }
      if (bonus){
        if (nx === bonus.x && ny === bonus.y){
          score += 10 + bonus.ttl * 2; ctx.beep(1760, 90); bonus = null;
        } else if (--bonus.ttl <= 0) bonus = null;
      }
      updateBar();
    }

    function die(){
      if (ctx.demo){ reset(); return; }   // Vorführung: einfach weiter
      state = "over";
      ctx.beep(220, 300, "sawtooth");
      if (score > best){ best = score; ctx.store.set(bestKey(), best); }
      updateBar();
      overlay(`<div class="big">GAME OVER</div><div>score ${score}${score === best && score > 0 ? "  ★ neuer highscore" : ""}</div>
        ${lvBtn()}<div class="dim">${ctx.touch ? "tippen" : "SPACE"} = nochmal · ESC = exit</div>`);
    }

    // leicht: Ziel erreicht – Jubel, Bestzeit, Angebot für die nächste Stufe
    function win(){
      state = "over";
      const t = Math.round(playT), rec = !best || t < best;
      if (rec){ best = t; ctx.store.set(bestKey(), best); }
      updateBar();
      [1046, 1318, 1568, 2093].forEach((f, i) => ctx.after(i * 110, () => ctx.beep(f, 120, "square", 0.04)));
      confetti();
      ctx.log("OK", `snake: gewonnen in ${secs(t)}`);
      overlay(`<div class="big">G E W O N N E N</div><div>${GOAL} ◆ in ${secs(t)}${rec ? "  ★ bestzeit" : ""}</div>
        ${lvBtn()}<div class="dim">${ctx.touch ? "tippen" : "SPACE"} = nochmal · ${ctx.touch ? "" : "2 = normal · "}ESC = exit</div>`);
    }

    // Jubel: Futter-Karos regnen übers Feld
    function confetti(){
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      body.style.overflow = "hidden";
      const h = body.clientHeight + 40;
      for (let i = 0; i < 70; i++){
        const s = document.createElement("span");
        s.textContent = "◆◇■"[i % 3];
        s.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-24px;pointer-events:none;z-index:3;` +
          `font-size:${10 + Math.random() * 14}px;color:${[GREEN, BRIGHT, "#ffb454"][i % 3]};text-shadow:0 0 8px currentColor`;
        body.appendChild(s);
        s.animate([{ transform: "translate(0,0) rotate(0)", opacity: 1 },
          { transform: `translate(${(Math.random() - 0.5) * 160}px,${h}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0.3 }],
          { duration: 1600 + Math.random() * 1800, delay: Math.random() * 900, easing: "cubic-bezier(.3,.5,.6,1)", fill: "both" }).onfinish = () => s.remove();
      }
    }

    /* Stufe wählen: 1/2/3 oder Knopf im Overlay / Statuszeile, nur außerhalb des Spiels */
    const lvBtn = () => ctx.demo ? "" : `<button type="button" class="lv-pick" style="font:inherit;color:${BRIGHT};background:rgba(51,255,102,.08);` +
      `border:1px solid rgba(51,255,102,.5);padding:6px 14px;margin:6px 0;cursor:pointer;touch-action:manipulation">stufe ‹ <b>${stufe()}</b> ›</button>` +
      `<div class="dim">${stufe() === "leicht" ? `ziel: ${GOAL} ◆ · biss kostet nur den schwanz` : stufe() === "normal" ? `endlos · ränder ${walls() ? "tödlich" : "offen"}` : "schneller · ränder tödlich"}</div>`;
    function setLevel(v){
      if (state === "running" || ctx.demo) return;
      if (v === lv.value) return;
      lv.set(v); reset(); state = "ready"; acc = 0;
      ctx.beep(520 + lv.index * 180, 60, "square", 0.03);
      overlay(titleHtml());
    }
    const titleHtml = () => `<div class="big">S N A K E</div><div>friss ◆ · wachse · beiß dich nicht selbst</div>${lvBtn()}
      <div class="dim">${ctx.touch ? "tippen zum Start · wischen oder neben den Kopf tippen" : "SPACE / Pfeiltaste = start · 1 2 3 = stufe"}</div>`;
    ov.addEventListener("pointerdown", e => { if (e.target.closest(".lv-pick")) e.stopPropagation(); });
    ov.addEventListener("click", e => { if (e.target.closest(".lv-pick")){ e.stopPropagation(); setLevel(lv.names[(lv.index + 1) % 3]); } });
    bar.addEventListener("click", e => { if (e.target.closest(".lv")) setLevel(lv.names[(lv.index + 1) % 3]); });

    function px(x, y, color, inset = 1){
      g.fillStyle = color;
      g.fillRect(x * cell + inset, y * cell + inset, cell - inset * 2, cell - inset * 2);
    }

    function draw(){
      g.clearRect(0, 0, cols * cell, rows * cell);
      // feines Raster wie auf einem LCD
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) px(x, y, DIM, cell / 2 - 1);
      if (walls()){ g.strokeStyle = GREEN; g.lineWidth = 2; g.strokeRect(1, 1, cols * cell - 2, rows * cell - 2); }
      g.shadowColor = GREEN; g.shadowBlur = 6;
      // Futter: kleines Karo
      g.fillStyle = BRIGHT;
      const fx = food.x * cell + cell / 2, fy = food.y * cell + cell / 2, r = cell / 3;
      g.beginPath(); g.moveTo(fx, fy - r); g.lineTo(fx + r, fy); g.lineTo(fx, fy + r); g.lineTo(fx - r, fy); g.fill();
      // Bonus-Käfer blinkt, wenn er bald weg ist
      if (bonus && (bonus.ttl > 10 || bonus.ttl % 2)){
        g.fillStyle = "#ffb454"; g.shadowColor = "#ffb454";
        g.fillRect(bonus.x * cell + 2, bonus.y * cell + 3, cell - 4, cell - 6);
        g.shadowColor = GREEN;
      }
      snake.forEach((s, i) => px(s.x, s.y, i === 0 ? BRIGHT : GREEN, i === 0 ? 1 : 2));
      g.shadowBlur = 0;
    }

    function startOrRestart(){
      if (state === "running") return;
      if (state === "over") reset();
      state = "running"; overlay(null);
    }

    ctx.loop(dt => {
      if (state === "running"){
        acc += dt; playT += dt;
        while (acc >= speed && state === "running"){ acc -= speed; step(); }
      }
      draw();
    });

    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "▲", key: "ArrowUp" },
      { label: "▼", key: "ArrowDown" }, { label: "▶", key: "ArrowRight" },
      { label: "⏯", key: "p", aria: "Pause" },
    ]);
    // Tippen lenkt auch: Richtung Fingerposition, quer zur aktuellen Fahrtrichtung
    ctx.swipe(body, e => {
      if (state !== "running"){ startOrRestart(); return; }
      const r = cv.getBoundingClientRect(), head = snake[0];
      const hx = r.left + (head.x + 0.5) * cell, hy = r.top + (head.y + 0.5) * cell;
      const cur = queue.length ? queue[queue.length - 1] : dir;
      if (cur.x) turn(0, e.clientY < hy ? -1 : 1);
      else turn(e.clientX < hx ? -1 : 1, 0);
    });

    reset();
    if (ctx.demo){
      // gleich mittendrin: etwas länger und schneller
      for (let i = 0; i < 4; i++) snake.push({ ...snake[snake.length - 1], x: (snake[snake.length - 1].x - 1 + cols) % cols });
      speed = 80; state = "running"; ov.hidden = true; updateBar();
    } else overlay(titleHtml());

    return {
      key(e){
        const k = e.key;
        const dirs = { ArrowUp:[0,-1], w:[0,-1], ArrowDown:[0,1], s:[0,1], ArrowLeft:[-1,0], a:[-1,0], ArrowRight:[1,0], d:[1,0] };
        if (dirs[k]){
          if (state === "ready") startOrRestart();
          if (state === "running") turn(...dirs[k]);
          return true;
        }
        if (k === " " || k === "Enter"){
          if (state === "paused"){ state = "running"; overlay(null); } else startOrRestart();
          return true;
        }
        if (k === "p" || k === "P"){
          if (state === "running"){ state = "paused"; overlay(`<div class="big">PAUSE</div><div class="dim">P = weiter</div>`); }
          else if (state === "paused"){ state = "running"; overlay(null); }
          else startOrRestart();
          return true;
        }
        if (k === "1" || k === "2" || k === "3"){ setLevel(lv.names[k - 1]); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
