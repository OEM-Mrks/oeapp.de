/* ============================================================
   oeapp.de terminal — Kern
   Boot-Animation, Log, Zitate, Anzeigen, Shell-Prompt und der
   App-Manager, über den sich die Mini-Apps (js/apps/*.js) anmelden.
   Alles läuft im Browser, es gibt keinen Server.
   ============================================================ */

(function(){
"use strict";

const $ = sel => document.querySelector(sel);
const pad2 = n => String(n).padStart(2,"0");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = a => a[Math.floor(Math.random()*a.length)];
const rint = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function stamp(d = new Date()){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const SRV = {
  host:  "oeapp.de",
  os:    "6.8.0-oe",
  mem:   "43%",
  upsec: Math.floor(86400 * (3 + Math.random() * 27)),   // 3–30 Tage "Uptime"
  now:   stamp(new Date(Date.now() - 86400000 * (1 + Math.random() * 3))),
};

const TOUCH = matchMedia("(pointer: coarse)").matches;
if (TOUCH) document.body.classList.add("touch");

/* -------- Handy-Anpassungen (vor allem iOS Safari) -------- */

const audioCtxs = [];
let resetZoom = () => {};
if (TOUCH){
  // Canvas-Leuchten (shadowBlur) ist in Safari sehr teuer und lässt die Spiele ruckeln
  const sb = window.CanvasRenderingContext2D && Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "shadowBlur");
  if (sb && sb.set) Object.defineProperty(CanvasRenderingContext2D.prototype, "shadowBlur", { ...sb, set(){ sb.set.call(this, 0); } });
  // 3x-Displays: Canvas mit höchstens 2x rechnen, sieht gleich aus, halb so viele Pixel
  if ((window.devicePixelRatio || 1) > 2){
    try{ Object.defineProperty(window, "devicePixelRatio", { get: () => 2, configurable: true }); } catch(e){}
  }

  // Bildschirmtastatur: Layout auf den sichtbaren Bereich schrumpfen, damit Eingabezeilen nicht verdeckt werden
  const vv = window.visualViewport, root = document.documentElement;
  if (vv){
    const fit = () => {
      if (Math.abs(vv.scale - 1) > 0.01) return;   // gezoomt: Layout nicht an den Ausschnitt anpassen
      root.style.setProperty("--vvh", vv.height + "px");
      root.style.setProperty("--vvt", vv.offsetTop + "px");
      document.body.classList.toggle("kbd", innerHeight - vv.height > 120);
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    fit();
    document.body.classList.add("vv");
  }

  // Hat iOS doch hineingezoomt (Eingabefeld, Doppeltipp), fehlt rechts und unten die halbe Seite.
  // Ein neu gesetzter Viewport-Tag setzt den Zoom zurück.
  const vp = document.querySelector('meta[name="viewport"]');
  const base = vp ? vp.content : "";
  resetZoom = () => {
    if (!vp || (vv && Math.abs(vv.scale - 1) < 0.01)) return;
    vp.content = base + ",user-scalable=no";
    setTimeout(() => { vp.content = base; }, 60);
  };
  document.addEventListener("focusout", () => setTimeout(resetZoom, 50));
  if (vv) vv.addEventListener("resize", () => { if (!document.activeElement || !document.activeElement.matches("input")) resetZoom(); });

  // Kein Gummiband-Scrollen der ganzen Seite, kein Pinch-Zoom mitten im Spiel
  const scrollable = el => {
    for (; el && el !== document.body; el = el.parentElement){
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return true;
    }
    return false;
  };
  document.addEventListener("touchmove", e => { if (e.touches.length > 1 || !scrollable(e.target)) e.preventDefault(); }, { passive: false });
  document.addEventListener("gesturestart", e => e.preventDefault());
  // Long-Press öffnet sonst Kontextmenü/Lupe statt Taste zu halten
  document.addEventListener("contextmenu", e => { if (!e.target.closest("input, textarea")) e.preventDefault(); });

  // iOS gibt WebAudio erst nach einer echten Berührung frei: alle Kontexte merken und dann aufwecken
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC){
    const Tracked = class extends AC { constructor(...a){ super(...a); audioCtxs.push(this); } };
    window.AudioContext = Tracked;
    if (window.webkitAudioContext) window.webkitAudioContext = Tracked;
  }
}

let speechUnlocked = false;
function unlockAudio(){
  try{
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    // iOS spricht (speechSynthesis) nur, wenn das erste Sprechen aus einer Berührung kam: einmal stumm freischalten
    if (!speechUnlocked && window.speechSynthesis && window.SpeechSynthesisUtterance){
      speechUnlocked = true;
      const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u);
    }
    // stummgeschaltete Kontexte (race in Pause) legen sich danach von selbst wieder schlafen;
    // iOS meldet nach Anruf, Siri, Sperrbildschirm o. ä. "interrupted" statt "suspended"
    for (const a of audioCtxs) if (a.state !== "running" && a.state !== "closed") a.resume().catch(() => {});
  } catch(e){}
}
for (const ev of ["touchend", "pointerup", "click", "keydown"]) addEventListener(ev, unlockAudio, { capture: true, passive: true });

/* -------- Speicher (Highscores etc.), darf fehlen -------- */

const store = {
  get(k, def){ try{ const v = localStorage.getItem("oe."+k); return v === null ? def : JSON.parse(v); } catch(e){ return def; } },
  set(k, v){ try{ localStorage.setItem("oe."+k, JSON.stringify(v)); } catch(e){} },
};

/* -------- Ton (WebAudio, erst nach erster Eingabe) -------- */

let audio = null;
function beep(freq = 880, ms = 80, type = "square", vol = 0.04){
  try{
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms/1000);
    o.stop(audio.currentTime + ms/1000 + 0.02);
  } catch(e){}
}

/* -------- Zitate -------- */

