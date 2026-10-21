/* fsociety — Fake-Shell im Stil von "Mr. Robot". Jeder Befehl ist
   gespielt: nichts verlässt den Browser, alle Hosts und IPs sind erfunden
   (Adressen aus den Dokumentationsbereichen 10.x / 192.0.2.x / 203.0.113.x). */

OE.register({
  id: "fsociety",
  alias: ["mrrobot", "robot"],
  title: "fsociety // shell",
  desc: "Fake-Hacker-Shell. /help zeigt die Befehle.",
  start(ctx){
    const { esc, rint, rand, sleep } = ctx;
    ctx.el.innerHTML = `<div class="app-bar"><span>fsociety <b>v2.0</b></span><span>tty: <b>pts/0</b></span>
      <span class="right">alles fake · /help</span></div><div class="fs-tty" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
    const t = ctx.tty(ctx.el.querySelector(".fs-tty"), { placeholder: "/help" });

    let host = "fsociety", user = "root", cwd = "~";
    const ps1 = () => `<span class="err">${user}@${host}</span><span class="dim">:</span>${cwd}<span class="dim">#</span>`;
    const setPrompt = () => t.prompt(ps1());

    const FILES = {
      "readme.txt": [
        "Hallo, Freund.",
        "",
        "Wenn du das liest, bist du schon drin. Glückwunsch —",
        "nur dass hier nichts echt ist. Jeder Befehl ist Theater.",
        "",
        "Probier: nmap, ssh, exploit, decrypt, ecorp, mask.",
      ],
      "notes.txt": [
        "- E Corp Backup-Server: Tape-Archiv in Halle 4 (laut Notiz)",
        "- Tyrell fragt zu viel",
        "- nicht vergessen: Fisch füttern",
        "- Stage 2 erst nach dem 5/9",
      ],
      "fsociety.dat": ["<binär>  benutze: decrypt fsociety.dat"],
      "ecorp_backup.tar.gz.enc": ["<verschlüsselt>  benutze: decrypt ecorp_backup.tar.gz.enc"],
    };
    const DIRS = ["keys/", "tools/", ".ssh/"];

    const MASK = [
      "                 ▄▄████████▄▄",
      "              ▄██▀▀        ▀▀██▄",
      "            ▄█▀    ▄▄    ▄▄    ▀█▄",
      "           ██     ████  ████     ██",
      "           ██      ▀▀    ▀▀      ██",
      "           ██   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄   ██",
      "            ▀█▄   ▀▀▀▀▀▀▀▀▀▀   ▄█▀",
      "              ▀██▄▄        ▄▄██▀",
      "                 ▀▀████████▀▀",
      "",
      "        f  s  o  c  i  e  t  y",
    ];

    const HELP = [
      ["help, /help", "diese Übersicht"],
      ["ls, cat <datei>", "Dateien ansehen"],
      ["whoami, id, uname", "wer bin ich, wo bin ich"],
      ["ifconfig", "Netzwerk (erfunden)"],
      ["nmap <host>", "Ports scannen (gespielt)"],
      ["ssh <host>", "einloggen (gespielt)"],
      ["exploit <host>", "\"hacken\" mit Fortschrittsbalken"],
      ["decrypt <datei>", "Datei \"entschlüsseln\""],
      ["traceroute <host>", "Route anzeigen"],
      ["ecorp", "Status von E Corp"],
      ["mask", "die Maske"],
      ["clear, history", "Bildschirm leeren, Verlauf"],
      ["exit", "ssh verlassen / zurück zum Hauptterminal"],
    ];

    const fakeIp = () => rand([`10.${rint(0,255)}.${rint(0,255)}.${rint(2,254)}`, `192.0.2.${rint(2,254)}`, `203.0.113.${rint(2,254)}`]);
    const ipOf = {};
    const resolve = h => ipOf[h] || (ipOf[h] = fakeIp());
    const history = [];
    let busy = false;

    async function bar(label, ms = 1600){
      const d = t.print("");
      const N = 26, steps = 26;
      for (let i = 0; i <= steps && ctx.alive; i++){
        const f = Math.round(i / steps * N);
        d.innerHTML = `${label} <span class="dim">[</span><span class="ok">${"#".repeat(f)}</span>${".".repeat(N - f)}<span class="dim">]</span> ${Math.round(i / steps * 100)}%`;
        t.out.scrollTop = t.out.scrollHeight;
        await sleep(ms / steps * (0.5 + Math.random()));
      }
    }

    async function hexdump(n = 6){
      for (let i = 0; i < n && ctx.alive; i++){
        const off = (i * 16).toString(16).padStart(8, "0");
        const bytes = Array.from({ length: 16 }, () => rint(0, 255).toString(16).padStart(2, "0")).join(" ");
        t.print(`<span class="dim">${off}</span>  ${bytes}`);
        await sleep(40);
      }
    }

    const CMDS = {
      help(){
        t.print('<span class="ok">fsociety shell</span> <span class="dim">— alles hier ist gespielt.</span>');
        HELP.forEach(([c, d]) => t.print(`  <span class="path">${esc(c.padEnd(20))}</span> <span class="dim">${d}</span>`));
      },
      ls(a){
        if (a[0] && a[0].startsWith("keys")) return t.print("id_rsa.fake   whiterose.pub   darkarmy.asc");
        t.print([...DIRS.map(d => `<span class="path">${d}</span>`), ...Object.keys(FILES)].join("   "));
      },
      cat(a){
        const f = FILES[a[0]];
        if (!a[0]) return t.print("cat: welche Datei?");
        if (!f) return t.print(`<span class="err">cat: ${esc(a[0])}: Datei oder Verzeichnis nicht gefunden</span>`);
        f.forEach(l => t.print(esc(l)));
      },
      whoami(){ t.print(user === "root" ? "root <span class=\"dim\">(eigentlich: Gast im Browser)</span>" : user); },
      id(){ t.print(`uid=0(${user}) gid=0(root) groups=0(root),1337(fsociety)`); },
      uname(){ t.print(`Linux ${host} 4.0.5-kali #1 SMP x86_64 GNU/Linux <span class="dim">(gespielt)</span>`); },
      pwd(){ t.print(cwd === "~" ? "/root" : cwd); },
      date(){ t.print(new Date().toString()); },
      sudo(){ t.print("du bist schon root. mehr root geht nicht."); },
      history(){ history.forEach((h, i) => t.print(`<span class="dim">${String(i + 1).padStart(4)}</span>  ${esc(h)}`)); },
      clear(){ t.clear(); },
      async ifconfig(){
        t.print(`eth0: flags=4163&lt;UP,BROADCAST,RUNNING,MULTICAST&gt;  mtu 1500`);
        t.print(`      inet ${resolve(host)}  netmask 255.255.255.0`);
        t.print(`      ether de:ad:be:ef:${rint(10,99)}:${rint(10,99)}`);
        t.print(`tun0: flags=4305&lt;UP,POINTOPOINT,RUNNING&gt;  <span class="dim">via 7 proxies</span>`);
      },
      async nmap(a){
        const h = a.filter(x => !x.startsWith("-"))[0];
        if (!h) return t.print("nmap: Ziel fehlt. Beispiel: nmap ecorp.com");
        t.print(`Starting Nmap 7.94 <span class="dim">( fake )</span> at ${new Date().toLocaleString("de-DE")}`);
        await sleep(600);
        t.print(`Nmap scan report for ${esc(h)} (${resolve(h)})`);
        t.print(`Host is up (0.0${rint(10, 99)}s latency).`);
        t.print("PORT      STATE    SERVICE");
        const ports = [[22,"ssh"],[25,"smtp"],[53,"domain"],[80,"http"],[110,"pop3"],[143,"imap"],[443,"https"],[445,"microsoft-ds"],[3306,"mysql"],[3389,"ms-wbt-server"],[5432,"postgresql"],[8080,"http-proxy"]];
        for (const [p, s] of ports){
          if (!ctx.alive) return;
          await sleep(rint(80, 260));
          const st = Math.random() < 0.45 ? "open" : Math.random() < 0.5 ? "filtered" : "closed";
          if (st === "closed") continue;
          t.print(`${(p + "/tcp").padEnd(9)} <span class="${st === "open" ? "ok" : "warn"}">${st.padEnd(8)}</span> ${s}`);
        }
        t.print(`Nmap done: 1 IP address (1 host up) scanned in ${(Math.random() * 4 + 1).toFixed(2)} seconds`);
      },
      async traceroute(a){
        const h = a[0] || "ecorp.com";
        t.print(`traceroute to ${esc(h)} (${resolve(h)}), 30 hops max`);
        const n = rint(5, 9);
        for (let i = 1; i <= n && ctx.alive; i++){
          await sleep(rint(120, 400));
          t.print(`${String(i).padStart(2)}  ${i === n ? resolve(h) : fakeIp()}  ${(Math.random() * 40 + i * 3).toFixed(3)} ms`);
        }
      },
      async ssh(a){
        const target = (a[0] || "").split("@").pop();
        if (!target) return t.print("usage: ssh [user@]host");
        if (host !== "fsociety") return t.print("erst mit exit zurück, dann weiter.");
        t.print(`Connecting to ${esc(target)} (${resolve(target)}) port 22 …`);
        await sleep(700);
        t.print(`The authenticity of host '${esc(target)}' can't be established.`);
        t.print(`ED25519 key fingerprint is SHA256:${btoa(String(Math.random())).slice(0, 32)}.`);
        await sleep(500);
        t.print('<span class="dim">yes  ← automatisch bestätigt</span>');
        await bar("brute-force key exchange", 1800);
        if (!ctx.alive) return;
        t.print(`<span class="ok">Access granted.</span> Last login: ${new Date(Date.now() - 864e5 * rint(1, 40)).toUTCString()}`);
        user = (a[0] || "").includes("@") ? a[0].split("@")[0] : "admin";
        host = target.split(".")[0];
        cwd = "~";
        setPrompt();
      },
      async exploit(a){
        const h = a[0] || "ecorp.com";
        t.print(`[*] Ziel: ${esc(h)} (${resolve(h)})`);
        await sleep(300);
        t.print("[*] lade Payload: <span class=\"path\">rootkit_v3.ko</span>");
        await bar("[*] Pufferüberlauf vorbereiten", 1300);
        await hexdump(5);
        await bar("[*] Rechte ausweiten", 1500);
        if (!ctx.alive) return;
        t.print(`<span class="ok">[+] root auf ${esc(h)}. Willkommen.</span> <span class="dim">(nicht wirklich)</span>`);
        ctx.log("WARN", `fsociety: gespielter Einbruch auf <span class="path">${esc(h)}</span> <span class="dim">— Theater, kein echter Traffic</span>`);
      },
      async decrypt(a){
        const f = a[0];
        if (!f) return t.print("decrypt: welche Datei?");
        if (!FILES[f]) return t.print(`<span class="err">decrypt: ${esc(f)} nicht gefunden</span>`);
        await hexdump(4);
        await bar("AES-256 brute force", 2200);
        if (!ctx.alive) return;
        if (f === "fsociety.dat"){
          t.print("");
          MASK.forEach(l => t.print(`<span class="err">${esc(l)}</span>`));
          t.print("");
          t.print("<span class=\"ok\">Wir sind fsociety. Wir sind niemand. Wir sind jeder.</span>");
        } else {
          t.print("<span class=\"ok\">entschlüsselt:</span> 4.096 Dateien, 1,2 TB Kundendaten …");
          t.print("<span class=\"dim\">… natürlich nicht. Das hier ist eine Webseite.</span>");
        }
      },
      async ecorp(){
        t.print("<span class=\"err\">E CORP</span> <span class=\"dim\">// status board</span>");
        const rows = [["Kurs", `${(Math.random() * 20 + 3).toFixed(2)} $  ▼ ${rint(40, 92)}%`], ["Server", `${rint(2, 9)} von 71 online`], ["Backups", "vernichtet"], ["Kredite", "gelöscht"], ["Stimmung", "Panik"]];
        for (const [k, v] of rows){ await sleep(180); t.print(`  ${k.padEnd(10)} <span class="warn">${v}</span>`); }
      },
      mask(){ MASK.forEach(l => t.print(`<span class="err">${esc(l)}</span>`)); },
      exit(){
        if (host !== "fsociety"){
          t.print(`Connection to ${esc(host)} closed.`);
          host = "fsociety"; user = "root"; cwd = "~"; setPrompt();
        } else ctx.exit();
      },
      cd(a){ cwd = !a[0] || a[0] === "~" ? "~" : (a[0].startsWith("/") ? a[0] : `~/${a[0]}`).replace(/\/$/, ""); setPrompt(); },
      rm(){ t.print("<span class=\"err\">rm: nein.</span>"); },
    };

    t.onLine(async v => {
      const raw = v.trim();
      t.print(`${ps1()} ${esc(v)}`);
      if (!raw || busy) return;
      history.push(raw);
      const [c0, ...args] = raw.split(/\s+/);
      const c = c0.replace(/^\//, "").toLowerCase();
      const fn = CMDS[c];
      if (!fn) return t.print(`<span class="err">bash: ${esc(c0)}: command not found</span> <span class="dim">— /help</span>`);
      busy = true; t.lock(true);
      try { await fn(args); } finally { busy = false; if (ctx.alive) t.lock(false); }
    });

    setPrompt();
    (async () => {
      await t.type('<span class="dim">Verbindung über 7 Proxies … ok</span>', 10);
      await t.type('<span class="ok">Hallo, Freund.</span> Tippe <span class="path">/help</span>.', 25);
    })();
  },
});
