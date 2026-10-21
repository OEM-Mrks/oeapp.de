/* video — Kassensystem einer Videothek von 1994 ("REWIND VIDEO").
   DOS-Masken mit F-Tasten-Leiste: Mitglieder, Titelsuche, Verleih per
   "Barcode", Rückgabe mit Säumnis- und Rückspulgebühr, Kasse mit Bon,
   Tagesabschluss (Z-Bon) — danach springt das Systemdatum einen Tag weiter.
   Alle Daten sind erfunden und liegen nur im Browser (localStorage). */

OE.register({
  id: "video",
  alias: ["videothek", "vhs", "rewind", "blockbuster"],
  title: "REWIND VIDEO // kasse 1",
  desc: "Videothek-Kasse von 1994: VHS verleihen, Rückgabe, Bon.",
  start(ctx){
    const { esc } = ctx;

    /* ================= Daten ================= */

    const BASE = Date.UTC(1994, 9, 21);              // Tag 0 = Fr 21.10.1994
    const PRICE = { neu: { p: 4.5, d: 1, l: "NEUHEIT" }, kat: { p: 3, d: 3, l: "KATALOG" }, kids: { p: 2, d: 3, l: "KINDER" } };
    const LATE = 2, REWIND = 1;                     // DM je Tag zu spät, DM fürs Nicht-Zurückspulen
    const T = (id, t, y, g, n, k) => ({ id: String(id), t, y, g, n, k });
    const TITLES = [
      T(1001, "Zurück in die Zukunft", 1985, "SciFi", 3, "kat"),
      T(1002, "Zurück in die Zukunft II", 1989, "SciFi", 2, "kat"),
      T(1003, "Terminator 2", 1991, "Action", 3, "kat"),
      T(1004, "Jurassic Park", 1993, "Abenteuer", 4, "kat"),
      T(1005, "Pulp Fiction", 1994, "Krimi", 3, "neu"),
      T(1006, "Forrest Gump", 1994, "Drama", 3, "neu"),
      T(1007, "Der König der Löwen", 1994, "Trickfilm", 4, "kids"),
      T(1008, "Speed", 1994, "Action", 3, "neu"),
      T(1009, "Die Maske", 1994, "Komödie", 3, "neu"),
      T(1010, "True Lies", 1994, "Action", 2, "neu"),
      T(1011, "Ghostbusters", 1984, "Komödie", 2, "kat"),
      T(1012, "Stirb langsam", 1988, "Action", 2, "kat"),
      T(1013, "E.T. – Der Außerirdische", 1982, "SciFi", 2, "kids"),
      T(1014, "Das Schweigen der Lämmer", 1991, "Thriller", 2, "kat"),
      T(1015, "Kevin – Allein zu Haus", 1990, "Komödie", 3, "kids"),
      T(1016, "Pretty Woman", 1990, "Romantik", 2, "kat"),
      T(1017, "Top Gun", 1986, "Action", 2, "kat"),
      T(1018, "Dirty Dancing", 1987, "Romantik", 2, "kat"),
      T(1019, "Die Goonies", 1985, "Abenteuer", 2, "kids"),
      T(1020, "Gremlins", 1984, "Horror", 2, "kat"),
      T(1021, "Aliens – Die Rückkehr", 1986, "SciFi", 2, "kat"),
      T(1022, "RoboCop", 1987, "SciFi", 1, "kat"),
      T(1023, "Total Recall", 1990, "SciFi", 2, "kat"),
      T(1024, "Blade Runner", 1982, "SciFi", 1, "kat"),
      T(1025, "Ferris macht blau", 1986, "Komödie", 2, "kat"),
      T(1026, "Die nackte Kanone", 1988, "Komödie", 2, "kat"),
      T(1027, "Und täglich grüßt das Murmeltier", 1993, "Komödie", 2, "kat"),
      T(1028, "Mrs. Doubtfire", 1993, "Komödie", 3, "kat"),
      T(1029, "Schindlers Liste", 1993, "Drama", 2, "kat"),
      T(1030, "Der mit dem Wolf tanzt", 1990, "Western", 1, "kat"),
      T(1031, "Ghost – Nachricht von Sam", 1990, "Romantik", 2, "kat"),
      T(1032, "Aladdin", 1992, "Trickfilm", 3, "kids"),
      T(1033, "Die Schöne und das Biest", 1991, "Trickfilm", 2, "kids"),
      T(1034, "Arielle, die Meerjungfrau", 1989, "Trickfilm", 2, "kids"),
      T(1035, "Hot Shots!", 1991, "Komödie", 2, "kat"),
      T(1036, "Wayne's World", 1992, "Komödie", 2, "kat"),
      T(1037, "Predator", 1987, "Action", 1, "kat"),
      T(1038, "Highlander", 1986, "Fantasy", 1, "kat"),
      T(1039, "Der Club der toten Dichter", 1989, "Drama", 1, "kat"),
      T(1040, "Indiana Jones und der letzte Kreuzzug", 1989, "Abenteuer", 2, "kat"),
    ];
    const byId = Object.fromEntries(TITLES.map(t => [t.id, t]));
    const COPIES = TITLES.flatMap(t => Array.from({ length: t.n }, (_, i) => t.id + "ABCD"[i]));
    const titleOf = copy => byId[copy.slice(0, 4)];

    function seed(){
      return {
        v: 1, day: 0, bon: 4711, nextCust: 10006,
        customers: [
          { nr: "10001", name: "Müller, Petra",  ort: "Musterstadt", since: 1991, saldo: 0 },
          { nr: "10002", name: "Schmidt, Uwe",   ort: "Musterstadt", since: 1989, saldo: 4 },
          { nr: "10003", name: "Becker, Sandra", ort: "Neudorf",     since: 1993, saldo: 0 },
          { nr: "10004", name: "Kowalski, Jan",  ort: "Musterstadt", since: 1994, saldo: 0 },
          { nr: "10005", name: "Yilmaz, Deniz",  ort: "Neudorf",     since: 1992, saldo: 0 },
        ],
        rentals: [
          { copy: "1012A", cust: "10002", out: -5, due: -2, price: 3 },
          { copy: "1006A", cust: "10001", out: 0,  due: 1,  price: 4.5 },
          { copy: "1003A", cust: "10004", out: -3, due: 0,  price: 3 },
          { copy: "1007A", cust: "10005", out: -1, due: 2,  price: 2 },
        ],
        journal: [],
      };
    }
    let S = ctx.store.get("video.v1", null);
    if (!S || S.v !== 1) S = seed();
    const save = () => ctx.store.set("video.v1", S);

    /* ================= Hilfsfunktionen ================= */

    const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const dateOf = day => new Date(BASE + day * 864e5);
    const fmtDate = (day, short) => {
      const d = dateOf(day), dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return short ? `${dd}.${mm}.${String(d.getUTCFullYear()).slice(2)}` : `${WD[d.getUTCDay()]} ${dd}.${mm}.${d.getUTCFullYear()}`;
    };
    const dm = x => x.toFixed(2).replace(".", ",");
    const now = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    const cust = nr => S.customers.find(c => c.nr === nr);
    const rentalOf = copy => S.rentals.find(r => r.copy === copy);
    const freeCopies = t => COPIES.filter(c => c.startsWith(t.id) && !rentalOf(c) && !inCart(c));
    const late = r => Math.max(0, S.day - r.due);
    const fit = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n);
    const fitL = (s, n) => String(s).padStart(n);
    const short = name => { const [a, b] = name.split(", "); return b ? `${a}, ${b[0]}.` : name; };
    const barcode = s => [...s].map(c => "▌▐▍▎▋▊"[c.charCodeAt(0) % 6]).join("");

    /* ================= Grundgerüst ================= */

    ctx.el.innerHTML = `
      <div class="dos">
        <div class="dos-head"><span>REWIND VIDEO · Filiale 042</span><span id="vClerk">KASSE 1</span><span id="vClock"></span></div>
        <div class="dos-main"></div>
        <div class="dos-msg">&nbsp;</div>
        <div class="dos-keys"></div>
      </div>`;
    const main = ctx.el.querySelector(".dos-main"), msgEl = ctx.el.querySelector(".dos-msg"), keysEl = ctx.el.querySelector(".dos-keys");
    const clerkEl = ctx.el.querySelector("#vClerk"), clockEl = ctx.el.querySelector("#vClock");
    const tick = () => { clockEl.textContent = `${fmtDate(S.day)}  ${now()}`; };
    tick(); ctx.every(5000, tick);

    let ui = { screen: "login", clerk: null, member: null, cart: [], acts: {}, back: null, menuSel: 0 };

    function msg(text, kind = ""){ msgEl.className = "dos-msg " + kind; msgEl.innerHTML = text || "&nbsp;"; }
    function err(text){ msg(text, "err"); ctx.beep(140, 220, "square", 0.05); }
    function scanBeep(){ ctx.beep(2600, 70, "square", 0.04); }

    const FKEYS = [["F1", "Hilfe", "help"], ["F2", "Mitglied", "member"], ["F3", "Titel", "titles"], ["F4", "Verleih", "rent"],
                   ["F5", "Rückgabe", "ret"], ["F8", "Kasse", "till"], ["F10", "Abmelden", "logout"]];
    function renderKeys(){
      const on = ui.clerk;
      keysEl.innerHTML = FKEYS.map(([k, l, s]) => `<button type="button" class="dos-key${on ? "" : " off"}" data-go="${s}"><b>${k}</b>${l}</button>`).join("")
        + `<button type="button" class="dos-key" data-go="esc"><b>ESC</b>Zurück</button>`;
    }
    keysEl.addEventListener("click", e => {
      const b = e.target.closest("[data-go]"); if (!b) return;
      if (b.dataset.go === "esc"){ if (!escape()) ctx.exit(); return; }
      if (ui.clerk) go(b.dataset.go);
    });

    // Bildschirm aufbauen: html, Aktionen (Taste → Funktion), Eingabefelder (id → Enter-Funktion)
    function screen(name, html, { acts = {}, enter = {}, back = "menu", focus = null } = {}){
      ui.screen = name; ui.acts = acts; ui.back = back;
      main.innerHTML = html;
      main.querySelectorAll("input.dos-in").forEach(inp => {
        inp.setAttribute("autocomplete", "off"); inp.setAttribute("spellcheck", "false");
        inp.addEventListener("keydown", e => {
          if (e.key === "Enter"){
            e.preventDefault(); e.stopPropagation();
            const fn = enter[inp.id];
            if (fn) fn(inp.value.trim(), inp);
            else { const all = [...main.querySelectorAll("input.dos-in")]; const nx = all[all.indexOf(inp) + 1]; if (nx) nx.focus(); }
          }
        });
      });
      main.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => { const f = ui.acts[b.dataset.act]; if (f) f(); }));
      const f = focus ? main.querySelector("#" + focus) : main.querySelector("input.dos-in");
      if (f && !ctx.touch) f.focus();
      renderKeys();
    }
    const cbtn = (act, label) => `<button type="button" class="dos-btn" data-act="${act}">${label}</button>`;   // nur klickbar
    const btn = (key, label) => `<button type="button" class="dos-btn" data-act="${key}"><b>${key.toUpperCase()}</b> ${label}</button>`;
    const box = (title, inner, cls = "") => `<div class="dos-box ${cls}"><div class="dos-box-t">${title}</div>${inner}</div>`;
    const field = (label, id, attrs = "") => `<label class="dos-f"><span>${label}</span><input id="${id}" class="dos-in" ${attrs}></label>`;

    function go(name){
      const map = { card: () => showCard(ui.member), help: showHelp, member: showMember, titles: showTitles, rent: showRent, ret: showReturn, till: showTill, logout: logout, menu: showMenu };
      if (map[name]) map[name]();
    }
    function escape(){
      if (ui.screen === "login") return false;
      if (ui.screen === "menu") return false;
      go(ui.back || "menu");
      return true;
    }

    /* ================= Anmeldung ================= */

    function showLogin(){
      ui.clerk = null; clerkEl.textContent = "KASSE 1 · gesperrt";
      screen("login", `
        <div class="dos-center">
          <pre class="dos-logo">
 ╔═════════════════════════════════╗
 ║  ┌───────┐           ┌───────┐  ║
 ║  │ ((·)) │═══════════│ ((·)) │  ║
 ║  └───────┘           └───────┘  ║
 ║   ▒▒▒▒▒▒  R E W I N D  ▒▒▒▒▒▒   ║
 ╚═════════════════════════════════╝</pre>
          <div class="dos-title">REWIND VIDEO</div>
          <div class="dos-sub">Kassensystem VKS 3.2 · (c) 1994 Rewind Video GmbH · Lizenz Filiale 042</div>
          ${box("ANMELDUNG", `${field("Mitarbeiter-Nr.", "vMa", 'maxlength="4" inputmode="numeric" value=""')}
            ${field("Kennwort", "vPw", 'type="password" maxlength="8"')}
            <div class="dos-actions">${cbtn("login", "Anmelden")}</div>
            <div class="dos-hint">Demo: beliebige Nummer, Kennwort egal${ctx.touch ? " · einfach „Anmelden“ tippen" : " · ENTER bestätigt"}</div>`, "narrow")}
        </div>`, {
        acts: { login: () => login() },
        enter: { vPw: () => login(), vMa: (v, i) => { if (!v) return err("Bitte Mitarbeiter-Nr. eingeben."); main.querySelector("#vPw").focus(); } },
      });
      msg("Bitte anmelden.");
    }
    function login(){
      const ma = (main.querySelector("#vMa").value.trim() || "007").padStart(3, "0");
      ui.clerk = ma; clerkEl.textContent = `KASSE 1 · MA ${ma}`;
      ctx.beep(880, 60); setTimeout(() => ctx.beep(1320, 90), 70);
      ctx.log("OK", `videothek: Mitarbeiter <span class="path">${esc(ma)}</span> an Kasse 1 angemeldet`);
      showMenu();
      msg(`Willkommen, Mitarbeiter ${esc(ma)}. Kasse 1 geöffnet. Systemdatum ${fmtDate(S.day)}.`, "ok");
    }
    function logout(){
      ctx.log("DBG", "videothek: Kasse 1 abgemeldet");
      ui.member = null; ui.cart = [];
      showLogin();
    }

    /* ================= Hauptmenü ================= */

    const MENU = [["1", "Verleih (Ausleihe)", "F4", "rent"], ["2", "Rückgabe", "F5", "ret"], ["3", "Mitglied suchen / anlegen", "F2", "member"],
                  ["4", "Titel & Bestand", "F3", "titles"], ["5", "Kasse & Tagesabschluss", "F8", "till"], ["6", "Hilfe", "F1", "help"], ["0", "Abmelden", "F10", "logout"]];
    function stats(){
      const today = S.journal;
      return {
        verleih: today.filter(j => j.type === "verleih").length,
        rueck: today.filter(j => j.type === "rueck").length,
        umsatz: today.filter(j => j.type === "zahlung").reduce((a, j) => a + j.amount, 0),
        aus: S.rentals.length,
        over: S.rentals.filter(r => late(r) > 0).length,
      };
    }
    function showMenu(){
      const st = stats();
      const rows = MENU.map(([n, l, f], i) => `<div class="dos-item${i === ui.menuSel ? " sel" : ""}" data-i="${i}"><b>${n}</b> ${fit(l, 28)}<span class="dim">${f}</span></div>`).join("");
      screen("menu", `<div class="dos-cols">
        ${box("HAUPTMENÜ", `<div class="dos-menu">${rows}</div><div class="dos-hint">↑ ↓ + ENTER, Ziffer oder F-Taste</div>`)}
        ${box(`HEUTE · ${fmtDate(S.day, true)}`, `<pre class="dos-pre">Verleihungen   ${fitL(st.verleih, 6)}
Rückgaben      ${fitL(st.rueck, 6)}
Umsatz bar  ${fitL(dm(st.umsatz), 9)} DM
───────────────────────
Bänder außer Haus ${fitL(st.aus, 4)}
davon überfällig  <span class="${st.over ? "warn" : ""}">${fitL(st.over, 4)}</span>
Mitglieder        ${fitL(S.customers.length, 4)}</pre>`, "dos-side")}
      </div>`, { back: null });
      main.querySelectorAll(".dos-item").forEach(el => el.addEventListener("click", () => { ui.menuSel = +el.dataset.i; go(MENU[ui.menuSel][3]); }));
    }

    /* ================= Mitglieder ================= */

    function showMember(query = ""){
      screen("member", box("MITGLIED SUCHEN", `${field("Nr. oder Name", "vQ", `maxlength="30" value="${esc(query)}"`)}
        <div id="vRes"></div>
        <div class="dos-actions">${btn("n", "Neues Mitglied anlegen")}</div>`),
        { enter: { vQ: v => findMember(v) }, acts: { n: newMember } });
      if (query) findMember(query);
      else listMembers(S.customers);
    }
    function listMembers(list){
      const res = main.querySelector("#vRes");
      res.innerHTML = `<pre class="dos-pre dos-table"><span class="dos-th">NR.    NAME                  ORT          BÄNDER  SALDO</span>\n${
        list.map(c => `<span class="dos-row" data-nr="${c.nr}">${c.nr}  ${fit(c.name, 21)} ${fit(c.ort, 12)} ${fitL(S.rentals.filter(r => r.cust === c.nr).length, 6)} ${fitL(dm(c.saldo), 6)}</span>`).join("\n")}</pre>`;
      res.querySelectorAll(".dos-row").forEach(r => r.addEventListener("click", () => showCard(r.dataset.nr)));
    }
    function findMember(q){
      if (!q){ listMembers(S.customers); return; }
      const ql = q.toLowerCase();
      const hits = S.customers.filter(c => c.nr === q || c.name.toLowerCase().includes(ql));
      if (hits.length === 1) return showCard(hits[0].nr);
      if (!hits.length){ err(`Kein Mitglied „${esc(q)}“. N = neu anlegen.`); listMembers([]); return; }
      msg(`${hits.length} Treffer. Nummer eingeben oder anklicken.`);
      listMembers(hits);
    }
    function showCard(nr){
      const c = cust(nr); if (!c) return err("Mitglied nicht gefunden.");
      ui.member = nr;
      const mine = S.rentals.filter(r => r.cust === nr);
      const rows = mine.map(r => {
        const t = titleOf(r.copy), l = late(r);
        return `${r.copy}  ${fit(t.t, 26)} bis ${fmtDate(r.due, true)} ${l ? `<span class="err">${l} TG ZU SPÄT</span>` : ""}`;
      }).join("\n") || '<span class="dim">keine Bänder ausgeliehen</span>';
      screen("card", `<div class="dos-cols">
        ${box("MITGLIEDSKARTE", `<pre class="dos-card">
┌──────────────────────────────┐
│ REWIND VIDEO   MITGLIED      │
│                              │
│ ${fit(c.name, 28)} │
│ ${fit(c.ort, 16)} seit ${c.since}  │
│                              │
│ ${barcode(c.nr + c.name).padEnd(18)}  ${c.nr}  │
└──────────────────────────────┘</pre>`, "dos-side")}
        ${box("KONTO", `<pre class="dos-pre">Saldo offen:  <span class="${c.saldo ? "err" : "ok"}">${fitL(dm(c.saldo), 7)} DM</span>
Bänder außer Haus: ${mine.length}

${rows}</pre>
        <div class="dos-actions">${btn("v", "Verleih")}${c.saldo ? btn("z", "Saldo kassieren") : ""}${btn("s", "andere Suche")}</div>`)}
      </div>`, {
        back: "member",
        acts: { v: () => showRent(nr), z: () => payBalance(nr), s: () => showMember() },
      });
      msg(c.saldo ? `Achtung: offener Saldo ${dm(c.saldo)} DM.` : `Mitglied ${nr} geladen.`, c.saldo ? "warn" : "");
    }
    function newMember(){
      screen("newmember", box("NEUES MITGLIED", `
        ${field("Nachname", "vNn", 'maxlength="18"')}${field("Vorname", "vVn", 'maxlength="14"')}
        ${field("Ort", "vOrt", 'maxlength="16" value="Musterstadt"')}
        <div class="dos-actions">${cbtn("rnd", "Zufallsdaten")}${cbtn("ok", "Anlegen")}</div>
        <div class="dos-hint">Personalausweis vorlegen lassen! · ENTER im letzten Feld legt an</div>`, "narrow"),
        { back: "member", enter: { vOrt: () => createMember() }, acts: { ok: () => createMember(), rnd: randomPerson } });
    }
    const NN = ["Wagner", "Hoffmann", "Schulz", "Koch", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Braun", "Krüger", "Hartmann"];
    const VN = ["Andrea", "Thomas", "Sabine", "Michael", "Claudia", "Stefan", "Nicole", "Frank", "Tanja", "Markus", "Silke", "Jörg"];
    function randomPerson(){
      main.querySelector("#vNn").value = ctx.rand(NN);
      main.querySelector("#vVn").value = ctx.rand(VN);
      main.querySelector("#vOrt").value = ctx.rand(["Musterstadt", "Neudorf", "Altheim"]);
    }
    async function createMember(){
      const nn = main.querySelector("#vNn").value.trim(), vn = main.querySelector("#vVn").value.trim(), ort = main.querySelector("#vOrt").value.trim() || "Musterstadt";
      if (!nn || !vn) return err("Nachname und Vorname bitte.");
      const c = { nr: String(S.nextCust++), name: `${nn}, ${vn}`, ort, since: dateOf(S.day).getUTCFullYear(), saldo: 0 };
      S.customers.push(c); save();
      msg("Mitgliedskarte wird gedruckt …");
      for (let i = 0; i < 6; i++){ ctx.beep(300 + i * 40, 40, "square", 0.03); await ctx.sleep(90); }
      ctx.log("OK", `videothek: neues Mitglied <span class="path">${c.nr}</span>`);
      showCard(c.nr);
      msg(`Mitglied ${c.nr} angelegt. Karte aushändigen.`, "ok");
    }
    function payBalance(nr){
      const c = cust(nr);
      ui.member = nr;
      ui.cart = [{ kind: "saldo", text: "Altschuld / Säumnis", price: c.saldo }];
      showPay("card");
    }

    /* ================= Titel & Bestand ================= */

    function showTitles(q = ""){
      const FILTER = ["alle", "neu", "Action", "Komödie", "SciFi", "Trickfilm", "Drama"];
      screen("titles", box("TITEL & BESTAND", `${field("Titel, Genre oder Nr.", "vT", `maxlength="30" value="${esc(q)}"`)}
        <div class="dos-actions">${FILTER.map(f => cbtn("f" + f, f === "neu" ? "Neuheiten" : f === "alle" ? "Alle" : f)).join("")}</div>
        <div id="vTres"></div>`),
        { enter: { vT: v => listTitles(v) }, acts: Object.fromEntries(FILTER.map(f => ["f" + f, () => { main.querySelector("#vT").value = f === "alle" ? "" : f; listTitles(f === "alle" ? "" : f); }])) });
      listTitles(q);
    }
    function listTitles(q){
      const ql = q.toLowerCase();
      if (byId[q]) return showCopies(byId[q]);
      const list = TITLES.filter(t => !q || t.t.toLowerCase().includes(ql) || t.g.toLowerCase().includes(ql) || String(t.y) === q || (ql === "neu" && t.k === "neu"));
      const res = main.querySelector("#vTres");
      res.innerHTML = `<pre class="dos-pre dos-table"><span class="dos-th">NR.   TITEL                           JAHR GENRE      PREIS/TG  DA</span>\n${
        list.map(t => {
          const free = COPIES.filter(c => c.startsWith(t.id) && !rentalOf(c)).length;
          return `<span class="dos-row" data-id="${t.id}">${t.id}  ${fit(t.t, 31)} ${t.y} ${fit(t.g, 10)} ${fitL(dm(PRICE[t.k].p), 5)}/${PRICE[t.k].d}  <span class="${free ? "ok" : "err"}">${free}/${t.n}</span></span>`;
        }).join("\n")}</pre><div class="dos-hint">${list.length} Titel · „neu“ zeigt die Neuheiten · Nummer eingeben = Exemplare</div>`;
      res.querySelectorAll(".dos-row").forEach(r => r.addEventListener("click", () => showCopies(byId[r.dataset.id])));
    }
    function showCopies(t){
      const rows = COPIES.filter(c => c.startsWith(t.id)).map(c => {
        const r = rentalOf(c);
        if (!r) return `${c}  <span class="ok">IM REGAL</span>`;
        const l = late(r);
        return `${c}  AUSGELIEHEN an ${r.cust} ${fit(short(cust(r.cust)?.name || "?"), 14)} bis ${fmtDate(r.due, true)} ${l ? `<span class="err">+${l} TG</span>` : ""}`;
      }).join("\n");
      screen("copies", box(`${t.id} · ${esc(t.t.toUpperCase())}`, `<pre class="dos-pre">${t.y} · ${t.g} · ${PRICE[t.k].l} ${dm(PRICE[t.k].p)} DM für ${PRICE[t.k].d} ${PRICE[t.k].d === 1 ? "Tag" : "Tage"}

${rows}</pre><div class="dos-actions">${ui.member ? btn("v", `für Mitglied ${ui.member} ausleihen`) : ""}${btn("s", "zurück zur Liste")}</div>`),
        { back: "titles", acts: { s: () => showTitles(), v: () => { showRent(ui.member); addToCart(t.id); } } });
    }

    /* ================= Verleih ================= */

    function inCart(copy){ return ui.cart.some(l => l.copy === copy); }

    function showRent(nr = ui.member){
      // anderes Mitglied → neuer Warenkorb; Altschuld wird bei jedem Öffnen frisch übernommen
      if (nr !== ui.member) ui.cart = [];
      if (ui.screen !== "rent" && ui.screen !== "pay") ui.cart = ui.cart.filter(l => l.kind !== "saldo");
      const c = nr && cust(nr);
      if (!c){
        screen("rent", box("VERLEIH · MITGLIED", `${field("Mitglieds-Nr.", "vRm", 'maxlength="5" inputmode="numeric"')}
          <pre class="dos-pre dos-table">${S.customers.map(m => `<span class="dos-row" data-nr="${m.nr}">${m.nr}  ${fit(m.name, 22)} ${fit(m.ort, 12)}</span>`).join("\n")}</pre>
          <div class="dos-hint">Nummer eingeben oder Mitglied antippen · neu anlegen: F2 → N</div>`, "narrow"),
          { enter: { vRm: v => { if (cust(v)) showRent(v); else err(`Mitglied ${esc(v)} unbekannt.`); } } });
        main.querySelectorAll(".dos-row").forEach(r => r.addEventListener("click", () => showRent(r.dataset.nr)));
        return;
      }
      ui.member = nr;
      if (c.saldo && !ui.cart.some(l => l.kind === "saldo")) ui.cart.unshift({ kind: "saldo", text: "Altschuld / Säumnis", price: c.saldo });
      const total = ui.cart.reduce((a, l) => a + l.price, 0);
      const lines = ui.cart.map(l => l.kind === "saldo"
        ? `       ${fit(l.text, 30)}          ${fitL(dm(l.price), 7)}`
        : `${l.copy}  ${fit(l.title, 30)} bis ${fmtDate(l.due, true)} ${fitL(dm(l.price), 7)}`).join("\n") || '<span class="dim">— noch keine Kassette gescannt —</span>';
      screen("rent", `<div class="dos-cols">
        ${box(`VERLEIH · ${c.nr} ${esc(c.name.toUpperCase())}`, `${field("Kassette scannen", "vScan", 'maxlength="30" placeholder="Nr. wie 1003 oder 1003B, oder Titel"')}
          <div class="dos-actions">${btn("r", "aus dem Regal")}${btn("p", "Scanner (zufällig)")}${btn("x", "letzte stornieren")}${btn("k", "kassieren")}</div>
          <pre class="dos-pre dos-table"><span class="dos-th">BAND   TITEL                          RÜCKGABE      PREIS</span>\n${lines}
<span class="dos-sum">                                                    ───────
                                          SUMME DM ${fitL(dm(total), 7)}</span></pre>
          <div id="vHits"></div>`)}
      </div>`, {
        back: "menu",
        enter: { vScan: v => { if (!v){ if (ui.cart.length) showPay("rent"); else err("Erst eine Kassette scannen."); } else addToCart(v); } },
        acts: { r: shelf, p: randomScan, x: () => { const i = ui.cart.map(l => l.kind).lastIndexOf("band"); if (i >= 0){ ui.cart.splice(i, 1); showRent(nr); msg("Position storniert."); } }, k: () => ui.cart.length ? showPay("rent") : err("Warenkorb ist leer.") },
        focus: "vScan",
      });
      if (!ctx.touch) main.querySelector("#vScan").focus();
    }
    function addToCart(code){
      const q = code.toUpperCase().replace(/\s+/g, "");
      let copy = null;
      if (COPIES.includes(q)){
        if (rentalOf(q)) return err(`Band ${q} ist bereits ausgeliehen (bis ${fmtDate(rentalOf(q).due, true)}).`);
        if (inCart(q)) return err(`Band ${q} liegt schon im Warenkorb.`);
        copy = q;
      } else if (byId[q]){
        copy = freeCopies(byId[q])[0];
        if (!copy) return err(`„${esc(byId[q].t)}“ ist komplett verliehen.`);
      } else {
        const hits = TITLES.filter(t => t.t.toLowerCase().includes(code.toLowerCase()));
        if (hits.length === 1){ copy = freeCopies(hits[0])[0]; if (!copy) return err(`„${esc(hits[0].t)}“ ist komplett verliehen.`); }
        else {
          const box_ = main.querySelector("#vHits");
          if (!hits.length) return err(`Nichts gefunden zu „${esc(code)}“.`);
          box_.innerHTML = `<pre class="dos-pre">${hits.slice(0, 8).map(t => `<span class="dos-row" data-id="${t.id}">${t.id}  ${fit(t.t, 34)} ${freeCopies(t).length ? '<span class="ok">da</span>' : '<span class="err">weg</span>'}</span>`).join("\n")}</pre>`;
          box_.querySelectorAll(".dos-row").forEach(r => r.addEventListener("click", () => addToCart(r.dataset.id)));
          msg(`${hits.length} Treffer – Nummer eingeben oder anklicken.`);
          return;
        }
      }
      const t = titleOf(copy), pr = PRICE[t.k];
      ui.cart.push({ kind: "band", copy, title: t.t, price: pr.p, due: S.day + pr.d });
      scanBeep();
      showRent(ui.member);
      msg(`PIEP · ${copy} ${esc(t.t)} · ${pr.l} · ${dm(pr.p)} DM · Rückgabe ${fmtDate(S.day + pr.d)}`, "ok");
    }
    // Regal: alle Titel mit freien Bändern zum Antippen
    function shelf(){
      const list = TITLES.filter(t => freeCopies(t).length);
      const box_ = main.querySelector("#vHits");
      box_.innerHTML = `<pre class="dos-pre dos-table"><span class="dos-th">NR.   TITEL                               PREIS</span>\n${
        list.map(t => `<span class="dos-row" data-id="${t.id}">${t.id}  ${fit(t.t, 34)} ${fitL(dm(PRICE[t.k].p), 5)}</span>`).join("\n")}</pre>`;
      box_.querySelectorAll(".dos-row").forEach(r => r.addEventListener("click", () => addToCart(r.dataset.id)));
      msg(`${list.length} Titel im Regal – antippen legt ein Band in den Warenkorb.`);
      box_.scrollIntoView({ block: "nearest" });
    }
    function randomScan(){
      const free = COPIES.filter(c => !rentalOf(c) && !inCart(c));
      if (!free.length) return err("Regale leer – alles verliehen!");
      addToCart(ctx.rand(free));
    }

    /* ================= Kasse (Bezahlen + Bon) ================= */

    function showPay(back){
      const total = ui.cart.reduce((a, l) => a + l.price, 0);
      const c = cust(ui.member);
      screen("pay", `<div class="dos-cols">
        ${box("KASSIEREN", `<pre class="dos-pre dos-big">ZU ZAHLEN  ${fitL(dm(total), 8)} DM</pre>
          ${field("Gegeben (DM)", "vGiven", 'maxlength="7" inputmode="decimal" placeholder="z. B. 20"')}
          <div class="dos-actions">${btn("p", "passend")}${[5, 10, 20, 50, 100].filter(v => v >= total).slice(0, 3).map(v => cbtn("g" + v, `${v} DM`)).join("")}</div>
          <div class="dos-hint">Mitglied ${c ? c.nr + " · " + esc(c.name) : "—"} · nur Barzahlung</div>`, "narrow")}
        <div class="drawer-wrap"><pre class="drawer">╔════════════════════╗
║ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓  ║
║ [DM] [DM] [DM] [··]║
╚════════════════════╝</pre></div>
      </div>`, {
        back,
        enter: { vGiven: v => pay(v === "" ? total : parseFloat(v.replace(",", ".")), total) },
        acts: Object.assign({ p: () => pay(total, total) }, ...[5, 10, 20, 50, 100].map(v => ({ ["g" + v]: () => pay(v, total) }))),
      });
      msg(`Betrag ${dm(total)} DM. Gegebenen Betrag eingeben (ENTER = passend).`);
    }

    async function pay(given, total){
      if (!(given >= total - 1e-9)) return err(`Zu wenig! Es fehlen ${dm(total - (given || 0))} DM.`);
      const change = given - total, c = cust(ui.member), bon = ++S.bon;
      // Buchen
      for (const l of ui.cart){
        if (l.kind === "band"){
          S.rentals.push({ copy: l.copy, cust: ui.member, out: S.day, due: l.due, price: l.price });
          S.journal.push({ type: "verleih", amount: 0 });
        }
        if (l.kind === "saldo" && c) c.saldo = 0;
      }
      S.journal.push({ type: "zahlung", amount: total });
      save();
      const lines = ui.cart.slice();
      ui.cart = [];
      ctx.log("OK", `videothek: Bon <span class="path">${bon}</span> · ${dm(total)} DM`);

      // Schublade springt auf
      const dr = main.querySelector(".drawer");
      if (dr){ dr.classList.add("open"); }
      ctx.beep(1568, 80); setTimeout(() => ctx.beep(2093, 220, "triangle", 0.06), 90);
      msg(`Rückgeld: ${dm(change)} DM`, "ok");
      await ctx.sleep(500);
      if (!ctx.alive) return;

      const L = [];
      const rule = "-".repeat(32);
      L.push("      R E W I N D  V I D E O", "     Filiale 042 · Musterstadt", "   Hauptstr. 1 · Tel. 0123/4567", rule,
        `Bon ${String(bon).padEnd(8)}${fmtDate(S.day, true)}  ${now()}`, `Kasse 1     MA ${ui.clerk}`,
        c ? `Mitgl. ${c.nr}  ${fit(short(c.name), 16)}` : "Laufkunde", rule);
      for (const l of lines){
        if (l.kind === "band"){ L.push(`${l.copy} ${fit(l.title, 19)}${fitL(dm(l.price), 7)}`, `      zurück bis ${fmtDate(l.due, true)}`); }
        else L.push(`${fit(l.text, 25)}${fitL(dm(l.price), 7)}`);
      }
      L.push(rule, `SUMME                  ${fitL(dm(total), 6)} DM`, `BAR                    ${fitL(dm(given), 6)} DM`, `RÜCKGELD               ${fitL(dm(change), 6)} DM`,
        `  enth. MwSt 15%        ${fitL(dm(total - total / 1.15), 6)} DM`, rule,
        "      BITTE ZURÜCKSPULEN!", "  Säumnis 2,00 DM je Tag", "  Nicht zurückgespult: 1,00 DM", "", "    Danke & viel Spaß beim", "         Filmabend!", "", "  " + barcode("BON" + bon + "REWIND").repeat(2).slice(0, 28));
      await printReceipt(L);
      if (ctx.alive) msg(`Bon gedruckt · Rückgeld ${dm(change)} DM · ENTER = weiter`, "ok");
    }

    async function printReceipt(L){
      const wrap = document.createElement("div");
      wrap.className = "receipt-wrap";
      wrap.innerHTML = `<pre class="receipt"></pre><div class="dos-actions">${btn("w", "weiter")}</div>`;
      main.innerHTML = ""; main.appendChild(wrap);
      const pre = wrap.querySelector(".receipt");
      ui.screen = "receipt"; ui.back = "menu";
      ui.acts = { w: () => showMenu(), enter: () => showMenu() };
      wrap.querySelector("[data-act=w]").addEventListener("click", () => showMenu());
      for (const line of L){
        if (!ctx.alive) return;
        pre.textContent += line + "\n";
        pre.scrollTop = pre.scrollHeight;
        ctx.beep(180 + Math.random() * 60, 25, "square", 0.025);   // Nadeldrucker
        await ctx.sleep(55);
      }
      pre.textContent += "\n✂ - - - - - - - - - - - - - - -\n";
    }

    /* ================= Rückgabe ================= */

    function showReturn(info = ""){
      screen("ret", box("RÜCKGABE", `${field("Kassette scannen", "vRet", 'maxlength="6" placeholder="Band-Nr. wie 1012A"')}
        <div class="dos-actions">${btn("p", "Scanner (zufällig)")}</div>
        <div id="vRetInfo">${info}</div>
        <pre class="dos-pre dos-table">${S.rentals.map(r => `<span class="dos-row" data-copy="${r.copy}">${r.copy}  ${fit(titleOf(r.copy).t, 28)} ${late(r) ? `<span class="err">+${late(r)} TG</span>` : ""}</span>`).join("\n") || '<span class="dim">nichts außer Haus</span>'}</pre>
        <div class="dos-hint">Band antippen oder Nummer scannen</div>`),
        { enter: { vRet: v => v && takeBack(v.toUpperCase()) }, acts: { p: () => { if (!S.rentals.length) return err("Nichts verliehen."); takeBack(ctx.rand(S.rentals).copy); } }, focus: "vRet" });
    }
    main.addEventListener("click", e => {   // Rückgabe-Liste
      const r = e.target.closest("[data-copy]");
      if (r && ui.screen === "ret") takeBack(r.dataset.copy);
    });
    function takeBack(copy){
      const r = rentalOf(copy);
      if (!r) return err(COPIES.includes(copy) ? `Band ${copy} ist gar nicht verliehen.` : `Band ${esc(copy)} unbekannt.`);
      scanBeep();
      const t = titleOf(copy), c = cust(r.cust), l = late(r);
      const info = `<pre class="dos-pre">${copy}  ${esc(t.t)}
Mitglied ${c.nr} ${esc(c.name)}
ausgeliehen ${fmtDate(r.out, true)} · fällig ${fmtDate(r.due, true)} · ${l ? `<span class="err">${l} Tag(e) zu spät → ${dm(l * LATE)} DM</span>` : '<span class="ok">pünktlich</span>'}

<span class="warn">Band zurückgespult?</span></pre>`;
      screen("ret2", box("RÜCKGABE", info + `<div class="dos-actions">${btn("j", "ja, zurückgespult")}${btn("n", "nein (+1,00 DM)")}</div>`),
        { back: "ret", acts: { j: () => finish(false), n: () => finish(true) } });
      function finish(notRewound){
        const fee = l * LATE + (notRewound ? REWIND : 0);
        S.rentals = S.rentals.filter(x => x.copy !== copy);
        S.journal.push({ type: "rueck", amount: 0 });
        if (fee > 0){
          c.saldo += fee;
          S.journal.push({ type: "saeumnis", amount: fee });
        }
        save();
        ctx.beep(notRewound ? 300 : 1046, 90);
        const txt = fee > 0
          ? `<span class="warn">${dm(fee)} DM aufs Konto von ${esc(c.name)} gebucht</span> (${l ? `${l} Tag(e) zu spät` : ""}${l && notRewound ? " + " : ""}${notRewound ? "nicht zurückgespult" : ""}). Saldo jetzt ${dm(c.saldo)} DM.`
          : `<span class="ok">Danke! ${esc(t.t)} ist zurück im Regal.</span>`;
        showReturn(`<pre class="dos-pre">${txt}</pre>` + (fee > 0 ? `<div class="dos-actions">${btn("z", "Saldo jetzt kassieren")}</div>` : ""));
        if (fee > 0) ui.acts.z = () => payBalance(c.nr);
        msg(fee > 0 ? `Gebühr ${dm(fee)} DM gebucht.` : "Rückgabe gebucht.", fee > 0 ? "warn" : "ok");
      }
    }

    /* ================= Kasse & Tagesabschluss ================= */

    function showTill(){
      const st = stats();
      const saeum = S.journal.filter(j => j.type === "saeumnis").reduce((a, j) => a + j.amount, 0);
      const offen = S.customers.reduce((a, c) => a + c.saldo, 0);
      screen("till", `<div class="dos-cols">
        ${box(`KASSE 1 · ${fmtDate(S.day)}`, `<pre class="dos-pre">Bareinnahmen heute   ${fitL(dm(st.umsatz), 9)} DM
Säumnis gebucht      ${fitL(dm(saeum), 9)} DM
Offene Salden ges.   ${fitL(dm(offen), 9)} DM
──────────────────────────────────
Verleihungen         ${fitL(st.verleih, 9)}
Rückgaben            ${fitL(st.rueck, 9)}
Bänder außer Haus    ${fitL(st.aus, 9)}
davon überfällig     <span class="${st.over ? "warn" : ""}">${fitL(st.over, 9)}</span></pre>
          <div class="dos-actions">${btn("z", "Tagesabschluss (Z-Bon)")}${btn("r", "Demo-Daten zurücksetzen")}</div>
          <div class="dos-hint">Nach dem Tagesabschluss springt das Systemdatum einen Tag weiter — ausgeliehene Bänder werden dann irgendwann überfällig.</div>`)}
      </div>`, { acts: { z: dayClose, r: askReset } });
    }
    async function dayClose(){
      const st = stats();
      const saeum = S.journal.filter(j => j.type === "saeumnis").reduce((a, j) => a + j.amount, 0);
      const day = S.day, rule = "=".repeat(32);
      const L = ["      R E W I N D  V I D E O", "       TAGESABSCHLUSS (Z)", rule, `Datum ${fmtDate(day, true)}     Z-Nr. ${String(day + 812).padStart(4, "0")}`, `Kasse 1          MA ${ui.clerk}`, rule,
        `Verleihungen           ${fitL(st.verleih, 8)}`, `Rückgaben              ${fitL(st.rueck, 8)}`, `Säumnis gebucht     ${fitL(dm(saeum), 8)} DM`,
        `BAR GESAMT          ${fitL(dm(st.umsatz), 8)} DM`, rule, `Außer Haus             ${fitL(st.aus, 8)}`, `Überfällig             ${fitL(st.over, 8)}`, rule,
        "   Kassensturz durchführen!", "   Tresor: Beutel Nr. " + (300 + day), ""];
      S.day += 1; S.journal = []; save();
      ctx.log("OK", `videothek: Tagesabschluss ${fmtDate(day, true)} — neues Systemdatum ${fmtDate(S.day, true)}`);
      tick();
      await printReceipt(L);
      if (ctx.alive) msg(`Tagesabschluss gedruckt. Neues Systemdatum: ${fmtDate(S.day)}. ENTER = weiter`, "ok");
    }
    function askReset(){
      screen("reset", box("ACHTUNG", `<pre class="dos-pre"><span class="err">Alle Demo-Daten (Mitglieder, Ausleihen, Datum) zurücksetzen?</span></pre>
        <div class="dos-actions">${btn("j", "ja, zurücksetzen")}${btn("n", "nein")}</div>`, "narrow"),
        { back: "till", acts: { j: () => { S = seed(); save(); ui.member = null; ui.cart = []; tick(); showMenu(); msg("Demo-Daten zurückgesetzt.", "ok"); }, n: showTill } });
    }

    /* ================= Hilfe ================= */

    function showHelp(){
      screen("help", box("HILFE · VKS 3.2", `<pre class="dos-pre">So läuft ein Kundenbesuch:

 F2  Mitglied suchen (Nr. oder Name), N legt ein neues an
 F4  Verleih: Mitglieds-Nr., dann Kassetten "scannen"
     – Titel-Nr. (1003), Band-Nr. (1003B) oder Titel tippen
     – P = Handscanner (nimmt ein zufälliges Band)
     – ENTER in leerem Feld oder K = kassieren
 F5  Rückgabe: Band-Nr. scannen, zurückgespult? J / N
 F3  Titel & Bestand, "neu" zeigt die Neuheiten
 F8  Kasse: Tagesabschluss → Z-Bon, danach nächster Tag

Preise   Neuheit 4,50 DM / 1 Tag · Katalog 3,00 DM / 3 Tage
         Kinderfilm 2,00 DM / 3 Tage
Gebühren Säumnis 2,00 DM je Tag · nicht zurückgespult 1,00 DM

ESC geht eine Maske zurück, im Hauptmenü zurück ins Terminal.
Alle Daten sind erfunden und bleiben in diesem Browser.</pre>`));
    }

    /* ================= Start ================= */

    showLogin();

    return {
      fkeys: true,
      escape,
      key(e){
        const k = e.key;
        const fk = { F1: "help", F2: "member", F3: "titles", F4: "rent", F5: "ret", F8: "till", F10: "logout" }[k];
        if (/^F\d+$/.test(k)){ if (fk && ui.clerk) go(fk); return true; }   // auch F5 = kein Neuladen
        const inInput = e.target && e.target.tagName === "INPUT";
        if (inInput) return false;
        if (ui.screen === "menu"){
          if (k === "ArrowDown"){ ui.menuSel = (ui.menuSel + 1) % MENU.length; showMenu(); return true; }
          if (k === "ArrowUp"){ ui.menuSel = (ui.menuSel - 1 + MENU.length) % MENU.length; showMenu(); return true; }
          if (k === "Enter"){ go(MENU[ui.menuSel][3]); return true; }
          const m = MENU.find(x => x[0] === k);
          if (m){ go(m[3]); return true; }
        }
        if (k === "Enter" && ui.acts.enter){ ui.acts.enter(); return true; }
        const a = ui.acts[k.toLowerCase()];
        if (a && k.length === 1){ a(); return true; }
        return false;
      },
    };
  },
});
