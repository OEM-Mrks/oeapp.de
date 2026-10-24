/* chomp — Labyrinth, Punkte fressen, vier Geister. Angelehnt an
   Pac-Man (1980), aber eigenes Labyrinth und eigener Code.
   Geister-Verhalten wie im Vorbild: abwechselnd "Ecke aufsuchen" und
   "jagen", jeder Geist mit eigenem Ziel; nach einer Kraftpille fliehen sie.
   Stufen: leicht (langsame, ziellose Geister, 5 Leben, halbes Feld = gewonnen),
   normal (wie früher), schwer (schnellere Geister, kürzere Jagdzeit). */

OE.register({
  id: "chomp",
  alias: ["pacman", "pac"],
  title: "chomp.exe",
  desc: "Labyrinth, Punkte, vier Geister (Pac-Man-artig).",
  demo: true,
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

    const lv = ctx.levels();
    const stufe = () => ctx.demo ? "normal" : lv.value;
    // je Stufe: Geistertempo, Leben, Kraftpillen-Dauer, Zerstreuen/Jagen (s), Ausgangs-Takt, Anteil zielloser Züge
    const LV = {
      leicht: { gs: 4.3, lives: 5, fr: 9, sc: 10, ch: 8,  rel: 2,   wander: 0.6 },
      normal: { gs: 6.4, lives: 3, fr: 7, sc: 6,  ch: 20, rel: 1,   wander: 0 },
      schwer: { gs: 7.0, lives: 3, fr: 4, sc: 4,  ch: 26, rel: 0.5, wander: 0 },
    };
    const S = () => LV[stufe()];
    // Rekord je Stufe; "normal" behält den alten Schlüssel, "leicht" zählt die Bestzeit
    const bestKey = () => stufe() === "normal" ? "chomp.best" : "chomp.best." + stufe();
    const secs = t => t.toFixed(1) + " s";

    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas"></canvas><div class="app-overlay"></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), ov = body.querySelector(".app-overlay");

    let ts = 20, mazeC = null, mazeFlash = null;
    function size(){
      ts = Math.max(10, Math.floor(Math.min(body.clientWidth / W, body.clientHeight / H)));
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * ts * dpr; cv.height = H * ts * dpr;
      cv.style.width = W * ts + "px"; cv.style.height = H * ts + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      mazeC = renderMaze("51,255,102", "#b8ffc8");
      mazeFlash = renderMaze("255,255,255", "#ffffff");
    }

    // Labyrinth einmal vorzeichnen: Neonröhren aus drei Lagen (breit/blass, mittel, hell)
    function renderMaze(rgb, core){
      const dpr = window.devicePixelRatio || 1;
      const c = document.createElement("canvas");
      c.width = W * ts * dpr; c.height = H * ts * dpr;
      const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bgr = x.createRadialGradient(W * ts / 2, H * ts / 2, 0, W * ts / 2, H * ts / 2, H * ts * 0.75);
      bgr.addColorStop(0, "#03140a"); bgr.addColorStop(1, "#000");
      x.fillStyle = bgr; x.fillRect(0, 0, W * ts, H * ts);
      const wall = (xx, yy) => yy < 0 || yy >= H || xx < 0 || xx >= W ? true : MAZE[yy][xx] === "#" || MAZE[yy][xx] === " ";
      // Wandblöcke leicht gefüllt, damit sie Masse haben
      x.fillStyle = `rgba(${rgb},.06)`;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (MAZE[y][xx] === "#") x.fillRect(xx * ts, y * ts, ts, ts);
      x.beginPath();
      const inset = ts * 0.32, r = ts * 0.32;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++){
        if (MAZE[y][xx] !== "#") continue;
        const X = xx * ts, Y = y * ts;
        const up = !wall(xx, y - 1), dn = !wall(xx, y + 1), lf = !wall(xx - 1, y), rt = !wall(xx + 1, y);
        // Kanten zu Gängen; an Außenecken gerundet
        if (up){ x.moveTo(X + (lf ? inset + r : 0), Y + inset); x.lineTo(X + ts - (rt ? inset + r : 0), Y + inset); }
        if (dn){ x.moveTo(X + (lf ? inset + r : 0), Y + ts - inset); x.lineTo(X + ts - (rt ? inset + r : 0), Y + ts - inset); }
        if (lf){ x.moveTo(X + inset, Y + (up ? inset + r : 0)); x.lineTo(X + inset, Y + ts - (dn ? inset + r : 0)); }
        if (rt){ x.moveTo(X + ts - inset, Y + (up ? inset + r : 0)); x.lineTo(X + ts - inset, Y + ts - (dn ? inset + r : 0)); }
        if (up && lf){ x.moveTo(X + inset, Y + inset + r); x.arcTo(X + inset, Y + inset, X + inset + r, Y + inset, r); }
        if (up && rt){ x.moveTo(X + ts - inset - r, Y + inset); x.arcTo(X + ts - inset, Y + inset, X + ts - inset, Y + inset + r, r); }
        if (dn && lf){ x.moveTo(X + inset, Y + ts - inset - r); x.arcTo(X + inset, Y + ts - inset, X + inset + r, Y + ts - inset, r); }
        if (dn && rt){ x.moveTo(X + ts - inset - r, Y + ts - inset); x.arcTo(X + ts - inset, Y + ts - inset, X + ts - inset, Y + ts - inset - r, r); }
        // Innenecken: diagonal offen, beide Nachbarn Wand
        const corner = (ox, oy) => !wall(xx + ox, y + oy) && wall(xx + ox, y) && wall(xx, y + oy);
        const cxp = ox => ox < 0 ? X + inset : X + ts - inset, cyp = oy => oy < 0 ? Y + inset : Y + ts - inset;
        for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (corner(ox, oy)){
          const ex = ox < 0 ? X : X + ts, ey = oy < 0 ? Y : Y + ts;
          x.moveTo(ex, cyp(oy)); x.arcTo(cxp(ox), cyp(oy), cxp(ox), ey, ts - inset);
        }
      }
      x.lineCap = "round"; x.lineJoin = "round";
      x.strokeStyle = `rgba(${rgb},.12)`; x.lineWidth = ts * 0.55; x.stroke();
      x.strokeStyle = `rgba(${rgb},.35)`; x.lineWidth = ts * 0.24; x.stroke();
      x.strokeStyle = core; x.lineWidth = Math.max(1.2, ts / 10); x.stroke();
      // Tür zum Geisterhaus
      x.fillStyle = "rgba(255,154,213,.25)"; x.fillRect(9 * ts - 2, 8 * ts + ts * 0.36, ts + 4, ts * 0.3);
      x.fillStyle = "#ff9ad5"; x.fillRect(9 * ts, 8 * ts + ts * 0.44, ts, ts * 0.14);
      return c;
    }

    const wrapX = x => (x + W) % W;
    const cell = (x, y) => (MAZE[y] || "")[wrapX(x)] || "#";
    const isWall = (x, y) => cell(x, y) === "#";

    let grid, dots, pac, ghosts, score, lives, level, best = ctx.store.get(bestKey(), 0), goal = 0, playT = 0;
    let state = "ready", mode = "scatter", modeT = 0, fright = 0, combo = 0, clock = 0, freeze = 0;
    let dieT = 0, eatenDots = 0, fruit = null, readyOn = false;
    let barKey = "";
    const pops = [], parts = [];   // Punkte-Einblendungen, Funken

    function newLevel(){
      grid = MAZE.map(r => [...r].map(c => c === "." ? 1 : c === "o" ? 2 : 0));
      dots = grid.flat().filter(Boolean).length; eatenDots = 0; fruit = null;
      goal = Math.ceil(dots / 2);
      resetActors();
    }
    function resetActors(){
      readyOn = true;
      pac = { x: 9, y: 15, dir: "left", want: "left", p: 0, moving: true, mouth: 0 };
      ghosts = GHOSTS.map((d, i) => ({ ...d, x: i === 0 ? DOOR.x : 8 + (i - 1), y: i === 0 ? DOOR.y : HOME.y,
        fx: 0, fy: 0, dir: "left", p: 0, st: i === 0 ? "out" : "house", eaten: false }));
      ghosts.forEach(gh => { gh.fx = gh.x; gh.fy = gh.y; });
      mode = "scatter"; modeT = 0; fright = 0; clock = 0; freeze = ctx.demo ? 0.3 : 1.2;
    }
    function newGame(){ score = 0; lives = S().lives; level = 1; playT = 0; best = ctx.store.get(bestKey(), 0); newLevel(); }

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

    /* Vorführung: Breitensuche zum nächsten Punkt, Felder in Geisternähe
       sind teuer; verängstigte Geister werden gejagt */
    function bfs(sx, sy, block){
      const d = grid.map(r => r.map(() => Infinity)), q = [[sx, sy]];
      d[sy][sx] = 0;
      while (q.length){
        const [x, y] = q.shift();
        for (const dir in DIRS){
          if (!canGo(x, y, dir)) continue;
          const nx = wrapX(x + DIRS[dir][0]), ny = y + DIRS[dir][1];
          if (d[ny][nx] !== Infinity || (block && block(nx, ny))) continue;
          d[ny][nx] = d[y][x] + 1; q.push([nx, ny]);
        }
      }
      return d;
    }
    function aiDir(e){
      const danger = ghosts.filter(gh => gh.st === "out" && !gh.scared).map(gh => bfs(gh.x, gh.y));
      const prey = ghosts.filter(gh => gh.st === "out" && gh.scared);
      const near = (x, y) => danger.reduce((m, d) => Math.min(m, d[y][x]), Infinity);
      let best = null, bestS = Infinity;
      for (const dir in DIRS){
        if (!canGo(e.x, e.y, dir)) continue;
        const nx = wrapX(e.x + DIRS[dir][0]), ny = e.y + DIRS[dir][1];
        const gd = near(nx, ny);
        // ab dem Nachbarfeld: nächster Punkt bzw. Geist, ohne Felder direkt vor einem Geist
        const d = bfs(nx, ny, (x, y) => near(x, y) <= 1);
        let goal = Infinity;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x]) goal = Math.min(goal, d[y][x] - (grid[y][x] === 2 && gd < 6 ? 4 : 0));
        for (const gh of prey) goal = Math.min(goal, d[gh.y][gh.x] - 3);
        let sc = goal + (gd <= 1 ? 1000 : gd <= 3 ? 30 / gd : 0) + (dir === OPP[e.dir] ? 1.5 : 0);
        if (sc < bestS){ bestS = sc; best = dir; }
      }
      return best;
    }

    function choosePac(e){
      if (ctx.demo){ const d = aiDir(e); if (d) e.want = d; }
      if (canGo(e.x, e.y, e.want)) return e.want;
      if (canGo(e.x, e.y, e.dir)) return e.dir;
      return null;
    }

    function ghostTarget(gh){
      if (gh.st === "eyes") return DOOR;
      if (fright > 0 || Math.random() < S().wander) return { x: ctx.rint(0, W - 1), y: ctx.rint(0, H - 1) };
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
      eatenDots++;
      if (eatenDots === 70 || eatenDots === 170) fruit = { x: 9, y: 11, t: 9 };   // Bonus-Kirsche unter dem Geisterhaus
      if (v === 1){ score += 10; if (dots % 2) ctx.beep(520, 25, "square", 0.02); }
      else {
        score += 50; combo = 0;
        burst(x * ts + ts / 2, y * ts + ts / 2, "#c8ffd4", 16);
        fright = Math.max(stufe() === "schwer" ? 1.5 : 2, S().fr - level);
        ghosts.forEach(gh => { if (gh.st === "out"){ gh.reverse = true; gh.scared = true; } });
        ctx.beep(220, 160, "triangle", 0.05);
      }
      if (stufe() === "leicht" && eatenDots >= goal) return win();
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
        if (clock > gh.release * S().rel / Math.max(1, level * 0.6)) gh.st = "leaving";
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

    function burst(x, y, col, n){
      for (let i = 0; i < n; i++){
        const a = Math.random() * Math.PI * 2, v = ts * (2 + Math.random() * 5), life = 0.3 + Math.random() * 0.4;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col });
      }
    }
    function pop(x, y, text, col){ pops.push({ x, y, text, col, t: 0 }); }

    function update(dt){
      clock += dt;
      if (freeze > 0){ freeze -= dt; return; }
      readyOn = false;
      if (fruit){
        fruit.t -= dt;
        const fp = pos(pac);
        if (Math.abs(fp.x - fruit.x) < 0.6 && Math.abs(fp.y - fruit.y) < 0.6){
          const pts = 100 * level; score += pts; pop(fruit.x, fruit.y, pts, "#ff7a8a");
          ctx.beep(1046, 80); ctx.after(90, () => ctx.beep(1568, 120)); fruit = null;
        } else if (fruit.t <= 0) fruit = null;
      }
      if (fright > 0){ fright -= dt; if (fright <= 0) ghosts.forEach(gh => gh.scared = false); }
      else {
        modeT += dt;
        const len = mode === "scatter" ? S().sc : S().ch;
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
      if (state === "over") return;   // leicht: gerade gewonnen
      if (pac.moving) pac.mouth += dt * 14;

      for (const gh of ghosts){
        if (gh.st !== "out" && gh.st !== "eyes"){ moveHouse(gh, dt); continue; }
        const inTunnel = gh.y === 9 && (gh.x < 4 || gh.x > W - 5);
        const sp = gh.st === "eyes" ? 14 : gh.scared ? (stufe() === "leicht" ? 3 : 4) : inTunnel ? 3.5 : S().gs + level * 0.3;
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
            pop(gh.fx, gh.fy, pts, "#5affe0");
            ctx.beep(880 + combo * 200, 120);
            freeze = 0.35;
          } else return die();
        }
      }
    }

    function die(){
      // erst die Animation (Spieler klappt auf und verpufft), dann geht es weiter
      state = "dying"; dieT = 0;
      for (let i = 0; i < 9; i++) ctx.after(i * 110, () => ctx.beep(780 - i * 60, 90, "triangle", 0.05));
    }
    function afterDeath(){
      lives--;
      const pp = pos(pac); burst(pp.x * ts + ts / 2, pp.y * ts + ts / 2, "#ffe066", 22);
      ctx.beep(140, 220, "sawtooth", 0.05);
      if (lives <= 0){
        state = "over";
        if (score > best && stufe() !== "leicht"){ best = score; ctx.store.set(bestKey(), best); }
        overlay(`<div class="big">GAME OVER</div><div>score ${score} · level ${level}</div>${lvBtn()}
          <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
      } else { resetActors(); state = "running"; }
    }

    // leicht: halbes Feld leer gefressen – Jubel, Bestzeit
    function win(){
      state = "over";
      const t = Math.round(playT * 10) / 10, rec = !best || t < best;
      if (rec){ best = t; ctx.store.set(bestKey(), best); }
      const pp = pos(pac);
      burst(pp.x * ts + ts / 2, pp.y * ts + ts / 2, "#ffe066", 30);
      [1046, 1318, 1568, 2093].forEach((f, i) => ctx.after(i * 110, () => ctx.beep(f, 120, "square", 0.04)));
      confetti();
      ctx.log("OK", `chomp: gewonnen in ${secs(t)}`);
      overlay(`<div class="big">G E W O N N E N</div><div>${goal} punkte in ${secs(t)}${rec ? "  ★ bestzeit" : ""}</div>${lvBtn()}
        <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ${ctx.touch ? "" : "2 = normal · "}ESC = exit</div>`);
    }
    // Jubel: Punkte und Geisterfarben regnen übers Labyrinth
    function confetti(){
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      body.style.overflow = "hidden";
      const h = body.clientHeight + 40, cols = ["#ffe066", "#ff5a5a", "#ff9ad5", "#5affe0", "#ffb454"];
      for (let i = 0; i < 70; i++){
        const s = document.createElement("span"), z = 6 + Math.random() * 10;
        s.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-24px;width:${z}px;height:${z}px;border-radius:50%;pointer-events:none;z-index:3;` +
          `background:${cols[i % cols.length]};box-shadow:0 0 10px ${cols[i % cols.length]}`;
        body.appendChild(s);
        s.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 160}px,${h}px)`, opacity: 0.3 }],
          { duration: 1600 + Math.random() * 1800, delay: Math.random() * 900, easing: "cubic-bezier(.3,.5,.6,1)", fill: "both" }).onfinish = () => s.remove();
      }
    }

    /* Stufe wählen: 1/2/3 oder Knopf im Overlay / Statuszeile, nur außerhalb des Spiels */
    const lvBtn = () => ctx.demo ? "" : `<button type="button" class="lv-pick" style="font:inherit;color:#ffe066;background:rgba(255,224,102,.08);` +
      `border:1px solid rgba(255,224,102,.5);padding:6px 14px;margin:6px 0;cursor:pointer;touch-action:manipulation">stufe ‹ <b>${stufe()}</b> ›</button>` +
      `<div class="dim">${{ leicht: "halbes feld = gewonnen · 5 leben · geister bummeln", normal: "alle punkte · 3 leben", schwer: "schnelle geister · kurze jagd" }[stufe()]}</div>`;
    const titleHtml = () => `<div class="big">C H O M P</div><div>alle Punkte fressen · ◯ = Geister jagen</div>${lvBtn()}
      <div class="dim">${ctx.touch ? "tippen zum Start · wischen zum Lenken" : "Pfeiltasten / WASD · ENTER = start · 1 2 3 = stufe"}</div>`;
    function setLevel(v){
      if (state === "running" || state === "dying" || state === "clear" || ctx.demo || v === lv.value) return;
      lv.set(v); newGame(); state = "ready";
      ctx.beep(520 + lv.index * 180, 60, "square", 0.03);
      overlay(titleHtml());
    }
    ov.addEventListener("pointerdown", e => { if (e.target.closest(".lv-pick")) e.stopPropagation(); });
    ov.addEventListener("click", e => { if (e.target.closest(".lv-pick")){ e.stopPropagation(); setLevel(lv.names[(lv.index + 1) % 3]); } });
    bar.addEventListener("click", e => { if (e.target.closest(".lv")) setLevel(lv.names[(lv.index + 1) % 3]); });

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    /* ---------- Zeichnen ---------- */
    const TAU = Math.PI * 2;
    function halo(x, y, r, rgb, a){
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function draw(dt){
      const flashing = state === "clear" && Math.floor(clock * 6) % 2;
      g.drawImage(flashing ? mazeFlash : mazeC, 0, 0, W * ts, H * ts);

      // Punkte und Kraftpillen
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        const v = grid[y][x], cx = x * ts + ts / 2, cy = y * ts + ts / 2;
        if (v === 1){
          g.fillStyle = "rgba(255,214,170,.18)"; g.beginPath(); g.arc(cx, cy, ts * 0.17, 0, TAU); g.fill();
          g.fillStyle = "#ffe2c2"; g.beginPath(); g.arc(cx, cy, Math.max(1.4, ts * 0.085), 0, TAU); g.fill();
        } else if (v === 2){
          const pulse = 0.8 + Math.sin(clock * 7) * 0.2;
          halo(cx, cy, ts * 0.85 * pulse, "255,226,194", 0.45);
          g.fillStyle = "#fff1de"; g.beginPath(); g.arc(cx, cy, ts * 0.3 * pulse, 0, TAU); g.fill();
        }
      }

      if (fruit && (fruit.t > 2 || Math.floor(clock * 8) % 2)) drawCherry(fruit.x * ts + ts / 2, fruit.y * ts + ts / 2, ts * 0.42);

      for (const gh of ghosts) drawGhost(gh);
      drawPac();

      // Funken
      g.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--){
        const p = parts[i];
        p.life -= dt; if (p.life <= 0){ parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
        g.globalAlpha = p.life / p.max; g.fillStyle = p.col; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";

      // Punkte-Einblendungen steigen auf und verblassen
      g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = pops.length - 1; i >= 0; i--){
        const p = pops[i]; p.t += dt;
        if (p.t > 1.1){ pops.splice(i, 1); continue; }
        g.globalAlpha = Math.min(1, (1.1 - p.t) * 2);
        g.font = `600 ${Math.round(ts * 0.75)}px "IBM Plex Mono", monospace`;
        g.fillStyle = p.col; g.fillText(p.text, p.x * ts + ts / 2, p.y * ts + ts / 2 - p.t * ts * 0.9);
      }
      g.globalAlpha = 1;

      if (readyOn && state !== "dying"){
        g.font = `600 ${Math.round(ts * 0.9)}px "IBM Plex Mono", monospace`;
        g.fillStyle = "#ffe066"; g.fillText("READY!", 9.5 * ts, 11.5 * ts);
      }

      const easy = stufe() === "leicht";
      const html = `<span>score <b>${String(score).padStart(5, "0")}</b></span>` +
        (easy ? `<span>ziel <b>${eatenDots}/${goal}</b></span>` : `<span>best <b>${best}</b></span><span>level <b>${level}</b></span>`) +
        `<span class="lv" style="cursor:pointer">stufe <b>${stufe()}</b></span>`;
      // nur bei Änderung neu schreiben (sonst geht der Klick auf "stufe" verloren)
      const key = html + lives + (fright > 0) + mode;
      if (key === barKey) return;
      barKey = key;
      bar.innerHTML = `${html}<span>leben <b style="color:#ffe066">${"◖".repeat(Math.max(0, lives))}</b></span>
        <span class="right">${fright > 0 ? "<b>JAGD!</b>" : mode === "chase" ? "geister jagen" : "geister zerstreut"}</span>`;
    }

    function drawPac(){
      const pp = pos(pac);
      const cx = pp.x * ts + ts / 2, cy = pp.y * ts + ts / 2, r = ts * 0.47;
      let open = 0.04 + Math.abs(Math.sin(pac.mouth)) * 0.3;
      let rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[pac.dir];
      if (state === "dying"){
        if (dieT > 1.15) return;
        rot = -Math.PI / 2; open = Math.min(0.999, 0.1 + dieT / 1.1);   // klappt nach oben auf, bis nichts mehr übrig ist
      }
      halo(cx, cy, r * 2.4, "255,224,102", 0.28);
      const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      gr.addColorStop(0, "#fffbd0"); gr.addColorStop(0.45, "#ffe34d"); gr.addColorStop(1, "#e2a800");
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, rot + open * Math.PI, rot - open * Math.PI + TAU); g.closePath(); g.fill();
      // kleines Auge, schaut in Laufrichtung
      if (state !== "dying"){
        const ex = cx + Math.cos(rot - Math.PI / 2 * (pac.dir === "left" ? -1 : 1)) * r * 0.45 + Math.cos(rot) * r * 0.05;
        const ey = cy + Math.sin(rot - Math.PI / 2 * (pac.dir === "left" ? -1 : 1)) * r * 0.45 + Math.sin(rot) * r * 0.05;
        g.fillStyle = "#3a2a00"; g.beginPath(); g.arc(ex, ey, Math.max(1, r * 0.11), 0, TAU); g.fill();
      }
    }

    function drawGhost(gh){
      const x = gh.fx * ts + ts / 2, y = gh.fy * ts + ts / 2, r = ts * 0.47;
      const blinkEnd = fright > 0 && fright < 1.6 && Math.floor(clock * 8) % 2;
      if (gh.st !== "eyes"){
        const col = gh.scared ? (blinkEnd ? "#e8f0ff" : "#2f5cff") : gh.color;
        const rgb = gh.scared ? (blinkEnd ? "232,240,255" : "47,92,255") : hexRgb(gh.color);
        halo(x, y, r * 2.2, rgb, 0.22);
        const gr = g.createLinearGradient(x, y - r, x, y + r);
        gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.6, col); gr.addColorStop(1, shade(col, -0.25));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y - r * 0.1, r, Math.PI, 0);
        // welliger Saum, wackelt im Takt
        const bottom = y + r * 0.88, waves = 4, wv = (r * 2) / waves, ph = Math.floor(clock * 8) % 2 ? 0.5 : 0;
        g.lineTo(x + r, bottom);
        for (let i = 0; i < waves; i++){
          const sx = x + r - i * wv;
          g.quadraticCurveTo(sx - wv * (0.25 + ph * 0.5), bottom - r * 0.32, sx - wv, bottom);
        }
        g.closePath(); g.fill();
      }
      if (gh.scared && gh.st !== "eyes"){
        // erschrockenes Gesicht: Punktaugen, Zickzack-Mund
        g.fillStyle = blinkEnd ? "#ff4f6a" : "#ffd6d6";
        g.fillRect(x - r * 0.38, y - r * 0.32, r * 0.2, r * 0.2); g.fillRect(x + r * 0.18, y - r * 0.32, r * 0.2, r * 0.2);
        g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1, r * 0.1);
        g.beginPath();
        for (let i = 0; i <= 6; i++) g.lineTo(x - r * 0.55 + i * r * 0.183, y + r * 0.3 + (i % 2 ? -r * 0.12 : 0));
        g.stroke();
        return;
      }
      // Augen schauen in Laufrichtung
      const [dx, dy] = DIRS[gh.dir] || [0, 0];
      for (const ex of [-0.36, 0.36]){
        g.fillStyle = "#fff"; g.beginPath(); g.ellipse(x + ex * r + dx * r * 0.08, y - r * 0.22 + dy * r * 0.06, r * 0.24, r * 0.3, 0, 0, TAU); g.fill();
        g.fillStyle = "#1a3cff"; g.beginPath(); g.arc(x + ex * r + dx * r * 0.2, y - r * 0.22 + dy * r * 0.18, r * 0.13, 0, TAU); g.fill();
      }
    }

    function drawCherry(x, y, r){
      halo(x, y, r * 2.2, "255,79,106", 0.3);
      g.strokeStyle = "#5ae86a"; g.lineWidth = Math.max(1.2, r * 0.14); g.lineCap = "round";
      g.beginPath(); g.moveTo(x - r * 0.45, y + r * 0.2); g.quadraticCurveTo(x - r * 0.1, y - r * 0.6, x + r * 0.45, y - r * 0.85);
      g.moveTo(x + r * 0.4, y + r * 0.35); g.quadraticCurveTo(x + r * 0.35, y - r * 0.3, x + r * 0.45, y - r * 0.85); g.stroke();
      for (const [ox, oy] of [[-0.45, 0.35], [0.4, 0.5]]){
        const gr = g.createRadialGradient(x + ox * r - r * 0.12, y + oy * r - r * 0.12, r * 0.05, x + ox * r, y + oy * r, r * 0.42);
        gr.addColorStop(0, "#ffb3bd"); gr.addColorStop(0.5, "#ff2d4b"); gr.addColorStop(1, "#a0001a");
        g.fillStyle = gr; g.beginPath(); g.arc(x + ox * r, y + oy * r, r * 0.42, 0, TAU); g.fill();
      }
    }

    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(",");
    function shade(h, f){
      const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).map(v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
      return `rgb(${c.join(",")})`;
    }

    function begin(){
      if (state === "over") newGame();
      if (state === "ready" || state === "over" || state === "paused"){ state = "running"; overlay(null); }
    }

    ctx.loop(dt => {
      const s = Math.min(dt, 50) / 1000;
      if (state === "running"){ update(s); playT += s; }
      else {
        clock += s;
        if (state === "dying"){ dieT += s; if (dieT > 1.5) afterDeath(); }
      }
      draw(s);
    });

    size();
    addEventListener("resize", size);
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "▲", key: "ArrowUp" },
      { label: "▼", key: "ArrowDown" }, { label: "▶", key: "ArrowRight" },
    ]);
    ctx.swipe(body, () => begin());
    newGame();
    if (ctx.demo){ state = "running"; overlay(null); }
    else overlay(titleHtml());

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
        if (k === "1" || k === "2" || k === "3"){ setLevel(lv.names[k - 1]); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