const QUOTES = [
  { tag:"@reflection",   a:"Henry Ford",                 t:"Wer immer tut, was er schon kann, bleibt immer das, was er schon ist." },
  { tag:"@philosophie",  a:"Johann Wolfgang von Goethe", t:"Es ist nicht genug zu wissen — man muss auch anwenden. Es ist nicht genug zu wollen — man muss auch tun." },
  { tag:"@physik",       a:"Albert Einstein",            t:"Phantasie ist wichtiger als Wissen, denn Wissen ist begrenzt." },
  { tag:"@strategie",    a:"Albert Einstein",            t:"In der Mitte von Schwierigkeiten liegen die Möglichkeiten." },
  { tag:"@politik",      a:"Konrad Adenauer",            t:"Nehmen Sie die Menschen, wie sie sind, andere gibt es nicht." },
  { tag:"@pragmatismus", a:"Helmut Schmidt",             t:"Wer Visionen hat, sollte zum Arzt gehen." },
  { tag:"@haltung",      a:"Bertolt Brecht",             t:"Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren." },
  { tag:"@empathie",     a:"Henry Ford",                 t:"Das Geheimnis des Erfolges ist, den Standpunkt des anderen zu verstehen." },
  { tag:"@sprache",      a:"Ludwig Wittgenstein",        t:"Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt." },
  { tag:"@management",   a:"Peter Drucker",              t:"Die beste Methode, die Zukunft vorherzusagen, ist, sie zu gestalten." },
  { tag:"@management",   a:"Peter Drucker",              t:"Effizienz heißt, die Dinge richtig zu tun. Effektivität heißt, die richtigen Dinge zu tun." },
  { tag:"@metrics",      a:"Peter Drucker",              t:"Was du nicht messen kannst, kannst du nicht steuern." },
  { tag:"@culture",      a:"Peter Drucker",              t:"Kultur isst Strategie zum Frühstück." },
  { tag:"@innovation",   a:"Steve Jobs",                 t:"Innovation unterscheidet einen Anführer von einem Mitläufer." },
  { tag:"@leben",        a:"Steve Jobs",                 t:"Deine Zeit ist begrenzt, also vergeude sie nicht damit, das Leben eines anderen zu leben." },
  { tag:"@design",       a:"Steve Jobs",                 t:"Einfach kann schwerer sein als kompliziert." },
  { tag:"@spirit",       a:"Steve Jobs",                 t:"Bleibt hungrig, bleibt töricht." },
  { tag:"@existenz",     a:"Jean-Paul Sartre",           t:"Der Mensch ist nichts anderes als das, wozu er sich macht." },
  { tag:"@stoa",         a:"Friedrich Nietzsche",        t:"Was uns nicht umbringt, macht uns stärker." },
  { tag:"@theorie",      a:"Kurt Lewin",                 t:"Es gibt nichts Praktischeres als eine gute Theorie." },
];
let lastQuote = -1;
function pickQuote(){
  let i;
  do { i = Math.floor(Math.random() * QUOTES.length); } while (i === lastQuote && QUOTES.length > 1);
  lastQuote = i;
  return QUOTES[i];
}

const PROCS = [
  { pid: 1,    name:"systemd",            cpu: 0.1, mem: 0.4 },
  { pid: 412,  name:"oeapp-core",         cpu: 12.4, mem: 8.2 },
  { pid: 514,  name:"quote.daemon",       cpu: 0.6, mem: 1.1 },
  { pid: 612,  name:"render-engine",      cpu: 4.2, mem: 5.5 },
  { pid: 781,  name:"nginx",              cpu: 2.3, mem: 4.1 },
  { pid: 902,  name:"index.worker",       cpu: 7.1, mem: 3.4 },
  { pid: 1024, name:"crypt.gatekeeper",   cpu: 0.4, mem: 0.6 },
  { pid: 1337, name:"observability",      cpu: 1.8, mem: 2.0 },
];

/* -------- BOOT -------- */

function bootLines(){
  return [
    `[    0.000000] Linux version ${SRV.os} (oeapp@build)`,
    "[    0.012043] Command line: BOOT_IMAGE=/boot/vmlinuz-oe root=UUID=oeapp ro quiet splash",
    "[    0.034210] CPU0: oe-virt @ 2.40GHz",
    `[    0.061772] Memory: usage ${SRV.mem}`,
    "[    0.094104] Initializing cgroup subsys cpuset",
    "[    0.122418] EXT4-fs (sda1): mounted filesystem with ordered data mode",
    "[    0.182013] systemd[1]: Detected architecture x86-64.",
    `[    0.244908] systemd[1]: Set hostname to <${SRV.host}>.`,
    "[    0.319812]   OK   Reached target Local File Systems.",
    "[    0.401122]   OK   Started Network Manager.",
    "[    0.488210]   OK   Started nginx.service (static, gh-pages)",
    "[    0.512908]   OK   Started quote.daemon.service",
    "[    0.601122]   OK   Started render-engine.service",
    `[    0.655311]   OK   Mounted /usr/local/oeapp/bin (${APPS.filter(a => !a.hidden).length} apps)`,
    "[    0.702010]   OK   Reached target Multi-User System.",
    "",
    `Welcome to ${SRV.host} (tty1)`,
    "",
    "login: oe",
    "password: ********",
    `Last login: ${SRV.now} on tty1`,
    "",
    "$ ./oeapp --watch --verbose",
  ];
}

async function bootAnim(){
  const el = $("#bootText");
  let skip = false;
  const skipper = () => { skip = true; };
  addEventListener("keydown", skipper, { once:true });
  addEventListener("pointerdown", skipper, { once:true });
  for (const line of bootLines()){
    el.textContent += line + "\n";
    if (!skip) await sleep(line.startsWith("[") ? 28 + Math.random()*55 : 100 + Math.random()*110);
  }
  removeEventListener("keydown", skipper);
  removeEventListener("pointerdown", skipper);
  await sleep(skip ? 60 : 420);
  $("#boot").classList.add("fade");
  setTimeout(()=> $("#boot").style.display="none", 700);
}

/* -------- LOG -------- */

