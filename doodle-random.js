/* =====================================================================
   DevQuest Doodle — header "bookmark" pixel mascot + staged catch-'em-all
   ---------------------------------------------------------------------
   A little ribbon-bookmark tab hangs off the bottom-right of the header,
   holding a pixel sprite. Click it to catch a random one (with a short
   cooldown shown as an RPG-style overlay that climbs the sprite, then
   fades when you can click again). Each click says "new!" or "already
   caught" so the count never feels stuck.

   The collection is STAGED into levels (one sprite pack per level). Catch
   every sprite in the active pack and it "graduates": a level-up fanfare
   plays, gold flash, and the next pack unlocks. Finish them all for a
   "caught 'em all" finale, after which the mascot free-roams every pack.

   Progress is tracked per pack in localStorage; the "Lvl N · Name · X / N"
   readout shows on hover/focus. A new catch flashes gold and plays a soft
   chime; a completed level plays a happy ascending fanfare instead.

   Press-and-hold the sprite ~0.7s to reset the whole collection. Click the
   "×" to fold into a tiny handle (remembered across visits); click the
   handle to bring it back.

   --- ADDING A PACK LATER (extensible) ------------------------------
   1. Drop the pack's icons in  doodle-sprites/packs/<your-id>/1.png .. N.png
   2. Add one line to the PACKS array below: { id:"<your-id>", name:"Display Name", count:N }
   That's it — a new level appears at the end. No other code changes.

   Belongs to the sticky <header>, so it travels with the bar as you scroll
   and never changes the header's height.

   Art: CraftPix free pixel-icon packs (see doodle-sprites/SOURCE-LICENSE-craftpix.txt).

   TO REMOVE: delete the <!-- DOODLE:START --> ... <!-- DOODLE:END --> block
   in index.html, plus this file and the doodle-sprites/ folder.
   ===================================================================== */
