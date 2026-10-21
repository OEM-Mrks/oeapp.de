/* atm — Hommage an die Geldautomaten-Szene aus Terminator 2: ein Atari
   Portfolio hängt am Kartenschlitz, man sieht nur seinen Bildschirm.
   Befehle werden eingetippt, Zahlenkolonnen rauschen durch, die PIN
   rastet Stelle für Stelle ein, am Ende: "Easy money!".
   Reine Animation, keine Logik dahinter. */

OE.register({
  id: "atm",
  alias: ["portfolio", "t2"],
  title: "portfolio.exe → atm",
  desc: "Atari Portfolio am Geldautomaten (T2-Hommage, Animation).",
  start(ctx){
    const COLS = 40, ROWS = 8;   // so groß war das LCD des Portfolio
    const KEYS = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM.\\"];

    ctx.el.innerHTML = `
      <div class="app-bar"><span>ATARI PORTFOLIO <b>// 80C88 · 128K</b></span><span>link: <b>card slot</b></span>
        <span class="right">simulation · keine echten daten</span></div>
      <div class="pf-wrap">
        <div class="pf">
          <div class="pf-top"><span class="pf-brand">ATARI</span><span class="pf-model">Portfolio</span></div>
          <div class="pf-lcd"><pre class="pf-screen"></pre><div class="pf-big" hidden></div></div>
          <div class="pf-kb">${KEYS.map(r => `<div class="pf-row">${r.split("").map(k => `<i data-k="${k}">${k}</i>`).join("")}</div>`).join("")}
            <div class="pf-row"><i class="wide" data-k=" ">&nbsp;</i><i class="ent" data-k="⏎">⏎</i></div></div>
        </div>
      </div>
      <div class="atm-hint dim"></div>`;
    const scr = ctx.el.querySelector(".pf-screen"), big = ctx.el.querySelector(".pf-big");
    const hint = ctx.el.querySelector(".atm-hint"), pf = ctx.el.querySelector(".pf");
    const keyEl = k => ctx.el.querySelector(`.pf-kb i[data-k="${k === "\n" ? "⏎" : k.toUpperCase()}"]`);

    /* Schriftgröße so wählen, dass genau 40 Zeichen in die Breite passen */
    function fit(){
      // Breite: 40 Zeichen à 0,6em + 58px Rahmen; Höhe: LCD + Tastatur ≈ 17,3em + 140px
      const w = Math.min(ctx.el.clientWidth - 8, 820), h = ctx.el.clientHeight;
      const fs = Math.min((w - 58) / (COLS * 0.6), h > 0 ? (h - 140) / 17.3 : Infinity);
      pf.style.setProperty("--fs", Math.max(7, fs) + "px");
    }
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(ctx.el);
    fit();

    /* ---------- LCD: 40×8 Zeichen, Cursor, Scrollbereich ---------- */
    let rows, cx, cy, top = 0, cursor = true, blink = true;
    function cls(){ rows = Array.from({ length: ROWS }, () => ""); cx = cy = 0; top = 0; paint(); }
    function paint(){
      scr.innerHTML = rows.map((r, y) => {
        const line = r.padEnd(COLS).slice(0, COLS);
        if (!cursor || !blink || y !== cy) return ctx.esc(line);
        return ctx.esc(line.slice(0, cx)) + `<span class="pf-cur">${ctx.esc(line[cx] || " ")}</span>` + ctx.esc(line.slice(cx + 1));
      }).join("\n");
    }
    function newline(){
      cx = 0;
      if (cy < ROWS - 1){ cy++; return; }
      rows.splice(top, 1); rows.push("");   // nur unterhalb von "top" scrollen
    }
    function putc(ch){
      if (ch === "\n"){ newline(); return; }
      if (cx >= COLS) newline();
      const r = rows[cy].padEnd(cx);
      rows[cy] = r.slice(0, cx) + ch + r.slice(cx + 1);
      cx++;
    }
    function print(s = ""){ for (const ch of s) putc(ch); putc("\n"); paint(); }
    function line(y, s){ rows[y] = s; paint(); }   // Zeile direkt überschreiben (Kopfzeilen)

    let runId = 0, done = false;
    const ok = id => ctx.alive && id === runId;
    async function wait(id, ms){ await ctx.sleep(ms); return ok(id); }

    // Eintippen wie von Hand: ungleichmäßiges Tempo, Taste leuchtet auf
    async function type(id, s, base = 120){
      for (const ch of s){
        if (!ok(id)) return false;
        const k = keyEl(ch);
        if (k){ k.classList.add("on"); ctx.after(90, () => k.classList.remove("on")); }
        putc(ch); paint();
        ctx.beep(ch === "\n" ? 900 : 1700 + ctx.rint(0, 300), 12, "square", 0.012);
        if (!await wait(id, base * (0.55 + Math.random() * 0.9))) return false;
      }
      return true;
    }
    async function enter(id, cmd, pause = 500){
      if (!await type(id, cmd)) return false;
      if (!await wait(id, 250)) return false;
      if (!await type(id, "\n")) return false;
      return wait(id, pause);
    }
    const hex = n => Array.from({ length: n }, () => ctx.rint(0, 255).toString(16).toUpperCase().padStart(2, "0")).join(" ");

    async function run(){
      const id = ++runId;
      done = false;
      big.hidden = true; hint.textContent = ""; cursor = true;
      cls();
      if (!await wait(id, 500)) return;

      // DOS-Prompt, Programm starten
      print("Atari Portfolio  DOS 2.11");
      print("");
      if (!await wait(id, 700)) return;
      putc("C"); putc(":"); putc("\\"); putc(">"); paint();
      if (!await wait(id, 900)) return;
      if (!await enter(id, "cd \\atm")) return;
      for (const ch of "C:\\ATM>") putc(ch); paint();
      if (!await wait(id, 700)) return;
      if (!await enter(id, "pinread /link=card", 700)) return;

      cls(); cursor = false;
      print("PIN IDENTIFICATION PROGRAM   v1.2");
      print("========================================");
      if (!await wait(id, 900)) return;
      print("card reader ........ ");
      if (!await wait(id, 700)) return;
      rows[cy - 1] += "linked"; paint();
      if (!await wait(id, 500)) return;
      print("account  ****-****-****-" + ctx.rint(1000, 9999));
      if (!await wait(id, 900)) return;

      // Magnetstreifen als Hex-Dump
      print("reading magnetic stripe:");
      for (let i = 0; i < 9; i++){
        print(`${(i * 12).toString(16).toUpperCase().padStart(4, "0")}: ${hex(11)}`);
        ctx.beep(2400, 6, "square", 0.01);
        if (!await wait(id, 160)) return;
      }
      if (!await wait(id, 600)) return;

      // Zahlen rauschen durch, oben Kopfzeilen fest
      cls(); top = 3;
      const pin = Array.from({ length: 4 }, () => ctx.rint(0, 9));
      const status = n => `PIN  [ ${pin.map((d, i) => i < n ? d : "_").join(" ")} ]` + (n < 4 ? "   PROCESSING" : "   IDENTIFIED");
      line(0, "PIN IDENTIFICATION PROGRAM   v1.2");
      line(1, status(0));
      line(2, "----------------------------------------");
      cy = 3;
      for (let pos = 0; pos < 4; pos++){
        const n = 26 + pos * 8;
        for (let s = 0; s < n; s++){
          // Kolonnen mit Kandidaten; in der Spalte der gesuchten Stelle schon die gefundenen Ziffern
          const cols = Array.from({ length: 5 }, () => pin.map((d, i) => i < pos ? d : ctx.rint(0, 9)).join(""));
          print(" " + cols.join("  ") + "   " + String(ctx.rint(0, 65535)).padStart(5, "0"));
          if (s % 2 === 0) ctx.beep(1000 + ctx.rint(0, 900), 8, "square", 0.01);
          if (!await wait(id, 55)) return;
        }
        line(1, status(pos + 1));
        ctx.beep(880, 90, "square", 0.04);
        if (!await wait(id, 650)) return;
      }
      if (!await wait(id, 400)) return;

      // PIN gefunden: blinkt dreimal
      cls(); top = 0;
      print("PIN IDENTIFICATION PROGRAM   v1.2");
      print("");
      for (let b = 0; b < 6; b++){
        line(3, b % 2 ? "" : `      >>>  PIN  ${pin.join(" ")}  <<<`);
        if (b % 2 === 0) ctx.beep(1320, 70, "square", 0.04);
        if (!await wait(id, 380)) return;
      }
      line(3, `      >>>  PIN  ${pin.join(" ")}  <<<`);
      cy = 5; cx = 0;
      if (!await wait(id, 800)) return;

      // Betrag eintippen
      cursor = true;
      for (const ch of "WITHDRAW AMOUNT: ") putc(ch); paint();
      if (!await wait(id, 900)) return;
      if (!await enter(id, "300", 400)) return;
      cursor = false;
      print("sending ......");
      if (!await wait(id, 1400)) return;
      rows[cy - 1] = "sending ...... APPROVED"; paint();
      ctx.beep(988, 90); ctx.after(110, () => ctx.beep(1318, 160));
      if (!await wait(id, 700)) return;
      print("DISPENSING  300.00");
      for (let k = 0; k < 6; k++){
        ctx.beep(260 + k * 30, 60, "triangle", 0.05);
        if (!await wait(id, 240)) return;
      }
      if (!await wait(id, 700)) return;

      // Schluss
      big.innerHTML = `EASY<br>MONEY!`;
      big.hidden = false;
      ctx.beep(660, 120, "square", 0.05); ctx.after(140, () => ctx.beep(990, 260, "square", 0.05));
      ctx.log("OK", `portfolio: <span class="path">pinread</span> — <span class="ok">easy money</span> <span class="dim">(nur Animation)</span>`);
      if (!await wait(id, 3200)) return;
      big.hidden = true;
      cls(); cursor = true;
      print("Easy money.");
      print("");
      for (const ch of "C:\\ATM>") putc(ch); paint();
      hint.textContent = (ctx.touch ? "tippen" : "ENTER") + " = nochmal · ESC = exit";
      done = true;
    }

    ctx.every(530, () => { blink = !blink; paint(); });
    ctx.el.addEventListener("click", () => { if (done) run(); });   // mitten im Ablauf nicht versehentlich neu starten
    run();

    return {
      stop(){ if (ro) ro.disconnect(); },
      key(e){
        if (e.key === "Enter" || e.key === " "){ run(); return true; }
        if (e.key === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
