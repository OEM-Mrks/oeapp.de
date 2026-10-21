/* swan — die Station aus "Lost": alle 108 Minuten muss jemand die Zahlen
   eingeben. "swan --fast" startet bei 4:00, damit man den Alarm erlebt. */

OE.register({
  id: "swan",
  alias: ["lost", "dharma"],
  title: "swan.station",
  desc: "108-Minuten-Countdown. Die Zahlen eingeben, sonst …",
  start(ctx){
    const SEQ = "4 8 15 16 23 42";
    const FULL = 108 * 60;
    const GLYPHS = ["𓂀","𓃀","𓆣","𓋹","𓊽","𓇳","𓅓","𓁹","𓎛","𓏏"];

    ctx.el.innerHTML = `
      <div class="app-bar"><span>DHARMA INITIATIVE <b>// station 3</b></span>
        <span>eingaben <b id="swRuns">0</b></span>
        <span class="right">tipp: <b>swan --fast</b> startet bei 4:00</span></div>
      <div class="swan-clock" id="swClock">108:00</div>
      <div class="swan-tty" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
    const clock = ctx.el.querySelector("#swClock"), runsEl = ctx.el.querySelector("#swRuns");
    const t = ctx.tty(ctx.el.querySelector(".swan-tty"), { prompt: "&gt;:", placeholder: "4 8 15 16 23 42 + ENTER" });

    let left = ctx.args.includes("--fast") ? 4 * 60 : FULL;
    let runs = ctx.store.get("swan.runs", 0), failed = false;
    runsEl.textContent = runs;

    const fmt = s => `${String(Math.floor(s / 60)).padStart(3, "0")}:${String(s % 60).padStart(2, "0")}`;
    function show(){
      clock.textContent = fmt(left);
      clock.classList.toggle("warn", left <= 240 && left > 60);
      clock.classList.toggle("crit", left <= 60);
    }

    (async () => {
      for (const l of [
        '<span class="dim">DHARMA INITIATIVE // SYSTEM 3.11 // TERMINAL</span>',
        '<span class="dim">Verbindung zur Station hergestellt.</span>',
        "",
        "Gib die Zahlenfolge ein und bestätige mit ENTER.",
        "Wiederhole das alle 108 Minuten.",
        '<span class="warn">Lass den Zähler nicht auf null laufen.</span>',
        "",
      ]){ await t.type(l, 8); }
    })();

    ctx.every(1000, () => {
      if (failed) return;
      left = Math.max(0, left - 1);
      show();
      if (left <= 60 && left > 0){ ctx.beep(left % 2 ? 880 : 660, 160, "square", 0.05); }
      else if (left <= 240 && left > 0){ ctx.beep(440, 90, "square", 0.03); }
      if (left === 240) t.print('<span class="warn">&gt; WARNUNG: noch 4 Minuten.</span>');
      if (left === 60) t.print('<span class="err">&gt; ALARM: noch 1 Minute. Eingabe erforderlich.</span>');
      if (left === 0) failure();
    });

    async function failure(){
      failed = true;
      t.lock(true);
      t.print('<span class="err">&gt; SYSTEM FAILURE</span>');
      ctx.log("ERR", `swan.station: <span class="err">SYSTEM FAILURE</span> — niemand hat die Zahlen eingegeben`);
      // Die Ziffern werden zu Hieroglyphen
      for (let i = 0; i < 30 && ctx.alive; i++){
        clock.textContent = Array.from({ length: 5 }, (_, k) => k === 3 ? ":" : ctx.rand(GLYPHS)).join("");
        ctx.beep(110 + i * 7, 60, "sawtooth", 0.05);
        await ctx.sleep(120);
      }
      for (const l of ["elektromagnetische Anomalie steigt …", "magnetfeld: 1.21 → 9.81 → ∞", "schlüssel umdrehen? <span class=\"dim\">(war nur Spaß)</span>", "", "System wird neu gestartet …"]){
        await t.type(`<span class="err">${l}</span>`, 20);
      }
      await ctx.sleep(1500);
      if (!ctx.alive) return;
      left = FULL; failed = false; show();
      t.print('<span class="ok">&gt; Neustart abgeschlossen. Zähler: 108:00</span>');
      t.lock(false);
    }

    t.onLine(v => {
      if (failed) return;
      const norm = v.replace(/[^0-9]+/g, " ").trim();
      t.print(`<span class="dim">&gt;:</span> ${ctx.esc(v)}`);
      if (!norm){ return; }
      if (norm === SEQ){
        runs++; ctx.store.set("swan.runs", runs); runsEl.textContent = runs;
        left = FULL; show();
        ctx.beep(1046, 90); setTimeout(() => ctx.beep(1318, 140), 100);
        t.print('<span class="ok">&gt; Sequenz akzeptiert. Zähler zurückgesetzt auf 108:00.</span>');
        ctx.log("OK", `swan.station: Sequenz eingegeben <span class="dim">(#${runs})</span>`);
      } else {
        ctx.beep(150, 250, "sawtooth");
        t.print('<span class="err">&gt; Falsche Eingabe.</span>');
      }
    });

    show();
  },
});
