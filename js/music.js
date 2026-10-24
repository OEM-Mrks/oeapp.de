/* ============================================================
   oeapp.de — Synthwave-Musik für die Spiele
   Wird live im Browser erzeugt (WebAudio), keine Audiodateien.
   Jedes Spiel hat einen eigenen Track: Tempo, Tonart, Akkordfolge
   und eine Melodie, die aus einem festen Startwert entsteht (klingt
   also jedes Mal gleich). Ein/aus über "♪" in der Fußleiste,
   die Einstellung merkt sich der Browser.
   ============================================================ */

(function(){
"use strict";

// root = Grundton als MIDI-Nummer (57 = A3), prog = Stufen der Moll-Tonleiter je Takt
const TRACKS = {
  snake:  { bpm: 112, root: 57, prog: [0, 5, 2, 6], seed: 3,    four: false },
  blocks: { bpm: 126, root: 52, prog: [0, 3, 5, 4], seed: 11,   four: true  },
  pong:   { bpm: 118, root: 50, prog: [0, 6, 5, 6], seed: 7,    four: false },
  chomp:  { bpm: 132, root: 48, prog: [0, 5, 3, 4], seed: 21,   four: true  },
  race:   { bpm: 104, root: 54, prog: [0, 5, 2, 6], seed: 42,   four: false },
  tron:   { bpm: 138, root: 47, prog: [0, 0, 5, 6], seed: 1982, four: true  },
  ttt:    { bpm: 96,  root: 55, prog: [0, 3, 5, 6], seed: 33,   four: false },
  ssp:    { bpm: 100, root: 53, prog: [0, 3, 4, 0], seed: 333,  four: true  },
  dilemma:{ bpm: 84,  root: 45, prog: [0, 5, 0, 4], seed: 1980, four: false },
};
const SCALE = [0, 2, 3, 5, 7, 8, 10];   // natürliches Moll
const LEAD_RHYTHMS = [               // 1 = Ton beginnt (16tel, zwei Takte)
  "1000001010001000100000101000100010000010100010001000001000100000",
  "1000100010101000100000001010000010001000101010001000000010000000",
  "1010001000100010100000101000000010100010001000101000001000000000",
];

const store = {
  get(){ try{ return localStorage.getItem("oe.music") === "1"; } catch(e){ return false; } },
  set(v){ try{ localStorage.setItem("oe.music", v ? "1" : "0"); } catch(e){} },
};

let enabled = store.get(), appId = null;
let ac = null, master = null, rev = null, dly = null, noise = null;
let track = null, timer = null, nextT = 0, step = 0, lead = null;

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ---------- Audio-Grundgerüst: Master, Hall, Echo ---------- */
/* iOS: WebAudio verstummt sonst beim Lautlos-Schalter; "playback" spielt trotzdem,
   aber nur solange die Musik eingeschaltet ist */
function session(){
  try{ if (navigator.audioSession) navigator.audioSession.type = enabled ? "playback" : "auto"; } catch(e){}
}
const asleep = () => ac.state !== "running" && ac.state !== "closed";   // auch iOS-"interrupted"

function init(){
  if (ac) return true;
  session();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ac.destination);
  // Hall: selbst erzeugter Nachhall aus abklingendem Rauschen
  rev = ac.createConvolver();
  const len = ac.sampleRate * 2.2, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  rev.buffer = ir;
  const revOut = ac.createGain(); revOut.gain.value = 0.35;
  rev.connect(revOut); revOut.connect(master);
  // Echo im Takt (punktierte Achtel), typisch für 80er-Leads
  dly = ac.createDelay(1.5);
  const fb = ac.createGain(); fb.gain.value = 0.32;
  const dlyOut = ac.createGain(); dlyOut.gain.value = 0.4;
  const dlyLp = ac.createBiquadFilter(); dlyLp.type = "lowpass"; dlyLp.frequency.value = 2600;
  dly.connect(dlyLp); dlyLp.connect(fb); fb.connect(dly); dlyLp.connect(dlyOut); dlyOut.connect(master);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return true;
}

function out(node, { dry = 1, reverb = 0, echo = 0 } = {}){
  if (dry){ const g = ac.createGain(); g.gain.value = dry; node.connect(g); g.connect(master); }
  if (reverb){ const g = ac.createGain(); g.gain.value = reverb; node.connect(g); g.connect(rev); }
  if (echo){ const g = ac.createGain(); g.gain.value = echo; node.connect(g); g.connect(dly); }
}
function env(g, t, a, peak, d, sustain = 0){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
}

/* ---------- Instrumente ---------- */
function kick(t){
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  env(g, t, 0.002, 0.9, 0.32);
  o.connect(g); out(g); o.start(t); o.stop(t + 0.36);
}
function snare(t){
  const n = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noise; hp.type = "highpass"; hp.frequency.value = 1300;
  env(g, t, 0.002, 0.32, 0.2);
  n.connect(hp); hp.connect(g); out(g, { reverb: 0.9 }); n.start(t); n.stop(t + 0.25);
  const o = ac.createOscillator(), og = ac.createGain();
  o.type = "triangle"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  env(og, t, 0.002, 0.25, 0.1);
  o.connect(og); out(og, { reverb: 0.5 }); o.start(t); o.stop(t + 0.14);
}
function hat(t, open){
  const n = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noise; hp.type = "highpass"; hp.frequency.value = 7500;
  env(g, t, 0.001, open ? 0.07 : 0.05, open ? 0.22 : 0.045);
  n.connect(hp); hp.connect(g); out(g); n.start(t, Math.random() * 0.5); n.stop(t + 0.3);
}
function bass(t, m, dur){
  const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
  o.type = "sawtooth"; o.frequency.value = mtof(m);
  lp.type = "lowpass"; lp.Q.value = 6;
  lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur);
  env(g, t, 0.004, 0.2, dur);
  o.connect(lp); lp.connect(g); out(g); o.start(t); o.stop(t + dur + 0.02);
}
function arp(t, m, dur){
  const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
  o.type = "square"; o.frequency.value = mtof(m);
  lp.type = "lowpass"; lp.frequency.value = 2400;
  env(g, t, 0.003, 0.045, dur);
  o.connect(lp); lp.connect(g); out(g, { dry: 0.8, echo: 0.6 }); o.start(t); o.stop(t + dur + 0.02);
}
function pad(t, notes, dur){
  for (const m of notes) for (const det of [-8, 8]){
    const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det;
    lp.type = "lowpass"; lp.frequency.value = 1300;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.35);
    g.gain.setValueAtTime(0.022, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    o.connect(lp); lp.connect(g); out(g, { dry: 0.7, reverb: 0.6 }); o.start(t); o.stop(t + dur + 0.3);
  }
}
function leadNote(t, m, dur){
  const g = ac.createGain(), lp = ac.createBiquadFilter(), vib = ac.createOscillator(), vg = ac.createGain();
  lp.type = "lowpass"; lp.frequency.value = 2300; lp.Q.value = 2;
  vib.frequency.value = 5.5; vg.gain.value = 0;
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(14, t + Math.min(0.4, dur));   // Vibrato setzt verzögert ein
  vib.connect(vg);
  for (const det of [-6, 6]){
    const o = ac.createOscillator();
    o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det;
    vg.connect(o.detune);
    o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.015);
  g.gain.setValueAtTime(0.05, t + Math.max(0.02, dur - 0.05));
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
  lp.connect(g); out(g, { dry: 0.9, reverb: 0.35, echo: 0.45 });
  vib.start(t); vib.stop(t + dur + 0.05);
}

