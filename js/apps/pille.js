/* pille — das Rot/Blau-Dilemma (virale Umfrage 2023, wieder 2026). Alle Menschen
   wählen geheim: rote oder blaue Pille. Wählen mehr als 50 % Blau, überleben alle,
   sonst nur die Roten. Kein Backend: die Welt ist ein Modell (10.000 Punkte, Anteil
   Blau um echte Umfragewerte gestreut, je nach Formulierung). Vier Szenarien
   (Original, Mixer, Familie, kleine Gruppe), danach die Auflösung mit der Einordnung
   von Prof. Christian Rieck. Eine Computerstimme liest mit (M = an/aus). */

OE.register({
  id: "pille",
  alias: ["pill", "rotblau", "rieck"],
  title: "pille // rot oder blau",
  desc: "Rot/Blau-Dilemma: rettet die Menschheit Blau? Mit Riecks Spieltheorie.",
  start(ctx){
    const { esc, rint } = ctx;

    /* ================= Modell ================= */

    const WORLD = 8.1e9, DOTS = 10000;
    const RIECK = { title: "Rot/blau Spiel: Retten Sie die Menschheit?", url: "https://www.youtube.com/watch?v=1K7m3yTQDmM" };
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const pct = x => (x * 100).toFixed(1).replace(".", ",") + " %";
    const mrd = n => n >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " Mrd." : (n / 1e6).toFixed(0) + " Mio.";
    const KID = "Mia";

    // Anteil Blau: Umfragen 2023 (64,9 %) und 2026 (57,9 %), im Ernstfall etwas vorsichtiger
    const SCEN = [
      { id: "orig",   name: "DIE NACHRICHT",  mu: 0.57, sd: 0.06, rL: "ROT",  bL: "BLAU" },
      { id: "mixer",  name: "DER MIXER",      mu: 0.27, sd: 0.07, rL: "DRAUSSEN", bL: "MIXER" },
      { id: "family", name: "MIA",            mu: 0.57, sd: 0.07, rL: "ROT",  bL: "BLAU" },
      { id: "group",  name: "RAUM 5",         rL: "ROT",  bL: "BLAU" },
    ];

    /* ================= Statistik & Stimme ================= */

    const S = Object.assign({ games: 0, red: 0, blue: 0, lived: 0, died: 0, by: {} }, ctx.store.get("pille.stats", {}));
    const save = () => ctx.store.set("pille.stats", S);
    let voiceOn = ctx.store.get("pille.voice", true);

    const speech = window.speechSynthesis;
    function voice(){
      const vs = speech ? speech.getVoices().filter(v => /^de/i.test(v.lang)) : [];
      return vs.find(v => /markus|yannick|martin|stefan|hans|google deutsch/i.test(v.name)) || vs[0] || null;
    }
    // iOS: core.js schaltet speechSynthesis beim ersten Tippen stumm frei (unlockAudio)
    function speak(text){
      return new Promise(res => {
        if (!voiceOn || !speech || !window.SpeechSynthesisUtterance) return res(false);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE"; u.pitch = 0.45; u.rate = 1.02;
        const v = voice(); if (v) u.voice = v;
        u.onend = u.onerror = () => res(true);
        speech.speak(u);
        ctx.after(2500 + text.length * 110, () => res(true));   // falls onend nie kommt
      });
    }
    const hush = () => { try{ if (speech) speech.cancel(); } catch(e){} };

    /* ================= Aufbau ================= */

    const { bar, body, pad } = ctx.layout();
    pad.classList.add("pl-pad");
    body.innerHTML = `
      <div class="pl">
        <div class="pl-world"><canvas></canvas><div class="pl-tag"></div><div class="pl-stamp" hidden></div></div>
        <div class="pl-meter">
          <div class="pl-bar"><i class="pl-r"></i><i class="pl-b"></i><span class="pl-mid"></span></div>
          <div class="pl-nums"></div>
        </div>
        <div class="pl-log"></div>
      </div>
      <div class="app-overlay pl-ov" hidden></div>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d"), worldEl = body.querySelector(".pl-world");
    const tag = body.querySelector(".pl-tag"), stampEl = body.querySelector(".pl-stamp");
    const barR = body.querySelector(".pl-r"), barB = body.querySelector(".pl-b"), nums = body.querySelector(".pl-nums");
    const logEl = body.querySelector(".pl-log"), ov = body.querySelector(".pl-ov"), plEl = body.querySelector(".pl");

    let state = "story", runId = 0, fast = false, sc = 0, mine = null, rounds = [];

    /* ---------- Welt: Punkte-Raster ---------- */
    // c: 0 = unbekannt, 1 = rot, 2 = blau, 3 = blau tot, 4 = gerettet
    let cols = 125, rows = 80, cells = new Uint8Array(DOTS), dirty = true, youAt = 0, kidAt = -1, glow = 0, group = null, pulse = 0;
    const COL = ["#0d3318", "#ff5a5a", "#4aa8ff", "#1a1f2e", "#a6ffb8"];
    function fit(){
      const r = worldEl.getBoundingClientRect();
      const W = Math.max(50, Math.floor(r.width)), H = Math.max(40, Math.floor(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.floor(W * dpr) || cv.height !== Math.floor(H * dpr)){
        cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
        cv.style.width = W + "px"; cv.style.height = H + "px";
        const c = clamp(Math.round(Math.sqrt(DOTS * W / H)), 40, 250);
        if (c !== cols){ cols = c; rows = Math.ceil(DOTS / cols); youAt = Math.floor(rows / 2) * cols + Math.floor(cols / 2); }
        dirty = true;
      }
    }
    youAt = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    function draw(t){
      fit();
      pulse = t;
      const W = cv.width, H = cv.height;
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      if (group){ drawGroup(W, H, t); return; }
      const cw = W / cols, ch = H / rows, s = Math.max(1, Math.min(cw, ch) - (Math.min(cw, ch) > 3 ? 1 : 0.4));
      const ox = (W - cw * cols) / 2, oy = (H - ch * rows) / 2;
      for (let col = 0; col < COL.length; col++){
        g.fillStyle = col === 0 ? `rgba(26,138,54,${0.22 + 0.08 * Math.sin(t / 700)})` : COL[col];
        g.beginPath();
        for (let i = 0; i < DOTS; i++) if (cells[i] === col) g.rect(ox + (i % cols) * cw, oy + Math.floor(i / cols) * ch, s, s);
        g.fill();
      }
      if (glow > 0){ g.fillStyle = `rgba(166,255,184,${glow})`; g.fillRect(0, 0, W, H); glow = Math.max(0, glow - 0.02); }
      // du (und Mia): blinkender Ring
      const ring = (i, color) => {
        const x = ox + (i % cols) * cw + s / 2, y = oy + Math.floor(i / cols) * ch + s / 2;
        g.strokeStyle = color; g.lineWidth = Math.max(1.5, s * 0.5);
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t / 180);
        g.beginPath(); g.arc(x, y, Math.max(6, s * 2.6), 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
        g.font = `${Math.round(11 * W / (cv.clientWidth || W))}px "IBM Plex Mono", monospace`;
        g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "middle";
        const label = i === youAt ? "DU" : KID.toUpperCase();
        const lx = x + Math.max(9, s * 3.4), tw = g.measureText(label).width;
        g.fillText(label, lx + tw > W ? x - Math.max(9, s * 3.4) - tw : lx, y);
      };
      ring(youAt, "#ffffff");
      if (kidAt >= 0) ring(kidAt, "#ffb454");
    }
    ctx.loop((dt, t) => draw(t));

    /* ---------- kleine Gruppe ---------- */
    const PEOPLE = [
      { n: "Aylin", say: "Ich nehme Blau. Ich kann nicht anders." , p: "b" },
      { n: "Jonas", say: "Blau. Wenn wir zusammenhalten, passiert niemandem was.", p: "b" },
      { n: "Herr Petersen", say: "Rot. Ich bin doch nicht verrückt.", p: "r" },
      { n: "Lea", say: "Ich weiß nicht … ich mach einfach, was du machst.", p: "you" },
    ];
    function drawGroup(W, H, t){
      const n = group.length, r = Math.min(W / (n * 2.6), H / 5.5);
      const dpr = W / cv.clientWidth;
      g.textAlign = "center"; g.textBaseline = "middle";
      group.forEach((p, i) => {
        const x = W * (i + 0.5) / n, y = H * 0.3;
        const c = p.c === 1 ? COL[1] : p.c === 2 ? COL[2] : p.c === 3 ? COL[3] : p.c === 4 ? COL[4] : "#0d3318";
        g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        if (!p.c){ g.fillStyle = "#33ff66"; g.font = `${Math.round(r)}px "IBM Plex Mono", monospace`; g.fillText("?", x, y); }
        if (p.c === 3){ g.strokeStyle = "#ff5a5a"; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(x - r * .6, y - r * .6); g.lineTo(x + r * .6, y + r * .6); g.moveTo(x + r * .6, y - r * .6); g.lineTo(x - r * .6, y + r * .6); g.stroke(); }
        if (p.you){ g.strokeStyle = "#fff"; g.lineWidth = 2 * dpr; g.globalAlpha = 0.7 + 0.3 * Math.sin(t / 180); g.beginPath(); g.arc(x, y, r * 1.25, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
        g.fillStyle = p.you ? "#fff" : "#a6ffb8";
        g.font = `${Math.round(Math.min(13 * dpr, W / n / 7))}px "IBM Plex Mono", monospace`;
        g.fillText(p.n, x, y + r * 1.6 + 6 * dpr);
      });
    }

    /* ---------- Balken ---------- */
    function meter(red, blue, total, note = ""){
      const n = red + blue;
      barR.style.width = n ? (red / n * 100) + "%" : "0%";
      barB.style.width = n ? (blue / n * 100) + "%" : "0%";
      nums.innerHTML = n
        ? `<span class="pl-tr">${SCEN[sc].rL} ${pct(red / n)}</span><span class="dim">${note || `ausgezählt ${Math.round(n / total * 100)} %`}</span><span class="pl-tb">${SCEN[sc].bL} ${pct(blue / n)}</span>`
        : `<span class="dim">${note || "noch nichts ausgezählt · Linie = 50 %"}</span>`;
    }

    function setBar(){
      bar.innerHTML = `<span>szenario <b>${state === "end" ? "auflösung" : `${sc + 1}/${SCEN.length}`}</b></span>
        <span class="pl-hide">gewählt <b>${S.red}× rot · ${S.blue}× blau</b></span>
        <span class="right">stimme <b>${voiceOn ? "an" : "aus"}</b> (M)${ctx.touch ? "" : " · ? regeln · R/B wählen"}</span>`;
    }

    /* ---------- Text: tippen + sprechen ---------- */
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
    // Zeile mittippen und (optional) sprechen; weiter erst, wenn beides fertig ist
    async function say(id, html, cls = "", spoken = null){
      const d = print("", cls), tmp = document.createElement("div");
      tmp.innerHTML = html;
      const text = tmp.textContent;
      const talk = spoken === false || fast ? Promise.resolve(false) : speak(spoken || text);
      for (let i = 1; i <= text.length; i++){
        if (!ok(id)) return false;
        if (fast) break;
        d.textContent = text.slice(0, i);
        logEl.scrollTop = logEl.scrollHeight;
        if (i % 4 === 0) ctx.beep(1700 + rint(0, 300), 5, "square", 0.005);
        await ctx.sleep(voiceOn && speech ? 26 : 14);
      }
      d.innerHTML = html; logEl.scrollTop = logEl.scrollHeight;
      const spokeIt = await talk;
      if (!ok(id)) return false;
      if (!spokeIt && !fast) await ctx.sleep(250 + text.length * 14);   // ohne Stimme: Zeit zum Lesen
      return wait(id, 220);
    }

    function setPad(){
      let defs;
      const s = SCEN[sc];
      if (state === "choose") defs = [
        { label: ctx.touch ? s.rL : `R · ${s.rL}`, key: "r", aria: "rot" },
        { label: ctx.touch ? s.bL : `B · ${s.bL}`, key: "b", aria: "blau" }];
      else if (state === "end") defs = [{ label: "↻ nochmal", key: "Enter" }];
      else if (state === "next") defs = [{ label: sc + 1 < SCEN.length ? "▸ nächstes szenario" : "▸ auflösung", key: "Enter" }];
      else defs = [{ label: "▸▸ weiter", key: "Enter" }];
      defs.push({ label: voiceOn ? "stimme an" : "stimme aus", key: "m", aria: "Stimme an/aus" });
      if (state !== "choose") defs.push({ label: "?", key: "?", aria: "Regeln" });
      ctx.buttons(pad, defs);
      const big = state === "choose";
      pad.classList.toggle("pl-choose", big);
      if (big){ pad.children[0].classList.add("pl-br"); pad.children[1].classList.add("pl-bb"); }
      setBar();
    }

    /* ================= Ablauf ================= */

    function resetWorld(){
      group = null; cells.fill(0); kidAt = -1; glow = 0; stampEl.hidden = true; stampEl.style.top = ""; plEl.classList.remove("pl-final");
      tag.textContent = "8.100.000.000 Menschen · 1 Punkt ≈ 810.000";
      meter(0, 0, 1);
    }

    async function intro(){
      const id = ++runId; fast = false;
      sc = 0; rounds = []; mine = null; state = "story"; logEl.innerHTML = "";
      resetWorld(); setPad();
      const L = [
        [`<b>EILMELDUNG · ALLE KANÄLE · ALLE SPRACHEN</b>`, "pl-hl", "Eilmeldung."],
        [`Um 06:00 Uhr Weltzeit erhalten alle 8 Milliarden Menschen gleichzeitig dieselbe Nachricht. Vor jedem liegen zwei Pillen: eine rote und eine blaue.`],
        [`Jeder muss eine nehmen. Geheim. Niemand weiß, was die anderen wählen.`],
        [`Wählen mehr als 50 % die blaue Pille, überleben alle.`, "pl-rule", "Wählen mehr als die Hälfte die blaue Pille, überleben alle."],
        [`Sonst überleben nur die, die Rot genommen haben.`, "pl-rule"],
        [`<span class="dim">Diese Frage ging 2023 und 2026 als Umfrage viral. Hier ist es ernst – zumindest für 10.000 simulierte Punkte.</span>`, "", false],
      ];
      for (const [h, c, sp] of L) if (!await say(id, h, c || "", sp === undefined ? null : sp)) return;
      round();
    }

    async function round(){
      const id = ++runId; fast = false;
      const s = SCEN[sc];
      state = "story"; resetWorld(); setPad();
      print("");
      print(`── SZENARIO ${sc + 1}: ${s.name} ──`, "pl-case");
      if (s.id === "orig"){
        if (!await say(id, `Die Uhr läuft. Noch 60 Sekunden. Rot oder Blau?`)) return;
      } else if (s.id === "mixer"){
        if (!await say(id, `Neuer Morgen, neue Nachricht. Vor jedem Menschen steht ein riesiger Mixer.`)) return;
        if (!await say(id, `Du kannst hineinsteigen oder draußen bleiben. Steigt mehr als die Hälfte der Menschheit hinein, schaltet er sich ab – und alle überleben.`)) return;
        if (!await say(id, `Sonst läuft er an. Wer draußen bleibt, überlebt immer.`, "pl-rule")) return;
      } else if (s.id === "family"){
        kidAt = clamp(youAt + 7 * cols, 0, DOTS - 1);
        if (!await say(id, `Wieder die Pillen. Aber diesmal sitzt deine Nichte ${KID} neben dir. Sie ist sechs.`)) return;
        if (!await say(id, `Sie hat die Regeln nicht verstanden. Sie hat schon die blaue Pille genommen, weil Blau ihre Lieblingsfarbe ist.`, "warn")) return;
        if (!await say(id, `Wie ${KID} geht es weltweit Millionen Menschen. Und du?`)) return;
      } else {
        group = [{ n: "DU", you: true, c: 0 }, ...PEOPLE.map(p => ({ ...p, c: 0 }))];
        tag.textContent = "5 Menschen · 1 Punkt = 1 Mensch";
        if (!await say(id, `Letzte Runde. Nur fünf Menschen in einem Raum. Dieselbe Regel: mindestens drei von fünf müssen Blau wählen, sonst sterben die Blauen.`)) return;
        if (!await say(id, `Diesmal dürft ihr vorher reden.`)) return;
        for (const p of PEOPLE) if (!await say(id, `<span class="pl-who">${esc(p.n)}:</span> „${esc(p.say)}“`, "pl-chat", `${p.n}: ${p.say}`)) return;
      }
      state = "choose"; setPad();
      print(`<span class="dim">${ctx.touch ? "wähle:" : `[R] ${s.rL.toLowerCase()} · [B] ${s.bL.toLowerCase()}`}</span>`, "pl-ask");
    }

    function choose(c){
      if (state !== "choose") return;
      mine = c; state = "count"; setPad();
      const a = logEl.querySelector(".pl-ask:last-child"); if (a) a.remove();
      const s = SCEN[sc];
      S[c === "b" ? "blue" : "red"]++;
      const by = S.by[s.id] || (S.by[s.id] = [0, 0]); by[c === "b" ? 1 : 0]++;
      save();
      ctx.beep(c === "b" ? 523 : 330, 90);
      print(`<span class="pl-you">DU:</span> ${s.id === "mixer" ? (c === "b" ? "steigst in den Mixer." : "bleibst draußen.") : `nimmst die <b class="${c === "b" ? "pl-tb" : "pl-tr"}">${c === "b" ? "blaue" : "rote"}</b> Pille.`}`);
      if (s.id === "group") countGroup(); else countWorld();
    }

    /* Welt auszählen: Zeitzone für Zeitzone (Spalten), Regionen ticken unterschiedlich */
    async function countWorld(){
      const id = ++runId; fast = false;
      const s = SCEN[sc];
      const p = clamp(s.mu + gauss() * s.sd, 0.08, 0.92);
      const bias = []; let b = 0;
      for (let x = 0; x < cols; x++){ b = b * 0.92 + gauss() * 0.035; bias.push(b); }
      const mean = bias.reduce((a, v) => a + v, 0) / cols;
      const want = new Uint8Array(DOTS);
      for (let i = 0; i < DOTS; i++) want[i] = Math.random() < clamp(p + bias[i % cols] - mean, 0.01, 0.99) ? 2 : 1;
      want[youAt] = mine === "b" ? 2 : 1;
      if (kidAt >= 0) want[kidAt] = 2;
      let red = 0, blue = 0;
      const T = 5200, t0 = performance.now();
      tag.textContent = "Auszählung läuft · Zeitzone für Zeitzone";
      print(`<span class="dim">Auszählung beginnt …</span>`);
      let x = 0;
      while (x < cols){
        if (!ok(id)) return;
        const k = fast ? cols : Math.floor(clamp((performance.now() - t0) / T, 0, 1) ** 1.15 * cols);
        for (; x < Math.max(k, x + (fast ? cols : 0)) && x < cols; x++){
          for (let y = 0; y < rows; y++){ const i = y * cols + x; if (i >= DOTS) continue; cells[i] = want[i]; if (want[i] === 2) blue++; else red++; }
        }
        meter(red, blue, DOTS);
        if (x % 6 === 0) ctx.beep(blue > red ? 700 : 420, 8, "square", 0.008);
        if (x < cols) await ctx.sleep(30);
      }
      const share = blue / (red + blue);
      const win = share > 0.5;
      meter(red, blue, DOTS, "endergebnis");
      if (!await wait(id, 500)) return;
      // Ergebnis
      stampEl.hidden = false;
      if (win){
        stampEl.className = "pl-stamp ok"; stampEl.textContent = "ALLE LEBEN";
        glow = 0.6; ctx.beep(660, 90); ctx.after(100, () => ctx.beep(990, 160));
      } else {
        stampEl.className = "pl-stamp err"; stampEl.textContent = `${mrd(share * WORLD)} TOT`;
        for (let i = 0; i < DOTS; i++) if (cells[i] === 2) cells[i] = 3;
        ctx.beep(140, 500, "sawtooth", 0.05);
      }
      const lived = mine === "r" || win;
      rounds.push({ id: s.id, c: mine, share, win, lived });
      S[lived ? "lived" : "died"]++; save();
      const B = s.id === "mixer" ? "Im Mixer" : "Blau";
      tag.textContent = `${B} ${pct(share)} · ${win ? "Mehrheit erreicht" : "Mehrheit verfehlt"}`;
      if (!await say(id, win ? `${B}: ${pct(share)}. Mehr als die Hälfte. <b>Alle 8,1 Milliarden überleben.</b>`
        : `${B}: ${pct(share)}. Zu wenig. <b>${mrd(share * WORLD)} Menschen sterben.</b>${mine === "b" ? " Du bist einer von ihnen." : ""}`, win ? "ok" : "err")) return;
      await lesson(id);
    }

    async function countGroup(){
      const id = ++runId; fast = false;
      const flip = Math.random() < 0.2;   // Petersen kippt manchmal in letzter Sekunde
      const ch = group.map(p => p.you ? mine : p.p === "you" ? mine : p.p === "r" ? (flip ? "b" : "r") : "b");
      print(`<span class="dim">Die Umschläge werden geöffnet …</span>`);
      let red = 0, blue = 0;
      for (let i = 0; i < group.length; i++){
        if (!await wait(id, 650)) return;
        group[i].c = ch[i] === "b" ? 2 : 1;
        if (ch[i] === "b") blue++; else red++;
        meter(red, blue, group.length);
        ctx.beep(ch[i] === "b" ? 640 : 380, 70);
      }
      for (let i = 0; i < group.length; i++) group[i].c = ch[i] === "b" ? 2 : 1;
      const win = blue >= 3;
      meter(red, blue, group.length, "endergebnis");
      stampEl.hidden = false; stampEl.style.top = "82%";
      if (win){ stampEl.className = "pl-stamp ok"; stampEl.textContent = "ALLE LEBEN"; ctx.beep(660, 90); ctx.after(100, () => ctx.beep(990, 160)); }
      else { stampEl.className = "pl-stamp err"; stampEl.textContent = `${blue} TOT`; group.forEach(p => { if (p.c === 2) p.c = 3; }); ctx.beep(140, 500, "sawtooth", 0.05); }
      const lived = mine === "r" || win;
      rounds.push({ id: "group", c: mine, share: blue / 5, win, lived, flip });
      S[lived ? "lived" : "died"]++; save();
      const dead = group.filter(p => p.c === 3).map(p => p.n === "DU" ? "du" : p.n);
      if (!await say(id, win ? `${blue} von 5 wählen Blau. <b>Alle fünf überleben.</b>${flip && mine === "r" ? " Herr Petersen hat in letzter Sekunde doch Blau genommen." : ""}`
        : `Nur ${blue} von 5 wählen Blau. <b>Es sterben: ${esc(dead.join(", "))}.</b>`, win ? "ok" : "err")) return;
      await lesson(id);
    }

    /* Was diese Runde zeigt */
    async function lesson(id){
      const s = SCEN[sc], r = rounds[rounds.length - 1];
      const L = [];
      if (s.id === "orig"){
        L.push(r.c === "r" ? `Du hast Rot genommen. Damit überlebst du in jedem Fall – egal was die anderen tun.`
          : r.win ? `Du hast Blau genommen und Glück gehabt. Bei unter 50 % wärst du jetzt tot.`
          : `Du hast Blau genommen. Rot hätte dich gerettet – in jedem Fall.`);
        L.push(`Merke: Mit Rot kannst du nie schlechter fahren als mit Blau. Spieltheoretiker nennen das eine schwach dominante Strategie.`);
      } else if (s.id === "mixer"){
        const o = rounds.find(x => x.id === "orig");
        L.push(`Moment. Das war exakt dasselbe Spiel. In den Mixer steigen heißt Blau, draußen bleiben heißt Rot.`);
        L.push(`Nur die Worte sind andere – und die simulierte Welt wählt ganz anders: ${o ? `${pct(o.share)} Blau bei den Pillen, ` : ""}${pct(r.share)} beim Mixer. Das ist der Framing-Effekt.`);
        L.push(`<span class="dim">Bei Pillen denkt man an „Leben retten“, beim Mixer an „in den Tod springen“. Die Zahlen hier sind ein Modell – aber genau diese Mixer-Fassung wurde 2023 im Netz als Gegenstück zur Pillen-Umfrage diskutiert.</span>`);
      } else if (s.id === "family"){
        L.push(r.win ? `${KID} lebt. ${r.c === "r" ? "Aber nur, weil genug andere Blau gewählt haben." : "Du hast mitgeholfen."}`
          : `${KID} hat nicht überlebt.${r.c === "b" ? " Du auch nicht." : ""}`);
        L.push(`Jetzt hat Rot einen Preis. Irgendwer wählt immer Blau: Kinder, Verwirrte, Mitfühlende. Sind dir diese Menschen nicht egal, ist Rot nicht mehr dominant.`);
        L.push(`Dann wird es ein Koordinationsspiel: Gut geht es, wenn genug Menschen dasselbe erwarten und tun.`);
      } else {
        L.push(`Hier war deine Stimme entscheidend: Aylin und Jonas wählen sicher Blau, Lea macht, was du machst. Mit Blau rettest du zwei Leben – ohne eigenes Risiko.`);
        L.push(`Reden hilft beim Koordinieren. Bei 8 Milliarden Menschen ist deine Stimme dagegen praktisch nie die, die kippt.`);
      }
      for (const h of L) if (!await say(id, h)) return;
      state = "next"; setPad();
      print(`<span class="dim">${ctx.touch ? "" : "[ENTER] "}${sc + 1 < SCEN.length ? "nächstes Szenario" : "zur Auflösung"}</span>`);
    }

    /* ================= Auflösung ================= */

    async function finish(){
      const id = ++runId; fast = false;
      state = "story"; setPad();
      S.games++; save();
      resetWorld();
      plEl.classList.add("pl-final");   // Welt weg, Platz für den Text
      // deine Runden als Mini-Bilanz
      const lines = rounds.map((r, i) => `  ${String(i + 1)}. ${SCEN[i].name.padEnd(14)} ${r.c === "b" ? "BLAU" : "ROT "}  Blau ${pct(r.share).padStart(7)}  ${r.lived ? "überlebt" : "tot"}`);
      print("");
      print(`── AUFLÖSUNG ──`, "pl-case");
      print(`<div class="pl-box">${esc(lines.join("\n"))}</div>`);
      const L = [
        [`<b>Rot</b> ist die sichere Wahl: Wer Rot nimmt, überlebt immer. Würden alle Rot nehmen, stürbe niemand. Das ist ein Gleichgewicht.`],
        [`<b>Blau</b> funktioniert nur, wenn mehr als die Hälfte mitzieht. Das ist das zweite Gleichgewicht: alle leben, auch die Verwirrten.`],
        [`Welches eintritt, entscheiden Erwartungen. Und die hängen an der Formulierung: Pille oder Mixer.`],
        [`<b class="warn">Prof. Christian Rieck</b>, Spieltheoretiker aus Frankfurt, hat das Spiel im April 2026 in seinem YouTube-Video „${esc(RIECK.title)}“ analysiert.`, "",
          `Professor Christian Rieck, Spieltheoretiker aus Frankfurt, hat das Spiel im April 2026 in seinem YouTube-Video analysiert: Rot-blau-Spiel. Retten Sie die Menschheit?`],
        [`In seinem Diskussionspapier „Das Rot-Blau-Spiel: Sicher überleben oder gemeinsam überleben?“ zeigt er: Unter manchen Bedingungen hat das Spiel eine schwach dominante Strategie und nur ein plausibles Gleichgewicht – unter anderen wird es zum Koordinationsspiel.`, "",
          `In seinem Diskussionspapier zeigt er: Unter manchen Bedingungen hat das Spiel eine schwach dominante Strategie und nur ein plausibles Gleichgewicht. Unter anderen wird es zum Koordinationsspiel.`],
        [`In seiner Umfrage mit mehreren tausend Teilnehmern wechselten viele unter bestimmten Bedingungen von Rot zu Blau. Sie behandeln das Spiel also nicht so, als wäre Rot einfach überlegen. Männer und Frauen, Linke und Rechte entschieden dabei deutlich unterschiedlich.`],
        [`<span class="dim">Echte Umfragen: 2023 auf X (Pillen) 64,9 % Blau bei 68.774 Stimmen · 2026 bei Tim Urban (Knöpfe) 57,9 % Blau bei über 95.000 Stimmen.</span>`, "", false],
      ];
      for (const [h, c, sp] of L) if (!await say(id, h, c || "", sp === undefined ? null : sp)) return;
      const tot = S.red + S.blue;
      print(`<div class="pl-box pl-src">Quelle: Prof. Dr. Christian Rieck · <a href="${RIECK.url}" target="_blank" rel="noopener">▶ „${esc(RIECK.title)}“</a> (YouTube, April 2026)</div>`);
      print(`<span class="dim">Deine Wahlen insgesamt: ${S.red}× Rot · ${S.blue}× Blau (${tot ? Math.round(S.blue / tot * 100) : 0} % Blau) · ${S.lived}× überlebt · ${S.died}× tot · ${S.games} ${S.games === 1 ? "Durchgang" : "Durchgänge"}</span>`);
      const by = id2 => { const v = S.by[id2] || [0, 0]; return v[0] + v[1] ? `${Math.round(v[1] / (v[0] + v[1]) * 100)} %` : "–"; };
      print(`<span class="dim">Blau-Quote je Szenario: Pillen ${by("orig")} · Mixer ${by("mixer")} · ${KID} ${by("family")} · Raum 5 ${by("group")}</span>`);
      if (!await say(id, `Ende der Übertragung.`, "pl-hl")) return;
      state = "end"; setPad();
      print(`<span class="dim">${ctx.touch ? "" : "[ENTER] nochmal · [ESC] Ende"}</span>`);
    }

    /* ================= Regeln ================= */

    function rules(){
      ov.hidden = false;
      ov.innerHTML = `<div class="pl-rules">
<p><b>DAS ROT/BLAU-DILEMMA</b></p>
<p>Alle wählen geheim. <b class="pl-tb">Mehr als 50 % Blau</b>: alle überleben. Sonst überleben nur die <b class="pl-tr">Roten</b>.</p>
<pre class="pl-mx">               │ Blau &gt; 50 % │ Blau ≤ 50 %
───────────────┼─────────────┼────────────
du wählst Rot  │    <span class="ok">lebst</span>    │   <span class="ok">lebst</span>
du wählst Blau │    <span class="ok">lebst</span>    │   <span class="err">tot</span></pre>
<p>Die Welt ist simuliert: 10.000 Punkte, ihr Wahlverhalten kommt aus einem Modell,
gestreut um echte Umfragewerte – je nach Formulierung.</p>
<p class="dim">${ctx.touch ? "" : "R = rot · B = blau · M = Stimme an/aus · ENTER = weiter/überspringen · ESC = Ende<br>"}${ctx.touch ? "tippen" : "beliebige Taste"} = schließen</p></div>`;
    }
    ov.addEventListener("pointerdown", e => { e.preventDefault(); ov.hidden = true; });

    function toggleVoice(){
      voiceOn = !voiceOn; ctx.store.set("pille.voice", voiceOn);
      if (!voiceOn) hush();
      setPad();
    }

    intro();

    return {
      stop(){ runId++; hush(); },
      escape(){ if (!ov.hidden){ ov.hidden = true; return true; } hush(); return false; },
      key(e){
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!ov.hidden){ ov.hidden = true; return true; }
        if (k === "Escape"){ if (!this.escape()) ctx.exit(); return true; }
        if (k === "?" || k === "h"){ rules(); return true; }
        if (k === "m"){ toggleVoice(); return true; }
        if (state === "choose"){
          if (k === "r" || k === "1"){ choose("r"); return true; }
          if (k === "b" || k === "2"){ choose("b"); return true; }
        }
        if (k === "Enter" || k === " "){
          if (state === "story" || state === "count"){ fast = true; hush(); return true; }
          if (state === "next"){ sc++; if (sc < SCEN.length) round(); else finish(); return true; }
          if (state === "end"){ intro(); return true; }
          return true;
        }
        return false;
      },
    };
  },
});