function ts(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

const log = $("#log");
const MAX_LINES = 200;
function addLine(html){
  const div = document.createElement("div");
  div.className = "line";
  div.innerHTML = html;
  log.appendChild(div);
  while (log.children.length > MAX_LINES) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  return div;
}
function fmt(level, msg){
  const cls = {OK:"ok", WARN:"warn", ERR:"err", DBG:"dim", "→":"arrow"}[level] || "";
  return `<span class="ts">${ts()}</span>  <span class="${cls}">[${level}]</span>  ${msg}`;
}

const HOSTS = ["edge-01.oeapp.de","worker-eu-3","cache-fra-7","db-primary","db-replica-2","cdn-04","gateway-tls"];
const PATHS = ["/api/v1/index","/api/v1/users/9281","/api/v1/jobs/run","/internal/metrics","/static/app.js","/health","/auth/token","/bin/snake","/bin/blocks"];
const FILES = ["/etc/oeapp/config.toml","/var/lib/oeapp/index.bin","/tmp/render-72f.cache","/srv/oeapp/store/0a/9c/4f.bin","/proc/cpuinfo"];
const TASKS = ["indexing batch","compiling shader cache","tokenizing corpus","computing embeddings","rebalancing shards","vacuuming WAL","warming cache","reticulating splines","diffusing latent space","training quote.classifier","syncing replica","GC sweep","emitting OTEL spans","rotating credentials","decoding stream"];
const VERBS = ["fetched","accepted","rejected","queued","dispatched","completed","retried","scheduled"];

function genHttpLine(){
  const code = rand([200,200,200,200,200,201,204,301,302,400,401,404,500,503]);
  const cls = code<300 ? "ok" : code<400 ? "dim" : code<500 ? "warn" : "err";
  const ip = `${rint(10,200)}.${rint(0,255)}.${rint(0,255)}.${rint(1,254)}`;
  return fmt("→", `<span class="dim">${ip}</span> "GET <span class="path">${rand(PATHS)}</span>" <span class="${cls}">${code}</span> <span class="num">${rint(2,420)}ms</span> ua=oeapp/1.0`);
}
function genJobLine(){
  const id = "job-" + Math.random().toString(36).slice(2,8);
  return fmt("OK", `<span class="path">${id}</span> ${rand(VERBS)} — ${rand(TASKS)} <span class="dim">on</span> <span class="path">${rand(HOSTS)}</span>`);
}
function genMetric(){
  const k = rand(["latency.p50","latency.p99","qps","mem.rss","gc.pause"]);
  const v = k==="qps" ? rint(80,1400) : k==="mem.rss" ? (rint(380,820)+"MB") : (rint(1,140)+"ms");
  return fmt("DBG", `metric <span class="dim">${k}</span> = <span class="num">${v}</span>`);
}
function genWarn(){ return fmt("WARN", `slow query on <span class="path">${rand(HOSTS)}</span> took <span class="num">${rint(420,2100)}ms</span>`); }
function genErr(){  return fmt("ERR",  `transient ${rand(["DNS","TLS","upstream","backoff"])} on <span class="path">${rand(HOSTS)}</span> — retrying`); }
function genFs(){   return fmt("DBG",  `${rand(["read","write","mmap","fsync"])} <span class="path">${rand(FILES)}</span> <span class="num">${rint(1,4096)}KB</span>`); }
function genLine(){
  const r = Math.random();
  if (r < 0.42) return genHttpLine();
  if (r < 0.66) return genJobLine();
  if (r < 0.80) return genMetric();
  if (r < 0.88) return genFs();
  if (r < 0.95) return genWarn();
  return genErr();
}

async function progressLine(label, totalSteps=24){
  const wrap = addLine("");
  for (let i=0; i<=totalSteps; i++){
    const pct = Math.round(i/totalSteps*100);
    wrap.innerHTML = `<span class="ts">${ts()}</span>  <span class="ok">[OK]</span>  ${label}  <span class="dim">[</span>${"█".repeat(i)}${"░".repeat(totalSteps-i)}<span class="dim">]</span>  <span class="num">${pct}%</span>`;
    await sleep(40 + Math.random()*70);
  }
  log.scrollTop = log.scrollHeight;
}
async function asciiSpinner(label, ms=1600){
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  const wrap = addLine("");
  const start = performance.now();
  let i = 0;
  while (performance.now() - start < ms){
    wrap.innerHTML = `<span class="ts">${ts()}</span>  <span class="warn">${frames[i++%frames.length]}</span>  ${label}`;
    await sleep(80);
  }
  wrap.innerHTML = `<span class="ts">${ts()}</span>  <span class="ok">✓</span>  ${label} <span class="dim">— done</span>`;
}
function sectionDivider(title){
  addLine(`<span class="dim">────────────────────────────────  ${title}  ────────</span>`);
}

/* -------- QUOTE -------- */

function initQuote(){
  const q = pickQuote();
  $("#qLabel").textContent = q.tag.toUpperCase();
  $("#qText").textContent = `„${q.t}"`;
  $("#qAuthor").innerHTML = `— <b>${q.a}</b>`;
}

let quoteBusy = false;
async function showQuote(){
  if (quoteBusy) return;
  quoteBusy = true;
  const q = pickQuote();
  const lab = $("#qLabel"), txt = $("#qText"), aut = $("#qAuthor");
  lab.textContent = "FETCH quote.daemon";
  txt.textContent = ""; aut.textContent = "";
  await sleep(220);
  lab.textContent = "DECRYPTING …";
  await sleep(280);
  lab.textContent = q.tag.toUpperCase();
  const full = `„${q.t}"`;
  for (let i=0; i<=full.length; i++){
    txt.innerHTML = full.slice(0,i) + '<span class="cursor"></span>';
    await sleep(14 + Math.random()*22);
  }
  txt.innerHTML = full;
  await sleep(140);
  aut.innerHTML = `— <b>${q.a}</b>`;
  if (logOn && !quiet()) addLine(fmt("OK", `quote.daemon emitted <span class="path">${q.tag}</span> — <span class="ok">"${q.t.length>60? q.t.slice(0,60)+"…" : q.t}"</span> <span class="dim">— ${q.a}</span>`));
  quoteBusy = false;
}

/* -------- METERS / PROCS / CLOCK -------- */

function jitter(cur, min, max, step=8){
  let v = cur + (Math.random()*2-1)*step;
  if (v<min) v = min + Math.random()*step;
  if (v>max) v = max - Math.random()*step;
  return v;
}
let m = { cpu:18, mem:43, net:9, disk:31, ent:78 };
function tickMeters(){
  const busy = current ? 30 : 0;   // läuft eine App, ist die "CPU" beschäftigter
  m.cpu  = jitter(m.cpu, 6 + busy, 92, 9);
  m.net  = jitter(m.net, 1, 96, 18);
  m.disk = jitter(m.disk, 2, 88, 14);
  m.ent  = jitter(m.ent, 60, 99, 4);
  for (const k of ["cpu","net","disk","ent"]){
    const v = Math.round(m[k]);
    const K = k[0].toUpperCase()+k.slice(1);
    document.getElementById("b"+K).style.width = v+"%";
    document.getElementById("v"+K).textContent = v+"%";
  }
  $("#load").textContent = (m.cpu/100*4).toFixed(2)+" "+(m.cpu/100*3.4).toFixed(2)+" "+(m.cpu/100*2.7).toFixed(2);
}
function renderProcs(){
  const list = PROCS.slice();
  if (current) list.push({ pid: current.pid, name: current.app.id, cpu: 18 + Math.random()*20, mem: 6 + Math.random()*3, app: true });
  const html = list
    .map(p => p.app ? p : {...p, cpu: Math.max(0, p.cpu + (Math.random()*2-1)*1.2), mem: Math.max(0, p.mem + (Math.random()*2-1)*0.4)})
    .sort((a,b)=>b.cpu-a.cpu)
    .map(p => `<div class="row${p.name==='systemd'?' dim':''}">
        <span class="name dim">${p.pid}</span>
        <span class="name">${p.app ? "▸ " : ""}${p.name}</span>
        <span class="num">${p.cpu.toFixed(1)}</span>
        <span class="num">${p.mem.toFixed(1)}</span>
      </div>`).join("");
  $("#ps").innerHTML = html;
}
const startedAt = Date.now();
function tickClock(){
  $("#now").textContent = stamp();
  const s = SRV.upsec + Math.floor((Date.now()-startedAt)/1000);
  const hh = Math.floor(s/3600), mm = Math.floor(s/60)%60, ss = s%60;
  $("#uptime").textContent = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

/* ============================================================
   APP-MANAGER
   Jede App ruft OE.register({ id, title, desc, start(ctx) }) auf.
   start() bekommt einen Kontext mit dem Container und Helfern und
   gibt optional { key(e), stop() } zurück.
   ============================================================ */

const APPS = [];
let current = null;          // { app, inst, ctx, pid }
let nextPid = 2048;

function register(app){ APPS.push(app); }
function findApp(id){ return APPS.find(a => a.id === id || (a.alias || []).includes(id)); }

function makeCtx(app, args, demo = false){
  const el = $("#app");
  el.innerHTML = "";
  const timers = [], rafs = [];
  const ctx = {
    el, args, touch: TOUCH, store, beep, esc, sleep, rand, rint,
    alive: true,
    keys: new Set(),        // gerade gedrückte Tasten (für Pong, Rennen …)
    every(ms, fn){ const id = setInterval(fn, ms); timers.push(() => clearInterval(id)); return id; },
    after(ms, fn){ const id = setTimeout(fn, ms); timers.push(() => clearTimeout(id)); return id; },
    loop(fn){
      let last = performance.now();
      const step = t => { if (!ctx.alive) return; fn(t - last, t); last = t; rafs[0] = requestAnimationFrame(step); };
      rafs[0] = requestAnimationFrame(step);
    },
    exit(){ exitApp(); },
    log(level, msg){ addLine(fmt(level, msg)); },
    /* Standard-Aufbau: Statuszeile, Fläche, Touch-Tasten */
    layout(){
      el.innerHTML = `<div class="app-bar"></div><div class="app-body"></div><div class="pad"></div>`;
      return { bar: el.querySelector(".app-bar"), body: el.querySelector(".app-body"), pad: el.querySelector(".pad") };
    },
    /* Touch-Tasten, die wie Tastendrücke an die App gehen */
    buttons(padEl, defs){
      padEl.innerHTML = "";
      for (const d of defs){
        const b = document.createElement("button");
        b.type = "button"; b.textContent = d.label; b.setAttribute("aria-label", d.aria || d.key);
        b.addEventListener("pointerdown", e => { e.preventDefault(); sendKey(d.key); });
        for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => releaseKey(d.key));
        padEl.appendChild(b);
      }
    },
    /* Wischgesten auf einem Element -> Pfeiltasten */
    swipe(target, onTap){
      // Pointer-Events decken Finger und Maus ab (Klick = Tippen)
      // Richtung wird schon beim Wischen ausgelöst (nicht erst beim Loslassen), danach
      // zählt die Fingerposition als neuer Startpunkt: so geht auch Haken schlagen ohne abzusetzen
      let sx = 0, sy = 0, st = 0, down = false, moved = false;
      target.style.touchAction = "none";
      target.addEventListener("pointerdown", e => {
        down = true; moved = false; sx = e.clientX; sy = e.clientY; st = Date.now();
        try{ target.setPointerCapture(e.pointerId); } catch(err){}
      });
      target.addEventListener("pointermove", e => {
        if (!down) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
        moved = true; sx = e.clientX; sy = e.clientY;
        sendKey(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : (dy > 0 ? "ArrowDown" : "ArrowUp"));
      });
      target.addEventListener("pointerup", e => {
        if (!down) return; down = false;
        if (!moved && onTap && Date.now()-st < 400) onTap(e);
      });
      target.addEventListener("pointercancel", () => { down = false; });
    },
    /* Text-Terminal: Ausgabe + eigene Eingabezeile (für swan, fsociety) */
    tty(container, { prompt = "&gt;", placeholder = "" } = {}){
      container.innerHTML = `<div class="tty"></div><label class="tty-in"><span class="ps1">${prompt}</span>
        <input class="cli-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${placeholder}" /></label>`;
      const outEl = container.querySelector(".tty"), input = container.querySelector("input"), ps = container.querySelector(".ps1");
      let onLine = () => {};
      const hist = []; let hp = 0;
      input.addEventListener("keydown", e => {
        if (e.key === "Enter"){
          e.preventDefault(); e.stopPropagation();
          const v = input.value; input.value = "";
          if (TOUCH){ input.blur(); container.classList.remove("kb"); if (!chipsEl.hidden) renderChips(); }   // Tastatur wieder weg
          if (v.trim()){ hist.push(v); hp = hist.length; }
          onLine(v);
        } else if (e.key === "ArrowUp"){ if (hp > 0) input.value = hist[--hp]; e.preventDefault(); }
        else if (e.key === "ArrowDown"){ hp = Math.min(hist.length, hp + 1); input.value = hist[hp] || ""; e.preventDefault(); }
      });
      if (!TOUCH) outEl.addEventListener("click", () => { if (!getSelection().toString()) input.focus(); });
      if (!TOUCH) setTimeout(() => input.focus(), 0);

      /* Tipp-Menü wie die Bot-Tastatur bei Telegram: Befehle als Knöpfe, Untermenüs für
         Argumente. Auf dem Handy ersetzt es die Eingabezeile, ⌨ holt sie bei Bedarf. */
      const chipsEl = document.createElement("div");
      chipsEl.className = "tty-chips";
      chipsEl.hidden = true;
      container.appendChild(chipsEl);
      let chipRoot = [], chipStack = [];
      function renderChips(){
        const defs = chipStack.length ? chipStack[chipStack.length - 1].sub : chipRoot;
        const all = [...defs];
        if (chipStack.length) all.unshift({ label: "‹ zurück", back: true });
        if (TOUCH) all.push({ label: container.classList.contains("kb") ? "▾ Tastatur" : "⌨ tippen", kb: true });
        chipsEl.innerHTML = "";
        if (chipStack.length){
          const h = document.createElement("div");
          h.className = "tty-chips-head"; h.textContent = chipStack.map(c => c.label.replace(/ ?▸$/, "")).join(" › ");
          chipsEl.appendChild(h);
        }
        for (const d of all){
          const b = document.createElement("button");
          b.type = "button"; b.textContent = d.label;
          if (d.back || d.kb) b.className = "aux";
          b.disabled = input.disabled && !d.back && !d.kb;
          b.addEventListener("click", () => {
            if (d.back){ chipStack.pop(); renderChips(); return; }
            if (d.kb){
              const on = container.classList.toggle("kb");
              if (on) input.focus(); else input.blur();
              renderChips(); return;
            }
            if (d.sub){ chipStack.push(d); renderChips(); return; }
            chipStack = [];
            renderChips();
            onLine(d.cmd);
          });
          chipsEl.appendChild(b);
        }
      }
      if (TOUCH) container.classList.add("tty-touch");
      const t = {
        input, out: outEl,
        print(html = ""){ const d = document.createElement("div"); d.innerHTML = html; outEl.appendChild(d);
          while (outEl.children.length > 400) outEl.removeChild(outEl.firstChild);
          outEl.scrollTop = outEl.scrollHeight; return d; },
        clear(){ outEl.innerHTML = ""; },
        prompt(html){ ps.innerHTML = html; },
        onLine(fn){ onLine = fn; },
        lock(on){ input.disabled = !!on; if (!on && !TOUCH) input.focus(); if (!chipsEl.hidden) renderChips(); },
        /* defs: [{ label, cmd } | { label, sub: [...] }] */
        chips(defs){
          chipRoot = defs; chipStack = [];
          chipsEl.hidden = false; renderChips();
        },
        async type(html, ms = 18){   // Zeile "eintippen"
          const d = t.print(""); const tmp = document.createElement("div"); tmp.innerHTML = html;
          const text = tmp.textContent;
          for (let i = 1; i <= text.length && ctx.alive; i++){ d.textContent = text.slice(0, i); outEl.scrollTop = outEl.scrollHeight; await sleep(ms); }
          d.innerHTML = html; return d;
        },
      };
      return t;
    },
    demo,                   // Vorführung: die App spielt selbst, ohne Ton und ohne Rekorde
    _cleanup(){ ctx.alive = false; timers.forEach(f => f()); rafs.forEach(id => cancelAnimationFrame(id)); },
  };
  return ctx;
}

const SWIPE_PX = 14;          // ab so viel Fingerweg zählt es als Wischen

const normKey = k => k.length === 1 ? k.toLowerCase() : k;

function sendKey(key){
  if (!current || !current.inst) return;
  current.ctx.keys.add(normKey(key));
  if (current.inst.key) current.inst.key({ key, code: key, preventDefault(){}, synthetic:true });
}
function releaseKey(key){
  if (current) current.ctx.keys.delete(normKey(key));
}

function runApp(id, args = [], demo = false){
  const app = findApp(id);
  if (!app) return false;
  if (current) stopCurrent();
  const ctx = makeCtx(app, args, demo);
  if (demo){
    ctx.beep = () => {};
    ctx.log = () => {};
    ctx.store = { get: store.get, set(){} };
  }
  current = { app, ctx, pid: nextPid++, demo };
  document.body.classList.add("app-on");
  $("#mainTitle").innerHTML = `// ${esc(app.title || app.id)} &nbsp; ── &nbsp; <span class="hide-sm">pid ${current.pid} · </span>ESC = exit`;
  setActiveSeg(app.id);
  logSeg();
  if (logOn) addLine(fmt("OK", `exec <span class="path">/usr/local/oeapp/bin/${esc(app.id)}</span> <span class="dim">pid=${current.pid}</span>`));
  current.inst = app.start(ctx) || {};
  dispatchEvent(new CustomEvent("oe:app", { detail: app.id }));   // z. B. für die Musik
  if (document.activeElement === $("#cli")) $("#cli").blur();
  resetZoom();
  return true;
}

function stopCurrent(){
  if (!current) return;
  try{ current.inst && current.inst.stop && current.inst.stop(); } catch(e){}
  current.ctx._cleanup();
  if (logOn) addLine(fmt("DBG", `process <span class="path">${esc(current.app.id)}</span> exited <span class="dim">pid=${current.pid} status=0</span>`));
  current = null;
  $("#app").innerHTML = "";
  dispatchEvent(new CustomEvent("oe:app", { detail: null }));
}

function exitApp(){
  endDemo(false);
  stopCurrent();
  document.body.classList.remove("app-on");
  setTitle();
  setActiveSeg("log");
  logSeg();
  log.scrollTop = log.scrollHeight;
  if (!TOUCH) $("#cli").focus();
  applyUpdate();   // ein wartendes Update erst nach dem Spiel einspielen
}

function setTitle(){
  $("#mainTitle").innerHTML = logOn ? "// system.log &nbsp; ── &nbsp; tail -f /var/log/oeapp.log" : "// tty1 &nbsp; ── &nbsp; oe@oeapp";
}

function setActiveSeg(id){
  document.querySelectorAll(".botbar .seg[data-go]").forEach(s => {
    const go = s.dataset.go;
    s.classList.toggle("active", go === id || (go === "apps" && id === "apps"));
  });
}

/* ============================================================
   SHELL-PROMPT
   ============================================================ */

let quietUntil = 0;           // nach Eingaben macht das Fake-Log kurz Pause
const quiet = () => Date.now() < quietUntil;
const history = [];
let histPos = 0;

function out(html, cls = ""){ addLine(cls ? `<span class="${cls}">${html}</span>` : html); }

const COMMANDS = {
  help(){
    out(`<span class="ok">oeapp.de shell</span> <span class="dim">— alles läuft lokal im Browser, nichts davon ist echt.</span>`);
    out(`<span class="dim">Befehle:</span>  help · apps · log · clear · quote · whoami · date · uname · echo · history · exit`);
    out(`<span class="dim">Apps:</span>     ${APPS.filter(a => !a.hidden).map(a => `<span class="path">${a.id}</span>`).join(" · ")}`);
    out(`<span class="dim">Tasten:</span>   F2 = App-Auswahl · ESC = App beenden · ↑ = letzter Befehl · TAB = vervollständigen`);
  },
  ls(){ return runApp("apps"); },
  log(args){ setLog(args[0] === "off" || args[0] === "stop" ? false : args[0] === "on" ? true : !logOn); },
  clear(){ log.innerHTML = ""; },
  quote(){ showQuote(); out(`<span class="dim">quote.daemon: neues Zitat angefordert →</span>`); },
  whoami(){ out("oe"); },
  date(){ out(new Date().toString()); },
  uname(args){ out(args[0] === "-a" ? `Linux ${SRV.host} ${SRV.os} #1 SMP PREEMPT x86_64 GNU/Linux (eigentlich: ${esc(navigator.userAgent.split(") ")[0])})` : "Linux"); },
  echo(args){ out(esc(args.join(" "))); },
  history(){ history.forEach((h,i) => out(`<span class="dim">${String(i+1).padStart(4)}</span>  ${esc(h)}`)); },
  sudo(){ out(`oe is not in the sudoers file. <span class="warn">This incident will be reported.</span>`); },
  exit(){ shutdown(); },
  logout(){ shutdown(); },
  rm(args){ out(args.join(" ").includes("-rf") ? `<span class="err">Netter Versuch.</span>` : `rm: Zugriff verweigert`); },
};
COMMANDS.dir = COMMANDS.ls;
COMMANDS["?"] = COMMANDS.help;
COMMANDS["/help"] = COMMANDS.help;

function runCommand(line){
  const raw = line.trim();
  if (!raw) return;
  history.push(raw); histPos = history.length;
  quietUntil = Date.now() + 20000;
  out(`<span class="ok">oe@oeapp</span><span class="dim">:</span>~<span class="dim">$</span> ${esc(raw)}`);
  const [cmd0, ...args] = raw.split(/\s+/);
  const cmd = cmd0.toLowerCase().replace(/^\.\//, "");
  if (COMMANDS[cmd]) { COMMANDS[cmd](args); return; }
  if (runApp(cmd, args)) return;
  out(`<span class="err">${esc(cmd0)}: command not found</span> <span class="dim">— probier „help“ oder „apps“</span>`);
}

function completions(prefix){
  const names = [...Object.keys(COMMANDS).filter(c => /^[a-z]/.test(c)), ...APPS.map(a => a.id)];
  return names.filter(n => n.startsWith(prefix.toLowerCase())).sort();
}

function initCli(){
  const cli = $("#cli");
  cli.addEventListener("keydown", e => {
    // stopPropagation: sonst bekäme eine gerade gestartete App dasselbe Enter
    if (e.key === "Enter"){ e.preventDefault(); e.stopPropagation(); const v = cli.value; cli.value = ""; runCommand(v); }
    else if (e.key === "ArrowUp"){ if (histPos > 0) cli.value = history[--histPos]; e.preventDefault(); }
    else if (e.key === "ArrowDown"){ histPos = Math.min(history.length, histPos+1); cli.value = history[histPos] || ""; e.preventDefault(); }
    else if (e.key === "Tab"){
      e.preventDefault();
      const c = completions(cli.value.trim());
      if (c.length === 1) cli.value = c[0] + " ";
      else if (c.length > 1){ out(c.map(x => `<span class="path">${x}</span>`).join("  ")); quietUntil = Date.now()+10000; }
    }
  });
}

/* -------- Globale Tasten -------- */

/* ============================================================
   SHUTDOWN ("exit" im Hauptterminal)
   Das Bild zerfällt in Kacheln, die nach unten wegfallen. Übrig
   bleibt ein blinkender Cursor, bis jemand eine Taste drückt —
   dann startet alles von vorne.
   ============================================================ */

let halted = false;

async function shutdown(){
  if (halted) return;
  halted = true;
  quietUntil = Infinity;
  $("#cli").blur();
  for (const l of [
    `<span class="dim">logout</span>`,
    `<span class="warn">Broadcast message from root@${SRV.host}: The system is going down for poweroff NOW!</span>`,
    `<span class="ok">[  OK  ]</span> Stopped quote.daemon.service`,
    `<span class="ok">[  OK  ]</span> Stopped render-engine.service`,
    `<span class="ok">[  OK  ]</span> Unmounted /usr/local/oeapp/bin`,
    `<span class="ok">[  OK  ]</span> Reached target Power-Off.`,
  ]){ addLine(l); await sleep(140); }
  await sleep(350);

  const parts = [".topbar", ".stage", ".botbar"].map(s => $(s));
  // Vorlage für die Kacheln: nur die sichtbaren Log-Zeilen, sonst wird es zu schwer
  const tpl = document.createElement("div");
  tpl.innerHTML = parts.map(p => p.outerHTML).join("");
  const tlog = tpl.querySelector("#log");
  while (tlog.children.length > 70) tlog.firstChild.remove();
  const html = tpl.innerHTML;
  const W = innerWidth, H = innerHeight;
  const COLS = W < 600 ? 4 : 7, ROWS = W < 600 ? 8 : 7;
  const cw = Math.ceil(W / COLS), ch = Math.ceil(H / ROWS);
  const layer = document.createElement("div");
  layer.className = "shatter";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anims = [];

  // Kacheln: jede zeigt per Versatz ihren Ausschnitt einer Kopie der Seite.
  // transform macht die Kachel zum Bezugsrahmen der position:fixed-Elemente.
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++){
    const tile = document.createElement("div");
    tile.className = "shard";
    Object.assign(tile.style, { left: c*cw + "px", top: r*ch + "px", width: cw + "px", height: ch + "px" });
    const inner = document.createElement("div");
    inner.className = "shard-inner";
    Object.assign(inner.style, { width: W + "px", height: H + "px", transform: `translate(${-c*cw}px, ${-r*ch}px)` });
    inner.innerHTML = html;
    tile.appendChild(inner);
    layer.appendChild(tile);
    // untere Reihen fallen zuerst, dann wandert der Zerfall nach oben
    const delay = (ROWS - 1 - r) * 110 + Math.random() * 260;
    const rot = (Math.random() * 2 - 1) * 28, dx = (Math.random() * 2 - 1) * 60;
    anims.push(() => tile.animate(reduce
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { transform: "translate(0,0) rotate(0)", opacity: 1 },
          { transform: "translate(0,-6px) rotate(0)", opacity: 1, offset: 0.12 },
          { transform: `translate(${dx}px, ${H - r*ch + ch}px) rotate(${rot}deg)`, opacity: 0.85 },
        ],
      { duration: reduce ? 600 : 900 + Math.random() * 500, delay, easing: "cubic-bezier(.55,0,1,.45)", fill: "forwards" }).finished);
  }
  document.body.appendChild(layer);
  // Kopien zeigen sonst den Anfang des Logs statt der letzten Zeilen.
  // Die IDs bleiben (fürs CSS); die Originale stehen im DOM vorne, $() trifft also weiter sie.
  layer.querySelectorAll("#log").forEach(l => l.scrollTop = l.scrollHeight);
  parts.forEach(p => p.style.visibility = "hidden");
  beep(140, 500, "sawtooth", 0.04);
  await Promise.all(anims.map(a => a()));
  layer.remove();

  // Nur noch der Cursor
  const halt = document.createElement("div");
  halt.className = "halt";
  halt.innerHTML = '<span class="cursor"></span>';
  document.body.appendChild(halt);
  await sleep(400);   // damit ein noch gedrücktes Enter nicht sofort neu startet
  const restart = () => location.reload();
  addEventListener("keydown", restart, { once: true });
  addEventListener("pointerdown", restart, { once: true });
}

