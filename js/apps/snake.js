/* snake — wie früher auf dem Nokia. Ränder sind offen (man kommt auf der
   anderen Seite wieder raus), "snake --walls" macht sie tödlich. */

OE.register({
  id: "snake",
  title: "snake.exe",
  desc: "Nokia-Klassiker. Pfeiltasten / WASD, auf dem Handy wischen.",
  start(ctx){
    const walls = ctx.args.includes("--walls");
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d");
    const ov = body.querySelector(".app-overlay");

    const GREEN = "#33ff66", DIM = "rgba(51,255,102,.14)", BRIGHT = "#a6ffb8";
    let cols, rows, cell;
    let snake, dir, queue, food, bonus, score, best = ctx.store.get("snake.best", 0);
    let state = "ready", acc = 0, speed, eaten;

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
      score = 0; eaten = 0; speed = 130; bonus = null;
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

    function updateBar(){
      bar.innerHTML = `<span>score <b>${String(score).padStart(4, "0")}</b></span>
        <span>länge <b>${snake.length}</b></span>
        <span>best <b>${String(best).padStart(4, "0")}</b></span>
        <span class="right">${walls ? "walls" : "wrap"} · P = pause</span>`;
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

    function step(){
      if (queue.length) dir = queue.shift();
      const head = snake[0];
      let nx = head.x + dir.x, ny = head.y + dir.y;
      if (walls){
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return die();
      } else {
        nx = (nx + cols) % cols; ny = (ny + rows) % rows;
      }
      const grow = nx === food.x && ny === food.y;
      const body_ = grow ? snake : snake.slice(0, -1);
      if (body_.some(s => s.x === nx && s.y === ny)) return die();
      snake.unshift({x: nx, y: ny});
      if (grow){
        score += 10; eaten++;
        speed = Math.max(58, 130 - eaten * 3);
        ctx.beep(1320, 40);
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
      state = "over";
      ctx.beep(220, 300, "sawtooth");
      if (score > best){ best = score; ctx.store.set("snake.best", best); }
      updateBar();
      overlay(`<div class="big">GAME OVER</div><div>score ${score}${score === best && score > 0 ? "  ★ neuer highscore" : ""}</div>
        <div class="dim">${ctx.touch ? "tippen" : "SPACE"} = nochmal · ESC = exit</div>`);
    }

    function px(x, y, color, inset = 1){
      g.fillStyle = color;
      g.fillRect(x * cell + inset, y * cell + inset, cell - inset * 2, cell - inset * 2);
    }

    function draw(){
      g.clearRect(0, 0, cols * cell, rows * cell);
      // feines Raster wie auf einem LCD
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) px(x, y, DIM, cell / 2 - 1);
      if (walls){ g.strokeStyle = GREEN; g.lineWidth = 2; g.strokeRect(1, 1, cols * cell - 2, rows * cell - 2); }
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
        acc += dt;
        while (acc >= speed && state === "running"){ acc -= speed; step(); }
      }
      draw();
    });

    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "▲", key: "ArrowUp" },
      { label: "▼", key: "ArrowDown" }, { label: "▶", key: "ArrowRight" },
      { label: "⏯", key: "p", aria: "Pause" },
    ]);
    ctx.swipe(body, () => { if (state !== "running") startOrRestart(); });

    reset();
    overlay(`<div class="big">S N A K E</div><div>friss ◆ · wachse · beiß dich nicht selbst</div>
      <div class="dim">${ctx.touch ? "tippen zum Start · wischen zum Lenken" : "SPACE / Pfeiltaste = start"}</div>`);

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
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
