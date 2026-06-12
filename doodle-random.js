/* =====================================================================
   DevQuest collection — RETURNING-DAYS tracker
   ---------------------------------------------------------------------
   Not an achievement system. Each distinct DAY you visit unlocks the next
   sprite in the collection (days need NOT be consecutive). Day 1 unlocks the
   goblet, which is also the default floating header icon. Click the floating
   sprite to open your collection; click any unlocked sprite to pin it as your
   mascot. Returning on a new day shows a brief "welcome back" pop-up.

   100% client-side (localStorage) — no accounts, no backend, no tracking.

   Art: CraftPix free pixel-icon packs (doodle-sprites/packs/<id>/N.png).
   TO REMOVE: delete the <!-- DOODLE:START --> block in index.html, this file,
   and the doodle-sprites/ folder.
   ===================================================================== */
(function () {
  "use strict";

  var BASE = "doodle-sprites/";
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches);

  // ---- Master collection. Day N unlocks SPRITES[N-1]. Sections = packs. ----
  // Pirate's Hoard leads, and its goblet (sprite 43) is moved to the very front
  // so Day 1 unlocks the goblet (also the default floating icon).
  var SECTIONS = [
    { name: "Pirate's Hoard", dir: "packs/pirate/",      first: 43 },
    { name: "Goblin Loot",    dir: "packs/goblin/" },
    { name: "Potions",        dir: "packs/potions/" },
    { name: "Critters",       dir: "packs/low-monsters/" },
    { name: "Archery",        dir: "packs/bow/" },
    { name: "Chaos",          dir: "packs/chaos/" },
    { name: "Palette",        dir: "packs/paint/" }
  ];
  var PACK_N = 48;
  var SPRITES = [];
  for (var _s = 0; _s < SECTIONS.length; _s++) {
    var _sec = SECTIONS[_s], _order = [];
    if (_sec.first) _order.push(_sec.first);
    for (var _i = 1; _i <= PACK_N; _i++) if (_i !== _sec.first) _order.push(_i);
    _sec.start = SPRITES.length;
    _sec.count = _order.length;
    for (var _k = 0; _k < _order.length; _k++) SPRITES.push(BASE + _sec.dir + _order[_k] + ".png");
  }
  var TOTAL = SPRITES.length;

  // ---- Persistent state ----
  var DAYS_KEY = "dq-days", PIN_KEY = "dq-pin", HINT_KEY = "dq-col-hint";
  function loadJSON(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function loadStr(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function saveStr(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  var days = loadJSON(DAYS_KEY, []);   // distinct "YYYY-MM-DD" visit days
  var pin = loadStr(PIN_KEY);          // pinned sprite index (as a string) or null

  function unlockedCount() { return Math.min(days.length, TOTAL); }
  function isUnlocked(i) { return i >= 0 && i < unlockedCount(); }
  function pinnedIndex() { var p = pin == null ? -1 : parseInt(pin, 10); return (!isNaN(p) && isUnlocked(p)) ? p : -1; }
  function mascotIndex() { var p = pinnedIndex(); return p >= 0 ? p : Math.max(0, unlockedCount() - 1); }
  function todayStr() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function escC(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ---- Styles ----
  function injectStyle() {
    if (document.getElementById("dqa-style")) return;
    var s = document.createElement("style"); s.id = "dqa-style";
    s.textContent =
      // Floating header icon (bare art, gently bobbing)
      ".dqa-ico{position:relative;display:none;align-items:center;margin-left:8px;padding:0;cursor:pointer;background:transparent;border:none;vertical-align:middle}" +
      ".dqa-ico.on{display:inline-flex}" +
      ".dqa-ico img{width:30px;height:30px;image-rendering:pixelated;display:block;animation:dqa-bob 3s ease-in-out infinite;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}" +
      ".dqa-ico:hover img{filter:drop-shadow(0 0 7px rgba(210,153,34,.75))}" +
      ".dqa-ico.flash{animation:dqa-flash 1s ease}" +
      "@keyframes dqa-flash{0%,100%{filter:drop-shadow(0 0 0 rgba(210,153,34,0))}30%{filter:drop-shadow(0 0 11px rgba(210,153,34,.95))}}" +
      "@keyframes dqa-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}" +
      // First-time discovery hint bubble
      ".dqa-hint{position:absolute;top:calc(100% + 9px);right:0;width:max-content;max-width:220px;background:var(--panel,#161b22);" +
      "border:1px solid var(--accent,#58a6ff);color:var(--text,#e6edf3);font-size:12px;line-height:1.4;padding:8px 11px;border-radius:9px;" +
      "box-shadow:0 8px 20px rgba(0,0,0,.45);z-index:30;text-align:left;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".dqa-hint::after{content:'';position:absolute;bottom:100%;right:14px;border:6px solid transparent;border-bottom-color:var(--accent,#58a6ff)}" +
      ".dqa-hint b{color:var(--accent,#58a6ff)}" +
      // Welcome-back toast (top of screen)
      ".dqa-toast{position:fixed;left:50%;top:16px;transform:translateX(-50%) translateY(-10px);display:flex;align-items:center;gap:10px;" +
      "background:var(--panel,#161b22);border:1px solid var(--gold,#d29922);border-radius:11px;padding:9px 14px 9px 10px;z-index:9999;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 16px rgba(210,153,34,.25);opacity:0;transition:opacity .25s,transform .25s;" +
      "font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:90vw;cursor:pointer}" +
      ".dqa-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}" +
      ".dqa-toast img{width:44px;height:44px;image-rendering:pixelated;flex:none}" +
      ".dqa-toast .t1{font-size:10px;font-weight:700;color:var(--gold,#d29922);letter-spacing:.4px;text-transform:uppercase}" +
      ".dqa-toast .t2{font-size:13px;font-weight:700;color:var(--text,#e6edf3)}" +
      // Collection modal
      ".dqa-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:9998;display:flex;align-items:flex-start;justify-content:center;" +
      "padding:5vh 14px;overflow:auto;opacity:0;transition:opacity .2s}" +
      ".dqa-modal.show{opacity:1}" +
      ".dqa-box{background:var(--panel,#161b22);border:1px solid var(--border,#30363d);border-radius:14px;max-width:560px;width:100%;" +
      "box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}" +
      ".dqa-head{display:flex;align-items:center;justify-content:space-between;padding:14px 17px;border-bottom:1px solid var(--border,#30363d)}" +
      ".dqa-title{font-size:15px;font-weight:800;color:var(--text,#e6edf3)}" +
      ".dqa-sub{font-size:11px;color:var(--muted,#8b949e);margin-top:2px}" +
      ".dqa-x{background:transparent;border:none;color:var(--muted,#8b949e);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px;transition:background .15s,color .15s}" +
      ".dqa-x:hover{color:var(--text,#e6edf3);background:var(--bg,#0d1117)}" +
      ".dqa-body{padding:14px 16px 18px;max-height:78vh;overflow:auto}" +
      ".dqa-progwrap{height:6px;border-radius:6px;background:var(--bg,#0d1117);border:1px solid var(--border,#30363d);overflow:hidden;margin:0 0 8px}" +
      ".dqa-prog{height:100%;background:linear-gradient(90deg,#58a6ff,#3fb950 55%,#e3b341);border-radius:6px;transition:width .5s ease}" +
      ".dqa-tip{font-size:11px;color:var(--muted,#8b949e);line-height:1.45;margin:0 0 14px}" +
      ".dqa-sec{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;font-weight:800;letter-spacing:1.2px;" +
      "text-transform:uppercase;color:#e3b341;margin:18px 0 10px;border-bottom:1px solid rgba(210,153,34,.3);padding-bottom:7px}" +
      ".dqa-sec:first-of-type{margin-top:2px}" +
      ".dqa-sec .c{color:var(--muted,#8b949e);font-weight:700;letter-spacing:.5px}" +
      ".dqa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:8px}" +
      ".dqa-cell{position:relative;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;background:var(--bg,#0d1117);" +
      "border:1px solid var(--border,#30363d);border-radius:9px;overflow:hidden;transition:border-color .15s,transform .1s,box-shadow .15s}" +
      ".dqa-cell img{width:78%;height:78%;object-fit:contain;image-rendering:pixelated;display:block;transition:filter .2s,opacity .2s}" +
      ".dqa-cell.locked img{filter:saturate(.55) brightness(.5);opacity:.5}" +
      ".dqa-cell.unlocked{cursor:pointer}" +
      ".dqa-cell.unlocked:hover{border-color:var(--gold,#d29922);transform:translateY(-2px);box-shadow:0 5px 14px rgba(0,0,0,.4)}" +
      ".dqa-cell.pinned{border-color:var(--gold,#d29922);box-shadow:0 0 0 2px var(--gold,#d29922),0 0 14px rgba(210,153,34,.3)}" +
      ".dqa-star{position:absolute;top:3px;right:4px;color:var(--gold,#d29922);font-size:11px;opacity:0;text-shadow:0 1px 2px rgba(0,0,0,.7)}" +
      ".dqa-cell.pinned .dqa-star{opacity:1}" +
      "@media(prefers-reduced-motion:reduce){.dqa-ico.flash{animation:none}.dqa-ico img{animation:none}.dqa-toast{transition:none}.dqa-cell,.dqa-cell img,.dqa-prog{transition:none}}";
    document.head.appendChild(s);
  }

  // ---- DOM refs ----
  var icoEl, icoImg, hintEl, toastEl;

  function buildIcon() {
    var header = document.querySelector("header");
    if (!header || document.querySelector(".dqa-ico")) return;
    injectStyle();
    icoEl = document.createElement("span"); icoEl.className = "dqa-ico"; icoEl.title = "Your collection";
    icoEl.setAttribute("role", "button"); icoEl.setAttribute("aria-label", "Open your collection"); icoEl.tabIndex = 0;
    icoImg = document.createElement("img"); icoImg.alt = ""; icoImg.draggable = false;
    icoEl.appendChild(icoImg);
    icoEl.addEventListener("click", function () { if (longFired) { longFired = false; return; } openCollection(); });
    icoEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCollection(); } });
    // Hidden reset: press & hold ~1.1s.
    icoEl.addEventListener("mousedown", startPress);
    icoEl.addEventListener("mouseup", cancelPress);
    icoEl.addEventListener("mouseleave", cancelPress);
    icoEl.addEventListener("touchstart", startPress, { passive: true });
    icoEl.addEventListener("touchend", cancelPress);
    icoEl.addEventListener("touchcancel", cancelPress);
    icoEl.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    var logo = header.querySelector(".logo");
    (logo || header).appendChild(icoEl);
  }

  // ---- Hidden reset (long-press the icon) ----
  var pressTimer = null, longFired = false;
  function startPress() { longFired = false; cancelPress(); pressTimer = setTimeout(function () { longFired = true; doReset(); }, 1100); }
  function cancelPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
  function doReset() {
    if (!window.confirm("Reset your DevQuest collection?\n\nThis clears your visit history, unlocked sprites, and pin on this device.")) { longFired = false; return; }
    saveStr(PIN_KEY, null);
    try { localStorage.removeItem(DAYS_KEY); localStorage.removeItem(HINT_KEY); } catch (e) {}
    try { location.reload(); } catch (e) { days = []; pin = null; refreshIcon(); }
  }

  function refreshIcon() {
    if (!icoEl) return;
    if (unlockedCount() < 1) { icoEl.classList.remove("on"); return; }
    icoImg.src = SPRITES[mascotIndex()];
    icoEl.classList.add("on");
  }
  function flashIcon() {
    if (!icoEl || reduce) return;
    icoEl.classList.remove("flash"); void icoEl.offsetWidth; icoEl.classList.add("flash");
  }

  // ---- First-time discovery hint ----
  function maybeHint() {
    try { if (localStorage.getItem(HINT_KEY) === "1") return; localStorage.setItem(HINT_KEY, "1"); } catch (e) {}
    if (!icoEl) return;
    hintEl = document.createElement("div"); hintEl.className = "dqa-hint";
    hintEl.innerHTML = "<b>Your collection!</b> Come back each day to unlock a new sprite. Click to open it.";
    icoEl.appendChild(hintEl);
    setTimeout(function () { if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl); }, 9000);
  }

  // ---- Welcome-back toast ----
  function hideToast() { if (toastEl) toastEl.classList.remove("show"); }
  function welcomeToast(idx) {
    if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
    if (!toastEl) {
      toastEl = document.createElement("div"); toastEl.className = "dqa-toast";
      toastEl.innerHTML = '<img alt=""><div><div class="t1">Welcome back</div><div class="t2"></div></div>';
      toastEl.addEventListener("click", function () { hideToast(); openCollection(); });
      document.body.appendChild(toastEl);
    }
    toastEl.querySelector("img").src = SPRITES[idx];
    toastEl.querySelector(".t2").textContent = "New sprite unlocked!";
    void toastEl.offsetWidth; toastEl.classList.add("show");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(hideToast, 5500);
  }

  // ---- Collection modal ----
  function openCollection() {
    if (document.querySelector(".dqa-modal")) return;
    if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
    var uc = unlockedCount(), pct = TOTAL ? Math.round(uc / TOTAL * 100) : 0;
    var html = '<div class="dqa-head"><div><div class="dqa-title">Your collection</div>'
      + '<div class="dqa-sub">' + uc + ' / ' + TOTAL + ' unlocked · ' + days.length + ' day' + (days.length === 1 ? '' : 's') + ' visited</div></div>'
      + '<button class="dqa-x" type="button" aria-label="Close">×</button></div><div class="dqa-body">'
      + '<div class="dqa-progwrap"><div class="dqa-prog" style="width:' + pct + '%"></div></div>'
      + '<div class="dqa-tip">A new sprite unlocks every day you visit (they don’t have to be in a row). Click any unlocked sprite to pin it as your floating mascot.</div>';
    for (var s = 0; s < SECTIONS.length; s++) {
      var sec = SECTIONS[s];
      var got = Math.max(0, Math.min(sec.count, uc - sec.start));
      html += '<div class="dqa-sec"><span>' + escC(sec.name) + '</span><span class="c">' + got + ' / ' + sec.count + '</span></div><div class="dqa-grid">';
      for (var j = 0; j < sec.count; j++) {
        var gi = sec.start + j, u = isUnlocked(gi), isPin = (pin != null && parseInt(pin, 10) === gi);
        html += '<div class="dqa-cell ' + (u ? "unlocked" : "locked") + (isPin ? " pinned" : "") + '" data-i="' + gi + '"'
          + (u ? ' role="button" tabindex="0" title="Click to pin as your mascot"' : ' title="Locked — keep visiting!"') + '>'
          + '<img loading="lazy" src="' + SPRITES[gi] + '" alt=""><div class="dqa-star">★</div></div>';
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
    for (var k = 0; k < cells.length; k++) bindTile(cells[k], box);
    void ov.offsetWidth; ov.classList.add("show");
  }
  function bindTile(cell, box) {
    function toggle() {
      var i = cell.getAttribute("data-i");
      if (!isUnlocked(parseInt(i, 10))) return;
      if (pin === i) { pin = null; saveStr(PIN_KEY, null); }   // clicking the pinned one again un-pins it
      else { pin = i; saveStr(PIN_KEY, i); }
      applyPins(box); refreshIcon();
    }
    cell.addEventListener("click", toggle);
    cell.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  }
  function applyPins(box) {
    var cells = box.querySelectorAll(".dqa-cell");
    for (var i = 0; i < cells.length; i++) cells[i].classList.toggle("pinned", pin != null && cells[i].getAttribute("data-i") === pin);
  }

  // ---- Boot ----
  function mount() {
    injectStyle();
    var today = todayStr();
    var isNewDay = days.indexOf(today) < 0;
    var before = unlockedCount();
    if (isNewDay) { days.push(today); saveJSON(DAYS_KEY, days); }
    buildIcon();
    refreshIcon();
    var after = unlockedCount();
    // Returning on a new day (2nd+ visit-day) → welcome-back pop-up with the new sprite.
    if (isNewDay && after > before && after > 1) { flashIcon(); welcomeToast(after - 1); }
    // First time the icon ever appears → one-time discovery hint.
    if (after >= 1) maybeHint();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