function initKeys(){
  document.addEventListener("keydown", e => {
    if (halted){ e.preventDefault(); return; }
    // Apps mit eigener F-Tasten-Leiste (videothek) bekommen F1–F10 selbst
    const appFkeys = current && current.inst.fkeys && /^F([1-9]|10)$/.test(e.key);
    const fk = !appFkeys && { F1:"log", F2:"apps", F3:"snake", F4:"blocks" }[e.key];
    if (fk){ e.preventDefault(); go(fk); return; }
    if (current){
      // ESC: erst darf die App selbst zurückgehen, sonst wird sie beendet
      if (e.key === "Escape"){ e.preventDefault(); if (!(current.inst.escape && current.inst.escape())) exitApp(); return; }
      current.ctx.keys.add(normKey(e.key));
      if (current.inst.key && current.inst.key(e) === true) e.preventDefault();
      return;
    }
    // Im Log-Modus: Tippen landet immer im Prompt
    const cli = $("#cli");
    if (document.activeElement !== cli && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) cli.focus();
  });
  document.addEventListener("keyup", e => { if (current) current.ctx.keys.delete(normKey(e.key)); });
  addEventListener("blur", () => { if (current) current.ctx.keys.clear(); });
  document.querySelectorAll(".botbar .seg[data-go]").forEach(s => s.addEventListener("click", () => go(s.dataset.go)));
  $("#logSeg").addEventListener("click", logSegClick);
  logSeg();
  // Handys haben keine F-Tasten: dort sprechendere Beschriftung
  if (TOUCH){
    $('.botbar .seg[data-go="log"]').style.display = "none";   // "zurück" übernimmt der Schalter rechts
    $('.botbar .seg[data-go="apps"]').textContent = "☰ apps";
  }
}

