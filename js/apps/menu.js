/* App-Auswahl im CLI-Stil: Pfeiltasten + Enter, Ziffern oder Klick */

OE.register({
  id: "apps",
  alias: ["menu", "bin"],
  title: "ls /usr/local/oeapp/bin",
  hidden: true,
  start(ctx){
    const apps = OE.apps.filter(a => !a.hidden);
    let sel = Math.min(ctx.store.get("menu.sel", 0), apps.length - 1);

    ctx.el.innerHTML = `
      <div class="menu">
        <div class="cmd">oe@oeapp:~$ ls -1 /usr/local/oeapp/bin <span class="cursor"></span></div>
        <div class="list"></div>
        <div class="hint">↑ ↓ wählen · ENTER starten · 1–${apps.length} direkt · ESC zurück</div>
      </div>`;
    const list = ctx.el.querySelector(".list");

    function render(){
      list.innerHTML = apps.map((a, i) => `
        <div class="item${i === sel ? " sel" : ""}" data-i="${i}">
          <span>${i === sel ? "▸" : i + 1}</span>
          <span class="name">${a.id}</span>
          <span class="desc">${a.desc || ""}</span>
        </div>`).join("");
    }
    function launch(i){ ctx.store.set("menu.sel", i); OE.run(apps[i].id); }

    list.addEventListener("click", e => {
      const it = e.target.closest(".item");
      if (it) launch(+it.dataset.i);
    });
    render();
    let num = "", numTimer = null;

    return {
      key(e){
        if (e.key === "ArrowDown" || e.key === "j"){ sel = (sel + 1) % apps.length; render(); return true; }
        if (e.key === "ArrowUp" || e.key === "k"){ sel = (sel - 1 + apps.length) % apps.length; render(); return true; }
        if (e.key === "Enter" || e.key === " "){ launch(sel); return true; }
        // Nummern auch zweistellig: "1" wartet kurz, ob noch eine Ziffer kommt
        if (/^[0-9]$/.test(e.key)){
          clearTimeout(numTimer);
          num += e.key;
          const n = +num;
          if (n * 10 > apps.length || num.length === 2){ num = ""; if (n >= 1 && n <= apps.length) launch(n - 1); }
          else { sel = Math.max(0, n - 1); render(); numTimer = ctx.after(700, () => { num = ""; if (n >= 1) launch(n - 1); }); }
          return true;
        }
        if (e.key === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