/* ---------- Komposition ---------- */
const deg = (tr, d, oct = 0) => tr.root + 12 * (oct + Math.floor(d / 7)) + SCALE[((d % 7) + 7) % 7];
const chord = (tr, d, oct = 0) => [deg(tr, d, oct), deg(tr, d + 2, oct), deg(tr, d + 4, oct)];

// Melodie für 8 Takte: Zwei-Takt-Motiv, wird über die Akkorde verschoben und leicht variiert
function compose(tr){
  const rnd = seeded(tr.seed);
  const rhythm = LEAD_RHYTHMS[Math.floor(rnd() * LEAD_RHYTHMS.length)];
  const motif = [];
  let d = 4;
  for (let i = 0; i < 32; i++){
    if (rhythm[i] !== "1") continue;
    d += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(rnd() * 8)];
    d = Math.max(0, Math.min(9, d));
    let len = 1; while (i + len < 32 && rhythm[i + len] !== "1" && len < 6) len++;
    motif.push({ s: i, d, len });
  }
  const notes = [];
  for (let phrase = 0; phrase < 4; phrase++){
    const shift = tr.prog[(phrase * 2) % tr.prog.length] - tr.prog[0];
    motif.forEach((n, k) => {
      let dd = n.d + Math.round(shift / 2);
      if (phrase === 3 && k === motif.length - 1) dd = 7;   // Phrase endet auf dem Grundton
      else if (phrase % 2 && rnd() < 0.3) dd += rnd() < 0.5 ? -1 : 1;
      notes.push({ s: phrase * 32 + n.s, m: deg(tr, dd, 1), len: n.len });
    });
  }
  return notes;
}

