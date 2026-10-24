/* matrix — digitaler Regen. SPACE friert ein, Klick/Tipp lässt eine
   Nachricht einregnen. */

OE.register({
  id: "matrix",
  alias: ["rain"],
  title: "matrix.scr",
  desc: "Digitaler Regen als Bildschirmschoner, grün und grob wie 1999.",
  demo: true,
  start(ctx){
    ctx.el.innerHTML = `<div class="app-bar"><span>matrix <b>.scr</b></span><span class="right">SPACE einfrieren · klick = nachricht · ESC exit</span></div>
      <div class="app-body"><canvas class="app-canvas matrix-cv" style="width:100%;height:100%"></canvas></div>`;
    const body = ctx.el.querySelector(".app-body"), cv = ctx.el.querySelector("canvas"), g = cv.getContext("2d");

    const CHARS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789OEAPP:.=*+<>";
    const MSGS = ["OEAPP.DE", "HALLO FREUND", "4 8 15 16 23 42", "NICHTS IST ECHT", "KNOCK KNOCK"];
    const FS = ctx.touch ? 16 : 18;
    // bewusst grob: in niedriger Auflösung zeichnen und hochskalieren, wie auf einem alten Monitor
    const PX = 2.2;
    let w, h, cols, drops, frozen = false, acc = 0, msg = null;

    function size(){
      w = body.clientWidth; h = body.clientHeight;
      cv.width = Math.ceil(w / PX); cv.height = Math.ceil(h / PX); g.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
      cols = Math.ceil(w / FS);
      drops = Array.from({ length: cols }, () => ({ y: Math.random() * h / FS * 1.2 - h / FS * 0.4, v: 0.4 + Math.random() * 0.9 }));
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    }

    function frame(){
      g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(0, 0, w, h);
      g.font = `600 ${FS}px "IBM Plex Mono", ui-monospace, monospace`;
      g.textBaseline = "top";
      // ab und zu flackert ein Zeichen weiter oben in der Spur um
      for (let k = 0; k < cols / 6; k++){
        const i = Math.floor(Math.random() * cols), d = drops[i], yy = Math.floor(d.y - 2 - Math.random() * 14);
        if (yy < 0) continue;
        g.fillStyle = "#000"; g.fillRect(i * FS, yy * FS, FS, FS);
        glyph(CHARS[Math.floor(Math.random() * CHARS.length)], i * FS, yy * FS, "rgba(26,180,70,.75)");
      }
      drops.forEach((d, i) => {
        const x = i * FS, y = Math.floor(d.y) * FS;
        let ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        // Nachricht: waagerecht in der Bildmitte
        if (msg && i >= msg.col && i < msg.col + msg.text.length && Math.floor(d.y) === msg.row) ch = msg.text[i - msg.col];
        // Kopf hell, das Zeichen dahinter sattgrün (die Spur dunkelt dann von selbst ab)
        if (d.last != null){ g.fillStyle = "#000"; g.fillRect(x, d.last, FS, FS); glyph(d.lc, x, d.last, "#22e05a"); }
        glyph(ch, x, y, "#8dffa6", true);
        d.last = y; d.lc = ch;
        d.y += d.v;
        if (y > h && Math.random() > 0.95){ d.y = 0; d.v = 0.4 + Math.random() * 0.9; d.last = null; }
      });
      if (msg && --msg.ttl <= 0) msg = null;
    }

    // Katakana gespiegelt wie im Film; Leuchten als zweiter, breiterer Durchgang (billiger als shadowBlur)
    function glyph(ch, x, y, col, head){
      const kana = ch >= "ｦ" && ch <= "ﾝ";
      g.save();
      if (kana){ g.translate(x + FS * 0.62, y); g.scale(-1, 1); x = 0; y = 0; }
      if (head){ g.globalAlpha = 0.35; g.fillStyle = "#33ff66"; g.fillText(ch, x - 1, y); g.fillText(ch, x + 1, y); g.globalAlpha = 1; }
      g.fillStyle = col; g.fillText(ch, x, y);
      g.restore();
    }

    function drop(){
      const text = ctx.rand(MSGS);
      const rows = Math.floor(h / FS);
      msg = { text, col: Math.max(0, Math.floor((cols - text.length) / 2)), row: Math.floor(rows / 2), ttl: 160 };
      // Spalten der Nachricht so stellen, dass sie gleich durch die Zeile laufen
      for (let i = 0; i < text.length; i++){ const d = drops[msg.col + i]; if (d){ d.y = msg.row - 6 - Math.random() * 3; d.v = 0.25; } }
    }

    ctx.loop(dt => {
      if (frozen) return;
      acc += dt;
      if (acc > 33){ acc = 0; frame(); }
    });
    body.addEventListener("click", drop);
    const onResize = () => size();
    addEventListener("resize", onResize);
    size();
    // Vorführung: Regen gleich in voller Fahrt, dann kommt eine Nachricht
    if (ctx.demo){ for (let i = 0; i < 45; i++) frame(); ctx.after(1800, drop); }

    return {
      stop(){ removeEventListener("resize", onResize); },
      key(e){
        if (e.key === " "){ frozen = !frozen; return true; }
        if (e.key === "Enter"){ drop(); return true; }
        if (e.key === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
