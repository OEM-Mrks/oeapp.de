/* dilemma — das iterierte Gefangenendilemma als Verhör. Du und dein Komplize
   sitzt in getrennten Räumen, die Kommissarin geht eure Einbruchserie Fall für
   Fall durch: schweigen oder verraten? Wie viele Fälle es sind, weiß keiner.
   Der Komplize spielt eine verborgene Strategie aus Axelrods Turnieren (1980),
   die am Ende aufgedeckt wird. "dilemma --turnier" lässt alle Strategien
   jeder gegen jeden antreten. */

OE.register({
  id: "dilemma",
  alias: ["gefangenendilemma", "prisoner", "pd"],
  title: "dilemma // verhörprotokoll",
  desc: "Gefangenendilemma: schweigen oder verraten? Mit Axelrod-Turnier.",
  start(ctx){
    const { esc, rint } = ctx;

    /* ================= Regeln & Strategien ================= */

    // Jahre Haft je Fall: [ich, er] für Zug ich+er (C = schweigen, D = verraten)
    const YEARS = { CC: [1, 1], CD: [3, 0], DC: [0, 3], DD: [2, 2] };
    const last = a => a[a.length - 1];
    const chance = p => Math.random() < p;

    /* play(meine Züge, seine Züge) -> "C" | "D" */
    const BOTS = [
      { id: "tft", name: "Der Spiegel", strat: "Tit for Tat",
        how: "Schweigt im ersten Fall, danach macht er genau das, was du im Fall davor gemacht hast.",
        why: "Nett, vergeltend, nachsichtig und leicht zu durchschauen – der Sieger von Axelrods Turnieren.",
        play: (m, o) => o.length ? last(o) : "C",
        say: { CC: "Klopf, klopf. Wir halten dicht.", CD: "Ah, so läuft das. Merk ich mir.", DC: "Du wolltest es nicht anders.", DD: "Wie du mir, so ich dir." } },
      { id: "tf2t", name: "Der Geduldige", strat: "Tit for Two Tats",
        how: "Verrät erst, wenn du zweimal hintereinander verraten hast. Einen Ausrutscher verzeiht er.",
        why: "Sehr friedlich und robust gegen Missverständnisse – aber man kann ihn jeden zweiten Fall ausnutzen.",
        play: (m, o) => o.length >= 2 && last(o) === "D" && o[o.length - 2] === "D" ? "D" : "C",
        say: { CC: "Ruhig bleiben. Das wird schon.", CD: "Einmal ist keinmal. Ich vertrau dir noch.", DC: "Zweimal? Jetzt reicht's.", DD: "Ich hab dir zwei Chancen gegeben." } },
      { id: "grim", name: "Der Elefant", strat: "Grim Trigger",
        how: "Schweigt, bis du ein einziges Mal verrätst. Danach verrät er dich für immer.",
        why: "Ein Elefant vergisst nie: abschreckend, aber ein Fehler zerstört alles – keine Vergebung.",
        play: (m, o) => o.includes("D") ? "D" : "C",
        say: { CC: "Ich vergesse nie, wer zu mir hält.", CD: "Das vergesse ich dir NIE.", DC: "Ab jetzt sing ich jedes Lied.", DD: "Pakt gebrochen. Für immer." } },
      { id: "pavlov", later: 1993, name: "Die Wetterfahne", strat: "Pavlov (Win-Stay, Lose-Shift)",
        how: "Lief der letzte Fall gut für ihn (1 oder 0 Jahre), bleibt er bei seinem Zug – sonst wechselt er.",
        why: "Repariert Missverständnisse von selbst und nutzt Dauer-Schweiger gnadenlos aus.",
        play: (m, o) => !m.length ? "C" : (last(m) === last(o) ? "C" : "D"),
        say: { CC: "Läuft doch. Weiter so.", CD: "Mist. Dann probier ich's anders.", DC: "Hehe. Dabei bleib ich.", DD: "Bringt keinem was. Neuer Versuch?" } },
      { id: "alld", name: "Die Ratte", strat: "Always Defect",
        how: "Verrät dich in jedem Fall. Immer. Egal, was du tust.",
        why: "Gewinnt jedes einzelne Duell gegen Gutgläubige – sammelt im Turnier aber trotzdem viele Jahre.",
        play: () => "D",
        say: { DC: "Danke, Kumpel. Echt nett von dir.", DD: "Was hast du denn erwartet?" } },
      { id: "allc", name: "Das Lamm", strat: "Always Cooperate",
        how: "Schweigt in jedem Fall, egal wie oft du ihn verrätst.",
        why: "Treu bis zur Selbstaufgabe – wird von jedem Verräter ausgenommen.",
        play: () => "C",
        say: { CC: "Wir sind doch Freunde, oder?", CD: "Bestimmt war das ein Versehen …" } },
      { id: "rnd", name: "Der Würfel", strat: "Random",
        how: "Wirft eine Münze: halb schweigt er, halb verrät er. Was du tust, ist ihm egal.",
        why: "Unberechenbar, aber ohne Plan – Axelrod nahm ihn als Messlatte mit ins Turnier.",
        play: () => chance(0.5) ? "C" : "D",
        say: { CC: "Kopf oder Zahl? Diesmal Kopf.", CD: "Huch.", DC: "Die Münze hat entschieden.", DD: "Tja. Zufall." } },
      { id: "gtft", later: 1992, name: "Der Pfarrer", strat: "Generous Tit for Tat",
        how: "Wie der Spiegel – aber jeden Verrat vergibt er mit 30 % Wahrscheinlichkeit.",
        why: "Durchbricht Vergeltungsketten. Bei Missverständnissen (Rauschen) oft besser als Tit for Tat.",
        play: (m, o) => !o.length || last(o) === "C" ? "C" : (chance(0.3) ? "C" : "D"),
        say: { CC: "Gemeinsam schaffen wir das.", CD: "Ich vergebe dir … vielleicht.", DC: "Das tat mir mehr weh als dir.", DD: "Wir drehen uns im Kreis." } },
      { id: "joss", name: "Der Schleicher", strat: "Joss",
        how: "Spielt wie der Spiegel, verrät aber ab und zu (10 %) heimlich – nur so, zum Testen.",
        why: "Die kleinen Gemeinheiten lösen Vergeltungsketten aus. Im ersten Axelrod-Turnier weit hinten.",
        play: (m, o) => (o.length ? last(o) : "C") === "D" || chance(0.1) ? "D" : "C",
        say: { CC: "Klar halt ich dicht. Klar.", CD: "Du falsche Schlange!", DC: "Ups. Ist mir rausgerutscht.", DD: "Ihr seid alle gleich." } },
      { id: "tester", name: "Der Detektiv", strat: "Tester",
        how: "Testet dich: schweigt, verrät, schweigt, schweigt. Hast du dich nie gewehrt, verrät er dich danach immer – sonst spielt er Spiegel.",
        why: "Ausbeuter mit Verstand: wer sich nicht wehrt, wird ausgenommen.",
        play: (m, o) => {
          const n = m.length;
          if (n < 4) return "CDCC"[n];
          return o.slice(0, 4).includes("D") ? last(o) : "D";
        },
        say: { CC: "Interessant …", CD: "Du bist also so einer.", DC: "Mal sehen, ob du dich wehrst.", DD: "Aha. Du wehrst dich. Respekt." } },
    ];

    const NICKS = ["Kalle", "Fingers", "Die Elster", "Schrauber", "Lupo", "Toni Tresor", "Mücke", "Brecheisen-Bernd",
      "Locke", "Schatten", "Ede", "Paule Pinzette", "Nina Nachtschicht", "Der Graf", "Socke", "Zange"];
    const CASES = ["Juwelier Goldammer", "Tankstelle Nordring", "Kiosk am Bahnhof", "Spielhalle Lucky 7", "Pfandhaus Kröger",
      "Autohaus Sternberg", "Elektromarkt Volt", "Bäckerei Krume, Tageskasse", "Weinkeller Brandauer", "Postfiliale Süd",
      "Stadtmuseum, Bronzeskulptur", "Briefmarken-Zack", "Fahrradladen Speiche", "Kegelbahn, Tresor", "Uhrmacher Tick",
      "Lagerhalle 7 am Hafen", "Parkhaus-Automat P3", "Getränkemarkt Durst", "Antiquariat Eselsohr", "Schützenverein, Pokale",
      "Zoohandlung, ein Papagei", "Copyshop Kopierwerk", "Bootsverleih Möwe", "Musikhaus, ein Saxophon"];
    const COP = {
      any: ["„Dein Kumpel wird schon weich. Ich würde an deiner Stelle zuerst reden.“", "„Ich hab Zeit. Du auch?“",
        "„Schweigen ist Gold. Aber Gold bringt dir hier drin nichts.“", "„Er hat gerade nach einem Anwalt gefragt. Was meinst du, was er ihm erzählt?“",
        "„Letzter Fall für heute. Vielleicht.“", "„Noch ein Kaffee? Das kann dauern.“", "„Du weißt, wie das Angebot lautet.“",
        "„Ich sag's dir ehrlich: Er hat keine Ahnung, was du sagst. Und du nicht, was er sagt.“"],
      CC: ["„Ihr haltet zusammen wie Pech und Schwefel …“", "„Na gut. Dann eben der nächste Fall.“"],
      DD: ["„Ihr singt ja beide wie die Kanarienvögel.“", "„Schöne Freundschaft habt ihr da.“"],
      DC: ["„Na also. Geht doch.“", "„Kluge Entscheidung. Für dich.“"],
      CD: ["„Tja. Er war schneller.“", "„Er hat dich eiskalt verpfiffen. Willst du dich nicht revanchieren?“"],
    };
    const pick = a => a[rint(0, a.length - 1)];
    const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = rint(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    /* ================= Statistik ================= */

    const S = Object.assign({ games: 0, rounds: 0, coop: 0, best: null, seen: [],
      first: [0, 0], afterC: [0, 0], afterD: [0, 0] }, ctx.store.get("dilemma.stats", {}));
    const save = () => ctx.store.set("dilemma.stats", S);
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

    // "DU" fürs Turnier: deine Schweige-Quoten aus allen Spielen (geglättet)
    function youBot(){
      const p = ([c, n]) => (c + 1) / (n + 2);
      const pf = p(S.first), pc = p(S.afterC), pd = p(S.afterD);
      return { id: "you", name: "DU", strat: "dein Profil", you: true,
        how: `Schweigt im ersten Fall zu ${Math.round(pf * 100)} %, nach seinem Schweigen zu ${Math.round(pc * 100)} %, nach seinem Verrat zu ${Math.round(pd * 100)} %.`,
        play: (m, o) => chance(!o.length ? pf : last(o) === "C" ? pc : pd) ? "C" : "D" };
    }

    /* ================= Aufbau ================= */

    const { bar, body, pad } = ctx.layout();
    pad.classList.add("pd-pad");
    body.innerHTML = `
      <div class="pd">
        <div class="pd-game">
          <div class="pd-head"></div>
          <div class="pd-log"></div>
        </div>
        <div class="pd-tour" hidden></div>
      </div>
      <div class="app-overlay pd-ov" hidden></div>`;
    const gameEl = body.querySelector(".pd-game"), head = body.querySelector(".pd-head"), logEl = body.querySelector(".pd-log");
    const tourEl = body.querySelector(".pd-tour"), ov = body.querySelector(".pd-ov");

    let state = "intro", view = "game", runId = 0, fast = false;
    let bot, nick, cases, N, me, op, yMe, yOp, round;

    const cell = m => m === "C" ? `<i class="pd-c"></i>` : `<i class="pd-d">✕</i>`;

    function setBar(){
      bar.innerHTML = view === "tour"
        ? `<span>axelrod-turnier <b>// ${modern ? "1980 + 90er" : "1980"}</b></span><span>rauschen <b>${noise ? "5 %" : "aus"}</b></span><span class="pd-hide">du <b>${withYou ? "dabei" : "-"}</b></span><span class="right">ESC = zurück</span>`
        : `<span>akte <b>80-AX</b></span><span>fall <b>${round ? String(round).padStart(2, "0") : "--"}</b></span>
           <span class="pd-hide">gespielt <b>${S.games}</b></span><span class="right">? = regeln · T = turnier</span>`;
    }

    function drawHead(){
      const row = (who, arr, y, cls) => `<div class="pd-row"><span class="pd-who ${cls}">${esc(who)}</span>
        <span class="pd-line">${arr.map(cell).join("")}${state === "choose" || state === "wait" ? `<i class="pd-q">?</i>` : ""}</span>
        <span class="pd-y"><b>${y}</b> J</span></div>`;
      head.innerHTML = `<div class="pd-file">VERNEHMUNGSPROTOKOLL · RAUM 1 · ${round ? `FALL ${round}${state === "end" || state === "ending" ? ` VON ${N}` : ""}` : "VOR DER VERNEHMUNG"}</div>
        ${row("DU", me || [], yMe || 0, "you")}${row((nick || "KOMPLIZE").toUpperCase(), op || [], yOp || 0, "him")}
        <div class="pd-legend dim"><i class="pd-c"></i> schweigt · <i class="pd-d">✕</i> verrät · J = Jahre Haft</div>`;
      setBar();
    }

    function print(html = "", cls = ""){
      const d = document.createElement("div");
      if (cls) d.className = cls;
      d.innerHTML = html;
      logEl.appendChild(d);
      while (logEl.children.length > 300) logEl.removeChild(logEl.firstChild);
      logEl.scrollTop = logEl.scrollHeight;
      return d;
    }
    const ok = id => ctx.alive && id === runId;
    async function wait(id, ms){ if (!fast) await ctx.sleep(ms); return ok(id); }
    // Zeile eintippen; ENTER/Tippen beschleunigt (fast)
    async function type(id, html, cls = "", ms = 16){
      const d = print("", cls), tmp = document.createElement("div");
      tmp.innerHTML = html;
      const text = tmp.textContent;
      for (let i = 1; i <= text.length; i++){
        if (!ok(id)) return false;
        if (fast) break;
        d.textContent = text.slice(0, i);
        logEl.scrollTop = logEl.scrollHeight;
        if (i % 3 === 0) ctx.beep(1900 + rint(0, 200), 6, "square", 0.006);
        await ctx.sleep(ms);
      }
      d.innerHTML = html; logEl.scrollTop = logEl.scrollHeight;
      return ok(id);
    }

    function setPad(){
      let defs;
      if (view === "tour") defs = [{ label: "↻ neu", key: "Enter" }, { label: noise ? "rauschen ✓" : "rauschen", key: "r" }, { label: modern ? "90er ✓" : "+90er", key: "m" },
        { label: withYou ? "du ✓" : "+du", key: "d" }, { label: "◂ zurück", key: "Escape" }];
      else if (state === "choose") defs = [{ label: ctx.touch ? "SCHWEIGEN" : "S · SCHWEIGEN", key: "s" }, { label: ctx.touch ? "VERRATEN" : "V · VERRATEN", key: "v" }, { label: "?", key: "?", aria: "Regeln" }];
      else if (state === "wait" || state === "story" || state === "ending") defs = [{ label: "▸▸ weiter", key: "Enter" }];
      else defs = [{ label: state === "end" ? "↻ nochmal" : "▸ verhör starten", key: "Enter" }, { label: "turnier", key: "t" }, { label: "?", key: "?", aria: "Regeln" }];
      ctx.buttons(pad, defs);
      pad.dataset.n = defs.length;
      const big = state === "choose" && view === "game";
      pad.classList.toggle("pd-choose", big);
      pad.classList.toggle("pd-tourpad", view === "tour");
      if (big){ pad.children[0].classList.add("pd-bs"); pad.children[1].classList.add("pd-bv"); }
    }

    /* ================= Spielablauf ================= */

    async function intro(){
      const id = ++runId; fast = false;
      view = "game"; tourEl.hidden = true; gameEl.hidden = false;
      bot = pick(BOTS); nick = pick(NICKS);
      N = rint(10, 20);
      cases = shuffle(CASES).slice(0, N);
      me = []; op = []; yMe = 0; yOp = 0; round = 0;
      state = "story"; logEl.innerHTML = ""; drawHead(); setPad();
      const L = [
        [`<b>KRIMINALPOLIZEI · KOMMISSARIAT 4 · AKTE 80-AX</b>`, "pd-hl"],
        [`Nacht auf Samstag, 02:40 Uhr. Eure Bande hat eine ganze Einbruchserie hingelegt – bis die Streife euch vor der Lagerhalle am Hafen erwischt hat.`],
        [`Du sitzt in Raum 1. <b>${esc(nick)}</b> sitzt in Raum 2. Reden könnt ihr nicht miteinander.`],
        [`Kommissarin Brandt geht die Serie Fall für Fall durch. Ohne Geständnis kann sie euch je Fall nur ein Jahr anhängen. Ihr Angebot gilt für jeden Fall:`],
        [`  beide schweigen  → je 1 Jahr`, "pd-pre"],
        [`  du verrätst      → du frei, er 3 Jahre`, "pd-pre"],
        [`  er verrät        → er frei, du 3 Jahre`, "pd-pre"],
        [`  beide verraten   → je 2 Jahre`, "pd-pre"],
        [`Wie viele Fälle in der Akte stecken, sagt sie nicht.`, "warn"],
      ];
      for (const [h, c] of L){ if (!await type(id, h, c)) return; if (!await wait(id, 260)) return; }
      state = "intro"; fast = false; setPad();
      print(`<span class="dim">${ctx.touch ? "▸ verhör starten" : "[ENTER] Verhör beginnen · [?] Regeln · [T] Turnier"}${S.games ? ` · bisher ${S.games} Verhöre, Schweigequote ${pct(S.coop, S.rounds)} %` : ""}</span>`);
    }

    async function nextCase(){
      const id = ++runId; fast = false;
      round++; state = "wait"; drawHead(); setPad();
      print("");
      print(`── FALL ${round}: ${esc(cases[round - 1])} ──`, "pd-case");
      if (!await wait(id, 250)) return;
      const prev = me.length ? last(me) + last(op) : null;
      const line = prev && chance(0.55) ? pick(COP[prev]) : pick(COP.any);
      if (!await type(id, `<span class="dim">Brandt:</span> ${line}`, "pd-cop")) return;
      fast = false;
      state = "choose"; drawHead(); setPad();
      print(`<span class="dim">${ctx.touch ? "schweigen oder verraten?" : "[S] schweigen · [V] verraten"}</span>`, "pd-ask");
    }

    async function choose(mv){
      if (state !== "choose") return;
      const id = ++runId; fast = false;
      state = "wait"; setPad();
      const ask = logEl.querySelector(".pd-ask:last-child"); if (ask) ask.remove();
      const his = bot.play(op, me);
      // Statistik: wie reagierst du auf seinen letzten Zug?
      const slot = !op.length ? S.first : last(op) === "C" ? S.afterC : S.afterD;
      slot[1]++; if (mv === "C") slot[0]++;
      S.rounds++; if (mv === "C") S.coop++;
      print(`<span class="you">DU:</span> ${mv === "C" ? "„Ich sage nichts.“" : "„Okay. Ich rede.“"}`);
      ctx.beep(mv === "C" ? 520 : 330, 70);
      const d = print(`<span class="dim">Protokolle werden verglichen </span>`);
      for (let i = 0; i < 3; i++){ if (!await wait(id, 260)) return; d.innerHTML += `<span class="dim">.</span>`; ctx.beep(1200, 15, "square", 0.01); }
      const [a, b] = YEARS[mv + his];
      me.push(mv); op.push(his); yMe += a; yOp += b;
      const res = mv === "C" && his === "C" ? `Ihr schweigt beide. <b>Je +1 Jahr.</b>`
        : mv === "D" && his === "D" ? `Ihr verratet euch gegenseitig. <b>Je +2 Jahre.</b>`
        : mv === "D" ? `Du verrätst, ${esc(nick)} schweigt. <b>Du: frei · ${esc(nick)}: +3 Jahre.</b>`
        : `${esc(nick)} hat dich verraten! <b>Du: +3 Jahre · ${esc(nick)}: frei.</b>`;
      d.innerHTML = res; d.className = mv + his === "CC" ? "ok" : mv + his === "CD" ? "err" : "warn";
      if (mv + his === "CD") ctx.beep(160, 260, "sawtooth"); else if (mv + his === "CC") ctx.beep(880, 90); else ctx.beep(440, 120);
      drawHead();
      if (!await wait(id, 500)) return;
      const say = bot.say[his + mv] || "…";
      if (!await type(id, `<span class="dim">‹ Klopfzeichen aus Raum 2 ›</span> <span class="him">${esc(nick)}:</span> „${esc(say)}“`, "pd-knock", 22)) return;
      save();
      if (!await wait(id, 650)) return;
      if (round >= N) finish(); else nextCase();
    }

    /* Wie hätten die Klassiker gegen deinen Komplizen abgeschnitten? (N Fälle, gemittelt) */
    function compare(){
      return BOTS.map(s => {
        let sum = 0; const R = 30;
        for (let r = 0; r < R; r++) sum += match(s, bot, N, 0)[0];
        return { s, y: sum / R };
      }).sort((x, y) => x.y - y.y);
    }

    async function finish(){
      const id = ++runId; fast = false;
      state = "ending"; drawHead(); setPad();
      S.games++;
      const avg = yMe / N;
      const best = S.best === null || avg < S.best;
      if (best) S.best = avg;
      if (!S.seen.includes(bot.id)) S.seen.push(bot.id);
      save(); setBar();
      print("");
      if (!await type(id, `Brandt klappt die Akte zu. „Das war's. ${N} Fälle.“`, "pd-cop")) return;
      if (!await wait(id, 500)) return;
      const verdict = yMe < yOp ? `Du kommst besser weg als ${esc(nick)}.` : yMe > yOp ? `${esc(nick)} kommt besser weg als du.` : "Ihr kommt gleich weg.";
      const coop = pct(me.filter(m => m === "C").length, N);
      print(`<div class="pd-box"><b>URTEIL</b>   du: <b>${yMe} Jahre</b> · ${esc(nick)}: <b>${yOp} Jahre</b>
${verdict} Du hast in ${coop} % der Fälle geschwiegen.
Hättet ihr beide immer geschwiegen: je ${N} Jahre. Immer verraten: je ${N * 2} Jahre.</div>`);
      if (!await wait(id, 700)) return;
      print(`<div class="pd-box pd-reveal"><span class="dim">AKTE ${esc(nick.toUpperCase())} · ENTSCHLÜSSELT</span>
<b class="pd-big">${esc(bot.name.toUpperCase())}</b>  <span class="warn">${esc(bot.strat)}</span>
${esc(bot.how)}
<span class="dim">${esc(bot.why)}</span></div>`);
      ctx.beep(660, 80); await ctx.sleep(90); ctx.beep(990, 120);
      if (!await wait(id, 500)) return;
      const cmp = compare();
      const rows = cmp.map(c => `  ${c.s.name.padEnd(16)} ${c.y.toFixed(1).padStart(5)} J`);
      const mine = `  ${"DU".padEnd(16)} ${String(yMe).padStart(3)}   J`;
      const at = cmp.findIndex(c => c.y > yMe);
      rows.splice(at < 0 ? rows.length : at, 0, `<b class="you">${mine}</b>`);
      print(`<div class="pd-box"><span class="dim">So hätten die Klassiker in ${N} Fällen gegen ${esc(nick)} abgeschnitten (Ø, weniger = besser):</span>
${rows.join("\n")}</div>`);
      print(`<span class="dim">Ø ${avg.toFixed(2)} Jahre je Fall${best ? ` · <span class="ok">★ beste Bilanz</span>` : ` · beste: ${S.best.toFixed(2)}`} · entlarvt: ${S.seen.length}/${BOTS.length} · Schweigequote gesamt ${pct(S.coop, S.rounds)} %</span>`);
      state = "end"; setPad();
      print(`<span class="dim">${ctx.touch ? "↻ nochmal · turnier" : "[ENTER] nochmal · [T] Turnier · [?] Regeln · [ESC] Ende"}</span>`);
    }

    /* ================= Turnier ================= */

    // Feld: Klassiker von 1980; M nimmt Pfarrer und Wetterfahne (1990er) dazu, D dein Profil
    let noise = ctx.args.includes("--rauschen"), modern = false, withYou = false, tourTimer = null, tourRes = null;

    // Ein Duell über n Fälle; mit Rauschen kippt ein Zug manchmal ("Missverständnis")
    function match(A, B, n, nz){
      const a = [], b = []; let ya = 0, yb = 0;
      for (let i = 0; i < n; i++){
        let x = A.play(a, b), y = B.play(b, a);
        if (nz && chance(nz)) x = x === "C" ? "D" : "C";
        if (nz && chance(nz)) y = y === "C" ? "D" : "C";
        a.push(x); b.push(y);
        const [p, q] = YEARS[x + y]; ya += p; yb += q;
      }
      return [ya, yb, a, b];
    }

    function tournament(){
      view = "tour"; state = "tour"; ++runId;
      gameEl.hidden = true; tourEl.hidden = false; ov.hidden = true;
      clearInterval(tourTimer);
      const field = BOTS.filter(b => modern || !b.later);
      if (withYou) field.push(youBot());
      const L = rint(150, 250);
      const tab = field.map(s => ({ s, y: 0, n: 0 }));
      const games = [];
      for (let i = 0; i < field.length; i++) for (let j = i; j < field.length; j++) games.push([i, j]);
      const played = games.map(([i, j]) => [i, j, match(field[i], field[j], L, noise ? 0.05 : 0)]);
      let k = 0;
      tourRes = { tab, played, L, field };
      setBar(); setPad();
      tourEl.innerHTML = `<div class="pd-file">JEDER GEGEN JEDEN · auch gegen sich selbst · ${games.length} Duelle à ${L} Fälle (die Strategien kennen die Länge nicht)</div>
        <div class="pd-now"></div><div class="pd-tab"></div><div class="pd-note"></div>`;
      const nowEl = tourEl.querySelector(".pd-now"), tabEl = tourEl.querySelector(".pd-tab"), noteEl = tourEl.querySelector(".pd-note");

      function render(){
        const rows = tab.slice().sort((x, y) => (x.n ? x.y / x.n : 9) - (y.n ? y.y / y.n : 9));
        tabEl.innerHTML = `<div class="pd-tr pd-th"><span>#</span><span>strategie</span><span>Ø J</span><span class="pd-hide"></span></div>` +
          rows.map((r, i) => {
            const v = r.n ? r.y / r.n : 0, w = Math.round(v / 3 * 100);
            return `<div class="pd-tr${r.s.you ? " you" : ""}${i === 0 && k >= played.length ? " top" : ""}"><span>${i + 1}</span>
              <span>${esc(r.s.name)} <span class="dim">${esc(r.s.strat)}</span></span>
              <span>${r.n ? v.toFixed(2) : "-.--"}</span><span class="pd-bar pd-hide"><i style="width:${w}%"></i></span></div>`;
          }).join("");
      }
      function step(){
        if (k >= played.length){ clearInterval(tourTimer); done(); return; }
        const [i, j, [ya, yb, a, b]] = played[k++];
        tab[i].y += ya; tab[i].n += L;
        if (i !== j){ tab[j].y += yb; tab[j].n += L; }
        const strip = arr => arr.slice(0, 24).map(cell).join("");
        nowEl.innerHTML = `<div>duell ${k}/${played.length}: <b>${esc(field[i].name)}</b> ↔ <b>${esc(field[j].name)}</b> &nbsp; ${(ya / L).toFixed(2)} : ${(yb / L).toFixed(2)}</div>
          <div class="pd-strip">${strip(a)} …</div><div class="pd-strip">${strip(b)} …</div>`;
        ctx.beep(900 + (k % 5) * 120, 12, "square", 0.01);
        render();
      }
      function done(){
        k = played.length; render();
        const rows = tab.slice().sort((x, y) => x.y / x.n - y.y / y.n);
        const w = rows[0].s, tft = rows.findIndex(r => r.s.id === "tft") + 1;
        noteEl.innerHTML = `<b>Sieger: ${esc(w.name)}</b> <span class="dim">(${esc(w.strat)})</span>. ${w.id === "tft" ? "Wie bei Axelrod: Tit for Tat vorn." : `Der Spiegel landet auf Platz ${tft} – an der Spitze ist es fast immer knapp, ein neues Turnier mischt neu.`}
Tit for Tat gewinnt kein einziges Duell – aber es verliert nie hoch und holt mit allen „netten“ Strategien das Maximum heraus.
Axelrods Zutaten: <b>nett</b> (verrät nie zuerst) · <b>vergeltend</b> (bestraft sofort) · <b>nachsichtig</b> (vergibt sofort) · <b>klar</b> (leicht zu durchschauen).
${noise ? "Mit Rauschen kippt jeder 20. Zug: Spiegel und Elefant geraten in Vergeltungsketten, das Feld rückt eng zusammen – jetzt kann fast jeder gewinnen."
  : modern ? "Der Pfarrer (Nowak & Sigmund, 1992) ist Tit for Tat mit Vergebung – damit oft noch einen Tick besser."
  : "Probier: [M] spätere Strategien dazu · [R] 5 % Missverständnisse · [D] dein eigenes Profil."}${withYou ? `\nDU spielt nach deinen Quoten aus ${S.rounds} Fällen: ${esc(field[field.length - 1].how)}` : ""}
<span class="dim">${ctx.touch ? "↻ neu · rauschen · +90er · +du" : "[ENTER] neues Turnier · [R] Rauschen · [M] 90er · [D] du · [ESC] zurück"}</span>`;
        ctx.beep(660, 80);
      }
      render();
      tourTimer = setInterval(step, 140);
      tourRes.skip = () => { nowEl.innerHTML = `<div>alle ${played.length} Duelle gespielt</div>`; while (k < played.length){ const [i, j, [ya, yb]] = played[k++]; tab[i].y += ya; tab[i].n += L; if (i !== j){ tab[j].y += yb; tab[j].n += L; } } clearInterval(tourTimer); done(); };
      tourRes.running = () => k < played.length;
    }

    function leaveTour(){
      clearInterval(tourTimer);
      if (ctx.args.includes("--turnier")) { ctx.exit(); return; }
      intro();
    }

    /* ================= Regeln ================= */

    function rules(){
      ov.hidden = false;
      ov.innerHTML = `<div class="pd-rules">
<p><b>DAS GEFANGENENDILEMMA</b> <span class="dim">· Jahre Haft je Fall: du / er</span></p>
<pre class="pd-mx">              │ er schweigt │ er verrät
──────────────┼─────────────┼──────────
du schweigst  │    <span class="ok">1 / 1</span>    │  <span class="err">3 / 0</span>
du verrätst   │    <span class="warn">0 / 3</span>    │  2 / 2</pre>
<p>Egal was er tut: Verraten bringt dir in <i>diesem</i> Fall ein Jahr weniger. Machen das beide,
sitzen beide länger, als wenn beide schweigen. Das ist das Dilemma.</p>
<p>Über viele Fälle sieht es anders aus: Wer verrät, wird beim nächsten Fall vielleicht selbst verraten.
Darum ist die Zahl der Fälle geheim (10–20) – sonst lohnt Verrat im letzten Fall.</p>
<p>Dein Komplize spielt eine feste Strategie aus Robert Axelrods Computerturnieren von 1980.
Wer es ist, erfährst du am Ende.</p>
<p class="dim">${ctx.touch ? "" : "S / 1 = schweigen · V / 2 = verraten · T = Turnier · ESC = Ende<br>"}${ctx.touch ? "tippen" : "beliebige Taste"} = schließen</p></div>`;
    }
    ov.addEventListener("pointerdown", e => { e.preventDefault(); ov.hidden = true; });

    /* ================= Tasten ================= */

    if (ctx.args.includes("--turnier") || ctx.args.includes("--tournament")) tournament(); else intro();

    return {
      stop(){ clearInterval(tourTimer); runId++; },
      escape(){
        if (!ov.hidden){ ov.hidden = true; return true; }
        if (view === "tour" && !ctx.args.includes("--turnier")){ leaveTour(); return true; }
        return false;
      },
      key(e){
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!ov.hidden){ ov.hidden = true; return true; }
        if (k === "Escape"){ if (!this.escape()) ctx.exit(); return true; }
        if (k === "?" || k === "h"){ rules(); return true; }
        if (view === "tour"){
          if (k === "Enter" || k === " "){ if (tourRes && tourRes.running()) tourRes.skip(); else tournament(); return true; }
          if (k === "r"){ noise = !noise; tournament(); return true; }
          if (k === "m"){ modern = !modern; tournament(); return true; }
          if (k === "d"){ withYou = !withYou; tournament(); return true; }
          if (k === "t"){ return true; }
          return false;
        }
        if (state === "choose"){
          if (k === "s" || k === "1"){ choose("C"); return true; }
          if (k === "v" || k === "2"){ choose("D"); return true; }
        }
        if (k === "Enter" || k === " "){
          if (state === "story" || state === "wait" || state === "ending"){ fast = true; return true; }
          if (state === "intro") { nextCase(); return true; }
          if (state === "end"){ intro(); return true; }
          return true;
        }
        if (k === "t" && (state === "intro" || state === "end")){ tournament(); return true; }
        return false;
      },
    };
  },
});