function go(target){
  if (target === "log" || target === "exit"){ if (current) exitApp(); return; }
  runApp(target);
}

/* -------- Begrüßung --------
   Nach dem Boot ist erst Ruhe, nur der Cursor blinkt. Wer nichts tut,
   bekommt nach und nach Besuch vom Server: Tipp-Animation wie im
   Messenger, dann eine Zeile – erst "Klopf, klopf.", später App-Vorschläge.
   Jede Eingabe schiebt die nächste Meldung auf. Das Fake-Log läuft nur
   noch auf Wunsch ("log"). */

let logOn = false, logBooted = false;
let lastInput = Date.now(), lastMsg = Date.now();
let typingEl = null;

function showTyping(){ if (!typingEl) typingEl = addLine(`<span class="typing" aria-label="schreibt …"><i></i><i></i><i></i></span>`); }
function hideTyping(){ if (typingEl){ typingEl.remove(); typingEl = null; } }
for (const ev of ["keydown", "pointerdown", "input"]) addEventListener(ev, () => { lastInput = Date.now(); hideTyping(); }, { capture: true, passive: true });

// klickbare Vorschläge (vor allem fürs Handy)
log.addEventListener("click", e => {
  const a = e.target.closest("[data-cmd]");
  if (a) runCommand(a.dataset.cmd);
});
const cmdLink = (cmd, label = cmd) => `<span class="run" data-cmd="${esc(cmd)}">${esc(label)}</span>`;

