/* ssp — Schnick, Schnack, Schnuck gegen den Computer. Im Takt: die Wahl
   muss bis kurz nach "SCHNUCK!" stehen, sonst ist die Runde weg.
   Der Computer legt sich beim Start jeder Runde fest (nur aus der
   Vorgeschichte, Commit-Hash zum Nachprüfen) und lernt Muster:
   Häufigkeit, Markov-Ketten, "nach Sieg bleiben / nach Niederlage
   wechseln", Reaktion auf seine letzte Hand – plus etwas Zufall.
   "ssp --bo3" / "--bo7" ändert die Länge, "--random" = reiner Zufall,
   "--reset" löscht Statistik und Gedächtnis.
   Stufen: leicht = Zufall mit Hang zur Niederlage, mehr Zeit, die CPU braucht
   einen Sieg mehr; normal = lernende KI; schwer = kaum Zufall, knapper Takt.
   Wechsel mit L oder per Tippen auf die Stufe (vor und zwischen den Matches). */

OE.register({
  id: "ssp",
  alias: ["schnick", "rps", "schnickschnackschnuck"],
  title: "schnick.schnack.schnuck",
  desc: "Schere, Stein, Papier im Takt gegen eine lernende KI.",
  demo: true,
  start(ctx){
    const NAME = ["Schere", "Stein", "Papier"];
    const beats = (a, b) => a === (b + 1) % 3;           // Stein > Schere, Papier > Stein, Schere > Papier
    const counter = m => (m + 1) % 3;                    // die Hand, die m schlägt
    const lv = ctx.levels();
    const LV = () => ctx.demo ? "normal" : lv.value;
    // Takt je Stufe; Vorführung: etwas schneller, damit drei Runden in 8 s passen
    let BEAT, GRACE, DEADLINE;
    function tempo(){
      [BEAT, GRACE] = ctx.demo ? [430, 160] : { leicht: [680, 650], normal: [600, 320], schwer: [560, 170] }[LV()];
      DEADLINE = 2 * BEAT + GRACE;
    }
    tempo();
    const boArg = ctx.args.map(a => /^-*bo(\d+)$/i.exec(a) || /^(\d+)$/.exec(a)).find(Boolean);
    let BO = boArg ? Math.max(1, Math.min(15, +boArg[1])) : 5;
    if (BO % 2 === 0) BO++;
    if (ctx.demo) BO = 7;                                // Vorführung: kein Matchende in 8 s
    const NEED = Math.ceil(BO / 2), RANDOM = ctx.args.includes("--random");
    const needCpu = () => NEED + (LV() === "leicht" ? 1 : 0);   // leicht: die CPU braucht einen Sieg mehr
    if (ctx.args.includes("--reset")){ for (const k of ["", ".leicht", ".schwer"]) ctx.store.set("ssp.stats" + k, null); ctx.store.set("ssp.hist", null); }

    /* ---------- ASCII-Hände (zeigen nach rechts, für den Computer gespiegelt) ---------- */
    const W = 18;
    const ART = [
      [ "    _______", "---'   ____)____", "          ______)", "       __________)", "      (____)", "---.__(___)" ],     // Schere
      [ "    _______", "---'   ____)", "      (_____)", "      (_____)", "      (____)", "---.__(___)" ],                 // Stein
      [ "    _______", "---'   ____)____", "          ______)", "          _______)", "         _______)", "---.__________)" ], // Papier
    ].map(a => a.map(l => l.padEnd(W)));
    const FLIP = { "(": ")", ")": "(", "/": "\\", "\\": "/" };
    const mirror = lines => lines.map(l => [...l].reverse().map(c => FLIP[c] || c).join(""));
    const ART_C = ART.map(mirror);
    const LATE = ["", "", "      ? ? ?", "", "", ""].map(l => l.padEnd(W));

    /* ---------- Lernender Gegner ----------
       Jeder Prädiktor schätzt die nächste Hand des Spielers (gewichtete Zählung,
       neuere Züge zählen mehr). Zu jedem gibt es drei Varianten: so wie geschätzt,
       oder um 1/2 verschoben (falls der Spieler um die Ecke denkt). Jede Variante
       sammelt Punkte, als hätte der Computer nach ihr gespielt; die beste gewinnt. */
    const OUT = ["Sieg", "Niederlage", "Unentschieden"];
    const outcome = r => beats(r.p, r.c) ? 0 : beats(r.c, r.p) ? 1 : 2;   // aus Sicht des Spielers
    const SHIFT = ["dasselbe", "die Hand, die deine letzte schlägt", "die Hand, die gegen deine letzte verliert"];
    const REACT = ["meine letzte Hand", "das, was meine letzte schlägt", "das, was gegen meine letzte verliert"];
    const H = [];                                        // { p, c } fertige Runden
    const PRED = [
      { id: "freq", min: 3, f(){ return tally((r, i) => r.p, 0); }, say: (m, pct) => `du spielst zu ${pct} % ${NAME[m]}` },
      { id: "markov1", min: 1, f(){
          const a = H[H.length - 1].p;
          return tally((r, i) => H[i - 1].p === a ? r.p : -1, 1);
        }, say: (m, pct) => `nach ${NAME[H[H.length - 1].p]} spielst du zu ${pct} % ${NAME[m]}` },
      { id: "markov2", min: 2, f(){
          const a = H[H.length - 2].p, b = H[H.length - 1].p;
          return tally((r, i) => H[i - 2].p === a && H[i - 1].p === b ? r.p : -1, 2);
        }, say: (m, pct) => `nach ${NAME[H[H.length - 2].p]}→${NAME[H[H.length - 1].p]} kommt zu ${pct} % ${NAME[m]}` },
      { id: "wsls", min: 1, f(){
          const last = H[H.length - 1], o = outcome(last);
          const d = tally((r, i) => outcome(H[i - 1]) === o ? (r.p - H[i - 1].p + 3) % 3 : -1, 1);
          return d && rot(d, last.p);                    // Verschiebung -> Hand
        }, say: (m, pct) => { const l = H[H.length - 1]; return `nach ${OUT[outcome(l)]} spielst du zu ${pct} % ${SHIFT[(m - l.p + 3) % 3]}`; } },
      { id: "react", min: 1, f(){
          const last = H[H.length - 1];
          const d = tally((r, i) => (r.p - H[i - 1].c + 3) % 3, 1);
          return d && rot(d, last.c);
        }, say: (m, pct) => `du spielst zu ${pct} % ${REACT[(m - H[H.length - 1].c + 3) % 3]}` },
    ];
    // gewichtete Verteilung über H; key() liefert 0..2 oder -1 (zählt nicht)
    function tally(key, from){
      const d = [0, 0, 0]; let w = 1, n = 0;
      for (let i = H.length - 1; i >= from; i--, w *= 0.93){
        const k = key(H[i], i);
        if (k >= 0){ d[k] += w; n++; }
      }
      return n ? d : null;
    }
    const rot = (d, s) => [0, 1, 2].map(m => d[(m - s + 3) % 3]);
    const score = new Array(PRED.length * 3).fill(0);
    let cand = [];                                       // Vorhersagen der laufenden Runde

    function predict(){
      cand = [];
      PRED.forEach((P, pi) => {
        if (H.length < P.min + 1) return;
        const d = P.f(); if (!d) return;
        const sum = d[0] + d[1] + d[2], top = Math.max(...d);
        const best = [0, 1, 2].filter(m => d[m] === top);
        const m0 = best[ctx.rint(0, best.length - 1)];
        for (let v = 0; v < 3; v++) cand.push({ k: pi * 3 + v, pi, v, m: (m0 + v) % 3, base: m0, pct: Math.round(top / sum * 100) });
      });
    }
    function pick(){
      predict();
      if (LV() === "leicht" && !RANDOM){
        // leicht: meist Zufall, gern aber die Hand, die gegen deine wahrscheinlichste verliert
        const c = cand.filter(x => !x.v).sort((a, b) => b.pct - a.pct)[0];
        if (c && Math.random() < 0.45) return { m: (c.base + 2) % 3, why: `glaubt, du spielst ${NAME[c.base]} – und nimmt ${NAME[(c.base + 2) % 3]}` };
        return { m: ctx.rint(0, 2), why: "würfelt (stufe leicht)" };
      }
      let best = null;
      // bei Gleichstand: das sicherere Muster, unverschobene Variante (erklärt sich besser)
      const val = c => score[c.k] + c.pct / 1000 + (c.v ? 0 : 0.01);
      for (const c of cand) if (!best || val(c) > val(best)) best = c;
      // Zufall: am Anfang, ohne brauchbares Modell, und gelegentlich zum Verschleiern
      const hard = LV() === "schwer";
      if (RANDOM || !best || score[best.k] < (hard ? 0.3 : 0.6) || Math.random() < (hard ? 0.04 : 0.12))
        return { m: ctx.rint(0, 2), why: RANDOM ? "zufall (--random)" : !best ? "zu wenig daten – rate" : score[best.k] < 0.6 ? "kein klares muster – würfelt" : "würfelt diesmal (damit du mich nicht liest)" };
      const P = PRED[best.pi];
      return { m: counter(best.m), why: P.say(best.base, best.pct) + (best.v ? " – aber du denkst um die Ecke" : "") + ` → ${NAME[counter(best.m)]}` };
    }
    function learn(p, c){
      for (const x of cand){
        const mine = counter(x.m);
        score[x.k] = score[x.k] * 0.85 + (beats(mine, p) ? 1 : beats(p, mine) ? -1 : 0);
      }
      H.push({ p, c });
      if (H.length > 200) H.shift();
    }
    // Gedächtnis aus früheren Sitzungen nachspielen
    const saved = ctx.store.get("ssp.hist", "") || "";
    for (let i = 0; i + 1 < saved.length; i += 2){ predict(); learn(+saved[i], +saved[i + 1]); }
    const saveHist = () => ctx.store.set("ssp.hist", H.slice(-120).map(r => "" + r.p + r.c).join(""));

    /* ---------- Statistik ---------- */
    // Statistik je Stufe; normal behält den alten Schlüssel
    const statKey = () => "ssp.stats" + (LV() === "normal" ? "" : "." + LV());
    let S;
    const loadStats = () => { S = Object.assign({ m: 0, mw: 0, r: 0, rw: 0, rl: 0, rd: 0, late: 0, best: 0 }, ctx.store.get(statKey(), null) || {}); };
    loadStats();
    const saveStats = () => ctx.store.set(statKey(), S);

    /* ---------- Aufbau ---------- */
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `
      <div class="ssp">
        <div class="ssp-score"></div>
        <div class="ssp-word">&nbsp;</div>
        <div class="ssp-timer"><i></i></div>
        <div class="ssp-arena">
          <div class="ssp-side ssp-me"><pre class="ssp-hand"></pre><div class="ssp-name"></div></div>
          <div class="ssp-vs">vs</div>
          <div class="ssp-side ssp-cpu"><pre class="ssp-hand"></pre><div class="ssp-name"></div></div>
        </div>
        <div class="ssp-info"><div class="ssp-commit"></div><div class="ssp-model"></div></div>
      </div>
      <div class="app-overlay"></div>`;
    const $ = s => body.querySelector(s);
    const root = $(".ssp"), scoreEl = $(".ssp-score"), word = $(".ssp-word"), timer = $(".ssp-timer"), arena = $(".ssp-arena");
    const me = $(".ssp-me"), cpu = $(".ssp-cpu"), meHand = me.querySelector("pre"), cpuHand = cpu.querySelector("pre");
    const meName = me.querySelector(".ssp-name"), cpuName = cpu.querySelector(".ssp-name");
    const commitEl = $(".ssp-commit"), modelEl = $(".ssp-model"), ov = $(".app-overlay");

    pad.classList.add("ssp-pad");
    const KEYS = [["1", "S"], ["2", "T"], ["3", "P"]];
    const btns = NAME.map((n, m) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", n);
      b.innerHTML = `<span>${n.toUpperCase()}</span><small>${KEYS[m][0]} · ${KEYS[m][1]}</small>`;
      b.addEventListener("pointerdown", e => { e.preventDefault(); choose(m); });
      pad.appendChild(b);
      return b;
    });

    function fit(){
      // Schriftgröße der Hände: 2 × 18 Zeichen + Mitte, Höhe für 7 Zeilen
      const w = root.clientWidth, h = root.clientHeight;
      const rest = scoreEl.offsetHeight + word.offsetHeight + timer.offsetHeight + $(".ssp-info").offsetHeight + 40;
      const fs = Math.max(8, Math.min(26, w / (W * 2 + 5) / 0.61, (h - rest) / 8.4));
      arena.style.fontSize = fs.toFixed(1) + "px";
    }

    /* ---------- Ablauf ---------- */
    let state = "ready", pick_ = null, cpuMove = null, why = "", salt = "", round = 0, sc = [0, 0], streak = 0;
    let t0 = 0, runId = 0;

    const fnv = s => { let h = 0x811c9dc5; for (const ch of s){ h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };

    function pips(n, need = NEED){ return "●".repeat(n) + "○".repeat(Math.max(0, need - n)); }
    function renderScore(){
      scoreEl.innerHTML = `<span class="dim">DU</span> <b>${pips(sc[0])}</b> <span class="ssp-num">${sc[0]} : ${sc[1]}</span> <b>${pips(sc[1], needCpu())}</b> <span class="dim">CPU</span>`;
      bar.innerHTML = `<span class="ssp-lv" style="cursor:pointer">stufe <b>${LV()}</b></span><span>best of <b>${BO}</b></span><span>runde <b>${round}</b></span>
        <span>serie <b>${streak}</b> <span class="ssp-sm">(rekord ${S.best})</span></span>
        <span>matches <b>${S.mw}:${S.m - S.mw}</b></span>
        <span class="right">1/S schere · 2/T stein · 3/P papier · L stufe · ENTER = los</span>`;
    }
    function hands(pm, cm){ meHand.textContent = ART[pm].join("\n"); cpuHand.textContent = ART_C[cm].join("\n"); }
    function restart(el, cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
    function setWord(text, cls = ""){ word.textContent = text; word.className = "ssp-word " + cls; restart(word, "hit"); }
    function mark(){ btns.forEach((b, m) => b.classList.toggle("sel", m === pick_)); }
    function overlay(html){ ov.hidden = !html; if (html) ov.innerHTML = html; }

    function choose(m){
      if (state === "count"){
        if (performance.now() - t0 > DEADLINE) return;
        pick_ = m; mark();
        meName.innerHTML = `DU <span class="dim">· ${NAME[m]}</span>`;
        ctx.beep(1200 + m * 120, 25, "square", 0.02);
        return;
      }
      // zwischen den Runden: Taste startet die nächste und zählt schon als Wahl
      if (state === "ready" || state === "wait" || state === "over"){ next(); if (state === "count") choose(m); }
    }

    // Stufe wechseln: nur vor und zwischen den Matches, dann beginnt ein neues
    function setLevel(){
      if (ctx.demo || !(state === "ready" || state === "over")) return false;
      lv.next(); tempo(); loadStats();
      ctx.beep(1200, 30);
      if (state === "over") newMatch();
      state = "ready"; title();
      return true;
    }
    function lvBtn(){
      return `<button type="button" class="ssp-lvb" style="font:inherit;color:inherit;background:rgba(51,255,102,.08);border:1px solid currentColor;padding:6px 14px;margin:6px 0;cursor:pointer">stufe ‹ <b>${LV()}</b> ›</button>`;
    }

    function next(){
      if (state === "over") newMatch();
      if (state === "count" || state === "reveal") return;
      overlay(null);
      startRound();
    }

    function newMatch(){ sc = [0, 0]; round = 0; state = "wait"; renderScore(); }

    function startRound(){
      const id = ++runId;
      state = "count"; round++; pick_ = null; mark();
      // Computer legt sich jetzt fest, nur aus der Vorgeschichte
      const p = pick(); cpuMove = p.m; why = p.why;
      salt = Math.random().toString(36).slice(2, 6);
      commitEl.innerHTML = `cpu hat gewählt · commit <b>${fnv(NAME[cpuMove] + ":" + salt)}</b>`;
      modelEl.innerHTML = `<span class="dim">${ctx.touch ? "tippe" : "drück"} deine Hand vor „SCHNUCK!“</span>`;
      // Vorführung: der Spieler entscheidet sich irgendwann zwischen SCHNICK und SCHNUCK
      if (ctx.demo){ const m = ctx.rint(0, 2); ctx.after(ctx.rint(BEAT * 0.4, BEAT * 1.8), () => { if (id === runId) choose(m); }); }
      me.className = "ssp-side ssp-me"; cpu.className = "ssp-side ssp-cpu";
      meName.innerHTML = "DU"; cpuName.innerHTML = "CPU";
      hands(1, 1);
      renderScore();
      // Zeitbalken bis zum Annahmeschluss, Strich bei SCHNUCK
      const i = timer.firstElementChild;
      timer.style.setProperty("--mark", (2 * BEAT / DEADLINE * 100).toFixed(1) + "%");
      i.style.transition = "none"; i.style.width = "0%"; void i.offsetWidth;
      i.style.transition = `width ${DEADLINE}ms linear`; i.style.width = "100%";
      timer.classList.add("on");
      t0 = performance.now();
      ["SCHNICK", "SCHNACK", "SCHNUCK!"].forEach((w, k) => ctx.after(k * BEAT, () => {
        if (id !== runId) return;
        setWord(w, k === 2 ? "go" : "");
        restart(meHand, "bob"); restart(cpuHand, "bob");
        ctx.beep(k === 2 ? 990 : 660, k === 2 ? 120 : 70, "square", 0.05);
        // leicht: bei SCHNACK verrät sich die CPU kurz (gewählt hat sie da längst)
        if (k === 1 && LV() === "leicht"){
          cpuHand.textContent = ART_C[cpuMove].join("\n");
          cpuName.innerHTML = `CPU <span class="dim">· zuckt Richtung ${NAME[cpuMove]}?</span>`;
          ctx.after(380, () => { if (id === runId && state === "count"){ cpuHand.textContent = ART_C[1].join("\n"); cpuName.innerHTML = "CPU"; } });
        }
      }));
      ctx.after(DEADLINE, () => { if (id === runId) resolve(); });
    }

    function resolve(){
      state = "reveal";
      timer.classList.remove("on");
      const late = pick_ === null;
      hands(late ? 1 : pick_, cpuMove);
      restart(meHand, "pop"); restart(cpuHand, "pop");
      cpuName.innerHTML = `CPU <span class="dim">· ${NAME[cpuMove]}</span>`;
      commitEl.innerHTML = `commit ${fnv(NAME[cpuMove] + ":" + salt)} = fnv1a(„${NAME[cpuMove]}:${salt}“) <span class="ok">✓</span>`;
      modelEl.innerHTML = `model › ${ctx.esc(why)}`;
      let res;
      S.r++;
      if (late){
        res = 1; S.late++;
        me.classList.add("late"); meHand.textContent = LATE.join("\n");
        if (LV() === "leicht") me.classList.remove("lose");
        meName.innerHTML = `DU <span class="err">· —</span>`;
      } else {
        res = beats(pick_, cpuMove) ? 0 : beats(cpuMove, pick_) ? 1 : 2;
        if (!ctx.demo){ learn(pick_, cpuMove); saveHist(); }
      }
      if (late && LV() === "leicht") res = 2;          // leicht: zu spät kostet keinen Punkt
      if (res === 0){ sc[0]++; S.rw++; streak++; S.best = Math.max(S.best, streak); me.classList.add("win"); cpu.classList.add("lose"); }
      else if (res === 1){ sc[1]++; S.rl++; streak = 0; cpu.classList.add("win"); me.classList.add("lose"); }
      else { S.rd++; }
      setWord(late ? "ZU SPÄT!" : ["GEWONNEN", "VERLOREN", "UNENTSCHIEDEN"][res], late ? "late" : ["win", "lose", "draw"][res]);
      if (res === 0){ ctx.beep(880, 80); ctx.after(90, () => ctx.beep(1320, 140)); }
      else if (res === 1) ctx.beep(196, 260, "sawtooth", 0.05);
      else ctx.beep(520, 120, "triangle", 0.05);
      renderScore();
      const id = runId;
      if (sc[0] >= NEED || sc[1] >= needCpu()){
        const won = sc[0] > sc[1];
        S.m++; if (won) S.mw++;
        saveStats();
        ctx.log("OK", `ssp: ${sc[0]}:${sc[1]} — <span class="${won ? "ok" : "err"}">${won ? "gewonnen" : "verloren"}</span> <span class="dim">(best of ${BO})</span>`);
        ctx.after(1300, () => {
          if (id !== runId) return;
          state = "over"; renderScore();
          const pct = n => S.r ? Math.round(n / S.r * 100) : 0;
          overlay(`<div class="big ${won ? "" : "ssp-red"}">${won ? "GEWONNEN" : "VERLOREN"}</div><div class="ssp-ovscore">${sc[0]} : ${sc[1]}</div>
            ${won && LV() === "leicht" ? `<div>match gewonnen – bereit für <b>normal</b>?</div>` : ""}
            <div class="dim">matches ${S.mw}:${S.m - S.mw} · rekord-serie ${S.best}</div>
            <div class="dim">runden: ${pct(S.rw)} % gew. · ${pct(S.rl)} % verl. · ${pct(S.rd)} % remis</div>
            ${lvBtn()}
            <div class="dim">${ctx.touch ? "tippen" : "ENTER"} = nochmal · ${ctx.touch ? "" : "L = stufe · "}ESC = exit</div>`);
        });
        return;
      }
      saveStats();
      state = "reveal";
      // nach "zu spät" wartet das Spiel, sonst geht es im Takt weiter
      ctx.after(late ? 900 : ctx.demo ? 500 : 700, () => {
        if (id !== runId) return;
        state = "wait";
        if (late) modelEl.innerHTML = `<span class="warn">${ctx.touch ? "tippen" : "ENTER"} = weiter</span> <span class="dim">· wähle vor dem Ende des Balkens${LV() === "leicht" ? " · zählt nicht" : ""}</span>`;
        else ctx.after(ctx.demo ? 750 : 1500, () => { if (id === runId && state === "wait") next(); });
      });
    }

    body.addEventListener("pointerdown", e => {
      if (e.target.closest(".ssp-lvb")){ e.preventDefault(); setLevel(); return; }
      if (state !== "count" && state !== "reveal") next();
    });
    bar.addEventListener("click", e => { if (e.target.closest(".ssp-lv")) setLevel(); });

    hands(1, 1);
    meName.textContent = "DU"; cpuName.textContent = "CPU";
    renderScore();
    function title(){
      const known = H.length ? `das modell kennt ${H.length} deiner züge` : "das modell lernt deine muster";
      const info = { leicht: "die cpu braucht einen sieg mehr<br>und verrät sich bei „SCHNACK“", normal: known, schwer: "lernt schnell, würfelt kaum · knapper takt" }[LV()];
      overlay(`<div class="big ssp-title">SCHNICK<br>SCHNACK<br>SCHNUCK!</div>
        <div>schere, stein, papier · best of ${BO}</div>
        <div class="dim">wähle im takt – spätestens bei „SCHNUCK!“</div>
        <div class="dim">${ctx.touch ? "unten tippen: schere · stein · papier" : "1/S schere · 2/T stein · 3/P papier"}</div>
        ${lvBtn()}
        <div class="dim">${info}</div><div class="dim">matches ${S.mw}:${S.m - S.mw}</div>
        <div>${ctx.touch ? "tippen zum Start" : "ENTER = start · L = stufe"}</div>`);
      renderScore();
    }
    title();
    addEventListener("resize", fit);
    fit(); ctx.after(50, fit);
    if (ctx.demo){ overlay(null); ctx.after(150, next); }   // Vorführung: ohne Titel gleich los

    return {
      stop(){ removeEventListener("resize", fit); },
      key(e){
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const m = { "1": 0, s: 0, "2": 1, t: 1, "3": 2, p: 2 }[k];
        if (m !== undefined){ choose(m); return true; }
        if (k === "l"){ setLevel(); return true; }
        if (k === "Enter" || k === " "){ if (state !== "count" && state !== "reveal") next(); return true; }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
