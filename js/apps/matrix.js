/* matrix — digitaler Regen. SPACE friert ein, Klick/Tipp lässt eine
   Nachricht einregnen. */

OE.register({
  id: "matrix",
  alias: ["rain"],
  title: "matrix.scr",
  desc: "Digitaler Regen als Bildschirmschoner.",
  start(ctx){
    ctx.el.innerHTML = `<div class="app-bar"><span>matrix <b>.scr</b></span><span class="right">SPACE einfrieren · klick = nachricht · ESC exit</span></div>
      <div class="app-body"><canvas class="app-canvas" style="width:100%;height:100%"></canvas></div>`;
    const body = ctx.el.querySelector(".app-body"), cv = ctx.el.querySelector("canvas"), g = cv.getContext("2d");

    const CHARS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789OEAPP:.=*+<>";
    const MSGS = ["OEAPP.DE", "HALLO FREUND", "4 8 15 16 23 42", "NICHTS IST ECHT", "KNOCK KNOCK"];
    const FS = ctx.touch ? 14 : 16;
    let w, h, cols, drops, frozen = false, acc = 0, msg = null;

    function size(){
      const dpr = window.devicePixelRatio || 1;
      w = body.clientWidth; h = body.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / FS);
      drops = Array.from({ length: cols }, () => ({ y: Math.random() * h / FS * 1.2 - h / FS * 0.4, v: 0.4 + Math.random() * 0.9 }));
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    }

    function frame(){
      g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(0, 0, w, h);
      g.font = `${FS}px "IBM Plex Mono", ui-monospace, monospace`;
      g.textBaseline = "top";
      drops.forEach((d, i) => {
        const x = i * FS, y = Math.floor(d.y) * FS;
        let ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        // Nachricht: waagerecht in der Bildmitte
        if (msg && i >= msg.col && i < msg.col + msg.text.length && Math.floor(d.y) === msg.row) ch = msg.text[i - msg.col];
        g.fillStyle = "#c8ffd4"; g.shadowColor = "#33ff66"; g.shadowBlur = 8;
        g.fillText(ch, x, y);
        g.shadowBlur = 0;
        d.y += d.v;
        if (y > h && Math.random() > 0.95){ d.y = 0; d.v = 0.4 + Math.random() * 0.9; }
      });
      if (msg && --msg.ttl <= 0) msg = null;
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