// Zeile Zeichen für Zeichen eintippen, Markup bleibt erhalten
async function say(html, speed = 42){
  const div = addLine("");
  div.classList.add("say");
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const texts = [];
  (function walk(n){ for (const c of n.childNodes){ if (c.nodeType === 3){ texts.push([c, c.textContent]); c.textContent = ""; } else walk(c); } })(tpl.content);
  div.appendChild(tpl.content);
  for (const [node, full] of texts) for (const ch of full){
    node.textContent += ch;
    log.scrollTop = log.scrollHeight;
    if (ch !== " ") beep(1500 + rint(0, 300), 6, "square", 0.006);
    await sleep(speed * (0.6 + Math.random() * 0.8));
  }
}

const GREET = [
  { wait: 2000, msg: () => "Klopf, klopf." },
  { wait: 1500, msg: () => "Willkommen in der Matrix." },
  { wait: 1500, msg: () => TOUCH
      ? `Tipp unten auf ${cmdLink("apps", "☰ apps")} und such dir was aus.`
      : `Such dir eine App aus: ${cmdLink("apps")} oder F2 – oder tipp einfach ihren Namen.` },
];
const NUDGES = [
  a => `Wie wär's mit ${cmdLink(a.id)}? <span class="dim">${esc(a.desc || "")}</span>`,
  a => `Ich hätte da was für dich: ${cmdLink(a.id)}.`,
  a => `Noch da? ${cmdLink(a.id)} wartet auf dich.`,
  a => `Psst … probier mal ${cmdLink(a.id)}.`,
  a => `Langweilig? Eine Runde ${cmdLink(a.id)} hilft.`,
  a => `Folge dem weißen Kaninchen: ${cmdLink(a.id)}.`,
  a => `Mein Tipp für heute: ${cmdLink(a.id)}.`,
  a => `Kleiner Vorschlag unter uns: ${cmdLink(a.id)}.`,
];
const CHATTER = [
  "Die Matrix hat dich …",
  "Ich sehe dich. Na ja, fast.",
  "Hier drin läuft alles nur in deinem Browser. Kein Server liest mit.",
  "Ich warte. Ich bin gut im Warten.",
  "Es gibt keinen Löffel. Aber es gibt Apps.",
  "Tipp: Mit ↑ holst du den letzten Befehl zurück.",
  () => `Schon ${cmdLink("help")} probiert?`,
  () => `Oder schau dem System bei der Arbeit zu: ${cmdLink("log")}.`,
];
const AFTER_DEMO = [
  a => `Na, Lust bekommen? ${cmdLink(a.id)} – jetzt du.`,
  a => `So sieht ${cmdLink(a.id)} aus. Selbst spielen ist besser.`,
  a => `Das war nur die Vorführung. ${cmdLink(a.id)} gehört dir.`,
];
let lastPick = null;
function pickApp(pool){
  pool = pool.filter(a => !a.hidden && a.id !== "apps" && a.id !== lastPick);
  const a = rand(pool);
  lastPick = a.id;
  return a;
}
const pickLine = l => typeof l === "function" ? l() : esc(l);

