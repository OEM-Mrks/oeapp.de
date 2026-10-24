/* atm — Hommage an die Geldautomaten-Szene aus Terminator 2: das
   PIN-Programm läuft direkt hier im Terminal. Befehle werden eingetippt,
   Zahlenkolonnen rauschen durch, die PIN rastet Stelle für Stelle ein,
   am Ende: "Easy money!". Reine Animation, keine Logik dahinter. */

OE.register({
  id: "atm",
  alias: ["portfolio", "t2", "pinread"],
  title: "atm // pinread",
  desc: "PIN-Programm am Geldautomaten (T2-Hommage, Animation).",
  start(ctx){
    const PS = "oe@oeapp:";

    ctx.el.innerHTML = `
      <div class="app-bar"><span>pinread <b>// v1.2</b></span><span>link: <b>card slot</b></span>
        <span class="right">simulation · keine echten daten</span></div>
      <div class="atm-term"><pre class="atm-screen"></pre><div class="atm-big" hidden></div></div>
      <div class="atm-hint dim"></div>`;
    const term = ctx.el.querySelector(".atm-term"), scr = ctx.el.querySelector(".atm-screen");
    const big = ctx.el.querySelector(".atm-big"), hint = ctx.el.querySelector(".atm-hint");

    /* Zeilen/Spalten aus der verfügbaren Fläche, wird bei jedem cls() neu gemessen */
    let COLS = 40, ROWS = 8;
    function measure(){
      const probe = document.createElement("span");
      probe.textContent = "0".repeat(10);
      scr.appendChild(probe);
      const r = probe.getBoundingClientRect();
      probe.remove();
      const cw = r.width / 10 || 8.4, lh = r.height || 19;
      COLS = Math.max(24, Math.floor(term.clientWidth / cw));
      ROWS = Math.max(8, Math.min(40, Math.floor(term.clientHeight / lh)));
    }

    /* ---------- Bildschirmpuffer: Cursor, Scrollbereich ---------- */
    let rows, cx, cy, top = 0, cursor = true, blink = true;
    function cls(){ measure(); rows = Array.from({ length: ROWS }, () => ""); cx = cy = 0; top = 0; paint(); }
    function paint(){
      scr.innerHTML = rows.map((r, y) => {
        const line = r.slice(0, COLS);
        let html = (!cursor || !blink || y !== cy) ? ctx.esc(line)
          : ctx.esc(line.slice(0, cx)) + `<span class="atm-cur">${ctx.esc(line[cx] || " ")}</span>` + ctx.esc(line.slice(cx + 1));
        // Shell-Prompt wie unten im Haupt-Terminal einfärben
        if (line.startsWith(PS)) html = html.replace(/^(oe@oeapp:)(.*?)(\$)/, '<span class="ps1">oe@oeapp<span class="dim">:</span>$2<span class="dim">$</span></span>');
        return html;
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

    // Eintippen wie von Hand: ungleichmäßiges Tempo
    async function type(id, s, base = 120){
      for (const ch of s){
        if (!ok(id)) return false;
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

      // Shell-Prompt, Programm starten
      const prompt = dir => { for (const ch of `${PS}${dir}$ `) putc(ch); paint(); };
      prompt("~");
      if (!await wait(id, 900)) return;
      if (!await enter(id, "cd atm")) return;
      prompt("~/atm");
      if (!await wait(id, 700)) return;
      if (!await enter(id, "./pinread --link=card", 700)) return;

      cls(); cursor = false;
      print("PIN IDENTIFICATION PROGRAM   v1.2");
      print("=".repeat(Math.min(COLS, 40)));
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
      line(2, "-".repeat(Math.min(COLS, 40)));
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
      ctx.log("OK", `atm: <span class="path">pinread</span> — <span class="ok">easy money</span> <span class="dim">(nur Animation)</span>`);
      if (!await wait(id, 3200)) return;
      big.hidden = true;
      cls(); cursor = true;
      print("Easy money.");
      print("");
      prompt("~/atm");
      hint.textContent = (ctx.touch ? "tippen" : "ENTER") + " = nochmal · ESC = exit";
      done = true;
    }

    ctx.every(530, () => { blink = !blink; paint(); });
    ctx.el.addEventListener("click", () => { if (done) run(); });   // mitten im Ablauf nicht versehentlich neu starten
    run();

    return {
      key(e){
        if (e.key === "Enter" || e.key === " "){ run(); return true; }
        if (e.key === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
