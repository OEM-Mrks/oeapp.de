/* life — Conways Spiel des Lebens. Ränder sind verbunden (Torus).
   Abgestorbene Zellen glimmen kurz nach wie auf einer Phosphor-Röhre.
   "?" startet eine Erklärung: Computerstimme (Sprachausgabe des Browsers),
   mitlaufender Text und Vorführung der Regeln auf dem herangezoomten Feld. */

OE.register({
  id: "life",
  alias: ["conway"],
  title: "life.sim",
  desc: "Conways Game of Life. ? erklärt die Regeln per Computerstimme.",
  demo: true,
  start(ctx){
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas" style="cursor:crosshair;touch-action:none"></canvas>
      <div class="life-say" hidden><div class="life-say-h">&gt; voice.out // life.sim <span class="dim">· tippen = stopp</span></div><div class="life-say-t"></div></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d");
    const sayBox = body.querySelector(".life-say"), sayTxt = body.querySelector(".life-say-t");

    const CELL = ctx.touch ? 9 : 8;
    let cols, rows, cur, glow, gen = 0, running = true, speed = 90, acc = 0;
    let view = { z: 1, ox: 0, oy: 0 }, marks = [];   // Zoom/Ausschnitt und Markierungen für die Erklärung

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
      const c = CELL * view.z, gap = Math.max(1, view.z);
      if (view.z > 1){   // Raster, damit man die Kästchen zählen kann
        g.fillStyle = "rgba(51,255,102,.10)";
        for (let x = 0; x <= cols / view.z; x++) g.fillRect(x * c, 0, 1, rows * CELL);
        for (let y = 0; y <= rows / view.z; y++) g.fillRect(0, y * c, cols * CELL, 1);
      }
      let pop = 0;
      for (let i = 0; i < cur.length; i++){
        if (cur[i]) pop++;
        const x = (i % cols - view.ox) * c, y = (Math.floor(i / cols) - view.oy) * c;
        if (x < -c || y < -c || x > cols * CELL || y > rows * CELL) continue;
        if (cur[i]){ g.fillStyle = "#33ff66"; g.fillRect(x + gap, y + gap, c - 2 * gap, c - 2 * gap); }
        else if (glow[i] > 0.05){ g.fillStyle = `rgba(51,255,102,${glow[i] * 0.35})`; g.fillRect(x + gap, y + gap, c - 2 * gap, c - 2 * gap); glow[i] *= 0.86; }
      }
      for (const m of marks){
        g.strokeStyle = m.col; g.lineWidth = 2;
        g.strokeRect((m.x - view.ox) * c + 1, (m.y - view.oy) * c + 1, c - 2, c - 2);
      }
      bar.innerHTML = `<span>gen <b>${gen}</b></span><span>pop <b>${pop}</b></span><span>tick <b>${speed}ms</b></span>
        <span class="right">${tour ? "<b>erklärung</b>" : running ? "läuft" : "<b>pause</b>"} · ? erklären · SPACE pause · R zufall · G gun · C leer · +/− tempo</span>`;
    }

    // Zeichnen mit Maus/Finger
    let painting = false, paintVal = 1;
    function cellFrom(e){
      const r = cv.getBoundingClientRect();
      return [view.ox + Math.floor((e.clientX - r.left) / r.width * cols / view.z), view.oy + Math.floor((e.clientY - r.top) / r.height * rows / view.z)];
    }
    cv.addEventListener("pointerdown", e => {
      if (tour){ stopTour(); return; }
      const [x, y] = cellFrom(e); painting = true; paintVal = cur[at(x, y)] ? 0 : 1; cur[at(x, y)] = paintVal;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", e => { if (painting){ const [x, y] = cellFrom(e); cur[at(x, y)] = paintVal; } });
    cv.addEventListener("pointerup", () => { painting = false; });

    /* ---------- Erklärung mit Computerstimme ---------- */
    const speech = window.speechSynthesis;
    let tour = null;
    function voice(){
      const vs = speech ? speech.getVoices().filter(v => /^de/i.test(v.lang)) : [];
      // männlich/neutral klingt eher nach Bordcomputer; sonst die erste deutsche Stimme
      return vs.find(v => /markus|yannick|martin|stefan|hans|google deutsch/i.test(v.name)) || vs[0] || null;
    }
    function speak(text){
      return new Promise(res => {
        if (!speech || !window.SpeechSynthesisUtterance) return res(false);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE"; u.pitch = 0.35; u.rate = 0.98;   // tief und gleichförmig: Terminal statt Nachrichtensprecher
        const v = voice(); if (v) u.voice = v;
        u.onend = u.onerror = () => res(true);
        speech.speak(u);
        ctx.after(2500 + text.length * 110, () => res(true));   // falls onend nie kommt (kommt vor)
      });
    }
    // Satz mittippen und sprechen; weiter geht es erst, wenn beides fertig ist
    async function say(t, text){
      sayBox.hidden = false;
      ctx.beep(1800, 25, "square", 0.02); ctx.after(45, () => ctx.beep(2400, 25, "square", 0.02));
      const spoken = speak(text);
      const typed = (async () => {
        for (let i = 1; i <= text.length && tour === t; i++){
          sayTxt.innerHTML = ctx.esc(text.slice(0, i)) + '<span class="cursor"></span>';
          await ctx.sleep(32);
        }
      })();
      await Promise.all([spoken, typed]);
      if (!speech) await ctx.sleep(text.length * 35);   // ohne Stimme: Zeit zum Lesen
      await ctx.sleep(350);
      return tour === t;
    }
    function zoom(z){
      view.z = z;
      view.ox = Math.floor(cols / 2 - cols / z / 2); view.oy = Math.floor(rows / 2 - rows / z / 2);
    }
    const put = (cells, v = 1) => cells.forEach(([x, y]) => { cur[at(cx() + x, cy() + y)] = v; });
    const cx = () => Math.floor(cols / 2), cy = () => Math.floor(rows / 2);
    const mark = (cells, col) => cells.map(([x, y]) => ({ x: cx() + x, y: cy() + y, col }));
    const RING = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    const AMBER = "#ffb454", RED = "#ff5a5a", BRIGHT = "#a6ffb8";
    async function steps(t, n, ms){ for (let i = 0; i < n && tour === t; i++){ step(); await ctx.sleep(ms); } return tour === t; }
    async function wait(t, ms){ await ctx.sleep(ms); return tour === t; }

    async function explain(){
      const t = {}; tour = t; running = false;
      ctx.log("OK", "life.sim: Sprachausgabe gestartet");
      clear(); zoom(ctx.touch ? 3 : 4); marks = [];
      if (!await say(t, "Initialisiere Erklärung. Das hier ist das Spiel des Lebens, erfunden neunzehnhundertsiebzig vom Mathematiker John Conway.")) return;
      put([[-2,-1],[1,-2],[2,1],[-1,2],[0,0]]);
      if (!await say(t, "Jedes Kästchen ist eine Zelle. Grün heißt lebendig, schwarz heißt tot.")) return;
      clear(); put([[0,0]]); marks = mark(RING, AMBER);
      if (!await say(t, "Jede Zelle hat acht Nachbarn. Das sind die Felder rundherum, auch schräg.")) return;
      marks = [];
      if (!await say(t, "Du spielst nicht gegen jemanden. Das Feld verändert sich Runde für Runde von selbst, nach nur vier Regeln.")) return;

      clear(); put([[-1,-1],[1,-1],[0,1]]); marks = mark([[0,0]], AMBER);
      if (!await say(t, "Regel eins, Geburt. Eine tote Zelle mit genau drei lebenden Nachbarn wird lebendig.")) return;
      put([[0,0]]); marks = mark([[0,0]], BRIGHT); ctx.beep(1320, 80);
      if (!await wait(t, 1200)) return;

      clear(); put([[0,0],[-1,0],[1,1]]); marks = mark([[0,0]], AMBER);
      if (!await say(t, "Regel zwei, Überleben. Eine lebende Zelle mit zwei oder drei Nachbarn bleibt am Leben.")) return;
      marks = mark([[0,0]], BRIGHT); ctx.beep(1046, 80);
      if (!await wait(t, 1000)) return;

      clear(); put([[0,0],[1,-1]]); marks = mark([[0,0]], AMBER);
      if (!await say(t, "Regel drei, Einsamkeit. Mit weniger als zwei Nachbarn stirbt sie.")) return;
      put([[0,0]], 0); glow[at(cx(), cy())] = 1; marks = mark([[0,0]], RED); ctx.beep(220, 160, "sawtooth", 0.04);
      if (!await wait(t, 1200)) return;

      clear(); put([[0,0],[-1,-1],[1,-1],[-1,1],[1,1]]); marks = mark([[0,0]], AMBER);
      if (!await say(t, "Regel vier, Überbevölkerung. Mit mehr als drei Nachbarn stirbt sie ebenfalls.")) return;
      put([[0,0]], 0); glow[at(cx(), cy())] = 1; marks = mark([[0,0]], RED); ctx.beep(220, 160, "sawtooth", 0.04);
      if (!await wait(t, 1200)) return;

      clear(); marks = []; put([[-1,0],[0,0],[1,0]]);
      if (!await say(t, "Alle Zellen ändern sich gleichzeitig. Aus diesen einfachen Regeln entstehen Muster. Der Blinker schwingt hin und her.")) return;
      if (!await steps(t, 6, 550)) return;

      clear(); zoom(ctx.touch ? 2 : 3); put([[0,-1],[1,0],[-1,1],[0,1],[1,1]]);
      const glide = steps(t, 40, 160);
      if (!await say(t, "Der Gleiter verändert seine Form und wandert dabei über das Feld.")) return;
      if (!await glide) return;

      zoom(1); clear(); stamp(GUN, 2, 2); running = true;
      const gun = (async () => { while (tour === t){ step(); await ctx.sleep(70); } })();
      if (!await say(t, "Diese Gleiterkanone erzeugt endlos neue Gleiter. Jetzt du. Male mit dem Finger oder der Maus Zellen ins Feld und schau, was daraus wird. Ende der Übertragung.")) return;
      tour = null; await gun;
      endTour();
    }
    function endTour(){
      zoom(1); view.z = 1; view.ox = view.oy = 0; marks = [];
      sayBox.hidden = true; running = true;
    }
    function stopTour(){
      tour = null;
      if (speech) speech.cancel();
      endTour();
    }
    sayBox.addEventListener("pointerdown", e => { e.stopPropagation(); stopTour(); });
    // Stimmen laden in manchen Browsern verzögert
    if (speech && speech.getVoices().length === 0 && "onvoiceschanged" in speech) speech.onvoiceschanged = () => {};

    ctx.loop(dt => {
      if (running && !painting && !tour){ acc += dt; if (acc >= speed){ acc = 0; step(); } }
      draw();
    });

    ctx.buttons(pad, [
      { label: "?", key: "?", aria: "Erklärung" }, { label: "⏯", key: " ", aria: "Pause" }, { label: "R", key: "r", aria: "Zufall" },
      { label: "G", key: "g", aria: "Glider Gun" }, { label: "C", key: "c", aria: "Leeren" },
      { label: "−", key: "-", aria: "langsamer" }, { label: "+", key: "+", aria: "schneller" },
    ]);

    size();
    if (ctx.demo){
      // Vorführung: Gleiterkanone schießt, daneben wuchert ein R-Pentomino; flottes Tempo
      clear(); stamp(GUN, 2, 2);
      stamp([".OO", "OO.", ".O."], Math.floor(cols * 0.68), Math.floor(rows * 0.45));
      speed = 40;
    } else randomize();

    return {
      stop(){ tour = null; if (speech) speech.cancel(); },
      escape(){ if (!tour) return false; stopTour(); return true; },   // ESC beendet erst die Erklärung
      key(e){
        const k = e.key.toLowerCase();
        if (k === "?" || k === "h"){ if (tour) stopTour(); else explain(); return true; }
        if (tour) return true;   // während der Erklärung keine anderen Tasten
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