(function () {
  "use strict";

  // ---- Level config (order = play order). Add packs here; see header note. ----
  var PACKS = [
    { id: "low-monsters", name: "Critters",        count: 48 },
    { id: "goblin",       name: "Goblin Loot",     count: 48 },
    { id: "potions",      name: "Potions",         count: 48 },
    { id: "pirate",       name: "Pirate's Bounty",  count: 48 },
    { id: "bow",          name: "Bows & Bolts",    count: 48 },
    { id: "paint",        name: "Paint Pots",      count: 48 },
    { id: "chaos",        name: "Chaos Monsters",  count: 48 }
  ];

  var BASE = "doodle-sprites/packs/";  // sprite path = BASE + pack.id + "/" + n + ".png"
  var COLLECT_KEY = "dq-collect";      // { packId: [caught indices] }
  var FOLDKEY = "dq-monsters-fold";    // folded state (kept from prior version)
  var OLD_KEY = "dq-monsters-seen";    // legacy flat collection -> migrates to low-monsters
  var COOLDOWN = 1200;                 // ms between catches (also the overlay climb time)
  var NEW_BIAS = 0;                    // 0 = pure random within the level; raise toward 1 to favor unseen
  var SOUND = true;                    // chime on new catch + fanfare on level-up; false to mute
  var PITY = 10;                       // bad-luck protection: after this many duplicates in a row, the
                                       // next catch is GUARANTEED to be one you're still missing. Lower
                                       // = kinder (shorter worst-case grind), higher = stricter. The tell
                                       // ("so close…") starts ~2 misses before the guarantee fires.

  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches);

  // ---- Collection storage (one object, all packs) ----
  var collect = {};
  function loadCollect() {
    var obj = {};
    try {
      var raw = JSON.parse(localStorage.getItem(COLLECT_KEY) || "{}");
      for (var k in raw) if (raw.hasOwnProperty(k)) obj[k] = new Set(raw[k]);
    } catch (e) {}
    // Migrate the old flat monsters collection into the first pack.
    if (!obj["low-monsters"]) {
      try {
        var old = JSON.parse(localStorage.getItem(OLD_KEY) || "[]");
        if (old && old.length) obj["low-monsters"] = new Set(old);
      } catch (e) {}
    }
    return obj;
  }
  function collectFor(id) { if (!collect[id]) collect[id] = new Set(); return collect[id]; }
  function saveCollect() {
    try {
      var o = {};
      for (var k in collect) if (collect.hasOwnProperty(k)) o[k] = Array.from(collect[k]);
      localStorage.setItem(COLLECT_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  function firstIncomplete() {
    for (var i = 0; i < PACKS.length; i++) if (collectFor(PACKS[i].id).size < PACKS[i].count) return i;
    return PACKS.length - 1;
  }
  function allComplete() {
    for (var i = 0; i < PACKS.length; i++) if (collectFor(PACKS[i].id).size < PACKS[i].count) return false;
    return true;
  }
  function grandTotal() { var t = 0; for (var i = 0; i < PACKS.length; i++) t += PACKS[i].count; return t; }
  function grandCaught() { var t = 0; for (var i = 0; i < PACKS.length; i++) t += collectFor(PACKS[i].id).size; return t; }

  // ---- Audio ----
  var actx;
  function ac() { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  function chime() {                  // soft blip on a NEW catch
    if (!SOUND) return;
    try {
      var c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = "triangle"; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
    } catch (e) {}
  }
  function fanfare() {                // happy ascending arpeggio on a LEVEL-UP
    if (!SOUND) return;
    try {
      var c = ac(), t0 = c.currentTime, notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach(function (f, i) {
        var o = c.createOscillator(), g = c.createGain(), t = t0 + i * 0.10;
        o.type = "triangle"; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.28);
      });
      var o2 = c.createOscillator(), g2 = c.createGain(), t2 = t0 + 0.42;   // sparkle
      o2.type = "sine"; o2.frequency.setValueAtTime(1318.5, t2);
      g2.gain.setValueAtTime(0.0001, t2); g2.gain.exponentialRampToValueAtTime(0.05, t2 + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.32);
      o2.connect(g2); g2.connect(c.destination); o2.start(t2); o2.stop(t2 + 0.36);
    } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById("dqd-style")) return;
    var s = document.createElement("style");
    s.id = "dqd-style";
    s.textContent =
      ".dqd-shelf{position:absolute;top:calc(100% - 1px);right:24px;display:flex;flex-direction:column;" +
      "align-items:center;background:var(--panel,#161b22);border:1px solid var(--border,#30363d);" +
      "border-top:none;border-radius:0 0 5px 5px;padding:5px 10px 8px;box-shadow:0 6px 14px rgba(0,0,0,.35);transition:border-color .2s}" +
      // Ribbon-bookmark tail (downward point) under the pocket.
      ".dqd-shelf::after{content:'';position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:0;height:0;" +
      "border-left:9px solid transparent;border-right:9px solid transparent;border-top:9px solid var(--panel,#161b22);" +
      "filter:drop-shadow(0 2px 1px rgba(0,0,0,.25))}" +
      // Image + its cooldown overlay live in a wrapper so the overlay tracks the sprite (incl. bob).
      ".dqd-imgwrap{position:relative;width:64px;height:64px;animation:dqd-bob 3s ease-in-out infinite}" +
      ".dqd-img{display:block;width:64px;height:64px;cursor:pointer;image-rendering:pixelated;" +
      "user-select:none;-webkit-user-select:none;-webkit-user-drag:none;transition:filter .15s}" +
      ".dqd-img.cooling{cursor:default}" +
      "@media(hover:hover){.dqd-img:not(.cooling):hover{filter:brightness(1.18)}}" +
      ".dqd-img:focus-visible{outline:2px solid var(--green,#3fb950);outline-offset:2px;border-radius:6px}" +
      // RPG cooldown overlay: a dark shade that climbs over the WHOLE bookmark (not just the art), then fades.
      ".dqd-cool{position:absolute;left:0;right:0;bottom:0;height:0;border-radius:0 0 5px 5px;pointer-events:none;opacity:1;z-index:4;" +
      "background:linear-gradient(to top,rgba(8,11,16,.85),rgba(8,11,16,.55))}" +
      // Catch badge (new / duplicate / level), floats out to the left so it never overlaps the header.
      ".dqd-badge{position:absolute;right:calc(100% + 8px);top:18px;font-size:10px;font-weight:700;padding:2px 7px;" +
      "border-radius:999px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s}" +
      ".dqd-badge.show{opacity:1}" +
      ".dqd-badge.new{background:var(--green,#3fb950);color:#06210f}" +
      ".dqd-badge.dupe{background:var(--border,#30363d);color:var(--text,#e6edf3)}" +
      ".dqd-badge.lvl{background:var(--gold,#d29922);color:#231a05}" +
      ".dqd-badge.luck{background:var(--gold,#d29922);color:#231a05;box-shadow:0 0 0 2px rgba(210,153,34,.4)}" +
      // Progress caption: only on hover / focus.
      ".dqd-cap{display:none;width:64px;margin-top:5px;text-align:center;overflow:visible}" +
      ".dqd-shelf:hover .dqd-cap,.dqd-shelf:focus-within .dqd-cap,.dqd-shelf.show .dqd-cap{display:block}" +
      ".dqd-capl{font-size:9.5px;line-height:1.25;color:var(--muted,#8b949e);white-space:normal;overflow-wrap:break-word;" +
      "font-family:-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:.02em}" +
      ".dqd-capn{font-size:11px;line-height:1.35;color:var(--text,#e6edf3);white-space:nowrap;font-weight:700;" +
      "font-family:-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".dqd-bar{height:4px;width:100%;background:var(--bg,#0d1117);border-radius:999px;margin-top:3px;overflow:hidden}" +
      ".dqd-bar>span{display:block;height:100%;width:0;background:var(--green,#3fb950);border-radius:999px;transition:width .35s ease}" +
      // Fold control + folded handle.
      ".dqd-x{position:absolute;top:1px;right:5px;font-size:13px;line-height:1;color:var(--muted,#8b949e);cursor:pointer;opacity:0;transition:opacity .15s}" +
      ".dqd-shelf:hover .dqd-x,.dqd-shelf:focus-within .dqd-x{opacity:.65}" +
      ".dqd-x:hover{opacity:1}" +
      ".dqd-handle{display:none;font-size:12px;line-height:1;color:var(--muted,#8b949e);cursor:pointer;user-select:none}" +
      ".dqd-shelf.folded{padding:3px 11px 4px;border-radius:0 0 8px 8px}" +
      ".dqd-shelf.folded::after{display:none}" +
      ".dqd-shelf.folded .dqd-imgwrap,.dqd-shelf.folded .dqd-cap,.dqd-shelf.folded .dqd-badge,.dqd-shelf.folded .dqd-x{display:none}" +
      ".dqd-shelf.folded .dqd-handle{display:block}" +
      // Gold "all caught" finale state.
      ".dqd-shelf.done{border-color:var(--gold,#d29922)}" +
      ".dqd-shelf.done::after{border-top-color:var(--gold,#d29922)}" +
      ".dqd-shelf.done .dqd-capn{color:var(--gold,#d29922)}" +
      ".dqd-shelf.done .dqd-bar>span{background:var(--gold,#d29922)}" +
      ".dqd-shelf.flash{animation:dqd-flash .7s ease}" +
      "@media(max-width:1300px){.dqd-shelf{display:none}}" +
      "@media(prefers-reduced-motion:reduce){.dqd-imgwrap{animation:none}.dqd-shelf.flash{animation:none}}" +
      "@keyframes dqd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}" +
      "@keyframes dqd-flash{0%,100%{box-shadow:0 6px 14px rgba(0,0,0,.35)}40%{box-shadow:0 0 0 2px var(--gold,#d29922),0 6px 14px rgba(0,0,0,.35)}}";
    document.head.appendChild(s);
  }

  function mount() {
    var header = document.querySelector("header");
    if (!header || header.querySelector(".dqd-shelf")) return;
    injectStyle();

    collect = loadCollect();
    var lvl = firstIncomplete();
    var allDone = allComplete();

    var shelf = document.createElement("div"); shelf.className = "dqd-shelf";

    var imgwrap = document.createElement("div"); imgwrap.className = "dqd-imgwrap";
    var img = document.createElement("img");
    img.className = "dqd-img"; img.alt = "Pixel art mascot"; img.title = "Click to catch another";
    img.setAttribute("role", "button"); img.tabIndex = 0; img.draggable = false;
    var cool = document.createElement("div"); cool.className = "dqd-cool";
    imgwrap.appendChild(img);

    var badge = document.createElement("div"); badge.className = "dqd-badge";

    var cap = document.createElement("div"); cap.className = "dqd-cap";
    var capl = document.createElement("div"); capl.className = "dqd-capl";
    var capn = document.createElement("div"); capn.className = "dqd-capn";
    var bar = document.createElement("div"); bar.className = "dqd-bar";
    var barFill = document.createElement("span"); bar.appendChild(barFill);
    cap.appendChild(capl); cap.appendChild(capn); cap.appendChild(bar);

    var x = document.createElement("div"); x.className = "dqd-x"; x.textContent = "×"; x.title = "Hide";
    var handle = document.createElement("div"); handle.className = "dqd-handle"; handle.textContent = "▾"; handle.title = "Show mascot";

    var cur = -1, curPack = "", busy = false, dupeStreak = 0, coolT, coolT2, flashT, badgeT;

    function spritePath(packId, n) { return BASE + packId + "/" + n + ".png"; }

    function updateCap() {
      if (allDone) {
        capl.textContent = "All packs · 🏆";
        capn.textContent = grandCaught() + " / " + grandTotal();
        barFill.style.width = "100%";
        shelf.classList.add("done");
        return;
      }
      var pack = PACKS[lvl], c = collectFor(pack.id).size;
      capl.textContent = "Lvl " + (lvl + 1) + " · " + pack.name;
      capn.textContent = c + " / " + pack.count;
      barFill.style.width = Math.round((c / pack.count) * 100) + "%";
      shelf.classList.remove("done");
    }

    // Returns { pack, n, forced }. `forced` = the pick was handed to you by bad-luck protection.
    function pick() {
      if (allDone) {                          // free-roam every pack
        var p = PACKS[Math.floor(Math.random() * PACKS.length)], m;
        do { m = Math.floor(Math.random() * p.count) + 1; } while (p.id === curPack && m === cur && p.count > 1);
        return { pack: p, n: m, forced: false };
      }
      var pack = PACKS[lvl], set = collectFor(pack.id);
      var unseen = [];
      for (var i = 1; i <= pack.count; i++) if (!set.has(i)) unseen.push(i);
      // Pity / bad-luck protection: after PITY duplicates in a row, guarantee one you're still missing.
      if (unseen.length && dupeStreak >= PITY) return { pack: pack, n: unseen[Math.floor(Math.random() * unseen.length)], forced: true };
      if (NEW_BIAS > 0 && unseen.length && Math.random() < NEW_BIAS) return { pack: pack, n: unseen[Math.floor(Math.random() * unseen.length)], forced: false };
      var n;
      do { n = Math.floor(Math.random() * pack.count) + 1; } while (n === cur && pack.count > 1);
      return { pack: pack, n: n, forced: false };
    }

    function showBadge(txt, kind) {
      badge.textContent = txt;
      badge.className = "dqd-badge " + kind + " show";
      clearTimeout(badgeT);
      badgeT = setTimeout(function () { badge.className = "dqd-badge " + kind; }, 1400);
    }

    function startCooldown() {
      busy = true; img.classList.add("cooling");
      clearTimeout(coolT); clearTimeout(coolT2);
      if (reduce) {                            // no climb for reduced-motion: flat dim that clears
        cool.style.transition = "none"; cool.style.opacity = "0.5"; cool.style.height = "100%";
      } else {
        cool.style.transition = "none"; cool.style.opacity = "1"; cool.style.height = "0%";
        void cool.offsetHeight;                // reflow so the climb animates from 0
        cool.style.transition = "height " + COOLDOWN + "ms linear";
        cool.style.height = "100%";
      }
      coolT = setTimeout(function () {
        busy = false; img.classList.remove("cooling");
        cool.style.transition = "opacity .28s ease";
        cool.style.opacity = "0";              // reached the top -> fade away
        coolT2 = setTimeout(function () { cool.style.transition = "none"; cool.style.height = "0%"; cool.style.opacity = "1"; }, 320);
      }, COOLDOWN);
    }

    function advance() {
      if (lvl < PACKS.length - 1) {
        lvl++;
        var np = PACKS[lvl], prev = Math.floor(Math.random() * np.count) + 1;
        cur = prev; curPack = np.id; img.src = spritePath(np.id, prev);  // tease the new pack (not counted)
        updateCap();
        showBadge("Lvl " + (lvl + 1) + " · " + np.name, "lvl");
        shelf.classList.add("show");
        clearTimeout(flashT); flashT = setTimeout(function () { shelf.classList.remove("show"); }, 1800);
      } else {
        allDone = true; updateCap();
        showBadge("All caught! 🏆", "lvl");
        shelf.classList.add("show", "flash"); fanfare();
        try { window.dqTrack && window.dqTrack("doodle_complete", {}); } catch (e) {}
        clearTimeout(flashT); flashT = setTimeout(function () { shelf.classList.remove("show", "flash"); }, 2200);
      }
    }

    function catchOne() {
      if (busy) return;
      var r = pick(), pack = r.pack, n = r.n, forced = r.forced, set = collectFor(pack.id), isNew = !set.has(n);
      cur = n; curPack = pack.id; img.src = spritePath(pack.id, n);
      if (isNew) { set.add(n); saveCollect(); dupeStreak = 0; } else { dupeStreak++; }
      var levelDone = isNew && !allDone && set.size >= pack.count;
      var stillMissing = !allDone && collectFor(pack.id).size < pack.count;
      updateCap();

      if (levelDone) {
        showBadge("Level complete! ✦", "lvl");
        shelf.classList.add("show", "flash"); fanfare();
        try { window.dqTrack && window.dqTrack("doodle_levelup", { lvl: lvl + 1, pack: pack.id }); } catch (e) {}
        clearTimeout(flashT);
        flashT = setTimeout(function () { shelf.classList.remove("show", "flash"); advance(); }, 1900);
      } else {
        if (isNew) {
          showBadge(forced ? "lucky find! ✦" : "new! ✦", forced ? "luck" : "new");
          shelf.classList.add("show", "flash"); chime();
        } else {
          var near = stillMissing && dupeStreak >= (PITY - 2);   // subtle tell as the guarantee nears
          showBadge(near ? "so close… ✦" : "already caught", "dupe");
          shelf.classList.add("show");
        }
        clearTimeout(flashT);
        flashT = setTimeout(function () { shelf.classList.remove("show", "flash"); }, 1400);
      }
      startCooldown();
      try { window.dqTrack && window.dqTrack(isNew ? "doodle_new" : "doodle_dupe", { pack: pack.id, n: n, lvl: lvl, caught: grandCaught() }); } catch (e) {}
    }

    // Hidden reset: press-and-hold ~0.7s. Wipes the whole collection back to Level 1.
    var LONGPRESS = 700, pressT, didLong = false;
    function reset() {
      collect = {}; allDone = false; lvl = 0;
      try { localStorage.removeItem(COLLECT_KEY); localStorage.removeItem(OLD_KEY); } catch (e) {}
      var np = PACKS[0], p0 = Math.floor(Math.random() * np.count) + 1;
      cur = p0; curPack = np.id; img.src = spritePath(np.id, p0);
      updateCap(); capl.textContent = "↺ reset!"; shelf.classList.add("show");
      clearTimeout(flashT); flashT = setTimeout(function () { shelf.classList.remove("show"); updateCap(); }, 1600);
    }
    function startPress() { didLong = false; clearTimeout(pressT); pressT = setTimeout(function () { didLong = true; reset(); }, LONGPRESS); }
    function endPress() { clearTimeout(pressT); }

    function setFold(v) { shelf.classList.toggle("folded", v); try { localStorage.setItem(FOLDKEY, v ? "1" : "0"); } catch (e) {} }

    // Initial reveal — show the active pack + current progress, no free catch.
    (function revealInitial() {
      var pack = PACKS[lvl], n = Math.floor(Math.random() * pack.count) + 1;
      cur = n; curPack = pack.id; img.src = spritePath(pack.id, n);
      updateCap();
    })();

    img.addEventListener("mousedown", startPress);
    img.addEventListener("mouseup", endPress);
    img.addEventListener("mouseleave", endPress);
    img.addEventListener("touchstart", startPress, { passive: true });
    img.addEventListener("touchend", endPress);
    img.addEventListener("click", function () { if (didLong) { didLong = false; return; } catchOne(); });
    img.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); catchOne(); } });
    x.addEventListener("click", function (e) { e.stopPropagation(); setFold(true); });
    handle.addEventListener("click", function () { setFold(false); });

    shelf.appendChild(imgwrap); shelf.appendChild(badge); shelf.appendChild(cap); shelf.appendChild(x); shelf.appendChild(handle);
    shelf.appendChild(cool);   // overlay last so the cooldown shade sits above the whole bookmark
    header.appendChild(shelf);

    try { if (localStorage.getItem(FOLDKEY) === "1") shelf.classList.add("folded"); } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
/* v11 staged */
