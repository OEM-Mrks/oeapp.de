/* blocks — fallende Blöcke im ASCII-Look der allerersten Version auf
   dem Elektronika 60. Eigene Umsetzung, kein fremder Code. */

OE.register({
  id: "blocks",
  alias: ["tetris"],
  title: "blocks.exe",
  desc: "Fallende Blöcke, volle Reihen verschwinden (Tetris-artig).",
  start(ctx){
    const W = 10, H = 20;
    const SHAPES = {
      I: [[0,1],[1,1],[2,1],[3,1]],
      O: [[1,0],[2,0],[1,1],[2,1]],
      T: [[1,0],[0,1],[1,1],[2,1]],
      S: [[1,0],[2,0],[0,1],[1,1]],
      Z: [[0,0],[1,0],[1,1],[2,1]],
      J: [[0,0],[0,1],[1,1],[2,1]],
      L: [[2,0],[0,1],[1,1],[2,1]],
    };
    const SIZE = { I: 4, O: 4 };   // Drehbox; alle anderen 3x3

    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<pre class="blocks-pre" style="margin:0;line-height:1.15"></pre><div class="app-overlay"></div>`;
    const pre = body.querySelector("pre"), ov = body.querySelector(".app-overlay");

    let grid, cur, next, bag, score, lines, level, best = ctx.store.get("blocks.best", 0);
    let state = "ready", acc = 0;

    function newBag(){
      const b = Object.keys(SHAPES);
      for (let i = b.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      return b;
    }
    function take(){ if (!bag.length) bag = newBag(); return bag.pop(); }
    function spawn(type){
      return { type, cells: SHAPES[type].map(c => c.slice()), x: 3, y: type === "I" ? -1 : 0 };
    }

    function reset(){
      grid = Array.from({ length: H }, () => Array(W).fill(0));
      bag = newBag();
      cur = spawn(take()); next = take();
      score = 0; lines = 0; level = 1; acc = 0;
      fit();
    }

    function cellsAt(p, dx = 0, dy = 0, cells = p.cells){ return cells.map(([x, y]) => [p.x + x + dx, p.y + y + dy]); }
    function collides(p, dx = 0, dy = 0, cells){
      return cellsAt(p, dx, dy, cells).some(([x, y]) => x < 0 || x >= W || y >= H || (y >= 0 && grid[y][x]));
    }

    function rotate(){
      if (cur.type === "O") return;
      const n = (SIZE[cur.type] || 3) - 1;
      const rot = cur.cells.map(([x, y]) => [n - y, x]);
      for (const kick of [0, -1, 1, -2, 2]){
        if (!collides(cur, kick, 0, rot)){ cur.cells = rot; cur.x += kick; ctx.beep(660, 25); return; }
      }
    }
    function move(dx){ if (!collides(cur, dx, 0)) cur.x += dx; }
    function soft(){ if (!collides(cur, 0, 1)){ cur.y++; score += 1; } else lock(); }
    function hard(){ let n = 0; while (!collides(cur, 0, 1)){ cur.y++; n++; } score += n * 2; lock(); }
    function ghostY(){ let d = 0; while (!collides(cur, 0, d + 1)) d++; return d; }

    function lock(){
      for (const [x, y] of cellsAt(cur)){
        if (y < 0) return over();
        grid[y][x] = 1;
      }
      let cleared = 0;
      for (let y = H - 1; y >= 0; y--){
        if (grid[y].every(Boolean)){ grid.splice(y, 1); grid.unshift(Array(W).fill(0)); cleared++; y++; }
      }
      if (cleared){
        score += [0, 100, 300, 500, 800][cleared] * level;
        lines += cleared;
        level = 1 + Math.floor(lines / 10);
        ctx.beep(cleared === 4 ? 1760 : 1100, cleared === 4 ? 220 : 90);
        if (cleared === 4) ctx.log("OK", `blocks: <span class="ok">TETRIS</span> — 4 Reihen auf einmal`);
      } else ctx.beep(330, 30);
      cur = spawn(next); next = take();
      if (collides(cur)) over();
    }

    function over(){
      state = "over";
      ctx.beep(196, 400, "sawtooth");
      if (score > best){ best = score; ctx.store.set("blocks.best", best); }
      overlay(`<div class="big">GAME OVER</div><div>score ${score} · ${lines} reihen</div>
        <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ESC = exit</div>`);
    }

    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    // Schriftgröße so wählen, dass Brett + Infospalte in die Fläche passen
    function fit(){
      const w = body.clientWidth, h = body.clientHeight;
      const fs = Math.max(9, Math.min(22, h / (H + 3) / 1.15, w / 40 / 0.6));
      pre.style.fontSize = fs.toFixed(1) + "px";
    }

    function render(){
      const g = ghostY();
      const live = new Set(cellsAt(cur).map(([x, y]) => x + "," + y));
      const ghost = new Set(state === "running" ? cellsAt(cur, 0, g).map(([x, y]) => x + "," + y) : []);
      const rowsOut = [];
      for (let y = 0; y < H; y++){
        let s = '<span class="dim">&lt;!</span>';
        for (let x = 0; x < W; x++){
          const k = x + "," + y;
          if (live.has(k)) s += '<span class="ok">[]</span>';
          else if (grid[y][x]) s += "[]";
          else if (ghost.has(k)) s += '<span class="dim">::</span>';
          else s += '<span class="dim"> .</span>';
        }
        rowsOut.push(s + '<span class="dim">!&gt;</span>');
      }
      rowsOut.push('<span class="dim">&lt;!' + "=".repeat(W * 2) + "!&gt;</span>");
      rowsOut.push('<span class="dim">  ' + "\\/".repeat(W) + "</span>");

      // Infospalte rechts
      const nx = SHAPES[next];
      const prev = [0, 1].map(r => [0, 1, 2, 3].map(c => nx.some(([x, y]) => x === c && y === r) ? "[]" : "  ").join(""));
      const info = [
        "", `  SCORE  <span class="ok">${String(score).padStart(6, "0")}</span>`,
        `  LINES  ${lines}`, `  LEVEL  ${level}`, `  BEST   ${best}`, "",
        '  <span class="dim">NEXT</span>', "  " + prev[0], "  " + prev[1], "",
        '  <span class="dim">← →   move</span>', '  <span class="dim">↑     rotate</span>',
        '  <span class="dim">↓     soft</span>', '  <span class="dim">SPACE drop</span>', '  <span class="dim">P     pause</span>',
      ];
      pre.innerHTML = rowsOut.map((r, i) => r + (info[i] || "")).join("\n");
    }

    function gravity(){ return Math.max(70, 800 - (level - 1) * 75); }

    ctx.loop(dt => {
      if (state === "running"){
        acc += dt;
        if (acc >= gravity()){
          acc = 0;
          if (!collides(cur, 0, 1)) cur.y++; else lock();
        }
      }
      render();
    });

    bar.innerHTML = `<span>blocks <b>v1.0</b></span><span>7-bag · ghost · wall kicks</span><span class="right">${ctx.touch ? "wischen ← → · tippen = drehen · ⤓ = drop" : "ESC = exit"}</span>`;
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft" }, { label: "↻", key: "ArrowUp", aria: "Drehen" },
      { label: "▶", key: "ArrowRight" }, { label: "▼", key: "ArrowDown", aria: "Runter" },
      { label: "⤓", key: " ", aria: "Fallen lassen" },
    ]);
    ctx.swipe(body, () => { if (state === "running") rotate(); else begin(); });
    addEventListener("resize", fit);

    function begin(){
      if (state === "over") reset();
      if (state !== "running"){ state = "running"; overlay(null); }
    }

    reset();
    overlay(`<div class="big">B L O C K S</div><div>volle Reihen verschwinden · 4 auf einmal = TETRIS</div>
      <div class="dim">${ctx.touch ? "tippen zum Start" : "ENTER = start"}</div>`);

    return {
      stop(){ removeEventListener("resize", fit); },
      key(e){
        const k = e.key;
        if (state !== "running"){
          if (k === "Enter" || k === " " || (state === "ready" && k.startsWith("Arrow"))){ begin(); return true; }
          if ((k === "p" || k === "P") && state === "paused"){ state = "running"; overlay(null); return true; }
          if (k === "q"){ ctx.exit(); return true; }
          return false;
        }
        if (k === "ArrowLeft" || k === "a"){ move(-1); return true; }
        if (k === "ArrowRight" || k === "d"){ move(1); return true; }
        if (k === "ArrowUp" || k === "w" || k === "x"){ rotate(); return true; }
        if (k === "ArrowDown" || k === "s"){ soft(); acc = 0; return true; }
        if (k === " "){ hard(); acc = 0; return true; }
        if (k === "p" || k === "P"){ state = "paused"; overlay(`<div class="big">PAUSE</div><div class="dim">P = weiter</div>`); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
