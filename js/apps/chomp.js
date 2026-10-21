/* chomp — Labyrinth, Punkte fressen, vier Geister. Angelehnt an
   Pac-Man (1980), aber eigenes Labyrinth und eigener Code.
   Geister-Verhalten wie im Vorbild: abwechselnd "Ecke aufsuchen" und
   "jagen", jeder Geist mit eigenem Ziel; nach einer Kraftpille fliehen sie. */

OE.register({
  id: "chomp",
  alias: ["pacman", "pac"],
  title: "chomp.exe",
  desc: "Labyrinth, Punkte, vier Geister (Pac-Man-artig).",
  start(ctx){
    const MAZE = [
      "###################",
      "#........#........#",
      "#o##.###.#.###.##o#",
      "#.................#",
      "#.##.#.#####.#.##.#",
      "#....#...#...#....#",
      "####.###.#.###.####",
      "   #.#.......#.#   ",
      "####.#.##-##.#.####",
      "T......#GGG#......T",
      "####.#.#####.#.####",
      "   #.#.......#.#   ",
      "####.#.#####.#.####",
      "#........#........#",
      "#.##.###.#.###.##.#",
      "#o.#.....P.....#.o#",
      "##.#.#.#####.#.#.##",
      "#....#...#...#....#",
      "#.######.#.######.#",
      "#.................#",
      "###################",
    ];
    const W = MAZE[0].length, H = MAZE.length;
    const DOOR = { x: 9, y: 7 }, HOME = { x: 9, y: 9 };
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const OPP = { up: "down", down: "up", left: "right", right: "left" };
    const GHOSTS = [
      { name: "blinky", color: "#ff5a5a", corner: [W - 2, 0],  release: 0 },
      { name: "pinky",  color: "#ff9ad5", corner: [1, 0],      release: 2 },
      { name: "inky",   color: "#5affe0", corner: [W - 2, H],  release: 5 },
      { name: "clyde",  color: "#ffb454", corner: [1, H],      release: 8 },
    ];

    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");

    let ts = 20;
    function size(){
      ts = Math.max(10, Math.floor(Math.min(body.clientWidth / W, body.clientHeight / H)));
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * ts * dpr; cv.height = H * ts * dpr;
      cv.style.width = W * ts + "px"; cv.style.height = H * ts + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const wrapX = x => (x + W) % W;
    const cell = (x, y) => (MAZE[y] || "")[wrapX(x)] || "#";
    const isWall = (x, y) => cell(x, y) === "#";

    let grid, dots, pac, ghosts, score, lives, level, best = ctx.store.get("chomp.best", 0);
    let state = "ready", mode = "scatter", modeT = 0, fright = 0, combo = 0, clock = 0, freeze = 0;

    function newLevel(){
      grid = MAZE.map(r => [...r].map(c => c === "." ? 1 : c === "o" ? 2 : 0));
      dots = grid.flat().filter(Boolean).length;
      resetActors();
    }
    function resetActors(){
      pac = { x: 9, y: 15, dir: "left", want: "left", p: 0, moving: true, mouth: 0 };
      ghosts = GHOSTS.map((d, i) => ({ ...d, x: i === 0 ? DOOR.x : 8 + (i - 1), y: i === 0 ? DOOR.y : HOME.y,
        fx: 0, fy: 0, dir: "left", p: 0, st: i === 0 ? "out" : "house", eaten: false }));
      ghosts.forEach(gh => { gh.fx = gh.x; gh.fy = gh.y; });
      mode = "scatter"; modeT = 0; fright = 0; clock = 0; freeze = 1.2;
    }
    function newGame(){ score = 0; lives = 3; level = 1; newLevel(); }

    // Geister dürfen durch die Tür, Spieler nicht
    function canGo(x, y, dir, ghost){
      const [dx, dy] = DIRS[dir];
      const c = cell(x + dx, y + dy);
      if (c === "#") return false;
      if ((c === "-" || c === "G") && !ghost) return false;
      if ((c === "-" || c === "G") && ghost && ghost.st === "out") return false;
      return true;
    }

    /* Bewegung auf dem Raster: Kachel + Fortschritt p (0..1) Richtung dir */
    function advance(e, speed, dt, choose){
      let dist = speed * dt;
      while (dist > 0){
        if (e.p === 0){
          const nd = choose(e);
          if (!nd){ e.moving = false; return; }
          e.dir = nd; e.moving = true;
        }
        const step = Math.min(dist, 1 - e.p);
        e.p += step; dist -= step;
        if (e.p >= 1 - 1e-9){
          const [dx, dy] = DIRS[e.dir];
          e.x = wrapX(e.x + dx); e.y += dy; e.p = 0;
          if (e.onTile) e.onTile();
        }
      }
    }
    const pos = e => { const [dx, dy] = DIRS[e.dir]; return { x: e.x + dx * e.p, y: e.y + dy * e.p }; };

    function choosePac(e){
      if (canGo(e.x, e.y, e.want)) return e.want;
      if (canGo(e.x, e.y, e.dir)) return e.dir;
      return null;
    }

    function ghostTarget(gh){
      if (gh.st === "eyes") return DOOR;
      if (fright > 0) return { x: ctx.rint(0, W - 1), y: ctx.rint(0, H - 1) };
      if (mode === "scatter") return { x: gh.corner[0], y: gh.corner[1] };
      const [dx, dy] = DIRS[pac.dir];
      if (gh.name === "blinky") return { x: pac.x, y: pac.y };
      if (gh.name === "pinky") return { x: pac.x + dx * 4, y: pac.y + dy * 4 };
      if (gh.name === "inky"){
        const b = ghosts[0], ax = pac.x + dx * 2, ay = pac.y + dy * 2;
        return { x: ax * 2 - b.x, y: ay * 2 - b.y };
      }
      const d = Math.hypot(pac.x - gh.x, pac.y - gh.y);   // clyde: jagt nur aus der Ferne
      return d > 7 ? { x: pac.x, y: pac.y } : { x: gh.corner[0], y: gh.corner[1] };
    }

    function chooseGhost(gh){
      // Augen an der Tür angekommen: anhalten, ab hier gleiten sie ins Haus
      if (gh.st === "eyes" && gh.x === DOOR.x && gh.y === DOOR.y){ gh.st = "entering"; gh.fx = DOOR.x; gh.fy = DOOR.y; return null; }
      if (gh.reverse){ gh.reverse = false; if (canGo(gh.x, gh.y, OPP[gh.dir], gh)) return OPP[gh.dir]; }
      const t = ghostTarget(gh);
      let bestDir = null, bestD = Infinity;
      for (const d of ["up", "left", "down", "right"]){
        if (d === OPP[gh.dir]) continue;
        if (!canGo(gh.x, gh.y, d, gh)) continue;
        const [dx, dy] = DIRS[d];
        const dd = (gh.x + dx - t.x) ** 2 + (gh.y + dy - t.y) ** 2;
        if (dd < bestD){ bestD = dd; bestDir = d; }
      }
      return bestDir || OPP[gh.dir];
    }

    function eatAt(x, y){
      const v = grid[y] && grid[y][x];
      if (!v) return;
      grid[y][x] = 0; dots--;
      if (v === 1){ score += 10; if (dots % 2) ctx.beep(520, 25, "square", 0.02); }
      else {
        score += 50; combo = 0;
        fright = Math.max(2, 7 - level);
        ghosts.forEach(gh => { if (gh.st === "out"){ gh.reverse = true; gh.scared = true; } });
        ctx.beep(220, 160, "triangle", 0.05);
      }
      if (dots === 0){
        state = "clear"; ctx.beep(1320, 300);
        ctx.log("OK", `chomp: Level ${level} geschafft — score ${score}`);
        ctx.after(1600, () => { level++; newLevel(); state = "running"; });
      }
    }

    // Geister im Haus wippen, verlassen es zeitversetzt (gleitend zur Tür)
    function moveHouse(gh, dt){
      if (gh.st === "house"){
        gh.fy = HOME.y + Math.sin(clock * 6 + gh.release) * 0.25;
        if (clock > gh.release / Math.max(1, level * 0.6)) gh.st = "leaving";
        return;
      }
      if (gh.st === "leaving" || gh.st === "entering"){
        const tgt = gh.st === "leaving" ? DOOR : HOME;
        const sp = (gh.st === "leaving" ? 3 : 8) * dt;
        const dx = tgt.x - gh.fx, dy = tgt.y - gh.fy;
        // erst waagerecht zur Mitte, dann senkrecht
        if (Math.abs(dx) > 0.01) gh.fx += Math.sign(dx) * Math.min(sp, Math.abs(dx));
        else if (Math.abs(dy) > 0.01) gh.fy += Math.sign(dy) * Math.min(sp, Math.abs(dy));
        else if (gh.st === "leaving"){ gh.st = "out"; gh.x = DOOR.x; gh.y = DOOR.y; gh.p = 0; gh.dir = "left"; gh.scared = false; }
        else { gh.st = "leaving"; gh.eaten = false; }
      }
    }

    function update(dt){
      clock += dt;
      if (freeze > 0){ freeze -= dt; return; }
      if (fright > 0){ fright -= dt; if (fright <= 0) ghosts.forEach(gh => gh.scared = false); }
      else {
        modeT += dt;
        const len = mode === "scatter" ? 6 : 20;
        if (modeT > len){ modeT = 0; mode = mode === "scatter" ? "chase" : "scatter"; ghosts.forEach(gh => { if (gh.st === "out") gh.reverse = true; }); }
      }

      const k = ctx.keys;
      if (k.has("ArrowUp") || k.has("w")) pac.want = "up";
      else if (k.has("ArrowDown") || k.has("s")) pac.want = "down";
      else if (k.has("ArrowLeft") || k.has("a")) pac.want = "left";
      else if (k.has("ArrowRight") || k.has("d")) pac.want = "right";
      // sofort umdrehen ist jederzeit erlaubt
      if (pac.want === OPP[pac.dir] && pac.p > 0){
        const [dx, dy] = DIRS[pac.dir];
        pac.x = wrapX(pac.x + dx); pac.y += dy; pac.p = 1 - pac.p; pac.dir = pac.want;
      }
      const pacSpeed = 7 + level * 0.25;
      advance(pac, pacSpeed, dt, choosePac);
      if (pac.p === 0 || pac.p > 0.5){ const pp = pos(pac); eatAt(Math.round(pp.x) % W, Math.round(pp.y)); }
      if (pac.moving) pac.mouth += dt * 14;

      for (const gh of ghosts){
        if (gh.st !== "out" && gh.st !== "eyes"){ moveHouse(gh, dt); continue; }
        const inTunnel = gh.y === 9 && (gh.x < 4 || gh.x > W - 5);
        const sp = gh.st === "eyes" ? 14 : gh.scared ? 4 : inTunnel ? 3.5 : 6.4 + level * 0.3;
        advance(gh, sp, dt, chooseGhost);
        if (gh.st !== "entering"){ const gp = pos(gh); gh.fx = gp.x; gh.fy = gp.y; }
      }

      // Zusammenstoß
      const pp = pos(pac);
      for (const gh of ghosts){
        if (gh.st !== "out") continue;
        let dx = Math.abs(gh.fx - pp.x); dx = Math.min(dx, W - dx);
        if (dx < 0.6 && Math.abs(gh.fy - pp.y) < 0.6){
          if (gh.scared){
            gh.st = "eyes"; gh.scared = false; gh.eaten = true;
            const pts = 200 * 2 ** combo++; score += pts;
            ctx.beep(880 + combo * 200, 120);
            freeze = 0.35;
          } else return die();
        }
      }
    }

    function die(){
      lives--;
      ctx.beep(400, 120, "sawtooth"); setTimeout(() => ctx.beep(250, 300, "sawtooth"), 130);
      if (lives <= 0){
        state = "over";
        if (score > best){ best = score; ctx.store.set("chomp.best", best); }
        overlay(`<div class="big">GAME OVER</div><div>score ${score} · level ${level}</div>
          <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
      } else resetActors();
    }

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    /* ---------- Zeichnen ---------- */
    function draw(){
      g.fillStyle = "#000"; g.fillRect(0, 0, W * ts, H * ts);
      // Wände als Umrisslinien wie auf einem Vektor-Monitor
      g.strokeStyle = state === "clear" && Math.floor(clock * 6) % 2 ? "#c8ffd4" : "#33ff66";
      g.lineWidth = Math.max(1.5, ts / 9); g.shadowColor = "#33ff66"; g.shadowBlur = 6;
      g.beginPath();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        if (MAZE[y][x] !== "#") continue;
        const X = x * ts, Y = y * ts, inset = ts * 0.3;
        const wall = (xx, yy) => yy < 0 || yy >= H || xx < 0 || xx >= W ? true : MAZE[yy][xx] === "#" || MAZE[yy][xx] === " ";
        if (!wall(x, y - 1)){ g.moveTo(X, Y + inset); g.lineTo(X + ts, Y + inset); }
        if (!wall(x, y + 1)){ g.moveTo(X, Y + ts - inset); g.lineTo(X + ts, Y + ts - inset); }
        if (!wall(x - 1, y)){ g.moveTo(X + inset, Y); g.lineTo(X + inset, Y + ts); }
        if (!wall(x + 1, y)){ g.moveTo(X + ts - inset, Y); g.lineTo(X + ts - inset, Y + ts); }
      }
      g.stroke();
      g.shadowBlur = 0;
      // Tür
      g.fillStyle = "#ff9ad5"; g.fillRect(9 * ts, 8 * ts + ts * 0.45, ts, ts * 0.12);
      // Punkte
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        const v = grid[y][x];
        if (v === 1){ g.fillStyle = "#a6ffb8"; const s = Math.max(2, ts / 7); g.fillRect(x * ts + ts / 2 - s / 2, y * ts + ts / 2 - s / 2, s, s); }
        else if (v === 2 && Math.floor(clock * 4) % 2 === 0){ g.fillStyle = "#c8ffd4"; g.beginPath(); g.arc(x * ts + ts / 2, y * ts + ts / 2, ts * 0.3, 0, Math.PI * 2); g.fill(); }
      }
      // Geister
      for (const gh of ghosts) drawGhost(gh);
      // Spieler
      const pp = pos(pac);
      const cx = pp.x * ts + ts / 2, cy = pp.y * ts + ts / 2, r = ts * 0.45;
      const open = 0.05 + Math.abs(Math.sin(pac.mouth)) * 0.32;
      const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[pac.dir];
      g.fillStyle = "#ffe066"; g.shadowColor = "#ffe066"; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, rot + open * Math.PI, rot - open * Math.PI + Math.PI * 2); g.closePath(); g.fill();
      g.shadowBlur = 0;

      bar.innerHTML = `<span>score <b>${String(score).padStart(5, "0")}</b></span><span>best <b>${best}</b></span>
        <span>level <b>${level}</b></span><span>leben <b>${"◖".repeat(Math.max(0, lives))}</b></span>
        <span class="right">${fright > 0 ? "<b>JAGD!</b>" : mode === "chase" ? "geister jagen" : "geister zerstreut"}</span>`;
    }

    function drawGhost(gh){
      const x = gh.fx * ts + ts / 2, y = gh.fy * ts + ts / 2, r = ts * 0.45;
      const blinkEnd = fright > 0 && fright < 1.6 && Math.floor(clock * 8) % 2;
      if (gh.st !== "eyes"){
        g.fillStyle = gh.scared ? (blinkEnd ? "#e8ffe8" : "#2f5cff") : gh.color;
        g.beginPath();
        g.arc(x, y - r * 0.1, r, Math.PI, 0);
        // gezackter Saum, wackelt im Takt
        const bottom = y + r * 0.85, waves = 3, wv = (r * 2) / waves, lift = Math.floor(clock * 8) % 2 ? 0.3 : 0.18;
        g.lineTo(x + r, bottom);
        for (let i = 0; i < waves; i++){
          const sx = x + r - i * wv;
          g.lineTo(sx - wv / 2, bottom - r * lift);
          g.lineTo(sx - wv, bottom);
        }
        g.closePath(); g.fill();
      }
      if (gh.scared && gh.st !== "eyes"){
        g.fillStyle = "#ffd6d6";
        g.fillRect(x - r * 0.4, y - r * 0.3, r * 0.2, r * 0.2); g.fillRect(x + r * 0.2, y - r * 0.3, r * 0.2, r * 0.2);
        return;
      }
      // Augen schauen in Laufrichtung
      const [dx, dy] = DIRS[gh.dir] || [0, 0];
      for (const ex of [-0.35, 0.35]){
        g.fillStyle = "#fff"; g.beginPath(); g.arc(x + ex * r, y - r * 0.2, r * 0.26, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#1a3cff"; g.beginPath(); g.arc(x + ex * r + dx * r * 0.12, y - r * 0.2 + dy * r * 0.12, r * 0.13, 0, Math.PI * 2); g.fill();
      }
    }

    function begin(){
      if (state === "over") newGame();
      if (state === "ready" || state === "over" || state === "paused"){ state = "running"; overlay(null); }
    }

    ctx.loop(dt => {
      const s = Math.min(dt, 50) / 1000;
      if (state === "running") update(s);
      else clock += s;
      draw();
    });

    size();
    addEventListener("resize", size);
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "▲", key: "ArrowUp" },
      { label: "▼", key: "ArrowDown" }, { label: "▶", key: "ArrowRight" },
    ]);
    ctx.swipe(body, () => begin());
    newGame();
    overlay(`<div class="big">C H O M P</div><div>alle Punkte fressen · ◯ = Geister jagen</div>
      <div class="dim">${ctx.touch ? "tippen zum Start · wischen zum Lenken" : "Pfeiltasten / WASD · ENTER = start"}</div>`);

    return {
      stop(){ removeEventListener("resize", size); },
      key(e){
        const k = e.key;
        const map = { ArrowUp: "up", w: "up", ArrowDown: "down", s: "down", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right" };
        if (map[k]){ pac.want = map[k]; if (state === "ready") begin(); return true; }
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
