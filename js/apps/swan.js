/* swan — die Station aus "Lost": alle 108 Minuten muss jemand die Zahlen
   eingeben. Läuft der Zähler ab, kommt das Finale: Hieroglyphen, Magnetfeld,
   Failsafe-Schlüssel, Lichtblitz, Neustart.
   "swan --fast" startet bei 4:00, "skip" springt auf die letzten 15 s,
   "swan --pomodoro" macht daraus einen Pomodoro-Timer (25 min Arbeit, 5 min Pause).
   "--debug" stellt window.swanDebug bereit (Zeit vorspulen für Tests). */

OE.register({
  id: "swan",
  alias: ["lost", "dharma"],
  title: "swan.station",
  desc: "108-Minuten-Countdown. Die Zahlen eingeben, sonst …",
  start(ctx){
    const SEQ = "4 8 15 16 23 42";
    const FULL = 108 * 60, WORK = 25 * 60, PAUSE = 5 * 60;
    const GLYPHS = ["𓂀","𓃀","𓆣","𓋹","𓊽","𓇳","𓅓","𓁹","𓎛","𓏏"];
    const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const $ = s => ctx.el.querySelector(s);

    ctx.el.innerHTML = `<div class="swan-wrap">
      <div class="app-bar"><span>DHARMA INITIATIVE <b>// station 3</b></span>
        <span>modus <b id="swMode">108 min</b></span>
        <span>eingaben <b id="swRuns">0</b></span>
        <span id="swPomoBox" hidden>pomodoros <b id="swPomos">0</b></span>
        <span class="right">tipp: <b>skip</b> = letzte 15 s · <b>pomodoro</b></span></div>
      <div class="swan-clock" id="swClock">108:00</div>
      <div class="swan-sub" id="swSub">station 3 · der schwan</div>
      <div class="swan-tty" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>`;
    const wrap = $(".swan-wrap"), clock = $("#swClock"), sub = $("#swSub");
    const t = ctx.tty($(".swan-tty"), { prompt: "&gt;:", placeholder: "4 8 15 16 23 42 + ENTER" });

    let mode = ctx.args.some(a => /^-*pomo(doro)?$/.test(a)) ? "pomo" : "swan";
    let phase = "work";                       // nur Pomodoro: "work" | "pause"
    let runs = ctx.store.get("swan.runs", 0), pomos = ctx.store.get("swan.pomos", 0);
    let left = 0, end = 0, busy = false, dead = false, keyTurn = null;
    const cleanups = [];                      // was stop() aufräumen muss

    const full = () => mode === "swan" ? FULL : phase === "work" ? WORK : PAUSE;
    const fmt = s => mode === "swan"
      ? `${String(Math.floor(s / 60)).padStart(3, "0")}:${String(s % 60).padStart(2, "0")}`
      : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    function setLeft(s){ left = s; end = Date.now() + s * 1000; show(); }

    function show(){
      if (busy) return;
      clock.textContent = fmt(left);
      const sw = mode === "swan";
      clock.classList.toggle("warn", sw ? left <= 240 && left > 60 : phase === "work" && left <= 60);
      clock.classList.toggle("crit", sw && left <= 60);
      clock.classList.toggle("swan-final", sw && left <= 10);
      clock.classList.toggle("swan-break", !sw && phase === "pause");
      wrap.classList.toggle("swan-alarm", sw && left <= 60);
      sub.textContent = sw ? "station 3 · der schwan" : phase === "work" ? "pomodoro · arbeit" : "pomodoro · pause";
      $("#swMode").textContent = sw ? "108 min" : phase === "work" ? "pomodoro · arbeit" : "pomodoro · pause";
      $("#swRuns").textContent = runs;
      $("#swPomos").textContent = pomos;
      $("#swPomoBox").hidden = sw;
    }

    function chips(){
      t.chips([
        { label: SEQ + "  ⏎", cmd: SEQ },
        { label: "⏩ letzte 15 s", cmd: "skip" },
        mode === "swan" ? { label: "🍅 Pomodoro", cmd: "pomodoro" } : { label: "◉ 108 min", cmd: "108" },
      ]);
    }
    // den Sprung-Knopf hervorheben (das Tipp-Menü wird öfter neu gebaut)
    const chipsEl = $(".tty-chips");
    const mark = () => chipsEl.querySelectorAll("button").forEach(b => { if (b.textContent.startsWith("⏩")) b.classList.add("swan-skip"); });
    const mo = new MutationObserver(mark); mo.observe(chipsEl, { childList: true });
    cleanups.push(() => mo.disconnect());

    function setMode(m){
      mode = m; phase = "work"; setLeft(full()); chips();
      t.print(m === "swan"
        ? '<span class="ok">&gt; Modus: 108 Minuten. Die Station braucht dich wieder.</span>'
        : '<span class="ok">&gt; Modus: Pomodoro. 25:00 arbeiten, Zahlenfolge setzt zurück, danach 5:00 Pause.</span>');
    }

    (async () => {
      const lines = [
        '<span class="dim">DHARMA INITIATIVE // SYSTEM 3.11 // TERMINAL</span>',
        '<span class="dim">Verbindung zur Station hergestellt.</span>',
        "",
        "Station 3, „Der Schwan“: Alle 108 Minuten muss hier jemand die Zahlenfolge eingeben.",
        'Was bei 0:00 passiert, hat noch keiner erlebt. <span class="warn">Lass den Zähler nicht auf null laufen.</span>',
        ctx.touch ? "Tippe unten auf die Zahlenfolge – oder auf ⏩, wenn du es wissen willst."
                  : 'Gib die Zahlenfolge ein und drück ENTER. Neugierig? <b>skip</b> springt auf die letzten 15 s.',
        "",
      ];
      if (mode === "pomo") lines.splice(6, 0, '<span class="ok">Pomodoro-Modus: 25 min Arbeit, dann 5 min Pause. Zahlenfolge = Zeit zurücksetzen.</span>');
      for (const l of lines){ if (dead) return; await t.type(l, 8); }
    })();

    /* ---------- Takt ---------- */
    ctx.every(250, () => {
      if (busy || dead) return;
      const nl = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (nl === left) return;
      const prev = left; left = nl; show();
      const crossed = x => prev > x && left <= x;
      if (mode === "swan"){
        if (left > 0 && left <= 10) ctx.beep(left % 2 ? 1320 : 990, 140, "square", 0.07);
        else if (left > 0 && left <= 60) ctx.beep(left % 2 ? 880 : 660, 160, "square", 0.05);
        else if (left > 0 && left <= 240) ctx.beep(440, 90, "square", 0.03);
        if (crossed(240)) t.print('<span class="warn">&gt; WARNUNG: noch 4 Minuten.</span>');
        if (crossed(60)) t.print('<span class="err">&gt; ALARM: noch 1 Minute. Eingabe erforderlich.</span>');
        if (crossed(10)) t.print('<span class="err">&gt; KRITISCH: 10 SEKUNDEN.</span>');
        if (left === 0) finale();
      } else {
        if (phase === "work" && crossed(60)) t.print('<span class="warn">&gt; Noch 1 Minute bis zur Pause.</span>');
        if (left > 0 && left <= 3) ctx.beep(660, 60, "sine", 0.03);
        if (left === 0) phaseEnd();
      }
    });

    /* ---------- Pomodoro ---------- */
    const chime = fs => fs.forEach((f, i) => ctx.after(i * 180, () => ctx.beep(f, 260, "sine", 0.06)));
    function phaseEnd(){
      if (phase === "work"){
        pomos++; ctx.store.set("swan.pomos", pomos);
        phase = "pause"; setLeft(PAUSE);
        chime([784, 988, 1175, 1568]);
        t.print(`<span class="ok">&gt; Pomodoro #${pomos} erledigt. Pause: 5:00 – steh auf, trink was.</span>`);
        ctx.log("OK", `swan.station: Pomodoro erledigt <span class="dim">(#${pomos})</span>`);
      } else {
        phase = "work"; setLeft(WORK);
        chime([1175, 988, 784]);
        t.print('<span class="ok">&gt; Pause vorbei. Neue Runde: 25:00.</span>');
      }
    }

    /* ---------- Eingabe ---------- */
    t.onLine(v => {
      if (busy) return;
      const cmd = v.trim().toLowerCase();
      t.print(`<span class="dim">&gt;:</span> ${ctx.esc(v)}`);
      if (!cmd) return;
      if (["skip", "⏩", "finale"].includes(cmd)){
        setLeft(15);
        t.print('<span class="warn">&gt; Zähler manipuliert: noch 15 Sekunden.</span>');
        return;
      }
      if (["pomodoro", "pomo", "--pomodoro"].includes(cmd)){ if (mode === "pomo") setMode("swan"); else setMode("pomo"); return; }
      if (["108", "swan", "station"].includes(cmd)){ if (mode !== "swan") setMode("swan"); return; }
      if (["help", "hilfe", "?", "/help"].includes(cmd)){
        for (const l of [`<b>${SEQ}</b>  Zähler zurücksetzen`, "<b>skip</b>  auf die letzten 15 s springen",
          "<b>pomodoro</b>  Pomodoro-Modus an/aus", "<b>108</b>  zurück zur Station", "<b>exit</b>  beenden (oder ESC)"]) t.print(l);
        return;
      }
      if (["exit", "quit", "q"].includes(cmd)){ ctx.exit(); return; }
      const norm = v.replace(/[^0-9]+/g, " ").trim();
      if (norm === SEQ){
        runs++; ctx.store.set("swan.runs", runs);
        ctx.beep(1046, 90); ctx.after(100, () => ctx.beep(1318, 140));
        if (mode === "swan"){
          setLeft(FULL);
          t.print('<span class="ok">&gt; Sequenz akzeptiert. Zähler zurückgesetzt auf 108:00.</span>');
          ctx.log("OK", `swan.station: Sequenz eingegeben <span class="dim">(#${runs})</span>`);
        } else if (phase === "work"){
          setLeft(WORK);
          t.print('<span class="ok">&gt; Sequenz akzeptiert. Arbeitszeit zurückgesetzt auf 25:00.</span>');
        } else {
          phase = "work"; setLeft(WORK);
          t.print('<span class="ok">&gt; Pause abgebrochen. Neue Runde: 25:00.</span>');
        }
      } else {
        ctx.beep(150, 250, "sawtooth");
        t.print(norm ? '<span class="err">&gt; Falsche Eingabe.</span>'
                     : '<span class="err">&gt; Unbekannter Befehl.</span> <span class="dim">hilfe zeigt die Befehle.</span>');
      }
    });

    /* ============================================================
       FINALE: bei 0:00 entlädt sich das Magnetfeld
       ============================================================ */
    const ABORT = {};
    const wait = async ms => { await ctx.sleep(ms); if (dead || !ctx.alive) throw ABORT; };
    const stage = ctx.el.closest(".stage") || ctx.el;

    // dumpfes, anschwellendes Brummen (eigener AudioContext, den der Core auf iOS mit aufweckt)
    function hum(){
      const nop = { crackle(){}, rise(){}, cut(){}, close(){} };
      if (ctx.demo) return nop;
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC(); if (ac.resume) ac.resume().catch(() => {});
        const T = () => ac.currentTime;
        const master = ac.createGain(); master.gain.value = 0.0001; master.connect(ac.destination);
        const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 120; lp.Q.value = 5; lp.connect(master);
        const trem = ac.createGain(); trem.gain.value = 0.8; trem.connect(lp);
        const oscs = [[46, "sawtooth", 0.5], [46.7, "sawtooth", 0.5], [23, "sine", 0.9], [92.3, "square", 0.12]].map(([f, type, v]) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(trem); o.start(); return o;
        });
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 4; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
        // Rauschen für Störbild und Entladung
        const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1600; bp.Q.value = 0.7;
        const ng = ac.createGain(); ng.gain.value = 0; noise.connect(bp); bp.connect(ng); ng.connect(ac.destination); noise.start();
        const ramp = (p, v, s) => { p.cancelScheduledValues(T()); p.setValueAtTime(Math.max(p.value, 0.0001), T()); p.exponentialRampToValueAtTime(v, T() + s); };
        ramp(master.gain, 0.16, 9); ramp(lp.frequency, 520, 9);
        return {
          crackle(on){ ng.gain.setTargetAtTime(on ? 0.05 : 0, T(), 0.08); },
          rise(s){   // Schlüssel umgedreht: Ton zieht hoch
            oscs.forEach(o => ramp(o.frequency, o.frequency.value * 7, s));
            ramp(master.gain, 0.3, s); ramp(lp.frequency, 4000, s); ramp(lfo.frequency, 22, s);
          },
          cut(){     // Entladung: kurzer Knall, dann Stille
            master.gain.cancelScheduledValues(T()); master.gain.setValueAtTime(master.gain.value, T());
            master.gain.linearRampToValueAtTime(0, T() + 0.05);
            bp.frequency.cancelScheduledValues(T()); bp.frequency.setValueAtTime(3000, T());
            bp.frequency.exponentialRampToValueAtTime(80, T() + 1.6);
            ng.gain.cancelScheduledValues(T()); ng.gain.setValueAtTime(0.35, T());
            ng.gain.exponentialRampToValueAtTime(0.0001, T() + 1.8);
          },
          close(){ try{ ac.close(); } catch(e){} },
        };
      } catch(e){ return nop; }
    }

    // Wackeln + magnetisch angezogene Zeichen (eigene rAF-Schleife)
    let amp = 0, raf = 0, magnet = null, spans = [], noiseCv = null, noiseT = 0;
    function frame(ts){
      if (dead) return;
      const a = RM ? amp * 0.12 : amp;
      stage.style.transform = a > 0.01
        ? `translate(${(Math.random() * 2 - 1) * a * 16}px,${(Math.random() * 2 - 1) * a * 11}px) rotate(${(Math.random() * 2 - 1) * a * 0.9}deg)` : "";
      if (magnet){
        const pull = Math.min(1, amp) ** 2 * (RM ? 0.15 : 0.55);
        for (const s of spans){
          const j = RM ? 0 : amp * 4;
          s.style.transform = `translate(${s._dx * pull * s._f + (Math.random() * 2 - 1) * j}px,${s._dy * pull * s._f + (Math.random() * 2 - 1) * j}px) rotate(${s._r * pull}deg)`;
        }
      }
      if (noiseCv && (!RM || ts - noiseT > 300)){ noiseT = ts; drawNoise(noiseCv); }
      raf = requestAnimationFrame(frame);
    }
    function magnetize(){
      if (!magnet) return;
      for (const line of [...t.out.children].slice(-30)){
        if (line.dataset.mag) continue;
        line.dataset.mag = "1";
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT), nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const n of nodes){
          const frag = document.createDocumentFragment();
          for (const ch of Array.from(n.textContent)){
            if (ch === " "){ frag.appendChild(document.createTextNode(" ")); continue; }
            const s = document.createElement("span");
            s.className = "swan-ch"; s.style.display = "inline-block"; s.textContent = ch;
            frag.appendChild(s); spans.push(s);
          }
          n.replaceWith(frag);
        }
      }
      for (const s of spans){
        if (s._f !== undefined) continue;
        const r = s.getBoundingClientRect();
        s._dx = magnet.x - (r.left + r.width / 2); s._dy = magnet.y - (r.top + r.height / 2);
        s._f = 0.35 + Math.random() * 0.65; s._r = (Math.random() * 2 - 1) * 90;
      }
    }
    function drawNoise(cv){
      const g = cv.getContext("2d"), img = g.createImageData(cv.width, cv.height), p = img.data;
      const bar = Math.random() * cv.height | 0;
      for (let i = 0, y = 0; i < p.length; i += 4){
        y = (i / 4 / cv.width) | 0;
        const v = Math.random() * 255 * (Math.abs(y - bar) < 4 ? 1.6 : 1);
        p[i] = v * 0.85; p[i + 1] = v; p[i + 2] = v * 0.9; p[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    function overlay(cls, html){
      const o = document.createElement("div"); o.className = cls; o.innerHTML = html;
      wrap.appendChild(o); return o;
    }

    // Lichtblitz über die ganze Seite: grell weiß, dann violetter Himmel
    function flash(){
      const peak = RM ? 0.45 : 1, slow = RM ? 1.4 : 1;
      const mk = bg => { const d = document.createElement("div");
        d.className = "swan-flash";
        d.style.cssText = `position:fixed;inset:0;z-index:99999;pointer-events:none;opacity:0;background:${bg}`;
        document.body.appendChild(d); cleanups.push(() => d.remove()); return d; };
      const sky = mk("radial-gradient(ellipse at 50% 35%, #fbf4ff 0%, #d9b8ff 22%, #9b5cff 48%, #4b1a9e 75%, #14062e 100%)");
      const white = mk("#fff");
      const anim = (el, kf, ms) => { try{ el.animate(kf, { duration: ms * slow, easing: "ease-out", fill: "forwards" }); } catch(e){ el.style.opacity = 0; } };
      anim(sky, [{ opacity: 0 }, { opacity: peak, offset: 0.08 }, { opacity: peak * 0.95, offset: 0.5 }, { opacity: 0 }], 4400);
      anim(white, [{ opacity: 0 }, { opacity: peak, offset: 0.05 }, { opacity: peak, offset: 0.22 }, { opacity: 0 }], 1900);
      ctx.after(4600 * slow, () => { sky.remove(); white.remove(); });
    }

    async function finale(){
      busy = true; t.lock(true);
      wrap.classList.remove("swan-alarm");
      const fails = ctx.store.get("swan.fails", 0) + 1; ctx.store.set("swan.fails", fails);
      ctx.log("ERR", `swan.station: <span class="err">SYSTEM FAILURE</span> — niemand hat die Zahlen eingegeben`);
      const snd = hum(); cleanups.push(() => snd.close());
      let glyphIv = 0;
      try{
        t.print('<span class="err">&gt; SYSTEM FAILURE</span>');
        // 1. Ziffern kippen eine nach der anderen zu Hieroglyphen
        clock.classList.remove("warn", "crit", "swan-final");
        clock.classList.add("swan-glyph");
        const cells = fmt(0).split("");
        const order = cells.map((c, i) => i).filter(i => cells[i] !== ":").sort(() => Math.random() - 0.5);
        for (const i of order){
          for (let k = 0; k < 4; k++){
            cells[i] = k < 3 ? String(Math.random() * 10 | 0) : ctx.rand(GLYPHS);
            clock.textContent = cells.join("");
            ctx.beep(180 + k * 60, 40, "square", 0.04);
            await wait(55);
          }
        }
        glyphIv = setInterval(() => {
          const i = ctx.rand(order); cells[i] = ctx.rand(GLYPHS); clock.textContent = cells.join("");
        }, 160);
        cleanups.push(() => clearInterval(glyphIv));

        // 2. Magnetfeld steigt: Wackeln und angezogene Zeichen
        const r = clock.getBoundingClientRect();
        magnet = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        raf = requestAnimationFrame(frame);
        const lines = [
          "elektromagnetische Anomalie erkannt …",
          "magnetfeld: 1.2 T … 4.8 T … 15.16 T … 23.42 T",
          "eindämmung: VERSAGT",
          "metallische Gegenstände lösen sich aus der Verankerung",
          "warnung: entladung steht unmittelbar bevor",
        ];
        for (let i = 0; i < lines.length; i++){
          amp = 0.12 + i * 0.13;
          await t.type(`<span class="err">&gt; ${lines[i]}</span>`, 14);
          if (dead) throw ABORT;
          magnetize();
          ctx.beep(70 + i * 15, 220, "sawtooth", 0.05);
          await wait(650);
        }
        amp = 0.85;
        await wait(500);

        // 3. Störbild / Systemausfall
        snd.crackle(true);
        const st = overlay("swan-static", `<canvas width="160" height="100"></canvas>
          <div class="swan-static-t">SYSTEMAUSFALL<small>signal verloren · fehler 0x108</small></div>`);
        noiseCv = st.querySelector("canvas");
        await wait(2200);

        // 4. Failsafe-Schlüssel
        snd.crackle(false); noiseCv = null; st.remove();
        amp = 0.15;   // Knopf muss treffbar bleiben
        const AUTO = 6;
        const ko = overlay("swan-key", `<div class="swan-key-h">⚠ FAILSAFE</div>
          <div class="swan-key-t">Entladung nicht mehr aufzuhalten.<br>Letzte Möglichkeit: der Failsafe-Schlüssel.</div>
          <button type="button" class="swan-keybtn"><span class="swan-keyico">🔑</span> SCHLÜSSEL UMDREHEN</button>
          <div class="swan-key-n">${ctx.touch ? "antippen" : "ENTER / LEERTASTE"} · sonst automatisch in <b>${AUTO}</b> s</div>`);
        const btn = ko.querySelector("button"), cnt = ko.querySelector(".swan-key-n b");
        if (!ctx.touch) btn.focus();
        let auto = false;
        await new Promise(res => {
          let n = AUTO;
          const iv = setInterval(() => {
            if (dead){ clearInterval(iv); res(); return; }
            cnt.textContent = --n;
            ctx.beep(520, 70, "square", 0.04);
            if (n <= 0){ clearInterval(iv); auto = true; res(); }
          }, 1000);
          cleanups.push(() => clearInterval(iv));
          keyTurn = () => { clearInterval(iv); res(); };
          btn.addEventListener("click", () => keyTurn && keyTurn());
        });
        keyTurn = null;
        if (dead) throw ABORT;
        btn.disabled = true; btn.classList.add("turned");
        ko.querySelector(".swan-key-n").textContent = auto ? "failsafe automatisch ausgelöst" : "schlüssel umgedreht";
        snd.rise(1.6);
        amp = 1;
        await wait(1600);

        // 5. Lichtblitz, dann Stille
        snd.cut();
        flash();
        await wait(RM ? 500 : 250);
        ko.remove();
        clearInterval(glyphIv);
        amp = 0; magnet = null; spans = [];
        stage.style.transform = "";
        cancelAnimationFrame(raf);
        const black = overlay("swan-black", "");
        t.clear();
        clock.classList.remove("swan-glyph");
        clock.textContent = "";
        await wait(3800);
        snd.close();

        // 6. langsamer Neustart
        black.remove();
        clock.classList.add("swan-boot");
        clock.textContent = fmt(0);
        await t.type('<span class="dim">Systemneustart …</span>', 40);
        await wait(500);
        const bar = t.print("");
        for (let i = 0; i <= 20; i++){
          bar.innerHTML = `<span class="dim">[${"#".repeat(i)}${".".repeat(20 - i)}] ${i * 5}%</span>`;
          await wait(70);
        }
        for (const l of ["magnetfeld: stabil", "eindämmung: aktiv", `ausfälle bisher: ${fails}`]){
          await t.type(`<span class="dim">${l}</span>`, 18);
        }
        // Zähler läuft wieder voll
        const target = full();
        for (let i = 1; i <= 24; i++){
          clock.textContent = fmt(Math.round(target * i / 24));
          ctx.beep(300 + i * 25, 30, "square", 0.025);
          await wait(50);
        }
        clock.classList.remove("swan-boot");
        busy = false;
        setLeft(target);
        t.print(`<span class="ok">&gt; Neustart abgeschlossen. Zähler: ${fmt(target)}</span>`);
        t.print("Gib die Zahlenfolge ein, bevor er wieder abläuft.");
        t.print("");
        t.lock(false);
      } catch(e){
        if (e !== ABORT) throw e;
      } finally {
        clearInterval(glyphIv);
      }
    }

    if (ctx.args.includes("--debug")){
      window.swanDebug = {
        set: s => setLeft(s),
        state: () => ({ mode, phase, left, busy, pomos, runs }),
      };
      cleanups.push(() => { delete window.swanDebug; });
    }

    setLeft(mode === "swan" && ctx.args.includes("--fast") ? 4 * 60 : full());
    chips();

    return {
      key(e){
        if (keyTurn && (e.key === "Enter" || e.key === " " || e.key === "k" || e.key === "s")){ keyTurn(); return true; }
      },
      stop(){
        dead = true;
        cancelAnimationFrame(raf);
        stage.style.transform = "";
        cleanups.forEach(f => { try{ f(); } catch(e){} });
      },
    };
  },
});