async function greeter(){
  let i = 0, n = 0, demos = 0, since = 0;
  lastMsg = Date.now();
  for (;;){
    const step = GREET[i];
    // nach der Begrüßung: zufällige Abstände, die langsam länger werden
    const wait = step ? step.wait : Math.min(rint(5000, 11000) + n * 700, 40000);
    const idle = () => Date.now() - Math.max(lastInput, lastMsg);
    while (halted || current || logOn || idle() < wait || document.activeElement === $("#cli") && $("#cli").value) await sleep(200);
    if (!step && n >= 40) return;       // irgendwann ist auch mal gut
    // Vorführung: früh die erste, danach ab und zu
    const demoApps = APPS.filter(a => a.demo);
    if (!step && demoApps.length && (n === 0 || (since >= 3 && Math.random() < 0.4))){
      const a = pickApp(demoApps);
      showTyping(); await sleep(900); if (!typingEl) continue; hideTyping();
      await say(demos ? `Noch eine Vorführung: ${esc(a.id)}.` : `Ich zeig dir mal was. Vorführung: ${esc(a.id)}.`);
      await sleep(700);
      if (Date.now() - lastInput < 1500) continue;
      demos++; n++; since = 0;
      const played = await playDemo(a.id);
      lastMsg = Date.now();
      if (played){ await sleep(600); await say(rand(AFTER_DEMO)(a)); lastMsg = Date.now(); }
      continue;
    }
    showTyping();
    const until = Date.now() + 900 + Math.random() * 1100;
    while (typingEl && Date.now() < until) await sleep(80);
    if (!typingEl) continue;            // jemand hat getippt: der Server hört auf zu schreiben
    hideTyping();
    await say(step ? step.msg() : Math.random() < 0.25 ? pickLine(rand(CHATTER)) : rand(NUDGES)(pickApp(APPS)));
    lastMsg = Date.now();
    if (step) i++; else { n++; since++; }
  }
}

