/* fixit — Hommage an das Arcade-Spiel aus „Ralph reicht's“ (Fix-It Felix Jr.),
   aber mit eigenen Figuren, eigener Pixelgrafik und eigenem Code:
   Flick-Fritz flickt mit seinem goldenen Hammer die Fenster, die Abriss-Atze
   vom Dach aus zertrümmert. Ein Level, 90 Sekunden.
   Stufen: leicht (keine Hindernisse, wenige langsame Ziegel, 120 s, 5 Leben),
   normal (das Original), schwer (75 s, schnellere Ziegel, mehr Würfe).
   Wechsel auf Titel und Ergebnis mit ← → / L oder Antippen der Stufe.
   Gezeichnet wird in 160×208 echten Pixeln, dann ganzzahlig hochskaliert (sonst
   "sharp bilinear"), darüber Scanlines und etwas Leuchten wie auf einer Röhre. */

OE.register({
  id: "fixit",
  alias: ["felix", "ralph"],
  title: "fixit.exe",
  desc: "Fenster flicken, Ziegeln ausweichen (Hommage an Fix-It Felix Jr.).",
  demo: true,
  start(ctx){
    const { bar, body, pad } = ctx.layout();
    body.innerHTML = `<canvas class="app-canvas fx-canvas" style="touch-action:none"></canvas>`;
    const cv = body.querySelector("canvas"), g = cv.getContext("2d");

    /* ---------- Spielfeld ---------- */
    const LW = 160, LH = 208, COLS = 5, FLOORS = 3;
    /* Stufen: time/lives, dm = Schläge je Fenster, obst = Blumenkästen und Markisen,
       bv = Fallgeschwindigkeit, drop/drum = Faktor auf die Pausen, rain = Spalten beim
       Wutanfall, again = Doppelwurf, rebreak = wie oft er Geflicktes zerdeppert, run = Lauftempo */
    const CFG = {
      leicht: { time: 120, lives: 5, dm: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], obst: false, bv: 46, drop: 2, drum: 1.6, rain: 1, again: 0, rebreak: 0, run: 0.7, pie: [12, 40] },
      normal: { time: 90, lives: 3, dm: [3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1], obst: true, bv: 84, drop: 1, drum: 1, rain: 3, again: .5, rebreak: 5, run: 1, pie: [22, 54] },
      schwer: { time: 75, lives: 3, dm: [3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 1], obst: true, bv: 104, drop: .7, drum: .8, rain: 3, again: .8, rebreak: 8, run: 1.25, pie: [30] },
    };
    const lv = ctx.levels();
    let CF = CFG[ctx.demo ? "normal" : lv.value], TIME = CF.time, HITS = 30;
    const bestKey = () => "fixit.best" + (CF === CFG.normal ? "" : CF === CFG.leicht ? ".leicht" : ".schwer");
    const wx = c => 28 + c * 26;              // Fenstermitte
    const FT = f => 50 + f * 46;              // Oberkante Stockwerk
    const LEDGE = f => FT(f) + 40;            // Sims = Standhöhe der Füße
    const ROOF = 44;
    const DOOR = { c: 2, f: 2 };
    // Hindernisse: Blumenkästen sperren den Sims zwischen Spalte b und b+1,
    // Markisen den Sprung zwischen Stock f-1 und f in Spalte c
    // leicht: keine Hindernisse (siehe obstacles())
    let POTS = [], AWN = [];
    const obstacles = () => {
      POTS = CF.obst ? [{ f: 0, b: 1 }, { f: 1, b: 3 }, { f: 2, b: 0 }] : [];
      AWN = CF.obst ? [{ f: 1, c: 1 }, { f: 2, c: 4 }] : [];
    };
    obstacles();
    const blockedH = (f, a, c) => POTS.some(p => p.f === f && p.b === Math.min(a, c));
    const blockedV = (c, a, f) => AWN.some(w => w.c === c && w.f === Math.max(a, f));
    const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

    /* ---------- Hilfen ---------- */
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const seeded = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pad6 = n => String(Math.max(0, Math.floor(n))).padStart(6, "0");

    const buf = mk(LW, LH), b = buf.getContext("2d");
    const R = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); };

    // Sprite aus Zeichen-Zeilen: jedes Zeichen ist eine Farbe der Palette, "." ist durchsichtig
    function spr(rows, pal){
      const c = mk(rows[0].length, rows.length), x = c.getContext("2d");
      rows.forEach((r, y) => { for (let i = 0; i < r.length; i++){ const col = pal[r[i]]; if (col){ x.fillStyle = col; x.fillRect(i, y, 1, 1); } } });
      return c;
    }
    function flipH(s){ const c = mk(s.width, s.height), x = c.getContext("2d"); x.translate(s.width, 0); x.scale(-1, 1); x.drawImage(s, 0, 0); return c; }
    function rot90(s){ const c = mk(s.height, s.width), x = c.getContext("2d"); x.translate(s.height, 0); x.rotate(Math.PI / 2); x.drawImage(s, 0, 0); return c; }
    function tint(s, col){ const c = mk(s.width, s.height), x = c.getContext("2d"); x.drawImage(s, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; }

    /* ---------- 5×7-Pixelschrift (eigene) ---------- */
    const FONT = {
      A:"0e11111f111111", B:"1e11111e11111e", C:"0e11101010110e", D:"1e11111111111e", E:"1f10101e10101f",
      F:"1f10101e101010", G:"0e11101711110f", H:"1111111f111111", I:"0e04040404040e", J:"0702020202120c",
      K:"11121418141211", L:"1010101010101f", M:"111b1515111111", N:"11111915131111", O:"0e11111111110e",
      P:"1e11111e101010", Q:"0e11111115120d", R:"1e11111e141211", S:"0f10100e01011e", T:"1f040404040404",
      U:"1111111111110e", V:"11111111110a04", W:"1111111515150a", X:"11110a040a1111", Y:"1111110a040404",
      Z:"1f01020408101f", "0":"0e11131519110e", "1":"040c040404040e", "2":"0e11010204081f", "3":"1f02040201110e",
      "4":"02060a121f0202", "5":"1f101e0101110e", "6":"0608101e11110e", "7":"1f010204080808", "8":"0e11110e11110e",
      "9":"0e11110f01020c", " ":"00000000000000", "-":"0000000e000000", ".":"00000000000c0c", ",":"000000000c0408",
      "!":"04040404040004", ":":"000c0c000c0c00", "?":"0e110102040004", "'":"04040800000000", "/":"01010204081010",
      "Ä":"0a000e111f1111", "Ö":"0a000e1111110e", "Ü":"0a00111111110e", "×":"00110a040a1100",
      "+":"0004041f040400", "=":"00001f001f0000", "←":"0004081f080400", "→":"0004021f020400", "↑":"040e1504040400",
      "↓":"00040404150e04", "*":"00150e1f0e1500", "(":"02040808080402", ")":"08040202020408",
    };
    const GLY = {};
    for (const k in FONT) GLY[k] = Array.from({ length: 7 }, (_, i) => parseInt(FONT[k].substr(i * 2, 2), 16));
    const tcache = new Map();
    // col: Farbe oder Liste mit einer Farbe je Glyphen-Zeile (Verlauf)
    function textImg(str, col, sc){
      const key = str + "|" + col + "|" + sc;
      let c = tcache.get(key);
      if (c) return c;
      if (tcache.size > 400) tcache.clear();
      const w = Math.max(1, str.length * 6 - 1);
      c = mk(w * sc + 1, 7 * sc + 1);
      const x = c.getContext("2d");
      for (const pass of [0, 1]){
        [...str].forEach((ch, i) => {
          const gl = GLY[ch] || GLY[" "];
          for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++){
            if (!(gl[r] >> (4 - k) & 1)) continue;
            x.fillStyle = pass ? (Array.isArray(col) ? col[r] : col) : "#12061a";
            x.fillRect((i * 6 + k) * sc + (pass ? 0 : 1), r * sc + (pass ? 0 : 1), sc, sc);   // erst Schatten, dann Schrift
          }
        });
      }
      tcache.set(key, c);
      return c;
    }
    function text(str, x, y, col, { sc = 1, align = "left" } = {}){
      str = String(str).toUpperCase();
      const c = textImg(str, col, sc), w = c.width - 1;
      const dx = align === "center" ? x - Math.floor(w / 2) : align === "right" ? x - w : x;
      b.drawImage(c, dx, y);
    }
    const GOLD = ["#fff6b0", "#ffe45a", "#ffd23c", "#ffb22c", "#ff922a", "#f06a24", "#d8481e"];
    const REDG = ["#ffb0a0", "#ff7a6a", "#ff5a4a", "#f03a3a", "#d82a3a", "#b81e36", "#901830"];

    /* ---------- Sprites ---------- */
    const K = "#1a0f1e";
    const PF = { k: K, c: "#38c6ff", C: "#1b6fc4", h: "#6b3b16", s: "#ffcf9e", S: "#e39260", e: K, m: "#d22c44",
      w: "#f4f1ff", b: "#2c5ae6", B: "#1a338e", n: "#7c4317" };
    const TOP = [
      "...kkkkk....", "..kcccccck..", "..kCCCCCCCCk", "..khsssesk..", "..kssssSsk..", "...ksmmsk...",
      "....kssk....", "..kwwbbwwk..", ".kwwwbbwwwk.", ".ksbbbbbbsk.", "..kbbbbbbk..", "..kbBbbBbk..",
    ];
    const LEGS = {
      stand: ["..kbbkkbbk..", "..kbbk.kbbk.", ".knnnk.knnnk", ".kkkkk.kkkkk"],
      walk1: ["..kbbkkbbk..", ".kbbk..kbbk.", "knnnk...knnk", "kkkkk...kkkk"],
      walk2: ["..kbbbbbbk..", "...kbbbbk...", "...knnnnk...", "...kkkkkk..."],
      jump:  ["..kbbkkbbk..", ".knnk..knnk.", ".kkk....kkk.", "............"],
    };
    const FR = {};
    for (const k in LEGS){
      const s = spr([...TOP, ...LEGS[k]], PF);
      FR[k] = [s, flipH(s)];
      FR[k + "W"] = [tint(s, "#ffffff"), flipH(tint(s, "#ffffff"))];
      FR[k + "G"] = [tint(s, "#ffd23c"), flipH(tint(s, "#ffd23c"))];
    }
    const LIE = rot90(FR.stand[0]);
    const PH = { k: K, G: "#b07a0c", g: "#ffd23c", y: "#fff4a8" };
    const HAM_D = spr(["..k..", ".kGk.", ".kGk.", ".kGk.", "kkkkk", "kyygk", "kgggk", "kkkkk"], PH);
    const HAM_U = spr(["kkkkk", "kyygk", "kgggk", "kkkkk", ".kGk.", ".kGk.", ".kGk.", "..k.."], PH);
    const HAM_S = spr(["....kkkk", "kkkkkyyk", "kGGGkggk", "kkkkkggk", "....kkkk"], PH);
    const HAM = { d: [HAM_D, flipH(HAM_D)], u: [HAM_U, flipH(HAM_U)], s: [HAM_S, flipH(HAM_S)] };

    const PR = { k: K, H: "#2a1810", s: "#f0a46e", S: "#c8784e", w: "#ffffff", r: "#6a0e1c" };
    const HEAD = [
      "..k..k..k..k..", ".kHkkHkkHkkHk.", "kHHHHHHHHHHHHk", "kHHHHHHHHHHHHk", "kHkkkkHHkkkkHk",
      "kswwkkSSkkwwsk", "ksswksssskwssk", "kssssSSSSssssk",
    ];
    const HEAD_N = spr([...HEAD, "ksskkkkkkkkssk", "kssssssssssssk", ".kssssssssssk.", "..kkkkkkkkkk.."], PR);
    const HEAD_R = spr([...HEAD, "kssrrrrrrrrssk", "ksrwwwwwwwwrsk", ".ksrrrrrrrrsk.", "..kkkkkkkkkk.."], PR);
    const FIST = spr([".kkkkkk.", "kssssssk", "ksSsSsSk", "kssssssk", "kssssssk", "kSssssSk", ".kSSSSk.", "..kkkk.."], PR);
    const RC = { skin: "#f0a46e", tank: "#4c9a3c", tankD: "#2f6a26", pants: "#5a3a22", pantsD: "#3e2614", boot: "#2a1a14", gold: "#ffd23c" };

    const PB = { k: "#2a0e0c", r: "#c94a36", R: "#8e2c20", l: "#e8735a" };
    const BRICK_H = spr(["kkkkkkk", "klllrrk", "krrrRRk", "kkkkkkk"], PB);
    const BRICK_V = rot90(BRICK_H);
    const PIE = spr(["..kkkkk..", ".kcCcCck.", "kcrcrcrck", "kccccccck", "kCCCCCCCk", ".kkkkkkk."],
      { k: K, c: "#eab466", C: "#a8642a", r: "#e0304e" });
    const POT = spr(["..f...f.", ".fyf.fyf", "..fl.lf.", ".lLllLl.", "kkkkkkkk", "kooooook", ".kOOOOk.", ".kooook.", "..kkkk.."],
      { f: "#ff5aa8", y: "#ffe14a", l: "#3cc04c", L: "#1f7a2c", k: K, o: "#d4632c", O: "#94401a" });
    const MEDAL = spr([".kBBkRRk.", ".kBBkRRk.", "..kBkRk..", "...kkk...", "..kgggk..", ".kgyyggk.", "kgyggggGk",
      "kgggyggGk", "kgggggGGk", ".kgggGGk.", "..kGGGk..", "...kkk..."],
      { k: K, B: "#2f6cff", R: "#ff3a4a", g: "#ffd23c", G: "#b07a0c", y: "#fff4a8" });
    const LIFE = spr(["..kkkk..", ".kcccck.", "kCCCCCCk", "khssesk.", ".kssssk.", "..kkkk.."], PF);
    const RES_ROWS = ["..kkkk..", ".khhhhk.", "khhhhhhk", "khsssshk", "ksessesk", "kssmmssk", ".kssssk.", "..kbbk..", ".kbbbbk.", "..kbbk..", "..k..k.."];
    const RES = [["#ffd24a", "#5aa8ff"], ["#8a4a20", "#ff7ab0"], ["#e0e0e8", "#6ad06a"], ["#3a2010", "#ffa040"], ["#d04a28", "#b080ff"]]
      .map(([h, bo]) => spr(RES_ROWS, { k: K, h, b: bo, s: "#ffd2a6", e: K, m: "#d22c44" }));

    /* ---------- Fenster ---------- */
    const CURT = ["#d84860", "#3aa8a0", "#8a5ad8", "#e08a2a", null];
    const PANES = [[2, 2], [10, 2], [2, 14], [10, 14]];   // je 6×10
    function renderWindow(w){
      const c = mk(18, 26), x = c.getContext("2d"), r = seeded(w.seed * 7 + w.dmg * 131);
      const P = (xx, yy, ww, hh, col) => { x.fillStyle = col; x.fillRect(xx, yy, ww, hh); };
      P(0, 0, 18, 26, "#2a1418"); P(1, 1, 16, 24, "#efe2c4");
      P(16, 1, 1, 24, "#b9a682"); P(1, 24, 16, 1, "#b9a682");
      const broken = new Set(), cracked = new Set();
      if (w.dmg >= 1){ broken.add(w.order[0]); cracked.add(w.order[1]); }
      if (w.dmg >= 2){ broken.add(w.order[1]); cracked.delete(w.order[1]); cracked.add(w.order[2]); }
      if (w.dmg >= 3){ broken.add(w.order[2]); broken.add(w.order[3]); cracked.clear(); }
      PANES.forEach(([px, py], i) => {
        if (broken.has(i)){
          // Loch: dunkles Zimmer, Glasreste an den Kanten
          P(px, py, 6, 10, "#140a16"); P(px, py + 7, 6, 3, "#1e1020");
          for (let k = 0; k < 6; k++){
            const a = Math.floor(r() * 4), d = Math.floor(r() * 3);
            P(px + k, py, 1, a, k % 2 ? "#a8dcff" : "#e6f7ff");
            P(px + k, py + 10 - d, 1, d, "#a8dcff");
          }
          for (let k = 0; k < 10; k++){ const a = Math.floor(r() * 2.4); if (a) P(i % 2 ? px + 6 - a : px, py + k, a, 1, "#cfeeff"); }
          return;
        }
        if (w.lit){
          P(px, py, 6, 10, "#ffd65c"); P(px, py, 6, 2, "#fff3b0"); P(px, py + 8, 6, 2, "#f2a93a");
          if (w.curtain){
            const cx = i % 2 ? px + 4 : px;
            P(cx, py, 2, 8, w.curtain); P(i % 2 ? px + 5 : px, py + 8, 1, 2, w.curtain);
            P(i % 2 ? cx : cx + 1, py, 1, 8, "rgba(0,0,0,.25)");
          }
          if (i === 0){ P(px + 3, py + 1, 1, 1, "#ffffff"); P(px + 2, py + 2, 1, 1, "#ffffff"); P(px + 1, py + 3, 1, 1, "#fffbe0"); }
        } else {
          P(px, py, 6, 10, "#25306a"); P(px, py + 7, 6, 3, "#1b2352");
          if (i === 0 || i === 3){ P(px + 3, py + 1, 1, 1, "#6a7cd0"); P(px + 2, py + 2, 1, 1, "#6a7cd0"); P(px + 1, py + 3, 1, 1, "#4a5cae"); }
        }
        if (cracked.has(i)){
          // Sprung: kleiner Zufallspfad in Weiß
          let cx = px + 1 + Math.floor(r() * 4), cy = py + 2 + Math.floor(r() * 6);
          for (let k = 0; k < 7; k++){
            P(cx, cy, 1, 1, k % 3 ? "#ffffff" : "#bfe8ff");
            cx = Math.max(px, Math.min(px + 5, cx + (r() < .5 ? -1 : 1)));
            cy = Math.max(py, Math.min(py + 9, cy + (r() < .7 ? 1 : -1)));
          }
        }
      });
      if (w.dmg >= 3){   // Sprossen angeknackst
        P(8, 3 + Math.floor(r() * 6), 2, 3, "#2a1418");
        P(3 + Math.floor(r() * 9), 12, 3, 2, "#2a1418");
        P(1, 16 + Math.floor(r() * 6), 1, 3, "#2a1418");
      }
      return c;
    }

    /* ---------- Hintergrund (einmal vorgezeichnet) ---------- */
    const STARS = [], TWINKLE = [];
    const bg = mk(LW, LH), fg = mk(LW, LH);
    function renderBG(){
      const x = bg.getContext("2d"), r = seeded(1982);
      const P = (xx, yy, ww, hh, col) => { x.fillStyle = col; x.fillRect(xx, yy, ww, hh); };
      // Nachthimmel in Farbbändern mit Raster-Übergängen wie auf alten Konsolen
      const BANDS = [[0, "#0b0726"], [26, "#120a35"], [56, "#1c0f46"], [96, "#291556"], [136, "#3a1c62"], [166, "#4e2468"]];
      for (let y = 0; y < 188; y++){
        let i = 0; while (i + 1 < BANDS.length && y >= BANDS[i + 1][0]) i++;
        P(0, y, LW, 1, BANDS[i][1]);
        const nx = BANDS[i + 1];
        if (nx && nx[0] - y <= 4) for (let xx = (y % 2); xx < LW; xx += nx[0] - y <= 2 ? 1 + (y % 2) : 2) P(xx, y, 1, 1, nx[1]);
      }
      for (let i = 0; i < 46; i++){
        const sx = Math.floor(r() * LW), sy = 10 + Math.floor(r() * 120);
        if (sx > 10 && sx < 150 && sy > 40) continue;
        (r() < .25 ? TWINKLE : STARS).push([sx, sy]);
      }
      for (const [sx, sy] of STARS) P(sx, sy, 1, 1, r() < .5 ? "#cfc8ff" : "#8a80c8");
      // Mond
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++){
        const d = dx * dx + dy * dy;
        if (d <= 49) P(21 + dx, 25 + dy, 1, 1, d > 36 ? "#e8d48a" : dx + dy > 4 ? "#f0dc98" : "#fff4c4");
      }
      P(18, 22, 2, 2, "#e8d48a"); P(23, 27, 3, 2, "#e8d48a"); P(19, 28, 1, 1, "#e8d48a");
      // ferne Häuser an den Seiten
      const sky = [[0, 118, 8], [5, 134, 9], [148, 110, 12], [152, 128, 8]];
      for (const [sx, sy, sw] of sky){
        P(sx, sy, sw, 188 - sy, "#1a1036");
        for (let yy = sy + 3; yy < 180; yy += 5) for (let xx = sx + 1; xx < sx + sw - 1; xx += 3) if (r() < .35) P(xx, yy, 1, 2, r() < .5 ? "#ffcf5a" : "#7a5a2a");
      }
      // Schornstein und Antenne
      P(17, 31, 10, 13, K); P(18, 32, 8, 12, "#9c3024"); P(16, 30, 12, 3, K); P(17, 30, 10, 2, "#cfbfa8");
      for (let yy = 35; yy < 44; yy += 3) P(18, yy, 8, 1, "#6e1e18");
      P(141, 22, 1, 22, "#5a5470"); P(138, 27, 7, 1, "#5a5470"); P(139, 32, 5, 1, "#5a5470"); P(137, 41, 9, 3, "#3a3450");
      // Backsteinfassade
      const BR = ["#b23a2c", "#a63428", "#bc4433", "#9c3024", "#b03a2e"];
      P(13, 50, 134, 136, "#5a1c18");
      for (let row = 0; 50 + row * 4 < 186; row++){
        const y0 = 50 + row * 4, off = row % 2 ? 4 : 0;
        for (let x0 = 13 - off; x0 < 147; x0 += 8){
          const a = Math.max(13, x0), e = Math.min(147, x0 + 7);
          if (e <= a) continue;
          const col = BR[Math.floor(r() * BR.length)];
          P(a, y0, e - a, 3, col);
          if (r() < .45) P(a, y0, e - a, 1, "#c8503c");
        }
      }
      P(13, 50, 3, 136, "rgba(0,0,0,.22)"); P(144, 50, 3, 136, "rgba(0,0,0,.3)");
      // Gesims oben (darauf steht der Riese)
      P(11, ROOF, 138, 6, K); P(12, ROOF, 136, 1, "#f4ead8"); P(12, ROOF + 1, 136, 3, "#d2c2a8");
      for (let xx = 13; xx < 147; xx += 3) P(xx, ROOF + 4, 2, 1, "#8a7660");
      P(12, ROOF + 5, 136, 1, "#5a4636");
      // Simse unter jedem Stock
      for (let f = 0; f < FLOORS; f++){
        const y = LEDGE(f);
        P(11, y, 138, 4, "#cbbca4"); P(11, y, 138, 1, "#f1e6d2"); P(11, y + 3, 138, 1, "#7a6a58");
        P(13, y + 4, 134, 1, "rgba(0,0,0,.35)");
      }
      P(11, 186, 138, 2, "#4a3a36");
      // Fensternischen: Sturz oben, Bank unten
      for (let f = 0; f < FLOORS; f++) for (let c = 0; c < COLS; c++){
        if (c === DOOR.c && f === DOOR.f) continue;
        const X = wx(c), Y = FT(f);
        P(X - 10, Y + 10, 20, 28, "#3a1210");
        P(X - 11, Y + 8, 22, 3, "#d8c8ae"); P(X - 11, Y + 8, 22, 1, "#f1e6d2"); P(X - 2, Y + 7, 4, 4, "#e8dcc4"); P(X - 2, Y + 7, 4, 1, K);
        P(X - 11, Y + 37, 22, 2, "#d8c8ae"); P(X - 11, Y + 38, 22, 1, "#8a7660");
      }
      // Haustür mit Steinbogen, Türfenster und Laternen
      const X = wx(DOOR.c), Y = FT(DOOR.f);
      P(X - 13, Y + 8, 26, 32, "#d8c8ae"); P(X - 13, Y + 8, 26, 1, "#f1e6d2");
      P(X - 11, Y + 11, 22, 29, K);
      P(X - 10, Y + 12, 20, 28, "#2c8a5a"); P(X - 10, Y + 12, 1, 28, "#3fae74"); P(X, Y + 12, 1, 28, "#1d5c3c");
      P(X - 8, Y + 14, 6, 7, "#ffd65c"); P(X + 2, Y + 14, 6, 7, "#ffd65c"); P(X - 8, Y + 14, 6, 1, "#fff3b0"); P(X + 2, Y + 14, 6, 1, "#fff3b0");
      P(X - 8, Y + 24, 6, 12, "#24704a"); P(X + 2, Y + 24, 6, 12, "#24704a");
      P(X - 3, Y + 27, 1, 2, "#ffd23c"); P(X + 2, Y + 27, 1, 2, "#ffd23c");
      P(X - 3, Y + 9, 6, 2, "#ffd23c");
      for (const lx of [X - 18, X + 16]){
        const gr = x.createRadialGradient(lx + 1, Y + 20, 0, lx + 1, Y + 20, 13);
        gr.addColorStop(0, "rgba(255,200,100,.35)"); gr.addColorStop(1, "rgba(255,200,100,0)");
        x.fillStyle = gr; x.fillRect(lx - 13, Y + 7, 28, 28);
        P(lx, Y + 16, 3, 1, K); P(lx - 1, Y + 17, 5, 6, K); P(lx, Y + 18, 3, 4, "#ffe680"); P(lx + 1, Y + 23, 1, 3, K);
      }
      // Gehweg und Straße, Matschpfütze links
      P(0, 188, LW, 8, "#5c5a6e"); P(0, 188, LW, 1, "#7a7890");
      for (let xx = 4; xx < LW; xx += 12) P(xx, 189, 1, 6, "#48465a");
      P(0, 195, LW, 1, "#8a8898"); P(0, 196, LW, 12, "#221f30");
      for (let xx = 0; xx < LW; xx += 2) if (r() < .3) P(xx, 197 + Math.floor(r() * 10), 1, 1, "#2c2940");
      P(30, 190, 24, 4, "#4a2e18"); P(28, 191, 28, 2, "#4a2e18"); P(33, 190, 8, 1, "#7a5432"); P(44, 192, 6, 1, "#6a4626");
      // Büsche
      for (const [bx, w] of [[0, 12], [148, 12]]){
        P(bx, 178, w, 10, "#1f5a2c");
        for (let k = 0; k < 9; k++) P(bx + Math.floor(r() * (w - 3)), 176 + Math.floor(r() * 8), 3, 3, r() < .5 ? "#2f8a3e" : "#3ea04a");
      }
      renderFG();
    }
    function renderFG(){   // Hindernisse (Vordergrund), je nach Stufe
      const y = fg.getContext("2d");
      y.clearRect(0, 0, LW, LH);
      for (const p of POTS) y.drawImage(POT, wx(p.b) + 13 - 4, LEDGE(p.f) - 9);
      for (const a of AWN){
        const ax = wx(a.c) - 12, ay = FT(a.f) + 4;
        y.fillStyle = K; y.fillRect(ax - 1, ay - 1, 26, 8);
        for (let k = 0; k < 24; k++){
          y.fillStyle = Math.floor(k / 3) % 2 ? "#f4ecdc" : "#e23a3a";
          y.fillRect(ax + k, ay, 1, 5 + (k % 3 === 1 ? 1 : 0));
        }
        y.fillStyle = "rgba(0,0,0,.25)"; y.fillRect(ax, ay + 4, 24, 1);
        y.fillStyle = "#8a7660"; y.fillRect(ax - 1, ay - 2, 26, 1);
      }
    }
    renderBG();

    /* ---------- Bildschirm: Skalierung, Scanlines, Leuchten ---------- */
    const glow = mk(LW / 2, LH / 2), gl = glow.getContext("2d");
    let S = 3, exact = true, up = null, scan = null;
    function size(){
      const dpr = window.devicePixelRatio || 1;
      const aw = body.clientWidth * dpr, ah = body.clientHeight * dpr;
      if (!aw || !ah) return;
      const fit = Math.min(aw / LW, ah / LH), n = Math.max(1, Math.floor(fit));
      exact = n / fit > 0.92 || fit < 1;        // ganzzahlig, wenn es kaum Platz kostet
      S = exact ? (fit < 1 ? fit : n) : fit;
      cv.width = Math.round(LW * S); cv.height = Math.round(LH * S);
      cv.style.width = cv.width / dpr + "px"; cv.style.height = cv.height / dpr + "px";
      // sonst "sharp bilinear": erst ganzzahlig scharf vergrößern, dann weich auf das Endmaß
      up = exact ? null : mk(LW * n, LH * n);
      if (up){ const u = up.getContext("2d"); u.imageSmoothingEnabled = false; }
      scan = mk(cv.width, cv.height);
      const s = scan.getContext("2d");
      if (S >= 2.5) for (let y = 0; y < LH; y++){
        s.fillStyle = "rgba(0,0,0,.28)"; s.fillRect(0, Math.round((y + 1) * S - Math.max(1, S / 3)), cv.width, Math.max(1, Math.round(S / 3)));
      }
      const v = s.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * .35, cv.width / 2, cv.height / 2, cv.height * .78);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.5)");
      s.fillStyle = v; s.fillRect(0, 0, cv.width, cv.height);
    }
    function present(){
      const sx = shakeT > 0 ? Math.round(rnd(-1, 1) * shakeA) : 0, sy = shakeT > 0 ? Math.round(rnd(-1, 1) * shakeA) : 0;
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
      if (up){
        const u = up.getContext("2d");
        u.drawImage(buf, 0, 0, up.width, up.height);
        g.imageSmoothingEnabled = true;
        g.drawImage(up, sx * S, sy * S, cv.width, cv.height);
      } else {
        g.imageSmoothingEnabled = false;
        g.drawImage(buf, sx * S, sy * S, cv.width, cv.height);
      }
      // Leuchten: verkleinerte Kopie weich darübergeblendet
      gl.imageSmoothingEnabled = true;
      gl.clearRect(0, 0, glow.width, glow.height);
      gl.drawImage(buf, 0, 0, glow.width, glow.height);
      g.imageSmoothingEnabled = true;
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.22;
      g.drawImage(glow, sx * S - S, sy * S - S, cv.width + 2 * S, cv.height + 2 * S);
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      if (scan) g.drawImage(scan, 0, 0);
    }

    /* ---------- Zustand ---------- */
    let state = "title", T = 0, clock = 0, paused = false;
    let windows = [], player, riese, bricks = [], parts = [], pops = [], walkers = [], roofies = [];
    let pie = null, pieAt = [], score = 0, shown = 0, lives = CF.lives, timeLeft = TIME, elapsed = 0, rebreaks = 0;
    let shakeT = 0, shakeA = 0, flashT = 0, flashC = "#fff", lastTick = 0, credit = 0, result = null, medalT = -1;
    let best = +ctx.store.get(bestKey(), 0) || 0;
    let god = false;
    // Vorführung: Intro im Zeitraffer, Fritz spielt selbst, Torte kommt früh
    const IT = ctx.demo ? 0.28 : 1;
    const clouds = [{ x: 40, y: 12, w: 22 }, { x: 110, y: 20, w: 16 }].map(c => {
      const img = mk(c.w, 6), x = img.getContext("2d");
      x.fillStyle = "#2a1858"; x.fillRect(2, 2, c.w - 4, 3); x.fillRect(5, 0, c.w / 2, 3); x.fillRect(0, 4, c.w, 2);
      x.fillStyle = "#3a2470"; x.fillRect(5, 0, c.w / 2, 1); x.fillRect(2, 2, 3, 1);
      return { ...c, img };
    });

    function newGame(){
      windows = [];
      for (let f = 0; f < FLOORS; f++) for (let c = 0; c < COLS; c++){
        if (c === DOOR.c && f === DOOR.f) continue;
        const w = { c, f, dmg: 0, goal: 0, lit: Math.random() < .7, curtain: pick(CURT), seed: Math.floor(Math.random() * 1e6),
          order: shuffle([0, 1, 2, 3]), shine: 0, pop: 0, res: Math.floor(Math.random() * RES.length), img: null };
        w.img = renderWindow(w);
        windows.push(w);
      }
      // alle 14 Fenster kaputt, normal 30 Hammerschläge insgesamt
      const dm = shuffle(CF.dm.slice());
      HITS = dm.reduce((a, v) => a + v, 0);
      shuffle(windows.slice()).slice(0, dm.length).forEach((w, i) => { w.goal = dm[i]; });
      player = { c: DOOR.c, f: DOOR.f, x: wx(DOOR.c), y: LEDGE(DOOR.f), mv: null, face: 1, swing: null, stun: 0, inv: 0, gold: 0, queue: null, bump: null, fall: null, walkT: 0 };
      riese = { x: 80, y: ROOF, tx: 80, act: "walk", t: 0, walk: 0, drumCd: 6 * CF.drum, dropCd: 2 * CF.drop, rain: [], speed: 30, vx: 0, vy: 0 };
      bricks = []; parts = []; pops = []; walkers = []; roofies = [];
      pie = null; pieAt = CF.pie.slice(); score = 0; shown = 0; lives = CF.lives; timeLeft = TIME; elapsed = 0; rebreaks = 0;
      result = null; medalT = -1; lastTick = 0;
    }
    const broken = () => windows.filter(w => w.dmg > 0).length;
    const winAt = (c, f) => windows.find(w => w.c === c && w.f === f);
    const prog = () => {
      const left = windows.reduce((s, w) => s + w.dmg, 0);
      return Math.max(1 - left / HITS, elapsed / TIME);
    };

    /* ---------- Töne (8-Bit über ctx.beep) ---------- */
    function seq(notes, step = 70, type = "square", vol = 0.045){
      notes.forEach((n, i) => { if (n) ctx.after(i * step, () => ctx.beep(n, step * 1.1, type, vol)); });
    }
    const SND = {
      coin(){ ctx.beep(988, 90, "square", .05); ctx.after(90, () => ctx.beep(1319, 320, "square", .05)); },
      pling(d){ ctx.beep([2093, 1760, 1568][d] || 2093, 60, "square", .05); ctx.after(45, () => ctx.beep(([2093, 1760, 1568][d] || 2093) * 1.5, 90, "triangle", .05)); },
      fixed(){ seq([1047, 1319, 1568, 2093], 55, "square", .045); },
      tock(){ ctx.beep(260, 30, "square", .025); },
      swing(){ ctx.beep(180, 30, "triangle", .03); },
      jump(up){ ctx.beep(up ? 440 : 520, 50, "square", .03); ctx.after(40, () => ctx.beep(up ? 660 : 390, 60, "square", .03)); },
      bump(){ ctx.beep(110, 60, "square", .035); },
      thump(){ ctx.beep(62, 110, "square", .09); ctx.beep(41, 140, "triangle", .1); },
      throwIt(){ ctx.beep(330, 40, "sawtooth", .025); },
      land(){ ctx.beep(95, 70, "triangle", .06); },
      crash(){ ctx.beep(1800, 40, "sawtooth", .03); ctx.after(30, () => ctx.beep(140, 90, "sawtooth", .05)); ctx.after(70, () => ctx.beep(2400, 50, "square", .02)); },
      hurt(){ seq([620, 480, 360, 240, 150], 55, "sawtooth", .05); },
      pie(){ seq([784, 988, 1175, 1568, 1976], 60, "square", .045); },
      tink(){ ctx.beep(2637, 50, "square", .04); },
      tick(){ ctx.beep(1200, 40, "square", .03); },
      fanfare(){ seq([784, 0, 784, 1047, 0, 988, 1047, 1319, 0, 1568, 1568, 1568], 95, "square", .05); },
      over(){ seq([523, 494, 466, 440, 0, 415, 392, 0, 330], 120, "triangle", .07); },
      medal(){ seq([1568, 2093, 2637, 3136], 70, "triangle", .05); },
      splat(){ ctx.beep(70, 220, "square", .1); ctx.beep(48, 300, "triangle", .12); },
    };

    /* ---------- Effekte ---------- */
    function burst(x, y, n, cols, { sp = 60, gr = 200, life = .6, upv = 0, size = 1 } = {}){
      for (let i = 0; i < n && parts.length < 500; i++){
        const a = Math.random() * Math.PI * 2, v = sp * (.3 + Math.random() * .7), l = life * (.5 + Math.random() * .7);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - upv, life: l, max: l, col: pick(cols), gr, size });
      }
    }
    const pop = (x, y, txt, col = "#ffffff") => pops.push({ x, y, txt, col, t: 0 });
    const shake = (t, a) => { shakeT = Math.max(shakeT, t); shakeA = Math.max(shakeT > 0 ? shakeA : 0, a); };

    /* ---------- Spieler ---------- */
    const heldDir = () => {
      const k = ctx.keys;
      if (k.has("ArrowLeft") || k.has("a")) return "left";
      if (k.has("ArrowRight") || k.has("d")) return "right";
      if (k.has("ArrowUp") || k.has("w")) return "up";
      if (k.has("ArrowDown") || k.has("s")) return "down";
      return null;
    };
    const hamHeld = () => ctx.keys.has(" ") || ctx.keys.has("x");
    const busy = () => player.mv || player.swing || player.bump || player.stun > 0;

    function act(d){
      const p = player;
      if (state !== "run" || p.fall) return;
      if (busy()){ p.queue = d; return; }
      if (d === "ham") return swing();
      const [dc, df] = DIRS[d];
      if (dc) p.face = dc;
      const nc = p.c + dc, nf = p.f + df;
      if (nc < 0 || nc >= COLS || nf < 0 || nf >= FLOORS || (dc && blockedH(p.f, p.c, nc)) || (df && blockedV(p.c, p.f, nf))){
        p.bump = { t: 0, dx: dc, dy: df }; SND.bump(); return;
      }
      p.mv = { c: nc, f: nf, x0: p.x, y0: p.y, x1: wx(nc), y1: LEDGE(nf), t: 0, dur: df ? (df < 0 ? .28 : .24) : .15, df };
      if (df) SND.jump(df < 0);
    }
    function swing(){
      player.swing = { t: 0, dur: .24, hit: false };
      SND.swing();
    }
    function strike(){
      const p = player, w = winAt(p.c, p.f);
      const hx = p.x + (p.face > 0 ? 10 : -11), hy = p.y - 11;
      if (!w || w.dmg === 0){ SND.tock(); burst(hx, hy, 3, ["#bba", "#887"], { sp: 25, life: .25 }); return; }
      w.dmg--;
      w.img = renderWindow(w);
      score += 50;
      SND.pling(w.dmg);
      burst(hx, hy, 12, ["#fff6b0", "#ffd23c", "#ffffff", "#ffb22c"], { sp: 90, gr: 160, life: .4 });
      if (w.dmg === 0){
        w.lit = true; w.img = renderWindow(w); w.shine = 1; w.pop = 1.6;
        score += 250; pop(wx(w.c), FT(w.f) + 6, "+300", "#ffe45a");
        ctx.after(120, SND.fixed);
        if (!broken()) startWin();
      } else pop(wx(w.c), FT(w.f) + 10, "+50", "#ffffff");
    }
    function hurt(br){
      const p = player;
      lives--;
      if (p.mv){ const m = p.mv; if (m.t / m.dur > .5){ p.c = m.c; p.f = m.f; } p.mv = null; p.x = wx(p.c); p.y = LEDGE(p.f); }
      p.swing = null; p.queue = null; p.bump = null;
      p.stun = 1; p.inv = 2.6;
      burst(br.x, br.y, 14, ["#c94a36", "#8e2c20", "#e8735a"], { sp: 70, gr: 260, life: .6, upv: 30 });
      shake(.35, 2); flashT = .15; flashC = "#ff2040";
      SND.hurt();
      if (lives <= 0) startOver("hit");
    }

    function updatePlayer(dt){
      const p = player;
      p.inv = Math.max(0, p.inv - dt); p.gold = Math.max(0, p.gold - dt);
      if (p.stun > 0){ p.stun -= dt; return; }
      if (p.bump){ p.bump.t += dt; if (p.bump.t >= .14) p.bump = null; }
      if (p.mv){
        const m = p.mv; m.t += dt;
        const k = Math.min(1, m.t / m.dur);
        if (!m.df){ p.x = m.x0 + (m.x1 - m.x0) * k; p.y = m.y0; p.walkT += dt; }
        else if (m.df < 0){ p.x = m.x0; p.y = m.y0 + (m.y1 - m.y0) * (1 - (1 - k) * (1 - k)) - Math.sin(Math.PI * k) * 8; }
        else { p.x = m.x0; p.y = m.y0 + (m.y1 - m.y0) * k * k - Math.sin(Math.PI * k) * 6; }
        if (k >= 1){
          p.c = m.c; p.f = m.f; p.x = m.x1; p.y = m.y1; p.mv = null;
          if (m.df){ burst(p.x, p.y, 4, ["#d2c2a8", "#a89880"], { sp: 30, gr: 60, life: .3 }); SND.land(); }
        }
      }
      if (p.swing){
        const s = p.swing; s.t += dt;
        if (!s.hit && s.t >= .11){ s.hit = true; strike(); }
        if (s.t >= s.dur) p.swing = null;
      }
      if (state === "run" && !busy()){
        const q = p.queue; p.queue = null;
        if (q) act(q);
        else if (ctx.demo){ const d = aiAct(); if (d) act(d); }
      else { const d = heldDir(); if (d) act(d); else if (hamHeld()) act("ham"); }
      }
      if (pie && !p.mv && p.c === pie.c && p.f === pie.f){
        score += 500; p.gold = 6; SND.pie();
        pop(wx(pie.c), LEDGE(pie.f) - 26, "+500", "#ffe45a");
        burst(wx(pie.c), LEDGE(pie.f) - 4, 16, ["#ffd23c", "#ffffff", "#ff7ab0"], { sp: 70, gr: 80, life: .6 });
        pie = null;
      }
    }

    /* ---------- Vorführ-KI: Ziegeln ausweichen, Torte holen, nächstes kaputtes Fenster ---------- */
    // Gefahr in Spalte c: fallender Ziegel über Kopfhöhe oder angekündigter Ziegelregen
    function danger(c){
      const X = wx(c), top = player.y - 15;
      if (player.gold > 0) return false;
      if (riese.rain.some(q => Math.abs(q.x - X) < 10 && q.t < .9)) return true;
      return bricks.some(k => !k.dead && Math.abs(k.x - X) < 10 && k.y < top + 4 && (top - k.y) < 26 + Math.max(k.vy, 30) * .55);
    }
    // Breitensuche über die Simse (Blumenkästen und Markisen sperren)
    function path(goal){
      const key = (c, f) => f * COLS + c, from = new Map([[key(player.c, player.f), null]]), q = [[player.c, player.f]];
      while (q.length){
        const [c, f] = q.shift();
        if (goal(c, f)){
          let k = key(c, f), first = null;
          while (from.get(k)){ first = from.get(k); k = first.prev; }
          return first ? first.d : "here";
        }
        for (const d of ["left", "right", "up", "down"]){
          const [dc, df] = DIRS[d], nc = c + dc, nf = f + df;
          if (nc < 0 || nc >= COLS || nf < 0 || nf >= FLOORS || from.has(key(nc, nf))) continue;
          if ((dc && blockedH(f, c, nc)) || (df && blockedV(c, f, nf))) continue;
          from.set(key(nc, nf), { prev: key(c, f), d }); q.push([nc, nf]);
        }
      }
      return null;
    }
    function aiAct(){
      const p = player;
      if (danger(p.c)){
        for (const d of shuffle(["left", "right"])){
          const nc = p.c + DIRS[d][0];
          if (nc >= 0 && nc < COLS && !blockedH(p.f, p.c, nc) && !danger(nc)) return d;
        }
        return null;
      }
      const d = pie ? path((c, f) => c === pie.c && f === pie.f) : path((c, f) => { const w = winAt(c, f); return w && w.dmg > 0; });
      if (!d) return null;
      if (d === "here") return pie ? null : "ham";
      if (DIRS[d][0] && danger(p.c + DIRS[d][0])) return null;   // lieber kurz warten
      return d;
    }

    /* ---------- Riese ---------- */
    function nextTarget(){
      const r = riese;
      const c = Math.random() < .58 ? player.c : Math.floor(Math.random() * COLS);
      r.tx = Math.max(30, Math.min(130, wx(c) + Math.round(rnd(-2, 2))));
      r.act = "walk"; r.t = 0; r.speed = (32 + 30 * prog()) * CF.run;
    }
    function spawnBrick(x, y, vy = 0){ bricks.push({ x, y, vx: 0, vy, rot: 0, dead: false }); }
    function updateRiese(dt){
      const r = riese;
      r.t += dt; r.drumCd -= dt;
      if (r.act === "walk"){
        const d = r.tx - r.x, st = r.speed * dt;
        r.walk += dt;
        if (Math.abs(d) <= st){ r.x = r.tx; r.act = "aim"; r.t = 0; }
        else r.x += Math.sign(d) * st;
        // im Laufen tritt er ab und zu einen Ziegel vom Sims
        if ((r.dropCd -= dt) <= 0){
          r.dropCd = (rnd(1.6, 2.4) - prog()) * CF.drop;
          spawnBrick(Math.round(r.x), ROOF + 4);
          burst(r.x, ROOF + 2, 5, ["#d2c2a8", "#8a7660"], { sp: 25, gr: 60, life: .35 });
        }
      } else if (r.act === "aim"){
        if (r.t >= .32 - .18 * prog()){ r.act = r.drumCd <= 0 ? "drum" : "throw"; r.t = 0; r.thrown = false; r.slam = -1; }
      } else if (r.act === "throw"){
        if (!r.thrown && r.t >= .38){ r.thrown = true; spawnBrick(r.x, ROOF - 8, 10); SND.throwIt(); }
        if (r.t >= .58){
          if (Math.random() < prog() * CF.again){ r.t = 0; r.thrown = false; }   // gern ein zweiter Wurf
          else nextTarget();
        }
      } else if (r.act === "drum"){
        const s = Math.floor(r.t * 8);
        if (s !== r.slam){ r.slam = s; SND.thump(); shake(.12, 1); burst(r.x + (s % 2 ? 9 : -9), ROOF, 3, ["#d2c2a8", "#8a7660"], { sp: 30, gr: 100, life: .35 }); }
        if (r.t >= 1.15){
          // Wutanfall: Ziegel lösen sich über drei Spalten, mit kurzem Staub als Warnung
          const c = Math.round((r.x - 28) / 26);
          (CF.rain > 1 ? [c - 1, c, c + 1] : [c]).filter(k => k >= 0 && k < COLS).forEach((k, i) => r.rain.push({ x: wx(k) + Math.round(rnd(-1, 1)), t: .35 + i * .3, dust: false }));
          // ab und zu zerdeppert er dabei ein schon geflicktes Fenster
          if (rebreaks < CF.rebreak && prog() > .25 && Math.random() < .8){
            const cand = windows.filter(w => w.dmg === 0 && !(w.c === player.c && w.f === player.f) && Math.abs(wx(w.c) - r.x) < 40);
            if (cand.length){
              const w = pick(cand); w.dmg = 1; w.img = renderWindow(w); rebreaks++;
              burst(wx(w.c), FT(w.f) + 24, 12, ["#a8dcff", "#e6f7ff", "#ffffff"], { sp: 60, gr: 300, life: .8 });
              pop(wx(w.c), FT(w.f) + 14, "KLIRR!", "#a8dcff"); SND.crash();
            }
          }
          r.drumCd = (rnd(5.5, 7.5) - 2 * prog()) * CF.drum;
          nextTarget();
        }
      }
      for (let i = r.rain.length - 1; i >= 0; i--){
        const q = r.rain[i]; q.t -= dt;
        if (!q.dust && q.t <= .3){ q.dust = true; burst(q.x, ROOF + 6, 6, ["#d2c2a8", "#8a7660", "#5a4636"], { sp: 20, gr: 40, life: .4 }); }
        if (q.t <= 0){ spawnBrick(q.x, ROOF + 6); r.rain.splice(i, 1); }
      }
    }
    function updateBricks(dt){
      const p = player;
      for (let i = bricks.length - 1; i >= 0; i--){
        const k = bricks[i];
        k.vy = Math.min(k.vy + 150 * dt, k.dead ? 220 : CF.bv); k.y += k.vy * dt; k.x += k.vx * dt; k.rot += dt;
        if (k.y > 187){
          burst(k.x, 187, 6, ["#c94a36", "#8e2c20", "#5a4636"], { sp: 40, gr: 260, life: .4, upv: 25 });
          if (k.x > 0 && k.x < LW) SND.land();
          bricks.splice(i, 1); continue;
        }
        if (k.dead || state !== "run") continue;
        if (Math.abs(k.x - p.x) < 7 && k.y + 2 > p.y - 15 && k.y - 2 < p.y - 1){
          if (p.gold > 0){
            k.dead = true; k.vx = (k.x < p.x ? -1 : 1) * 70; k.vy = -90;
            score += 100; pop(p.x, p.y - 22, "+100", "#ffd23c"); SND.tink();
          } else if (p.inv <= 0 && p.stun <= 0 && !god){ bricks.splice(i, 1); hurt(k); }
        }
      }
    }

    /* ---------- Ablauf ---------- */
    function begin(){
      if (state === "title" || (state === "result" && T > .8)){
        credit = Math.min(99, credit + 1); SND.coin();
        newGame(); state = "intro"; T = 0; riese.act = "drum"; riese.t = 0; riese.slam = -1;
        const q = shuffle(windows.filter(w => w.goal > 0));
        q.forEach((w, i) => { w.smashAt = (.3 + i * .11) * IT; });
      } else if (state === "pause") resume();
    }
    function pause(){ if (state === "run"){ state = "pause"; } }
    // Stufe wechseln: nur auf Titel und Ergebnis, danach steht wieder der Titel da
    const LVY = { title: 136, result: 167 };
    function setLevel(d = 1){
      if (ctx.demo || !(state === "title" || (state === "result" && T > .8))) return;
      const i = lv.names.indexOf(lv.value);
      CF = CFG[lv.set(lv.names[(i + d + 3) % 3])]; TIME = CF.time;
      obstacles(); renderFG();
      best = +ctx.store.get(bestKey(), 0) || 0;
      newGame(); state = "title"; T = 0;
      ctx.beep(1100 + i * 200, 40, "square", .04);
    }
    function resume(){ if (state === "pause"){ state = "run"; } }

    function startWin(){
      state = "win"; T = 0;
      const tb = Math.ceil(timeLeft) * 25, lb = lives * 500;
      result = { win: true, base: score, tb, lb, secs: Math.round(elapsed) };
      for (const k of bricks) burst(k.x, k.y, 6, ["#ffffff", "#d2c2a8"], { sp: 40, gr: 0, life: .4 });
      bricks = []; riese.rain = [];
      riese.act = "shock"; riese.t = 0;
      walkers = [0, 1, 2, 3].map(i => ({ x: wx(DOOR.c), y: LEDGE(DOOR.f), tx: [66, 98, 118, 140][i], at: .3 + i * .35, res: (i + 1) % RES.length, out: false }));
      roofies = [];
      SND.fanfare();
    }
    function startOver(reason){
      state = "over"; T = 0;
      result = { win: false, reason, base: score, tb: 0, lb: 0, secs: Math.round(elapsed) };
      if (reason === "hit") player.fall = { vy: -70 };
      riese.act = "laugh"; riese.t = 0; riese.rain = [];
      ctx.after(400, SND.over);
    }
    function finish(){
      state = "result"; T = 0;
      score = result.base + result.tb + result.lb;
      result.total = score;
      result.rec = score > best;
      if (result.rec){ best = score; ctx.store.set(bestKey(), best); }
      if (result.win) ctx.log("OK", `fixit: alle Fenster geflickt in ${result.secs} s — score <span class="num">${score}</span>${result.rec ? " <span class=\"dim\">(neuer Rekord)</span>" : ""}`);
      else ctx.log("WARN", `fixit: ${result.reason === "time" ? "Zeit abgelaufen" : "keine Leben mehr"} — ${broken()} Fenster kaputt, score <span class="num">${score}</span>`);
    }

    function update(dt){
      clock += dt; T += dt;
      shakeT = Math.max(0, shakeT - dt); if (!shakeT) shakeA = 0;
      flashT = Math.max(0, flashT - dt);
      for (const w of windows){ w.shine = Math.max(0, w.shine - dt * 1.6); w.pop = Math.max(0, w.pop - dt); }
      for (const c of clouds){ c.x += dt * 2; if (c.x > LW + 4) c.x = -c.w - 4; }
      if (state === "pause") return;

      if (state === "title"){
        // Vorführung: der Riese läuft und trommelt, wirft aber nichts
        const r = riese; r.t += dt;
        if (r.act === "walk"){ r.walk += dt; const d = r.tx - r.x; if (Math.abs(d) < 1){ r.act = Math.random() < .5 ? "drum" : "idle"; r.t = 0; r.slam = -1; } else r.x += Math.sign(d) * 22 * dt; }
        else if (r.t > (r.act === "drum" ? 1.1 : .8)){ r.act = "walk"; r.tx = wx(Math.floor(Math.random() * COLS)); r.t = 0; }
        if (r.act === "drum"){ const s = Math.floor(r.t * 8); if (s !== r.slam){ r.slam = s; burst(r.x + (s % 2 ? 9 : -9), ROOF, 2, ["#d2c2a8"], { sp: 20, gr: 80, life: .3 }); } }
      } else if (state === "intro"){
        const r = riese; r.t += dt;
        const s = Math.floor(r.t * 8);
        if (r.act === "drum" && s !== r.slam){ r.slam = s; SND.thump(); shake(.12, 1); }
        for (const w of windows){
          if (w.smashAt !== undefined && T >= w.smashAt){
            w.smashAt = undefined; w.dmg = w.goal; w.lit = Math.random() < .5; w.img = renderWindow(w);
            burst(wx(w.c), FT(w.f) + 24, 10, ["#a8dcff", "#e6f7ff", "#ffffff"], { sp: 60, gr: 300, life: .8 });
            SND.crash(); shake(.1, 1);
          }
        }
        if (T >= 2.0 * IT && r.act === "drum"){ r.act = "idle"; r.t = 0; }
        if (T >= 2.9 * IT){ state = "run"; T = 0; nextTarget(); riese.tx = wx(player.c); }
      } else if (state === "run"){
        elapsed += dt; timeLeft = Math.max(0, timeLeft - dt);
        const sec = Math.ceil(timeLeft);
        if (sec <= 10 && sec !== lastTick){ lastTick = sec; if (sec > 0) SND.tick(); }
        updatePlayer(dt); updateRiese(dt); updateBricks(dt);
        if (pieAt.length && elapsed >= pieAt[0]){
          pieAt.shift();
          const cells = [];
          for (let f = 0; f < FLOORS; f++) for (let c = 0; c < COLS; c++) if (Math.abs(c - player.c) + Math.abs(f - player.f) >= 2) cells.push({ c, f });
          pie = { ...pick(cells), t: 9 };
          burst(wx(pie.c), LEDGE(pie.f) - 4, 8, ["#ffffff", "#ffd23c"], { sp: 30, gr: 0, life: .5 });
        }
        if (pie && (pie.t -= dt) <= 0){ burst(wx(pie.c), LEDGE(pie.f) - 4, 6, ["#ffffff"], { sp: 25, gr: 0, life: .4 }); pie = null; }
        if (state === "run" && timeLeft <= 0) startOver("time");
      } else if (state === "win"){
        updateWin(dt);
      } else if (state === "over"){
        const p = player; riese.t += dt; updateBricks(dt);
        if (p.fall){ p.fall.vy += 320 * dt; p.y += p.fall.vy * dt; if (p.y >= 194){ if (!p.fall.down){ p.fall.down = true; SND.land(); shake(.2, 1); } p.y = 194; } }
        if (T >= 3) finish();
      } else if (state === "result"){
        riese.t += dt;
      }
      if (state !== "run" && state !== "over") bricks.forEach(k => { k.vy += 160 * dt; k.y += k.vy * dt; });

      shown = shown < score ? Math.min(score, shown + Math.max(1, Math.ceil((score - shown) * dt * 6))) : score;
      for (let i = parts.length - 1; i >= 0; i--){
        const q = parts[i]; q.life -= dt;
        if (q.life <= 0){ parts.splice(i, 1); continue; }
        q.vy += q.gr * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .98;
      }
      for (let i = pops.length - 1; i >= 0; i--){ const q = pops[i]; q.t += dt; q.y -= 14 * dt; if (q.t > 1) pops.splice(i, 1); }
    }

    /* Siegesfeier: Bewohner kommen raus, zwei heben den Riesen hoch und werfen ihn in den Matsch */
    function updateWin(dt){
      const r = riese, p = player;
      r.t += dt;
      updatePlayer(dt);
      for (const w of walkers){
        if (T < w.at) continue;
        if (!w.out){ w.out = true; ctx.beep(1320, 40, "square", .03); }
        if (w.y < 194){ w.y = Math.min(194, w.y + 40 * dt); }
        else if (Math.abs(w.tx - w.x) > 1) w.x += Math.sign(w.tx - w.x) * 40 * dt;
        else w.cheer = true;
        if (w.y < 194) w.x += Math.sign(w.tx - w.x) * 20 * dt;
      }
      if (T >= 1.9 && !roofies.length){
        roofies = [{ dx: -14, res: 0 }, { dx: 13, res: 4 }];
        for (const q of roofies) burst(r.x + q.dx, ROOF - 6, 10, ["#ffffff", "#ffd23c"], { sp: 40, gr: 0, life: .4 });
        ctx.beep(1760, 60, "square", .04);
      }
      if (T >= 2.3 && T < 3.1){ r.act = "lifted"; r.y = ROOF - Math.min(1, (T - 2.3) / .5) * 8; }
      if (T >= 3.1 && r.act === "lifted"){
        r.act = "fly"; r.t = 0; r.x0 = r.x; r.y0 = r.y;
        r.vx = (42 - r.x) / 1.45; r.vy = -60;
        seq([1568, 1397, 1175, 988, 784, 659, 523, 392], 90, "square", .04);
      }
      if (r.act === "fly"){
        r.vy += 230 * dt; r.x += r.vx * dt; r.y += r.vy * dt;
        if (r.y >= 199){
          r.y = 199; r.act = "mud"; r.t = 0;
          SND.splat(); shake(.6, 3);
          burst(r.x, 193, 30, ["#4a2e18", "#7a5432", "#6a4626", "#2a1a10"], { sp: 110, gr: 300, life: .9, upv: 70, size: 2 });
          medalT = 0;
        }
      }
      if (medalT >= 0){
        const was = medalT; medalT += dt;
        if (was < .9 && medalT >= .9){ SND.medal(); burst(p.x, p.y - 12, 16, ["#ffd23c", "#fff6b0", "#ffffff"], { sp: 70, gr: 40, life: .7 }); }
      }
      // Feuerwerk über dem Dach
      if (T > .4 && T < 7 && Math.random() < dt * 2.2){
        const fx = rnd(20, 140), fy = rnd(10, 34);
        burst(fx, fy, 18, pick([["#ff5aa8", "#ffffff"], ["#5ae8ff", "#ffffff"], ["#ffe45a", "#ff922a"], ["#6ad06a", "#ffffff"]]), { sp: 50, gr: 30, life: .8 });
        ctx.beep(rnd(900, 1400), 40, "triangle", .02);
      }
      if (T >= 7.4) finish();
    }

    /* ---------- Zeichnen ---------- */
    function line(ax, ay, bx2, by, rad, col){
      const n = Math.max(1, Math.abs(bx2 - ax), Math.abs(by - ay));
      b.fillStyle = col;
      for (let i = 0; i <= n; i++) b.fillRect(Math.round(ax + (bx2 - ax) * i / n) - rad, Math.round(ay + (by - ay) * i / n) - rad, rad * 2, rad * 2);
    }
    function riesePose(r){
      const t = r.t, mir = v => [-v[0] - 1, v[1]];
      switch (r.act){
        case "walk": { const ph = Math.floor(r.walk * 6) % 2; return { l: [-13, -8 + ph], r: [12, -9 + ph], step: ph ? 1 : -1 }; }
        case "drum": { const d = Math.floor(t * 8) % 2, upP = [-11, -31], dn = [-9, -3]; return { l: d ? upP : dn, r: mir(d ? dn : upP), roar: true }; }
        case "throw": return t < .38 ? { l: [-5, -34], r: [4, -34], brick: true, roar: false } : { l: [-6, -12], r: [5, -12], roar: true };
        case "laugh": { const s = Math.floor(t * 7) % 2; return { l: [-7, -12 + s], r: [6, -12 + s], roar: s === 0, hop: s }; }
        case "lifted": case "fly": { const s = Math.round(Math.sin(t * 20) * 3); return { l: [-13, -27 + s], r: [12, -27 - s], roar: true }; }
        case "mud": return { l: [-15, -14 + Math.round(Math.sin(t * 3))], r: [14, -14 - Math.round(Math.sin(t * 3))], roar: false };
        case "shock": return { l: [-12, -20], r: [11, -20], roar: true };
        default: return { l: [-13, -8], r: [12, -8] };
      }
    }
    function drawRiese(){
      const r = riese, P = riesePose(r);
      const x = Math.round(r.x), fy = Math.round(r.y) - (P.hop || 0), top = fy - 19;
      if (r.act === "mud"){ b.save(); b.beginPath(); b.rect(0, 0, LW, 194); b.clip(); }
      const lu = P.step === 1 ? 1 : 0, ru = P.step === -1 ? 1 : 0;
      R(x - 8, fy - 8 - lu, 7, 8, K); R(x + 1, fy - 8 - ru, 7, 8, K);
      R(x - 7, fy - 7 - lu, 5, 6, RC.pants); R(x + 2, fy - 7 - ru, 5, 6, RC.pants);
      R(x - 7, fy - 7 - lu, 1, 6, RC.pantsD); R(x + 6, fy - 7 - ru, 1, 6, RC.pantsD);
      R(x - 7, fy - 2 - lu, 5, 1, RC.boot); R(x + 2, fy - 2 - ru, 5, 1, RC.boot);
      const sh = [[x - 8, top + 3], [x + 7, top + 3]], fe = [[x + P.l[0], fy + P.l[1]], [x + P.r[0], fy + P.r[1]]];
      for (let i = 0; i < 2; i++) line(sh[i][0], sh[i][1], fe[i][0], fe[i][1], 3, K);
      R(x - 10, top - 1, 20, 14, K);
      R(x - 9, top, 18, 5, RC.skin);
      R(x - 6, top + 1, 12, 11, RC.tank); R(x - 6, top + 1, 2, 11, RC.tankD); R(x + 4, top + 1, 2, 11, RC.tankD);
      R(x - 2, top, 4, 2, RC.skin);
      R(x - 2, top + 4, 4, 4, RC.tankD); R(x - 1, top + 3, 2, 1, RC.tankD);     // Abrissbirne als Aufdruck
      R(x - 9, top + 10, 18, 2, RC.boot); R(x - 1, top + 10, 2, 2, RC.gold);
      for (let i = 0; i < 2; i++) line(sh[i][0], sh[i][1], fe[i][0], fe[i][1], 2, RC.skin);
      b.drawImage(P.roar ? HEAD_R : HEAD_N, x - 7, top - 11);
      for (let i = 0; i < 2; i++) b.drawImage(FIST, fe[i][0] - 4, fe[i][1] - 4);
      if (P.brick) b.drawImage(BRICK_H, x - 4, fy - 42);
      if (r.act === "mud"){
        b.restore();
        for (let i = 0; i < 3; i++){ const a = r.t * 4 + i * 2.1; R(Math.round(x + Math.cos(a) * 9), Math.round(top - 13 + Math.sin(a) * 2), 1, 1, "#ffe45a"); }
        R(x - 12, 193, 24, 2, "#4a2e18"); R(x - 9, 192, 18, 1, "#6a4626");
      }
    }
    function drawPlayer(){
      const p = player;
      if (!p) return;
      let x = Math.round(p.x), y = Math.round(p.y);
      if (p.bump){ const k = Math.sin(Math.PI * p.bump.t / .14) * 2; x += Math.round(p.bump.dx * k); y += Math.round(p.bump.dy * k); }
      if (state === "win" && medalT > .9) y -= Math.round(Math.abs(Math.sin(T * 7)) * 4);
      const fl = p.face > 0 ? 0 : 1;
      if (p.fall && p.fall.down){ b.drawImage(LIE, x - 8, y - 12); stars(x, y - 13); return; }
      if (p.inv > 0 && p.stun <= 0 && Math.floor(clock * 14) % 2 && state === "run") return;   // Blinken nach Treffer
      let fr = "stand";
      if (p.fall) fr = "jump";
      else if (p.mv) fr = p.mv.df ? "jump" : (Math.floor(p.mv.t / p.mv.dur * 2) % 2 ? "walk2" : "walk1");
      let suf = "";
      if (p.gold > 0 && Math.floor(clock * 10) % 2 && (p.gold > 1.5 || Math.floor(clock * 20) % 2)) suf = "G";
      if (p.stun > 0 && Math.floor(clock * 16) % 2) suf = "W";
      b.drawImage(FR[fr + suf][fl], x - 6, y - 16);
      // goldener Hammer
      const H = (img, dx, dy, w) => b.drawImage(img[fl], fl ? x - dx - w : x + dx, y + dy);
      if (p.swing){ if (p.swing.t < .11) H(HAM.u, -1, -25, 5); else H(HAM.s, 3, -13, 8); }
      else if (!p.fall) H(HAM.d, 3, -9, 5);
      if (p.stun > 0) stars(x, y - 17);
      if (state === "win" && medalT >= 0){
        const k = Math.min(1, medalT / .9);
        b.drawImage(MEDAL, x - 4, Math.round(y - 46 + k * 36));
      }
    }
    function stars(x, y){
      for (let i = 0; i < 3; i++){
        const a = clock * 6 + i * 2.1;
        R(Math.round(x + Math.cos(a) * 6), Math.round(y + Math.sin(a) * 2), 1, 1, i ? "#ffe45a" : "#ffffff");
      }
    }
    function drawWorld(){
      b.drawImage(bg, 0, 0);
      for (const c of clouds) b.drawImage(c.img, Math.round(c.x), c.y);
      TWINKLE.forEach(([sx, sy], i) => { const v = Math.sin(clock * 2.2 + i * 1.7); if (v > -.3) R(sx, sy, 1, 1, v > .6 ? "#ffffff" : "#8a80c8"); });
      if (Math.floor(clock * 1.2) % 2) R(141, 21, 1, 1, "#ff3a3a");
      for (const w of windows){
        const X = wx(w.c), Y = FT(w.f);
        b.drawImage(w.img, X - 9, Y + 11);
        if (w.pop > 0){
          // Bewohner schaut kurz aus dem frisch geflickten Fenster
          const k = w.pop / 1.6, rise = k > .8 ? (1 - k) / .2 : k < .2 ? k / .2 : 1;
          b.save(); b.beginPath(); b.rect(X - 7, Y + 13, 14, 10); b.clip();
          b.drawImage(RES[w.res], X - 4 + (w.c % 2 ? 3 : -3), Y + 23 - Math.round(rise * 9));
          b.restore();
        }
        if (w.shine > 0){
          b.globalAlpha = w.shine * .8; R(X - 8, Y + 12, 16, 24, "#ffffff"); b.globalAlpha = 1;
          const s = Math.round((1 - w.shine) * 6);
          for (const [dx, dy] of [[-11 - s, 10], [10 + s, 14], [-9, 38 + s], [9 + s, 36]]){ R(X + dx, Y + dy - 1, 1, 3, "#fff6b0"); R(X + dx - 1, Y + dy, 3, 1, "#fff6b0"); }
        }
      }
      b.drawImage(fg, 0, 0);
      if (pie){
        const blink = pie.t < 2 && Math.floor(clock * 8) % 2;
        if (!blink){
          const X = wx(pie.c), Y = LEDGE(pie.f);
          b.drawImage(PIE, X - 4, Y - 6);
          for (let i = 0; i < 2; i++){ const sy = (clock * 8 + i * 4) % 8; R(X - 1 + i * 3 + Math.round(Math.sin(clock * 5 + i) * 1), Math.round(Y - 8 - sy), 1, 1, "rgba(255,255,255,.7)"); }
        }
      }
      for (const q of roofies){
        const j = Math.floor(clock * 8 + q.dx) % 2;
        const rx = Math.round(riese.act === "fly" || riese.act === "mud" ? q.x0 || (q.x0 = riese.x0 + q.dx) : riese.x + q.dx);
        b.drawImage(RES[q.res], rx - 4, ROOF - 11 - j);
        R(rx - 4, ROOF - 13 - j, 1, 3, "#ffd2a6"); R(rx + 3, ROOF - 13 - j, 1, 3, "#ffd2a6");
      }
      drawRiese();
      drawPlayer();
      for (const w of walkers){
        if (!w.out) continue;
        const j = w.cheer ? Math.round(Math.abs(Math.sin(clock * 9 + w.tx)) * 3) : 0;
        b.drawImage(RES[w.res], Math.round(w.x) - 4, Math.round(w.y) - 11 - j);
        if (w.cheer){ R(Math.round(w.x) - 5, Math.round(w.y) - 12 - j, 1, 3, "#ffd2a6"); R(Math.round(w.x) + 4, Math.round(w.y) - 12 - j, 1, 3, "#ffd2a6"); }
      }
      for (const k of bricks){
        const img = Math.floor(k.rot * 10) % 2 ? BRICK_V : BRICK_H;
        b.drawImage(img, Math.round(k.x - img.width / 2), Math.round(k.y - img.height / 2));
      }
      for (const q of parts){
        b.globalAlpha = Math.min(1, q.life / q.max * 1.5);
        R(Math.round(q.x), Math.round(q.y), q.size, q.size, q.col);
      }
      b.globalAlpha = 1;
      for (const q of pops) if (q.t < .85 || Math.floor(clock * 20) % 2) text(q.txt, Math.round(q.x), Math.round(q.y), q.col, { align: "center" });
      if (flashT > 0){ b.globalAlpha = flashT / .15 * .35; R(0, 0, LW, LH, flashC); b.globalAlpha = 1; }
    }
    function drawHUD(){
      const blink = Math.floor(clock * 2.5) % 2;
      if (state !== "title" || blink) text("1UP", 2, 1, "#ff4a4a");
      text(pad6(shown), 23, 1, "#ffffff");
      text("HI", 104, 1, "#ff4a4a"); text(pad6(Math.max(best, shown)), 118, 1, "#ffffff");
      if (state !== "title"){
        const sec = Math.ceil(timeLeft), low = sec <= 10;
        if (!low || Math.floor(clock * 4) % 2 || state !== "run") text(String(sec).padStart(2, "0"), 80, 1, low ? "#ff4a4a" : "#ffe45a", { align: "center" });
        for (let i = 0; i < lives; i++) b.drawImage(LIFE, 3 + i * 10, 199);
        const n = broken();
        text("KAPUTT", 120, 200, "#ff7a6a", { align: "right" }); text(String(n).padStart(2, "0"), 157, 200, "#ffffff", { align: "right" });
        if (player && player.gold > 0){ const w = Math.round(player.gold / 6 * 30); R(65, 10, 30, 2, "#3a2470"); R(65, 10, w, 2, "#ffd23c"); }
      }
    }
    function banner(txt, y, col, sc = 2){
      b.globalAlpha = .6; R(0, y - 4, LW, 7 * sc + 8, "#0c0420"); b.globalAlpha = 1;
      text(txt, 80, y, col, { sc, align: "center" });
    }
    function panel(y0, y1){
      b.globalAlpha = .86; R(6, y0, 148, y1 - y0, "#0c0420"); b.globalAlpha = 1;
      R(6, y0, 148, 1, "#ffd23c"); R(6, y1 - 1, 148, 1, "#ffd23c"); R(6, y0, 1, y1 - y0, "#ffd23c"); R(153, y0, 1, y1 - y0, "#ffd23c");
      R(8, y0 + 2, 144, 1, "#e2452f"); R(8, y1 - 3, 144, 1, "#e2452f"); R(8, y0 + 2, 1, y1 - y0 - 4, "#e2452f"); R(151, y0 + 2, 1, y1 - y0 - 4, "#e2452f");
    }
    function drawTitle(){
      panel(54, 186);
      text("FLICK-FRITZ", 80, 60, GOLD, { sc: 2, align: "center" });
      text("JR.", 146, 77, "#ffe45a", { align: "right" });
      text("GEGEN ABRISS-ATZE", 80, 88, "#ff7a6a", { align: "center" });
      b.drawImage(FR.stand[0], 16, 100); b.drawImage(HAM_D, 25, 107);
      text("FLICK ALLE FENSTER", 88, 99, "#ffffff", { align: "center" });
      text(`IN ${TIME} SEKUNDEN!`, 88, 108, "#ffe45a", { align: "center" });
      const ph = Math.floor(clock / .8) % 2;
      if (Math.floor(clock * 3) % 3) text(ph ? "INSERT COIN" : "PRESS START", 80, 117, ph ? "#5ae8ff" : "#ffffff", { sc: 2, align: "center" });
      lvLine(LVY.title);
      text("HI-SCORE " + pad6(best), 80, 147, "#5ae8ff", { align: "center" });
      text(ctx.touch ? "KREUZ = LAUFEN" : "←→↑↓ = LAUFEN", 80, 156, "#b8a8e8", { align: "center" });
      text(ctx.touch ? "HAMMER = FLICKEN" : "LEER = HAMMER", 80, 165, "#b8a8e8", { align: "center" });
      if (Math.floor(clock * 2) % 2) text(ctx.touch ? "TIPPEN = START" : "ENTER = START", 80, 174, "#ffffff", { align: "center" });
      text("CREDIT " + String(credit).padStart(2, "0"), 157, 200, "#8a80c8", { align: "right" });
      text("(C) OEAPP", 3, 200, "#8a80c8");
    }
    function drawResult(){
      const r = result;
      panel(56, 184);
      if (r.win){
        text("GESCHAFFT!", 80, 62, GOLD, { sc: 2, align: "center" });
        b.drawImage(MEDAL, 13, 62); b.drawImage(MEDAL, 138, 62);
      } else text(r.reason === "time" ? "ZEIT UM!" : "GAME OVER", 80, 62, REDG, { sc: 2, align: "center" });
      const row = (y, l, v, col = "#ffffff") => { text(l, 16, y, "#b8a8e8"); text(v, 144, y, col, { align: "right" }); };
      // Punkte zählen nacheinander hoch
      const k = Math.min(1, T / .5), k2 = Math.min(1, Math.max(0, T - .5) / .5), k3 = Math.min(1, Math.max(0, T - 1) / .5);
      row(84, "PUNKTE", pad6(r.base * k));
      row(94, "ZEITBONUS", pad6(r.tb * k2));
      row(104, "LEBEN " + lives + "×500", pad6(r.lb * k3));
      R(16, 114, 128, 1, "#5a4a8a");
      const tot = Math.round(r.base * k + r.tb * k2 + r.lb * k3);
      row(118, "GESAMT", pad6(tot), "#ffe45a");
      row(128, "HI-SCORE", pad6(best), "#5ae8ff");
      if (r.rec && T > 1.5 && Math.floor(clock * 4) % 2) text("NEUER REKORD!", 80, 141, GOLD, { align: "center" });
      else if (!r.rec) text(r.win ? `${r.secs} SEKUNDEN` : `${broken()} FENSTER KAPUTT`, 80, 141, "#8a80c8", { align: "center" });
      if (T > .8 && Math.floor(clock * 2.5) % 2) text(ctx.touch ? "TIPPEN = NOCHMAL" : "ENTER = NOCHMAL", 80, 153, "#ffffff", { align: "center" });
      if (T > .8) lvLine(LVY.result);
    }
    // Stufenzeile mit Rahmen, antippbar (siehe pointerup)
    function lvLine(y){
      const t = `STUFE ← ${lv.value.toUpperCase()} →`, w = t.length * 6 + 6;
      R(80 - w / 2, y - 3, w, 13, "#2a1858"); R(80 - w / 2, y - 3, w, 1, "#ffd23c"); R(80 - w / 2, y + 9, w, 1, "#ffd23c");
      text(t, 80, y, CF === CFG.leicht ? "#6ad06a" : CF === CFG.schwer ? "#ff7a6a" : "#ffe45a", { align: "center" });
    }
    function draw(){
      drawWorld();
      drawHUD();
      if (state === "title") drawTitle();
      else if (state === "intro"){
        if (T > .3 * IT && T < 2.0 * IT) banner("ATZE IST SAUER!", 112 + (Math.floor(T * 8) % 2), "#ff7a6a", 1);
        if (T >= 2.0 * IT && Math.floor(T * 6 / IT) % 3) banner("LOS GEHT'S!", 110, GOLD);
      } else if (state === "pause"){
        b.globalAlpha = .65; R(0, 0, LW, LH, "#000"); b.globalAlpha = 1;
        banner("PAUSE", 96, "#ffffff");
        text(ctx.touch ? "TIPPEN = WEITER" : "P = WEITER", 80, 116, "#b8a8e8", { align: "center" });
      } else if (state === "win"){
        if (T < 2) banner("ALLE FENSTER HEIL!", 112, GOLD, 1);
        if (medalT > .9) banner("MEDAILLE!", Math.round(player.y) - 54, GOLD, 1);
      } else if (state === "over"){
        if (T > .5) banner(result.reason === "time" ? "ZEIT UM!" : "AUTSCH!", 110, REDG);
        if (T > .3){
          const rx = Math.round(riese.x), y = 20 + (Math.floor(T * 7) % 2);
          if (rx < 80) text("HA HA HA!", rx + 18, y, "#ff7a6a"); else text("HA HA HA!", rx - 18, y, "#ff7a6a", { align: "right" });
        }
      } else if (state === "result") drawResult();
      present();
    }

    function updBar(){
      const html = `<span>fenster kaputt <b>${state === "title" ? "–" : broken()}</b></span><span>rekord <b>${best}</b></span>
        <span class="fx-lv" style="cursor:pointer">stufe <b>${ctx.demo ? "normal" : lv.value}</b></span>
        <span class="right">${ctx.touch ? "" : "←→↑↓ · LEER = hammer · "}P = pause</span>`;
      if (html !== bar._h){ bar._h = html; bar.innerHTML = html; }
    }

    /* ---------- Steuerung ---------- */
    // Leinwand: tippen = Hammer bzw. Start, wischen = laufen/springen
    let sx = 0, sy = 0, st = 0, down = false, moved = false;
    cv.addEventListener("pointerdown", e => {
      e.preventDefault();
      down = true; moved = false; sx = e.clientX; sy = e.clientY; st = Date.now();
      try{ cv.setPointerCapture(e.pointerId); } catch(err){}
    });
    cv.addEventListener("pointermove", e => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      moved = true; sx = e.clientX; sy = e.clientY;
      act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    });
    cv.addEventListener("pointerup", e => {
      if (!down) return; down = false;
      if (moved || Date.now() - st > 500) return;
      // Tipp auf die Stufenzeile = Stufe wechseln (in Spielpixeln gerechnet)
      const r = cv.getBoundingClientRect(), ly = (e.clientY - r.top) / r.height * LH, y0 = LVY[state];
      if (y0 && ly > y0 - 8 && ly < y0 + 14){ setLevel(1); return; }
      if (state === "run") act("ham"); else begin();
    });
    bar.addEventListener("click", e => { if (e.target.closest(".fx-lv")) setLevel(1); });
    cv.addEventListener("pointercancel", () => { down = false; });

    const onBlur = () => pause();
    addEventListener("blur", onBlur);
    // Größe folgt der Fläche (auch wenn die Touch-Tasten erst später ihren Platz bekommen)
    const ro = new ResizeObserver(() => size());
    ro.observe(body);
    pad.classList.add("fx-pad");
    ctx.buttons(pad, [
      { label: "◀", key: "ArrowLeft", aria: "links" }, { label: "▲", key: "ArrowUp", aria: "hoch" },
      { label: "▼", key: "ArrowDown", aria: "runter" }, { label: "▶", key: "ArrowRight", aria: "rechts" },
      { label: "HAMMER", key: " ", aria: "Hammer" }, { label: "II", key: "p", aria: "Pause" },
    ]);

    newGame();
    size();
    if (ctx.demo){ god = true; begin(); pieAt = [2.2]; }
    ctx.loop(ms => {
      const dt = Math.min(ms, 50) / 1000;
      update(dt);
      draw();
      updBar();
    });

    // nur zum Testen: fixit --debug
    if ((ctx.args || []).includes("--debug")) window.OE_FIXIT = {
      get s(){ return { state, T, score, lives, timeLeft, elapsed, best, p: player && { c: player.c, f: player.f, busy: !!busy(), gold: player.gold },
        dmg: windows.map(w => ({ c: w.c, f: w.f, d: w.dmg })), bricks: bricks.filter(k => !k.dead).map(k => [k.x, k.y, k.vy]), S, exact }; },
      god(v = true){ god = v; },
      fixAll(){ windows.forEach(w => { w.dmg = 0; w.lit = true; w.img = renderWindow(w); }); if (state === "run") startWin(); },
      time(t){ timeLeft = t; },
      lives(n){ lives = n; },
      pie(){ pieAt = [elapsed]; },
      drum(){ riese.drumCd = 0; },
    };

    return {
      stop(){ ro.disconnect(); removeEventListener("blur", onBlur); if (window.OE_FIXIT) delete window.OE_FIXIT; },
      key(e){
        const k = e.key;
        const map = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
          ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down" };
        if ((state === "title" || state === "result") && (k === "ArrowLeft" || k === "ArrowRight")){ setLevel(k === "ArrowLeft" ? -1 : 1); return true; }
        if (k === "l" || k === "L"){ setLevel(1); return true; }
        if (map[k]){ if (!e.repeat) act(map[k]); return true; }
        if (k === " " || k === "x" || k === "X"){
          if (state === "run"){ if (!e.repeat) act("ham"); }
          else if (state === "pause") resume();
          else if (!e.repeat) begin();
          return true;
        }
        if (k === "Enter"){ begin(); return true; }
        if (k === "p" || k === "P"){
          if (state === "run") pause(); else if (state === "pause") resume();
          return true;
        }
        if (k === "q"){ ctx.exit(); return true; }
        return false;
      },
    };
  },
});
