/* =====================================================================
   DevQuest mascot — ACHIEVEMENT edition
   ---------------------------------------------------------------------
   Sprites are unlocked by *doing things* on DevQuest, not by clicking a
   mascot. Open jobs, follow studios, share the site, come back on
   different days → achievements unlock, each revealing one sprite.

   Discovery: nothing shows in the header until you unlock your first
   sprite. Then a small icon appears next to the logo with a gold flash
   and a one-time hint; from then on it shows your latest unlock + a
   count, flashes on each new unlock, and opens your collection on click.

   100% client-side (localStorage) — no accounts, no backend. We reward
   exploration and loyalty, never applying.

   Detection: we wrap window.dqTrack (the site's own cookieless event
   tracker) and tally real actions. Adding/▾editing achievements = edit
   the ACH array below.

   Art: CraftPix free pixel-icon packs (doodle-sprites/packs/<id>/N.png).
   TO REMOVE: delete the <!-- DOODLE:START --> block in index.html, this
   file, and the doodle-sprites/ folder.
   ===================================================================== */
(function () {
  "use strict";

  var BASE = "doodle-sprites/packs/";
  var SOUND = true;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches);

  // ---- Tiers (each draws its art from one pack) ----
  var TIERS = [
    { id: "explorer",  name: "Explorer",  pack: "low-monsters" },
    { id: "collector", name: "Collector", pack: "goblin" },
    { id: "champion",  name: "Champion",  pack: "pirate" }
  ];
  function packOf(tier) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === tier) return TIERS[i].pack; return "low-monsters"; }
  function tierName(tier) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === tier) return TIERS[i].name; return tier; }

  // ---- Achievements. Each carries its own hand-picked sprite: pack + n (index
  //      1..48 in doodle-sprites/packs/<pack>/). test(s) -> unlocked? ----
  var ACH = [
    // Explorer — browse & discover
    { id: "open1",   tier: "explorer", pack: "pirate", n: 12, name: "Window Shopper", hint: "Open your first job",          test: function (s) { return s.jobs >= 1; } },     // compass
    { id: "search",  tier: "explorer", pack: "bow",    n: 2,  name: "On the Hunt",    hint: "Run a search",                 test: function (s) { return s.search >= 1; } },   // bow
    { id: "filter",  tier: "explorer", pack: "pirate", n: 20, name: "Picky",          hint: "Apply a filter",               test: function (s) { return s.filter >= 1; } },   // dividers
    { id: "open25",  tier: "explorer", pack: "pirate", n: 19, name: "Deep Diver",     hint: "Open 25 jobs",                 test: function (s) { return s.jobs >= 25; } },    // map
    { id: "open100", tier: "explorer", pack: "pirate", n: 8,  name: "Job Scholar",    hint: "Open 100 jobs",                test: function (s) { return s.jobs >= 100; } },   // scroll
    { id: "map",     tier: "explorer", pack: "pirate", n: 4,  name: "Cartographer",   hint: "Explore the studio map",       test: function (s) { return s.map >= 1; } },      // treasure map
    { id: "grid",    tier: "explorer", pack: "pirate", n: 32, name: "Number Cruncher",hint: "Use the discipline grid",      test: function (s) { return s.grid >= 1; } },     // coins
    { id: "bestfit", tier: "explorer", pack: "pirate", n: 14, name: "Matchmaker",     hint: "Use the Best-Fit finder",      test: function (s) { return s.bestfit >= 1; } },  // key that fits
    // Collector — curate your hunt
    { id: "follow1", tier: "collector", pack: "goblin", n: 23, name: "First Crush",   hint: "Follow a studio",              test: function (s) { return s.follow >= 1; } },   // heart
    { id: "follow5", tier: "collector", pack: "bow",    n: 32, name: "Talent Scout",  hint: "Follow 5 studios",             test: function (s) { return s.follow >= 5; } },   // crossbow
    { id: "save1",   tier: "collector", pack: "goblin", n: 18, name: "Squirrel",      hint: "Save a job",                   test: function (s) { return s.save >= 1; } },     // backpack
    { id: "save10",  tier: "collector", pack: "pirate", n: 10, name: "Hoarder",       hint: "Save 10 jobs",                 test: function (s) { return s.save >= 10; } },    // open chest
    { id: "alert",   tier: "collector", pack: "goblin", n: 33, name: "On Alert",      hint: "Set up a job alert",           test: function (s) { return s.alert >= 1; } },    // torch beacon
    { id: "track",   tier: "collector", pack: "goblin", n: 20, name: "Organiser",     hint: "Track a job's status",         test: function (s) { return s.track >= 1; } },    // scroll/list
    { id: "know",    tier: "collector", pack: "goblin", n: 42, name: "Connector",     hint: "Use “Who do I know?”",         test: function (s) { return s.know >= 1; } },     // bead necklace
    { id: "pin",     tier: "collector", pack: "pirate", n: 43, name: "Curator",       hint: "Pin a favourite",              test: function (s) { return s.pin >= 1; } },      // goblet
    // Champion — share & stick around
    { id: "share1",  tier: "champion", pack: "pirate", n: 23, name: "Herald",         hint: "Share DevQuest",               test: function (s) { return s.shareP.length >= 1; } }, // flag
    { id: "share3",  tier: "champion", pack: "pirate", n: 24, name: "Town Crier",     hint: "Share on 3 platforms",         test: function (s) { return s.shareP.length >= 3; } }, // big flag
    { id: "copy",    tier: "champion", pack: "pirate", n: 25, name: "Link Wizard",    hint: "Copy the site link",           test: function (s) { return s.copy >= 1; } },     // key
    { id: "day3",    tier: "champion", pack: "pirate", n: 47, name: "Regular",        hint: "Visit on 3 different days",    test: function (s) { return s.days >= 3; } },     // ship wheel
    { id: "day7",    tier: "champion", pack: "pirate", n: 44, name: "Devoted",        hint: "Visit on 7 different days",    test: function (s) { return s.days >= 7; } },     // anchor
    { id: "day30",   tier: "champion", pack: "pirate", n: 31, name: "Lifer",          hint: "Visit on 30 different days",   test: function (s) { return s.days >= 30; } },    // gold medallion
    { id: "complete",tier: "champion", pack: "pirate", n: 13, name: "Completionist",  hint: "Unlock all Explorer + Collector", test: function () { return explorerCollectorDone(); } }, // ornate chest
    { id: "legend",  tier: "champion", pack: "chaos",  n: 13, name: "DevQuest Legend",hint: "Unlock everything else",       test: function () { return allButLegendDone(); } }   // golden naga
  ];
  var ACH_BY_ID = {}; for (var _i = 0; _i < ACH.length; _i++) ACH_BY_ID[ACH[_i].id] = ACH[_i];
  function spriteFor(a) { return BASE + (a.pack || packOf(a.tier)) + "/" + a.n + ".png"; }
  var TOTAL = ACH.length;

  // ---- Persistent state ----
  var STATS_KEY = "dq-ach-stats", UNLOCK_KEY = "dq-ach", DAYS_KEY = "dq-ach-days", HINT_KEY = "dq-ach-hint", FAV_KEY = "dq-ach-fav";
  var stats = { jobs: 0, search: 0, filter: 0, map: 0, grid: 0, bestfit: 0, save: 0, alert: 0, track: 0, know: 0, pin: 0, copy: 0, follows: [], shareP: [] };
  var unlocked = [];   // ordered achievement ids (unlock order; last = latest)
  var favs = [];       // pinned achievement ids
  var days = [];       // distinct YYYY-MM-DD strings

  function loadJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function loadAll() {
    var st = loadJSON(STATS_KEY, null); if (st) for (var k in stats) if (st[k] != null) stats[k] = st[k];
    if (!stats.follows) stats.follows = []; if (!stats.shareP) stats.shareP = [];
    unlocked = loadJSON(UNLOCK_KEY, []); favs = loadJSON(FAV_KEY, []); days = loadJSON(DAYS_KEY, []);
  }
  function saveStats() { saveJSON(STATS_KEY, stats); }
  function saveUnlocked() { saveJSON(UNLOCK_KEY, unlocked); }

  function view() {
    return { jobs: stats.jobs, search: stats.search, filter: stats.filter, map: stats.map, grid: stats.grid, bestfit: stats.bestfit,
      save: stats.save, alert: stats.alert, track: stats.track, know: stats.know, pin: stats.pin, copy: stats.copy,
      follow: stats.follows.length, shareP: stats.shareP, days: days.length };
  }
  function has(id) { return unlocked.indexOf(id) >= 0; }
  function explorerCollectorDone() { for (var i = 0; i < ACH.length; i++) { var a = ACH[i]; if ((a.tier === "explorer" || a.tier === "collector") && !has(a.id)) return false; } return true; }
  function allButLegendDone() { for (var i = 0; i < ACH.length; i++) if (ACH[i].id !== "legend" && !has(ACH[i].id)) return false; return true; }

  // ---- Audio ----
  var actx;
  function ac() { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  function chime() {
    if (!SOUND) return;
    try { var c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = "triangle"; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.22); } catch (e) {}
  }
  function fanfare() {
    if (!SOUND) return;
    try { var c = ac(), t0 = c.currentTime, notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach(function (f, i) { var o = c.createOscillator(), g = c.createGain(), t = t0 + i * 0.10;
        o.type = "triangle"; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.3); }); } catch (e) {}
  }

  // ---- Styles ----
  function injectStyle() {
    if (document.getElementById("dqa-style")) return;
    var s = document.createElement("style"); s.id = "dqa-style";
    s.textContent =
      ".dqa-ico{position:relative;display:none;align-items:center;gap:5px;margin-left:10px;padding:3px 7px 3px 4px;cursor:pointer;" +
      "background:var(--panel,#161b22);border:1px solid var(--border,#30363d);border-radius:9px;vertical-align:middle;transition:border-color .2s,box-shadow .2s}" +
      ".dqa-ico.on{display:inline-flex}" +
      ".dqa-ico:hover{border-color:var(--gold,#d29922)}" +
      ".dqa-ico img{width:26px;height:26px;image-rendering:pixelated;display:block}" +
      ".dqa-ico .dqa-n{font-size:11px;font-weight:700;color:var(--muted,#8b949e);font-family:-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".dqa-ico.flash{animation:dqa-flash 1s ease}" +
      "@keyframes dqa-flash{0%,100%{box-shadow:0 0 0 0 rgba(210,153,34,0)}30%{box-shadow:0 0 0 3px rgba(210,153,34,.6),0 0 14px rgba(210,153,34,.5);border-color:var(--gold,#d29922)}}" +
      // First-unlock hint bubble
      ".dqa-hint{position:absolute;top:calc(100% + 9px);right:0;width:max-content;max-width:210px;background:var(--panel,#161b22);" +
      "border:1px solid var(--accent,#58a6ff);color:var(--text,#e6edf3);font-size:12px;line-height:1.4;padding:8px 11px;border-radius:9px;" +
      "box-shadow:0 8px 20px rgba(0,0,0,.45);z-index:30;text-align:left;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".dqa-hint::after{content:'';position:absolute;bottom:100%;right:14px;border:6px solid transparent;border-bottom-color:var(--accent,#58a6ff)}" +
      ".dqa-hint b{color:var(--accent,#58a6ff)}" +
      // Unlock toast
      ".dqa-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(8px);display:flex;align-items:center;gap:10px;" +
      "background:var(--panel,#161b22);border:1px solid var(--gold,#d29922);border-radius:12px;padding:9px 14px 9px 10px;z-index:9999;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 16px rgba(210,153,34,.25);opacity:0;transition:opacity .25s,transform .25s;" +
      "font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:90vw}" +
      ".dqa-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}" +
      ".dqa-toast img{width:40px;height:40px;image-rendering:pixelated;flex:none}" +
      ".dqa-toast .t1{font-size:11px;font-weight:700;color:var(--gold,#d29922);letter-spacing:.4px;text-transform:uppercase}" +
      ".dqa-toast .t2{font-size:14px;font-weight:700;color:var(--text,#e6edf3)}" +
      // Collection modal
      ".dqa-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:9998;display:flex;align-items:flex-start;justify-content:center;" +
      "padding:5vh 14px;overflow:auto;opacity:0;transition:opacity .2s}" +
      ".dqa-modal.show{opacity:1}" +
      ".dqa-box{background:var(--panel,#161b22);border:1px solid var(--border,#30363d);border-radius:16px;max-width:640px;width:100%;" +
      "box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}" +
      ".dqa-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border,#30363d)}" +
      ".dqa-title{font-size:17px;font-weight:800;color:var(--text,#e6edf3);letter-spacing:.2px}" +
      ".dqa-sub{font-size:12px;color:var(--muted,#8b949e);margin-top:3px}" +
      ".dqa-x{background:transparent;border:none;color:var(--muted,#8b949e);font-size:24px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px;transition:background .15s,color .15s}" +
      ".dqa-x:hover{color:var(--text,#e6edf3);background:var(--bg,#0d1117)}" +
      ".dqa-body{padding:20px;max-height:74vh;overflow:auto}" +
      ".dqa-favwrap{background:linear-gradient(180deg,rgba(210,153,34,.12),rgba(210,153,34,0)),var(--bg,#0d1117);" +
      "border:1px solid var(--gold,#d29922);border-radius:12px;padding:12px 14px;margin-bottom:22px}" +
      ".dqa-favrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}" +
      ".dqa-favrow img{width:36px;height:36px;image-rendering:pixelated}" +
      ".dqa-tier{font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#58a6ff;margin:24px 0 12px;border-bottom:1px solid var(--border,#30363d);padding-bottom:8px}" +
      ".dqa-tier:first-child{margin-top:2px}" +
      ".dqa-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}" +
      ".dqa-cell{display:flex;gap:10px;align-items:center;min-height:64px;box-sizing:border-box;background:var(--bg,#0d1117);border:1px solid var(--border,#30363d);border-radius:10px;padding:10px;transition:border-color .15s,transform .1s,box-shadow .15s}" +
      ".dqa-cell .pic{width:42px;height:42px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:9px;background:rgba(255,255,255,.03)}" +
      ".dqa-cell img{width:38px;height:38px;image-rendering:pixelated;display:block}" +
      ".dqa-cell.locked img{filter:brightness(0);opacity:.22}" +
      ".dqa-cell.locked .pic{background:rgba(255,255,255,.015)}" +
      ".dqa-cell.unlocked{cursor:pointer}" +
      ".dqa-cell.unlocked:hover{border-color:var(--gold,#d29922);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}" +
      ".dqa-cell.faved{border-color:var(--gold,#d29922);box-shadow:0 0 0 1px var(--gold,#d29922)}" +
      ".dqa-nm{font-size:12.5px;font-weight:700;color:var(--text,#e6edf3);line-height:1.25}" +
      ".dqa-cell.locked .dqa-nm{color:var(--muted,#8b949e)}" +
      ".dqa-hn{font-size:11px;color:var(--muted,#8b949e);line-height:1.3;margin-top:3px}" +
      ".dqa-star{margin-left:auto;align-self:flex-start;color:var(--gold,#d29922);font-size:12px;opacity:0}" +
      ".dqa-cell.faved .dqa-star{opacity:1}" +
      "@media(prefers-reduced-motion:reduce){.dqa-ico.flash{animation:none}.dqa-toast{transition:none}}" +
      "@media(max-width:560px){.dqa-grid{grid-template-columns:repeat(2,1fr)}.dqa-ico .dqa-n{display:none}}";
    document.head.appendChild(s);
  }

  // ---- DOM refs ----
  var icoEl, icoImg, icoNum, hintEl, toastEl, toastT;

  function buildIcon() {
    var header = document.querySelector("header");
    if (!header || document.querySelector(".dqa-ico")) return;
    injectStyle();
    icoEl = document.createElement("span"); icoEl.className = "dqa-ico"; icoEl.title = "Your collection";
    icoEl.setAttribute("role", "button"); icoEl.setAttribute("aria-label", "Open your collection"); icoEl.tabIndex = 0;
    icoImg = document.createElement("img"); icoImg.alt = ""; icoImg.draggable = false;
    icoNum = document.createElement("span"); icoNum.className = "dqa-n";
    icoEl.appendChild(icoImg); icoEl.appendChild(icoNum);
    // Click opens the collection — unless a long-press just fired the hidden reset.
    icoEl.addEventListener("click", function () { if (longFired) { longFired = false; return; } openCollection(); });
    icoEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCollection(); } });
    // Hidden reset: press & hold the icon for ~1.1s.
    icoEl.addEventListener("mousedown", startPress);
    icoEl.addEventListener("mouseup", cancelPress);
    icoEl.addEventListener("mouseleave", cancelPress);
    icoEl.addEventListener("touchstart", startPress, { passive: true });
    icoEl.addEventListener("touchend", cancelPress);
    icoEl.addEventListener("touchcancel", cancelPress);
    icoEl.addEventListener("contextmenu", function (e) { e.preventDefault(); }); // suppress mobile long-press menu
    var logo = header.querySelector(".logo");
    (logo || header).appendChild(icoEl);
  }

  // ---- Hidden reset (long-press the header icon) ----
  var pressTimer = null, longFired = false;
  function startPress() { longFired = false; cancelPress(); pressTimer = setTimeout(function () { longFired = true; doReset(); }, 1100); }
  function cancelPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
  function doReset() {
    if (!window.confirm("Reset your DevQuest collection?\n\nThis permanently clears every unlocked achievement and favourite on this device.")) { longFired = false; return; }
    try { [STATS_KEY, UNLOCK_KEY, DAYS_KEY, HINT_KEY, FAV_KEY].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    try { location.reload(); } catch (e) {
      stats = { jobs: 0, search: 0, filter: 0, map: 0, grid: 0, bestfit: 0, save: 0, alert: 0, track: 0, know: 0, pin: 0, copy: 0, follows: [], shareP: [] };
      unlocked = []; favs = []; days = []; refreshIcon();
    }
  }

  function refreshIcon() {
    if (!icoEl) return;
    if (!unlocked.length) { icoEl.classList.remove("on"); return; }
    var latest = ACH_BY_ID[unlocked[unlocked.length - 1]];
    if (latest) icoImg.src = spriteFor(latest);
    icoNum.textContent = unlocked.length + " / " + TOTAL;
    icoEl.classList.add("on");
  }

  function flashIcon() {
    if (!icoEl) return;
    icoEl.classList.remove("flash"); void icoEl.offsetWidth; icoEl.classList.add("flash");
  }

  function showFirstHint() {
    try { if (localStorage.getItem(HINT_KEY) === "1") return; localStorage.setItem(HINT_KEY, "1"); } catch (e) {}
    if (!icoEl) return;
    hintEl = document.createElement("div"); hintEl.className = "dqa-hint";
    hintEl.innerHTML = "<b>Your first sprite!</b> Click here anytime to see your collection.";
    icoEl.appendChild(hintEl);
    setTimeout(function () { if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl); }, 9000);
  }

  // ---- Unlock + celebrate ----
  function checkUnlocks(announce) {
    var newly = [], changed = true, s = view();
    while (changed) {
      changed = false;
      for (var i = 0; i < ACH.length; i++) {
        var a = ACH[i];
        if (!has(a.id) && a.test(s)) { unlocked.push(a.id); newly.push(a); changed = true; }
      }
    }
    if (newly.length) { saveUnlocked(); if (announce) celebrate(newly); else refreshIcon(); }
    return newly;
  }

  var firstEver;
  function celebrate(newly) {
    try { firstEver = (unlocked.length === newly.length); } catch (e) { firstEver = false; }
    refreshIcon(); flashIcon();
    var bigOne = false;
    for (var i = 0; i < newly.length; i++) if (newly[i].id === "complete" || newly[i].id === "legend") bigOne = true;
    if (bigOne) fanfare(); else chime();
    queueToasts(newly.slice());
    if (firstEver) setTimeout(showFirstHint, 400);
  }

  var toastQueue = [];
  function queueToasts(list) { toastQueue = toastQueue.concat(list); if (!toastEl || !toastEl._busy) nextToast(); }
  function nextToast() {
    if (!toastQueue.length) return;
    var a = toastQueue.shift();
    if (!toastEl) {
      toastEl = document.createElement("div"); toastEl.className = "dqa-toast";
      toastEl.innerHTML = '<img alt=""><div><div class="t1">Achievement unlocked</div><div class="t2"></div></div>';
      document.body.appendChild(toastEl);
    }
    toastEl._busy = true;
    toastEl.querySelector("img").src = spriteFor(a);
    toastEl.querySelector(".t2").textContent = a.name;
    void toastEl.offsetWidth; toastEl.classList.add("show");
    setTimeout(function () {
      toastEl.classList.remove("show");
      setTimeout(function () { toastEl._busy = false; nextToast(); }, 280);
    }, toastQueue.length ? 1500 : 2400);
  }

  // ---- Collection modal ----
  function escC(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function openCollection() {
    if (document.querySelector(".dqa-modal")) return;
    if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
    var html = '<div class="dqa-head"><div><div class="dqa-title">Your collection</div>'
      + '<div class="dqa-sub">' + unlocked.length + ' / ' + TOTAL + ' unlocked</div></div>'
      + '<button class="dqa-x" type="button" aria-label="Close">×</button></div><div class="dqa-body">';
    // Favourites
    if (favs.length) {
      html += '<div class="dqa-favwrap"><div style="font-size:12px;font-weight:800;color:var(--gold,#d29922)">★ Favourites</div><div class="dqa-favrow">';
      for (var f = 0; f < favs.length; f++) { var fa = ACH_BY_ID[favs[f]]; if (fa && has(fa.id)) html += '<img loading="lazy" src="' + spriteFor(fa) + '" alt="" title="' + escC(fa.name) + '">'; }
      html += '</div></div>';
    }
    // Tiers
    for (var t = 0; t < TIERS.length; t++) {
      var tier = TIERS[t];
      var got = 0, total = 0;
      for (var c = 0; c < ACH.length; c++) if (ACH[c].tier === tier.id) { total++; if (has(ACH[c].id)) got++; }
      html += '<div class="dqa-tier">' + escC(tier.name) + ' · ' + got + ' / ' + total + '</div><div class="dqa-grid">';
      for (var i = 0; i < ACH.length; i++) {
        var a = ACH[i]; if (a.tier !== tier.id) continue;
        var u = has(a.id), fav = favs.indexOf(a.id) >= 0;
        html += '<div class="dqa-cell ' + (u ? "unlocked" : "locked") + (fav ? " faved" : "") + '"'
          + (u ? ' data-id="' + a.id + '" role="button" tabindex="0" title="Click to pin / unpin"' : '') + '>'
          + '<div class="pic"><img loading="lazy" src="' + spriteFor(a) + '" alt=""></div>'
          + '<div><div class="dqa-nm">' + escC(a.name) + '</div><div class="dqa-hn">' + (u ? "Unlocked" : escC(a.hint)) + '</div></div>'
          + '<div class="dqa-star">★</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    var ov = document.createElement("div"); ov.className = "dqa-modal";
    var box = document.createElement("div"); box.className = "dqa-box"; box.innerHTML = html;
    ov.appendChild(box); document.body.appendChild(ov);
    function close() { ov.classList.remove("show"); document.removeEventListener("keydown", onkey); setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 200); }
    function onkey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    box.querySelector(".dqa-x").addEventListener("click", close);
    document.addEventListener("keydown", onkey);
    var cells = box.querySelectorAll(".dqa-cell.unlocked");
    for (var k = 0; k < cells.length; k++) bindPin(cells[k]);
    void ov.offsetWidth; ov.classList.add("show");
    try { window.dqTrack && window.dqTrack("ach_open", { n: unlocked.length }); } catch (e) {}
  }
  function bindPin(cell) {
    function toggle() {
      var id = cell.getAttribute("data-id"), at = favs.indexOf(id);
      if (at >= 0) { favs.splice(at, 1); cell.classList.remove("faved"); }
      else { favs.push(id); cell.classList.add("faved"); stats.pin = (stats.pin || 0) + 1; saveStats(); checkUnlocks(true); }
      saveJSON(FAV_KEY, favs);
    }
    cell.addEventListener("click", toggle);
    cell.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  }

  // ---- Event tracking: tally real actions from the site's dqTrack ----
  function bump(name, props) {
    props = props || {};
    switch (name) {
      case "apply_click": stats.jobs++; break;            // clicking through to view a job posting
      case "search":      stats.search++; break;
      case "filter":      stats.filter++; break;
      case "directory_click": case "moon_click": case "pulse_studio_click": stats.map++; break;
      case "grid_cell":   stats.grid++; break;
      case "bestfit_filter": case "bestfit_pick": stats.bestfit++; break;
      case "save_job":    stats.save++; break;
      case "track_job":   stats.track++; break;
      case "alert_signup": stats.alert++; break;
      case "who_do_i_know": stats.know++; break;
      case "studio_follow":
        if (props.on === false) { var ix = stats.follows.indexOf(props.st); if (ix >= 0) stats.follows.splice(ix, 1); }
        else if (props.st && stats.follows.indexOf(props.st) < 0) stats.follows.push(props.st);
        break;
      case "share_click":
        if (props.p && stats.shareP.indexOf(props.p) < 0) stats.shareP.push(props.p);
        if (props.p === "copy") stats.copy++;
        break;
      default: return false;
    }
    return true;
  }

  function hookTracker() {
    var orig = window.dqTrack;
    window.dqTrack = function (name, props) {
      try { if (bump(name, props)) { saveStats(); checkUnlocks(true); } } catch (e) {}
      if (typeof orig === "function") return orig(name, props);
    };
  }

  // ---- Boot ----
  function mount() {
    loadAll();
    // Mark today's visit (distinct days).
    try { var today = new Date().toISOString().slice(0, 10); if (days.indexOf(today) < 0) { days.push(today); saveJSON(DAYS_KEY, days); } } catch (e) {}
    buildIcon();
    checkUnlocks(false);   // restore prior unlocks silently
    refreshIcon();
    var dayWins = checkUnlocks(true);   // a day milestone reached just by visiting today celebrates
    hookTracker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