/* -------- Vorführung --------
   Eine App mit demo:true spielt 8 s lang selbst (ctx.demo), ohne Ton und
   ohne Rekorde. Taste oder Tippen = selbst spielen (App startet frisch),
   ESC oder Fußleiste = zurück zum Terminal. */
const DEMO_MS = 8000;
let demoRun = null;

function playDemo(id){
  return new Promise(res => {
    if (!runApp(id, [], true)) return res(false);
    document.body.classList.add("demo");
    const badge = document.createElement("div");
    badge.className = "demo-badge";
    badge.innerHTML = `<b>DEMO</b> · ${TOUCH ? "tippen" : "Taste drücken"} = selbst spielen`;
    $(".pane.main").appendChild(badge);
    demoRun = { id, res, badge, timer: setTimeout(() => endDemo(true), DEMO_MS) };
  });
}
// back: zurück zum Terminal (sonst läuft die App weiter bzw. wird neu gestartet)
function endDemo(back){
  if (!demoRun) return;
  const d = demoRun; demoRun = null;
  clearTimeout(d.timer);
  d.badge.remove();
  document.body.classList.remove("demo");
  if (back) exitApp();
  d.res(back);
}
function takeOver(){
  const id = demoRun.id;
  endDemo(false);
  runApp(id);
  if (logOn) addLine(fmt("OK", `${esc(id)}: Vorführung beendet, du bist dran.`));
}
addEventListener("keydown", e => {
  if (!demoRun) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === "Escape") endDemo(true); else takeOver();
}, { capture: true });
addEventListener("pointerdown", e => {
  if (!demoRun) return;
  if (e.target.closest(".botbar")){ endDemo(true); return; }   // Klick geht dann normal weiter
  e.preventDefault(); e.stopImmediatePropagation();
  takeOver();
}, { capture: true });

/* Schalter unten rechts: in einer App = zurück zum Terminal, sonst Log an/aus */
function logSeg(){
  const el = $("#logSeg");
  if (!el) return;
  el.innerHTML = current && !current.demo ? "◂ zurück" : `log&nbsp;<b>${logOn ? "an" : "aus"}</b>`;
  el.classList.toggle("on", logOn && !current);
}
function logSegClick(){
  if (current){ exitApp(); return; }
  setLog(!logOn);
}

async function setLog(on){
  logOn = on;
  setTitle();
  logSeg();
  if (!on){ out(`<span class="dim">log angehalten — „log“ startet es wieder.</span>`); return; }
  quietUntil = 0;
  hideTyping();
  if (logBooted) return;
  logBooted = true;
  addLine(`<span class="ok">★</span>  ${SRV.host} <span class="dim">— static build</span> — process monitor attached.`);
  addLine(fmt("OK","quote.daemon online — pulling from local store"));
  addLine(fmt("OK",`<span class="path">/usr/local/oeapp/bin</span> mounted — ${APPS.filter(a=>!a.hidden).length} apps <span class="dim">(${TOUCH ? "unten auf ☰ apps tippen" : "tippe „apps“ oder drück F2"})</span>`));
  await sleep(300);
  sectionDivider("startup self-check");
  await progressLine("preflight checks", 28);
  await progressLine("warming cache", 32);
  await asciiSpinner("verifying tls chain (Let's Encrypt R3)");
  await asciiSpinner(`connecting to db-primary as ${SRV.host}`);
  sectionDivider("steady state");
  addLine(fmt("OK", `bereit. <span class="ok">help</span> für Befehle, <span class="ok">apps</span> für die Mini-Apps, <span class="ok">log off</span> stoppt das Log.`));
}

/* -------- Update-Check --------
   Als App auf dem Home-Bildschirm lädt iOS die Seite oft tagelang nicht neu.
   Darum beim Zurückholen in den Vordergrund und alle 10 Minuten index.html
   frisch holen und die Versionsnummer (?v=…) vergleichen. Ist sie neu,
   wird neu geladen – aber nie mitten in einer App oder einer Eingabe. */

const MY_VER = ((document.querySelector('script[src*="js/core.js"]') || {}).src || "").match(/[?&]v=(\d+)/)?.[1];
let updateReady = false, lastCheck = 0;

async function checkUpdate(){
  if (updateReady) return applyUpdate();
  if (!MY_VER || Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  try{
    const r = await fetch("index.html?u=" + Date.now(), { cache: "no-store" });
    const v = (await r.text()).match(/js\/core\.js\?v=(\d+)/)?.[1];
    if (v && v !== MY_VER) updateReady = true;
  } catch(e){}
  applyUpdate();
}
function applyUpdate(){
  if (!updateReady || current || halted || $("#cli").value) return;
  out(`<span class="ok">update</span> <span class="dim">— neue Version gefunden, lade neu …</span>`);
  setTimeout(() => location.reload(), 900);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
addEventListener("pageshow", e => { if (e.persisted) checkUpdate(); });
setInterval(checkUpdate, 10 * 60 * 1000);

/* -------- MAIN -------- */

async function start(){
  initQuote();
  $("#year").textContent = new Date().getFullYear();
  tickMeters(); renderProcs(); tickClock();
  setInterval(tickMeters, 800);
  setInterval(renderProcs, 1200);
  setInterval(tickClock, 1000);
  initCli();
  initKeys();

  await bootAnim();
  setTitle();
  if (!TOUCH) $("#cli").focus();
  greeter();

  setTimeout(showQuote, 4000);
  setInterval(showQuote, 12000);

  setInterval(() => {
    if (!logOn || quiet()) return;
    const burst = 1 + (Math.random()<0.25 ? rint(1,3) : 0);
    for (let i=0; i<burst; i++) addLine(genLine());
  }, 380);

  setInterval(async () => {
    if (!logOn || quiet()) return;
    const r = Math.random();
    if (r < 0.18){
      await progressLine(rand(["rebuilding index","compacting WAL","retraining ranker","encoding corpus"]), rint(20,40));
    } else if (r < 0.32){
      await asciiSpinner(rand(["fsync /var/lib/oeapp","handshake with cdn-04","scrubbing old sessions"]), rint(900,2200));
    } else if (r < 0.40){
      sectionDivider(rand(["heartbeat","scheduled tick","cron @ * */1 * * *","gc pass"]));
    }
  }, 4500);

  setInterval(() => {
    if (!logOn || quiet()) return;
    addLine(fmt("DBG", `stats refreshed — load=<span class="num">${$("#load").textContent}</span> mem=<span class="num">${Math.round(m.mem)}%</span> host=<span class="path">gh-pages</span>`));
  }, 30000);
}

window.OE = { register, start, run: runApp, exit: exitApp, apps: APPS, store, beep, esc };

})();
