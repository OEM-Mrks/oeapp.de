/* atm — Hommage an die Geldautomaten-Szene aus Terminator 2: ein
   Taschencomputer (Atari Portfolio) hängt am Kartenschlitz und "errät"
   die PIN. Reine Animation, keine Logik dahinter. */

OE.register({
  id: "atm",
  alias: ["portfolio", "t2"],
  title: "portfolio.exe → atm",
  desc: "Taschencomputer am Geldautomaten (T2-Hommage, reine Animation).",
  start(ctx){
    ctx.el.innerHTML = `
      <div class="app-bar"><span>OE-PORTFOLIO <b>// 80C88 · 128K</b></span><span>link: <b>card slot</b></span>
        <span class="right">simulation · keine echten daten</span></div>
      <div class="atm-wrap">
        <div class="portfolio">
          <div class="pf-lcd"><pre class="pf-screen"></pre></div>
          <div class="pf-keys">${"QWERTYUIOP".split("").map(k => `<i>${k}</i>`).join("")}</div>
          <div class="pf-label">PORTFOLIO</div>
        </div>
        <div class="atm-cable">═══╡</div>
        <pre class="atm"></pre>
      </div>
      <div class="atm-hint dim"></div>`;
    const scr = ctx.el.querySelector(".pf-screen"), atm = ctx.el.querySelector(".atm"), hint = ctx.el.querySelector(".atm-hint");

    const COLS = 34;
    let lines = [];
    function paint(){ scr.textContent = lines.slice(-9).map(l => l.padEnd(COLS).slice(0, COLS)).join("\n"); }
    function put(l){ lines.push(l); paint(); }
    function setLast(l){ lines[lines.length - 1] = l; paint(); }

    function drawAtm(display, slot = "", bills = 0){
      const d = display.padEnd(16).slice(0, 16);
      const money = Array.from({ length: bills }, () => "        ║ ▒▒ 50 ▒▒ ║").join("\n");
      atm.textContent =
`  ╔══════════════════════╗
  ║  ┌────────────────┐  ║
  ║  │${d}│  ║
  ║  └────────────────┘  ║
  ║   [1] [2] [3]  [◄]   ║
  ║   [4] [5] [6]  [■]   ║
  ║   [7] [8] [9]  [►]   ║
  ║       [0]            ║
  ║  ▕▔▔▔▔ KARTE ▔▔▔▔▏${slot.padEnd(3).slice(0, 3)}║
  ║  ▕▁▁▁▁▁▁▁▁▁▁▁▁▁▁▏   ║
  ╚══════════[▁▁▁▁]══════╝${money ? "\n" + money : ""}`;
    }

    let runId = 0;
    async function run(){
      const id = ++runId;
      const ok = () => ctx.alive && id === runId;
      lines = []; paint(); hint.textContent = "";
      drawAtm(" BITTE KARTE  ");
      await ctx.sleep(400); if (!ok()) return;

      put("PORTFOLIO DOS 2.11"); await ctx.sleep(250);
      put("C:\\> RUN ATMLINK.COM"); await ctx.sleep(500); if (!ok()) return;
      put("ATMLINK v0.9  (c) oeapp.de");
      put("");
      drawAtm(" KARTE ERKANNT ", "◄═");
      put("magstripe lesen ");
      for (let i = 0; i < 14 && ok(); i++){ setLast("magstripe lesen " + ".".repeat(i)); ctx.beep(2000, 8, "square", 0.02); await ctx.sleep(60); }
      if (!ok()) return;
      setLast("magstripe lesen ........ OK");
      put("konto  ****-****-****-" + ctx.rint(1000, 9999));
      await ctx.sleep(300);
      put("");
      put("PIN-ERMITTLUNG");
      drawAtm(" PIN EINGEBEN  ", "◄═");

      // Ziffern laufen durch und rasten nacheinander ein
      const pin = Array.from({ length: 4 }, () => ctx.rint(0, 9));
      put("");
      for (let pos = 0; pos < 4 && ok(); pos++){
        const spins = 18 + pos * 6;
        for (let s = 0; s < spins && ok(); s++){
          const shown = pin.map((d, i) => i < pos ? d : i === pos ? ctx.rint(0, 9) : "_").join(" ");
          const tries = String(ctx.rint(0, 9999)).padStart(4, "0");
          setLast(`  [ ${shown} ]   try ${tries}`);
          if (s % 3 === 0) ctx.beep(1200 + ctx.rint(0, 600), 10, "square", 0.015);
          await ctx.sleep(28);
        }
        ctx.beep(880, 60);
        drawAtm(" PIN " + "*".repeat(pos + 1).padEnd(4) + "      ", "◄═");
      }
      if (!ok()) return;
      setLast(`  [ ${pin.join(" ")} ]   ✓ gefunden`);
      await ctx.sleep(500);
      put("");
      drawAtm(" BETRAG?       ", "◄═");
      put("betrag > ");
      for (const c of "300"){ await ctx.sleep(220); if (!ok()) return; setLast(lines[lines.length - 1] + c); ctx.beep(1500, 15); }
      await ctx.sleep(300);
      put("senden ...");
      drawAtm(" BITTE WARTEN  ", "◄═");
      await ctx.sleep(900); if (!ok()) return;

      // Scheine kommen raus
      drawAtm(" AUSZAHLUNG    ", "◄═");
      for (let b = 1; b <= 6 && ok(); b++){
        drawAtm(" AUSZAHLUNG    ", "◄═", b);
        ctx.beep(300 + b * 40, 70, "triangle", 0.05);
        await ctx.sleep(260);
      }
      if (!ok()) return;
      setLast("senden ... OK");
      put("auszahlung: 300,00 EUR");
      put("");
      put("C:\\> _");
      ctx.log("OK", `portfolio: <span class="path">atm</span> link beendet <span class="dim">(nur Animation)</span>`);
      hint.textContent = (ctx.touch ? "tippen" : "ENTER") + " = nochmal · ESC = exit";
    }

    ctx.el.addEventListener("click", () => run());
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