function schedule(s, t){
  const tr = track, spb = 60 / tr.bpm / 4;                 // Dauer einer 16tel
  const bar = Math.floor(s / 16) % 16, inBar = s % 16;
  const cd = tr.prog[bar % tr.prog.length];
  const intro = s < 32;                                     // zwei Takte nur Flächen und Arpeggio

  if (inBar === 0) pad(t, chord(tr, cd, 0), spb * 16);
  // Arpeggio: Akkordtöne über zwei Oktaven auf und ab
  const ch = chord(tr, cd, 1), ap = [0, 1, 2, 3, 2, 1, 0, 1][inBar % 8];
  arp(t, ap === 3 ? ch[0] + 12 : ch[ap], spb * 0.9);
  if (intro) return;

  // Bass: Achtel im Oktavwechsel, typischer Synthwave-Antrieb
  if (inBar % 2 === 0) bass(t, deg(tr, cd, -1) + (inBar % 4 === 2 ? 12 : 0), spb * 1.7);
  // Schlagzeug
  if (tr.four ? inBar % 4 === 0 : inBar === 0 || inBar === 8 || (inBar === 10 && bar % 2)) kick(t);
  if (inBar === 4 || inBar === 12) snare(t);
  if (inBar % 2 === 1 || (tr.four && inBar % 2 === 0)) hat(t, inBar === 14);
  if (bar === 15 && inBar >= 12) snare(t);                 // kleiner Wirbel vor dem Neuanfang

  // Lead in der zweiten Hälfte der Schleife
  if (bar >= 8){
    const local = (bar - 8) * 16 + inBar;
    for (const n of lead) if (n.s === local) leadNote(t, n.m, n.len * spb * 0.95);
  }
}

/* ---------- Ablauf ---------- */
function pump(){
  if (!ac || !track) return;
  if (nextT < ac.currentTime - 0.1) nextT = ac.currentTime + 0.05;   // nach Hängern nicht alles auf einmal nachspielen
  while (nextT < ac.currentTime + 0.15){
    schedule(step, nextT);
    nextT += 60 / track.bpm / 4;
    step++;
  }
}
function play(id){
  const tr = TRACKS[id];
  if (!tr || !enabled || !init()) return stop();
  if (asleep()) ac.resume().catch(() => {});
  if (track === tr && timer) return;
  track = tr; lead = compose(tr); step = 0; nextT = ac.currentTime + 0.12;
  dly.delayTime.value = 3 * 60 / tr.bpm / 4;
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setValueAtTime(master.gain.value, ac.currentTime);
  master.gain.linearRampToValueAtTime(0.32, ac.currentTime + 0.8);   // unter den Spielgeräuschen bleiben
  clearInterval(timer); timer = setInterval(pump, 25); pump();
}
function stop(){
  if (!ac || !timer) return;
  const t = ac.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0, t + 0.5);
  clearInterval(timer); timer = null; track = null;
}

/* ---------- Schalter in der Fußleiste ---------- */
const seg = document.createElement("div");
seg.className = "seg music-seg";
seg.setAttribute("role", "button");
seg.title = "Synthwave-Musik in den Spielen ein/aus";
function label(){ seg.innerHTML = `<span>♪ musik&nbsp;<b>${enabled ? "an" : "aus"}</b></span>`; seg.classList.toggle("on", enabled); }
seg.addEventListener("click", () => {
  enabled = !enabled; store.set(enabled); label();
  session();
  if (enabled){ init(); if (asleep()) ac.resume().catch(() => {}); if (appId) play(appId); }
  else stop();
});
const spacer = document.querySelector(".botbar .spacer");
if (spacer) spacer.parentNode.insertBefore(seg, spacer);
label();

addEventListener("oe:app", e => { appId = e.detail; if (appId && TRACKS[appId]) play(appId); else stop(); });
document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden){ ac.suspend().catch(() => {}); }
  else if (timer && asleep()){ ac.resume().then(() => { nextT = Math.max(nextT, ac.currentTime + 0.05); }).catch(() => {}); }
});

window.OE_MUSIC = { tracks: TRACKS, play, stop };
})();
