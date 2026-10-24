/* ttt — Tic-Tac-Toe gegen den Computer (leicht / normal / schwer = unschlagbar)
   oder zu zweit an einem Gerät ("ttt --2p"). Felder per Ziffer im
   Nummernblock-Layout (7 8 9 oben), Pfeiltasten + ENTER oder antippen.
   S oder "stufe" wechselt die Stufe, Standard ist leicht. */

OE.register({
  id: "ttt",
  alias: ["tictactoe", "xo"],
  title: "tictactoe.exe",
  desc: "Drei in einer Reihe. Gegen den Computer oder zu zweit (--2p).",
  demo: true,
  start(ctx){
    // 0 leicht, 1 normal (früher "mittel"), 2 schwer (unschlagbar), 3 zu zweit
    const LEVELS = ["leicht", "normal", "schwer", "2p"];
    const lv = ctx.levels(LEVELS);
    if (ctx.args.includes("--unschlagbar")) lv.set("schwer");
    let level = LEVELS.indexOf(lv.value);
    if (ctx.demo) level = 3;           // Vorführung: Computer gegen Computer, angezeigt wie zu zweit

    const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    // Ziffer -> Feld wie auf dem Nummernblock (7 8 9 ist die obere Reihe)
    const NUM = { 7:0, 8:1, 9:2, 4:3, 5:4, 6:5, 1:6, 2:7, 3:8 };
    const LABEL = [7, 8, 9, 4, 5, 6, 1, 2, 3];
    const ART = {
      X: ["██     ██", "  ██ ██  ", "   ███   ", "  ██ ██  ", "██     ██"].join("\n"),
      O: ["  █████  ", "██     ██", "██     ██", "██     ██", "  █████  "].join("\n"),
    };

    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<div class="ttt-wrap"><div class="ttt-board"></div><div class="ttt-msg"></div></div><div class="app-overlay ttt-ov" hidden></div>`;
    const boardEl = body.querySelector(".ttt-board"), msgEl = body.querySelector(".ttt-msg"), ov = body.querySelector(".app-overlay");
    const cells = [];
    for (let i = 0; i < 9; i++){
      const c = document.createElement("div");
      c.className = "ttt-cell";
      c.innerHTML = `<span class="ttt-num">${LABEL[i]}</span><pre class="ttt-art"></pre>`;
      c.addEventListener("click", () => { cursor = i; place(i); });
      boardEl.appendChild(c); cells.push(c);
    }
    ov.addEventListener("click", e => {
      if (e.target.closest(".ttt-lvb")){ cycleLevel(); return; }
      if (state === "over") newRound();
    });

    let board, turn, starter = ctx.store.get("ttt.first", "X") === "O" ? "O" : "X";
    let state = "play", cursor = 4, lastMove = -1, round = 0, think = 0;
    const two = () => level === 3;
    // Bilanz je Stufe; normal und schwer behalten die alten Schlüssel
    const scoreKey = () => "ttt.score." + ["einfach", "mittel", "unschlagbar", "2p"][level];
    const score = () => ctx.store.get(scoreKey(), { w: 0, l: 0, d: 0 });

    /* ---------- Spiellogik ---------- */
    function winner(b){
      for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], line: l };
      return b.every(Boolean) ? { p: null, line: [] } : null;
    }
    const empty = b => b.map((v, i) => v ? -1 : i).filter(i => i >= 0);
    const pick = a => a[ctx.rint(0, a.length - 1)];

    // Minimax: schneller Sieg ist besser, späte Niederlage weniger schlimm
    let nodes = 0;
    function minimax(b, me, who, depth){
      nodes++;
      const w = winner(b);
      if (w) return w.p === me ? 10 - depth : w.p ? depth - 10 : 0;
      let best = who === me ? -99 : 99;
      for (const i of empty(b)){
        b[i] = who;
        const s = minimax(b, me, who === "X" ? "O" : "X", depth + 1);
        b[i] = null;
        best = who === me ? Math.max(best, s) : Math.min(best, s);
      }
      return best;
    }
    function bestMoves(b, me){
      nodes = 0;
      let best = -99, moves = [];
      for (const i of empty(b)){
        b[i] = me;
        const s = minimax(b, me, me === "X" ? "O" : "X", 1);
        b[i] = null;
        if (s > best){ best = s; moves = [i]; } else if (s === best) moves.push(i);
      }
      return { moves, best };
    }
    // Feld, mit dem "who" sofort eine Reihe schließt
    function finisher(b, who){
      for (const i of empty(b)){ b[i] = who; const w = winner(b); b[i] = null; if (w && w.p === who) return i; }
      return -1;
    }

    function cpuMove(){
      const me = "O", you = "X", free = empty(board);
      if (level === 2){
        const r = bestMoves(board, me);
        return { i: pick(r.moves), info: r.best > 0 ? "sieg erzwingbar" : r.best < 0 ? "lage kritisch" : "bewertung ±0" };
      }
      const win = finisher(board, me), block = finisher(board, you);
      if (level === 0){
        // leicht: übersieht fast immer eigene Chancen und Drohungen, mag Ecken nicht
        if (win >= 0 && Math.random() < 0.2) return { i: win, info: "glückstreffer" };
        if (block >= 0 && Math.random() < 0.15) return { i: block, info: "abwehr" };
        const meh = free.filter(i => i % 2 === 1);   // Randfelder sind die schwächsten
        return { i: pick(meh.length && Math.random() < 0.7 ? meh : free), info: "zufall" };
      }
      // mittel: gewinnt und blockt, spielt sonst meist gut, aber nicht immer
      if (win >= 0) return { i: win, info: "reihe schließen" };
      if (block >= 0 && Math.random() < 0.9) return { i: block, info: "drohung abgewehrt" };
      if (Math.random() < 0.6){ const r = bestMoves(board, me); return { i: pick(r.moves), info: "heuristik" }; }
      return { i: pick(free), info: "bauchgefühl" };
    }

    /* ---------- Darstellung ---------- */
    function size(){
      const w = body.clientWidth, h = body.clientHeight - 34;
      const s = Math.max(180, Math.floor(Math.min(w - 4, h, 600) / 3) * 3);
      boardEl.style.width = boardEl.style.height = s + "px";
      boardEl.style.fontSize = Math.floor(s / 3 * 0.12) + "px";
      boardEl.querySelectorAll(".ttt-num").forEach(n => n.style.fontSize = Math.max(10, Math.round(s / 34)) + "px");
    }

    function render(){
      const w = state === "over" ? winner(board) : null;
      boardEl.classList.toggle("ttt-busy", state === "cpu");
      boardEl.classList.toggle("ttt-dead", !!w);
      cells.forEach((c, i) => {
        const v = board[i];
        c.classList.toggle("ttt-full", !!v);
        c.classList.toggle("ttt-o", v === "O");
        c.classList.toggle("ttt-cur", i === cursor && state !== "over" && !ctx.touch);
        const lose = w && w.p && !two() && w.p === "O";
        c.classList.toggle("ttt-win", !!(w && w.line.includes(i) && !lose));
        c.classList.toggle("ttt-lose", !!(w && w.line.includes(i) && lose));
        const art = c.querySelector(".ttt-art");
        if (art.dataset.v !== (v || "")){ art.dataset.v = v || ""; art.textContent = v ? ART[v] : ""; }
        c.classList.toggle("ttt-new", i === lastMove);
      });
      updateBar();
    }

    function updateBar(){
      const s = score();
      const who = two() ? (state === "over" ? `runde <b>${round}</b> vorbei` : `am zug <b>${turn}</b>`) : `du <b>X</b> · cpu <b>O</b>`;
      const sc = two() ? `X <b>${s.w}</b> · O <b>${s.l}</b> · remis <b>${s.d}</b>`
        : `siege <b>${s.w}</b> · niederlagen <b>${s.l}</b> · remis <b>${s.d}</b>`;
      bar.innerHTML = `<span>${who}</span><span>${sc}</span><span class="ttt-lv" style="cursor:pointer">stufe <b>${ctx.demo ? "cpu gegen cpu" : two() ? "2 spieler" : LEVELS[level]}</b></span>
        <span class="right">${ctx.touch ? "feld antippen" : "1–9 / ←↑↓→ + ENTER"} · S = stufe · N = neu</span>`;
    }
    const msg = html => { msgEl.innerHTML = html; };

    /* ---------- Ablauf ---------- */
    function newRound(){
      ++think;                         // laufendes Nachdenken verwerfen
      board = Array(9).fill(null);
      turn = starter; round++;
      starter = starter === "X" ? "O" : "X";   // nächste Runde fängt der andere an
      ctx.store.set("ttt.first", starter);
      state = "play"; lastMove = -1; cursor = 4;
      ov.hidden = true;
      if (two()) msg(`runde ${round} · <b>${turn}</b> beginnt`);
      else msg(turn === "X" ? `runde ${round} · <b>du</b> beginnst` : `runde ${round} · <b>cpu</b> beginnt`);
      ctx.beep(660, 40); ctx.after(60, () => ctx.beep(990, 50));
      render();
      if (ctx.demo) demoTurn();
      else if (!two() && turn === "O") cpuTurn();
    }

    function place(i){
      if (state !== "play" || board[i]) { if (state === "play") ctx.beep(140, 60, "sawtooth", 0.03); return; }
      set(i, turn);
    }

    function set(i, p){
      board[i] = p; lastMove = i;
      ctx.beep(p === "X" ? 880 : 620, 50, "square", 0.035);
      const w = winner(board);
      if (w) return finish(w);
      turn = p === "X" ? "O" : "X";
      if (two() && !ctx.demo) msg(`<b>${turn}</b> ist am zug`);
      render();
      if (ctx.demo) demoTurn();
      else if (!two() && turn === "O") cpuTurn();
    }

    // Computer "denkt": scannt Felder, dann Zug
    async function cpuTurn(){
      const id = ++think;
      state = "cpu";
      const free = empty(board);
      render();
      msg(`<span class="warn">cpu</span> analysiere ${free.length} ${free.length === 1 ? "zug" : "züge"}…`);
      const t0 = performance.now();
      const mv = cpuMove();
      const ms = (performance.now() - t0).toFixed(1), n = nodes; nodes = 0;
      const wait = level === 2 ? 650 + free.length * 70 : 450 + ctx.rint(0, 400);
      let scanAt = -1;
      const steps = Math.max(3, Math.floor(wait / 110));
      for (let k = 0; k < steps; k++){
        if (!ctx.alive || id !== think) return;
        if (scanAt >= 0) cells[scanAt].classList.remove("ttt-scan");
        scanAt = k === steps - 1 ? mv.i : pick(free);
        cells[scanAt].classList.add("ttt-scan");
        ctx.beep(1500 + ctx.rint(0, 600), 10, "square", 0.01);
        await ctx.sleep(wait / steps);
      }
      if (scanAt >= 0) cells[scanAt].classList.remove("ttt-scan");
      if (!ctx.alive || id !== think) return;
      msg(`<span class="warn">cpu</span> → feld <b>${LABEL[mv.i]}</b> · dein zug<span class="cur">_</span> <span class="dim">· ${mv.info}${n ? ` · ${n.toLocaleString("de-DE")} stellungen · ${ms} ms` : ""}</span>`);
      state = "play";
      set(mv.i, "O");
    }

    /* Vorführung: O spielt perfekt, X greift zu, wenn es eine Reihe schließen kann,
       wehrt aber nie ab – so gibt es fast immer eine Gewinnreihe. Züge im Takt von ~0,6 s */
    async function demoTurn(){
      const id = ++think, p = turn, free = empty(board);
      let i = finisher(board, p);
      if (i < 0) i = p === "O" ? pick(bestMoves(board, "O").moves) : free.length === 9 ? pick([0, 2, 4, 6, 8]) : pick(free);
      state = "cpu"; render();
      msg(`<span class="warn">cpu ${p}</span> analysiere ${free.length} ${free.length === 1 ? "zug" : "züge"}…`);
      const steps = 4 + ctx.rint(0, 1);
      let scanAt = -1;
      for (let k = 0; k < steps; k++){
        if (!ctx.alive || id !== think) return;
        if (scanAt >= 0) cells[scanAt].classList.remove("ttt-scan");
        scanAt = k === steps - 1 ? i : pick(free);
        cells[scanAt].classList.add("ttt-scan");
        await ctx.sleep(130);
      }
      if (scanAt >= 0) cells[scanAt].classList.remove("ttt-scan");
      if (!ctx.alive || id !== think) return;
      msg(`<span class="warn">cpu ${p}</span> → feld <b>${LABEL[i]}</b>`);
      state = "play"; cursor = i;
      set(i, p);
    }

    function finish(w){
      state = "over"; ++think;
      const s = score();
      let title, sub, res;
      if (!w.p){ s.d++; title = "REMIS"; sub = "keiner gewinnt"; res = "remis"; }
      else if (two()){ w.p === "X" ? s.w++ : s.l++; title = `${w.p} GEWINNT`; sub = "drei in einer reihe"; res = w.p + " gewinnt"; }
      else if (w.p === "X"){ s.w++; title = "GEWONNEN"; sub = level === 2 ? "das sollte nicht gehen …" : level === 0 ? "drei in einer reihe – stark!" : "gut gespielt"; res = "sieg"; }
      else { s.l++; title = "VERLOREN"; sub = "die maschine gewinnt"; res = "niederlage"; }
      ctx.store.set(scoreKey(), s);
      render();
      // Sound: Sieg aufsteigend, Niederlage absteigend, Remis neutral
      const lose = w.p === "O" && !two();
      const seq = !w.p ? [520, 520] : lose ? [440, 330, 220] : [660, 880, 1320];
      seq.forEach((f, k) => ctx.after(k * 120, () => ctx.beep(f, 110, lose ? "sawtooth" : "square", 0.04)));
      msg(!w.p ? "unentschieden" : lose ? `<span class="err">cpu gewinnt</span>` : two() ? `<b>${w.p}</b> gewinnt` : `<b>du</b> gewinnst`);
      ctx.log(w.p && !lose ? "OK" : "WARN", `ttt: ${res} <span class="dim">(${two() ? "2 spieler" : LEVELS[level]}) ${s.w}:${s.l}:${s.d}</span>`);
      const sc = two() ? `X ${s.w} · O ${s.l} · remis ${s.d}` : `siege ${s.w} · niederlagen ${s.l} · remis ${s.d}`;
      if (ctx.demo){ ctx.after(1500, () => { if (state === "over") newRound(); }); return; }
      ctx.after(w.p ? 1300 : 700, () => {
        if (state !== "over") return;
        ov.hidden = false;
        ov.innerHTML = `<div class="big">${title}</div><div>${sub}</div><div class="ttt-score">${sc}</div>
          <button type="button" class="ttt-lvb" style="font:inherit;color:inherit;background:rgba(51,255,102,.08);border:1px solid currentColor;padding:6px 14px;cursor:pointer">stufe ‹ <b>${two() ? "2 spieler" : LEVELS[level]}</b> ›</button>
          <div class="dim">${ctx.touch ? "tippen = nochmal" : "ENTER = nochmal · S = stufe · ESC = exit"}</div>`;
      });
    }

    function cycleLevel(){
      level = (level + 1) % 4;
      lv.set(LEVELS[level]);
      ctx.beep(1200, 30);
      newRound();
      msg(`stufe: <b>${two() ? "2 spieler" : LEVELS[level]}</b> · ${msgEl.innerHTML}`);
    }

    function moveCursor(dx, dy){
      const x = (cursor % 3 + dx + 3) % 3, y = (Math.floor(cursor / 3) + dy + 3) % 3;
      cursor = y * 3 + x; ctx.beep(1800, 8, "square", 0.012);
      render();
    }

    bar.addEventListener("click", e => { if (e.target.closest(".ttt-lv") && !ctx.demo) cycleLevel(); });
    ctx.buttons(pad, [{ label: "stufe", key: "s", aria: "Stufe wechseln" }, { label: "neu", key: "n", aria: "Neue Runde" }]);
    size();
    addEventListener("resize", size);
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    if (ro) ro.observe(body);
    newRound();

    return {
      stop(){ removeEventListener("resize", size); if (ro) ro.disconnect(); },
      key(e){
        const k = e.key;
        if (/^[1-9]$/.test(k)){ if (state === "play"){ cursor = NUM[k]; place(cursor); } return true; }
        const dirs = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] };
        if (dirs[k]){ if (state !== "over") moveCursor(...dirs[k]); return true; }
        if (k === "Enter" || k === " "){
          if (state === "over") newRound(); else place(cursor);
          return true;
        }
        if (k === "s" || k === "S"){ cycleLevel(); return true; }
        if (k === "n" || k === "N"){ newRound(); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
