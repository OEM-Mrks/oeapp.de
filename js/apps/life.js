/* life — Conways Spiel des Lebens. Ränder sind verbunden (Torus).
   Abgestorbene Zellen glimmen kurz nach wie auf einer Phosphor-Röhre. */

OE.register({
  id: "life",
  alias: ["conway"],
  title: "life.sim",
  desc: "Conways Game of Life. Zellen zeichnen, zusehen, staunen.",
  start(ctx){
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas" style="cursor:crosshair;touch-action:none"></canvas>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d");

    const CELL = ctx.touch ? 9 : 8;
    let cols, rows, cur, glow, gen = 0, running = true, speed = 90, acc = 0;

    function size(){
      cols = Math.max(20, Math.floor(body.clientWidth / CELL));
      rows = Math.max(16, Math.floor(body.clientHeight / CELL));
      const dpr = window.devicePixelRatio || 1;
      cv.width = cols * CELL * dpr; cv.height = rows * CELL * dpr;
      cv.style.width = cols * CELL + "px"; cv.style.height = rows * CELL + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      cur = new Uint8Array(cols * rows); glow = new Float32Array(cols * rows);
    }
    const at = (x, y) => ((y + rows) % rows) * cols + ((x + cols) % cols);

    function randomize(){ for (let i = 0; i < cur.length; i++) cur[i] = Math.random() < 0.22 ? 1 : 0; gen = 0; }
    function clear(){ cur.fill(0); glow.fill(0); gen = 0; }
    function stamp(pattern, ox, oy){
      pattern.forEach((row, y) => [...row].forEach((c, x) => { if (c !== ".") cur[at(ox + x, oy + y)] = 1; }));
    }
    const GUN = [
      "........................O...........",
      "......................O.O...........",
      "............OO......OO............OO",
      "...........O...O....OO............OO",
      "OO........O.....O...OO..............",
      "OO........O...O.OO....O.O...........",
      "..........O.....O.......O...........",
      "...........O...O....................",
      "............OO......................",
    ];

    function step(){
      const nxt = new Uint8Array(cur.length);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++){
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += cur[at(x + dx, y + dy)];
        const i = y * cols + x;
        nxt[i] = n === 3 || (n === 2 && cur[i]) ? 1 : 0;
        if (cur[i] && !nxt[i]) glow[i] = 1;
      }
      cur = nxt; gen++;
    }

    function draw(){
      g.fillStyle = "#000"; g.fillRect(0, 0, cols * CELL, rows * CELL);
      let pop = 0;
      for (let i = 0; i < cur.length; i++){
        const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
        if (cur[i]){ pop++; g.fillStyle = "#33ff66"; g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
        else if (glow[i] > 0.05){ g.fillStyle = `rgba(51,255,102,${glow[i] * 0.35})`; g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); glow[i] *= 0.86; }
      }
      bar.innerHTML = `<span>gen <b>${gen}</b></span><span>pop <b>${pop}</b></span><span>tick <b>${speed}ms</b></span>
        <span class="right">${running ? "läuft" : "<b>pause</b>"} · SPACE pause · R zufall · G gun · C leer · +/− tempo</span>`;
    }

    // Zeichnen mit Maus/Finger
    let painting = false, paintVal = 1;
    function cellFrom(e){
      const r = cv.getBoundingClientRect();
      return [Math.floor((e.clientX - r.left) / r.width * cols), Math.floor((e.clientY - r.top) / r.height * rows)];
    }
    cv.addEventListener("pointerdown", e => {
      const [x, y] = cellFrom(e); painting = true; paintVal = cur[at(x, y)] ? 0 : 1; cur[at(x, y)] = paintVal;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", e => { if (painting){ const [x, y] = cellFrom(e); cur[at(x, y)] = paintVal; } });
    cv.addEventListener("pointerup", () => { painting = false; });

    ctx.loop(dt => {
      if (running && !painting){ acc += dt; if (acc >= speed){ acc = 0; step(); } }
      draw();
    });

    ctx.buttons(pad, [
      { label: "⏯", key: " ", aria: "Pause" }, { label: "R", key: "r", aria: "Zufall" },
      { label: "G", key: "g", aria: "Glider Gun" }, { label: "C", key: "c", aria: "Leeren" },
      { label: "−", key: "-", aria: "langsamer" }, { label: "+", key: "+", aria: "schneller" },
    ]);

    size(); randomize();

    return {
      key(e){
        const k = e.key.toLowerCase();
        if (k === " " || k === "p"){ running = !running; return true; }
        if (k === "r"){ randomize(); return true; }
        if (k === "c"){ clear(); running = false; return true; }
        if (k === "g"){ clear(); stamp(GUN, 2, 2); running = true; return true; }
        if (k === "n" || k === "enter"){ step(); return true; }
        if (k === "+" || k === "="){ speed = Math.max(20, speed - 20); return true; }
        if (k === "-"){ speed = Math.min(600, speed + 20); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
