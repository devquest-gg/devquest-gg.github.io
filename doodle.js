/* =====================================================================
   DevQuest Daily Doodle  ·  self-contained, easy to remove
   ---------------------------------------------------------------------
   A tiny pixel "companion of the day" that sits by the wordmark and
   changes every day (deterministic by date — same for every visitor,
   rolls over at midnight, zero backend). Every sprite starts as a
   code-generated placeholder; over time we replace them, one slot per
   artist, each credited with a link. Click the sprite for the story.

   TO REMOVE COMPLETELY:
     1. Delete the two <!-- DOODLE:START --> ... <!-- DOODLE:END --> blocks
        in index.html (a mount span in the header, and the script tag).
     2. Delete this file, sprites.html, and DOODLE_STYLE_GUIDE.md.
   Nothing else in the site references it.

   Exposes window.DQDoodle for the gallery page (sprites.html).
   Preview any day with  ?doodle=YYYY-MM-DD  or  ?doodle=<slot 1-366>.
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  CONFIG  — the only part you normally edit                          *
   * ------------------------------------------------------------------ */
  var CONFIG = {
    contactEmail: "studios@devquest.gg", // where "claim a slot" mail goes
    payPerSprite: 10,                    // USD, stated up front
    weeklyCap: 5,                        // max paid replacements per week
    tz: "America/Los_Angeles",           // the daily sprite rolls over at midnight in this timezone
    galleryUrl: "https://devquest.gg/sprites.html",  // the collection / program page
    claimPage: "https://devquest.gg/claim.html",     // intake form (slot pre-filled via ?slot=)
    feedUrl: "https://devquest-alerts.balesdestin.workers.dev/sprite-claims.json", // posted sprites + weekly capacity

    // Date-pinned holiday slots (month-day). These show a themed sprite
    // and their name in the disclosure. Themes are palette + small
    // accessory for now; hand-made specials can replace them later.
    holidays: {
      "01-01": { name: "New Year's Day", theme: "newyear" },
      "02-14": { name: "Valentine's Day", theme: "valentine" },
      "03-17": { name: "St. Patrick's Day", theme: "stpatrick" },
      "07-04": { name: "Fourth of July", theme: "july4" },
      "10-31": { name: "Halloween", theme: "halloween" },
      "12-25": { name: "Christmas", theme: "christmas" },
      "12-31": { name: "New Year's Eve", theme: "newyear" }
    },

    // Claimed slots — filled in as artists replace placeholders.
    // slot number (1-366)  ->  { artist, url, png (optional data-URI) }.
    // Each claim may carry "week" (ISO yyyy-Www) so the meter can count
    // how many were paid this week. Empty to start — 100% placeholders.
    claims: {
      // 200: { artist: "@example", url: "https://example.com", week: "2026-W24" }
    }
  };

  // Live overlay: posted sprites + weekly capacity, fetched from the Worker. Falls back to pure
  // placeholders if the feed is unreachable, so the site never breaks on a network hiccup.
  var LIVE = { claims: {}, openThisWeek: null };
  var claimsReady = (function () {
    try {
      return fetch(CONFIG.feedUrl, { mode: "cors" }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.claims) for (var i = 0; i < d.claims.length; i++) { var c = d.claims[i]; if (c && c.slot) LIVE.claims[c.slot] = c; }
        if (d && typeof d.openThisWeek === "number") LIVE.openThisWeek = d.openThisWeek;
        return LIVE;
      }).catch(function () { return LIVE; });
    } catch (e) { return Promise.resolve(LIVE); }
  })();

  /* ------------------------------------------------------------------ *
   *  GENERATOR  — chunky procedural critter on a 32x32 canvas           *
   * ------------------------------------------------------------------ */
  var W = 12, H = 11, half = W / 2, S = 2, XO = 4, YO = 5; // art-grid + 32px frame

  var HUES = [140, 148, 155, 160, 45, 42, 38, 275, 265, 255, 185, 192, 12, 210];

  var THEMES = {
    christmas: { hues: [0, 355, 150], sat: 60, acc: "santa" },
    newyear:   { hues: [45, 48, 50], sat: 72, acc: "partyhat" },
    valentine: { hues: [340, 350, 0], sat: 62, acc: "heart" },
    july4:     { hues: [0, 210, 222], sat: 58, acc: "sparkle" },
    halloween: { hues: [26, 30, 280], sat: 70, acc: "sparkle" },
    stpatrick: { hues: [140, 145, 130], sat: 66, acc: "sparkle" }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Build the critter mask + palette for a slot (optionally themed).
  function gen(slot, theme) {
    var rng = mulberry32(((slot * 2654435761) ^ 0x9e3779b9) >>> 0);
    var cxf = (W - 1) / 2, cyf = (H - 1) / 2 + 0.2;
    var rx = 4.8 * (0.85 + rng() * 0.18), ry = 4.5 * (0.8 + rng() * 0.22);
    var m = [], x, y, a, b;
    for (y = 0; y < H; y++) { m[y] = []; for (x = 0; x < W; x++) m[y][x] = 0; }
    for (y = 0; y < H; y++) for (x = 0; x < half; x++) {
      var d = Math.pow((x - cxf) / rx, 2) + Math.pow((y - cyf) / ry, 2);
      m[y][x] = d < 0.6 ? 1 : (d < 1.0 ? (rng() < 0.5 ? 1 : 0) : 0);
    }
    for (y = 0; y < H; y++) for (x = 0; x < half; x++) m[y][W - 1 - x] = m[y][x];
    var n = []; for (y = 0; y < H; y++) n[y] = m[y].slice();
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      var c = 0; for (a = -1; a <= 1; a++) for (b = -1; b <= 1; b++) { if (a || b) c += m[y + a][x + b]; }
      n[y][x] = c >= 5 ? 1 : (c <= 2 ? 0 : m[y][x]);
    }
    for (y = 0; y < H; y++) for (x = 0; x < half; x++) n[y][W - 1 - x] = n[y][x];
    m = n;
    var bd = function () { var lo = 99, hi = -1; for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (m[y][x]) { if (y < lo) lo = y; if (y > hi) hi = y; } return [lo, hi]; };
    var bb = bd();
    if (rng() < 0.5 && bb[0] - 1 >= 0) { m[bb[0] - 1][3] = 1; m[bb[0] - 1][8] = 1; }
    if (rng() < 0.55 && bb[1] + 1 < H) { m[bb[1] + 1][4] = 1; m[bb[1] + 1][7] = 1; }
    bb = bd();

    var th = theme && THEMES[theme] ? THEMES[theme] : null;
    var hi2 = th ? th.hues[Math.floor(rng() * th.hues.length)] : HUES[Math.floor(rng() * HUES.length)];
    var sat = th ? th.sat : (46 + Math.floor(rng() * 26));
    function L(l) { return "hsl(" + hi2 + "," + sat + "%," + l + "%)"; }
    return {
      m: m, minY: bb[0], maxY: bb[1], rng: rng, acc: th ? th.acc : null,
      mid: L(50), light: L(68), shade: L(35), accent: L(73)
    };
  }

  // Draw a generated critter into a fresh 32x32 canvas, return the canvas.
  function renderCanvas(slot, dpx, theme) {
    var g = gen(slot, theme);
    var c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    c.style.width = (32 * dpx) + "px"; c.style.height = (32 * dpx) + "px";
    c.style.imageRendering = "pixelated"; c.style.display = "block";
    var ctx = c.getContext("2d");
    function put(cx, cy, col) { ctx.fillStyle = col; ctx.fillRect(XO + cx * S, YO + cy * S, S, S); }
    var lt = g.minY + Math.max(1, Math.round((g.maxY - g.minY) * 0.30));
    var sh = g.maxY - Math.max(1, Math.round((g.maxY - g.minY) * 0.16));
    var yy, xx;
    for (yy = 0; yy < H; yy++) for (xx = 0; xx < W; xx++) {
      if (!g.m[yy][xx]) {
        var adj = (yy > 0 && g.m[yy - 1][xx]) || (yy < H - 1 && g.m[yy + 1][xx]) ||
                  (xx > 0 && g.m[yy][xx - 1]) || (xx < W - 1 && g.m[yy][xx + 1]);
        if (adj) put(xx, yy, "#0b0e13");
      }
    }
    for (yy = 0; yy < H; yy++) for (xx = 0; xx < W; xx++) {
      if (g.m[yy][xx]) put(xx, yy, yy < lt ? g.light : (yy > sh ? g.shade : g.mid));
    }
    // eyes + highlight
    var ey = g.minY + Math.round((g.maxY - g.minY) * 0.42), eo = 2;
    if (g.m[ey] && g.m[ey][3] && g.m[ey][8]) eo = 3;
    var lc = eo === 3 ? 3 : 4, rc = eo === 3 ? 8 : 7;
    put(lc, ey, "#0b0e13"); put(rc, ey, "#0b0e13");
    if (ey - 1 >= 0) { put(lc, ey - 1, "rgba(240,246,252,0.9)"); put(rc, ey - 1, "rgba(240,246,252,0.9)"); }
    if (g.rng() < 0.55 && ey + 2 < H && g.m[ey + 2]) {
      if (g.m[ey + 2][5]) put(5, ey + 2, g.shade);
      if (g.m[ey + 2][6]) put(6, ey + 2, g.shade);
    }
    // holiday accessory (drawn on top, sits in the canvas top padding)
    if (g.acc) drawAccessory(put, g.acc, g.minY);
    return c;
  }

  function drawAccessory(put, acc, minY) {
    var t = minY; // head-top row
    if (acc === "santa") {
      put(4, t - 1, "#c1121f"); put(5, t - 1, "#e5383b"); put(6, t - 1, "#e5383b"); put(7, t - 1, "#c1121f");
      put(5, t - 2, "#e5383b"); put(6, t - 2, "#c1121f");
      put(7, t - 2, "#f7f7f7"); // pompom
      put(4, t, "#f7f7f7"); put(5, t, "#f7f7f7"); put(6, t, "#f7f7f7"); put(7, t, "#f7f7f7"); // trim
    } else if (acc === "partyhat") {
      put(6, t - 2, "#ffd60a"); // tip
      put(5, t - 1, "#f778ba"); put(6, t - 1, "#ffd60a");
      put(5, t, "#58a6ff"); put(6, t, "#f778ba");
    } else if (acc === "heart") {
      put(5, t - 1, "#ff4d6d"); put(7, t - 1, "#ff4d6d");
      put(5, t, "#ff4d6d"); put(6, t, "#ff758f"); put(7, t, "#ff4d6d");
      put(6, t + 1, "#ff4d6d");
    } else if (acc === "sparkle") {
      put(3, t, "rgba(255,255,255,0.95)"); put(8, t - 1, "#ffd60a"); put(6, t - 2, "rgba(255,255,255,0.85)");
    }
  }

  /* ------------------------------------------------------------------ *
   *  DATE  ->  SLOT  ->  STATE                                          *
   * ------------------------------------------------------------------ */
  // Calendar date in the configured timezone (California), so "today" rolls over at local
  // midnight, not UTC midnight. Falls back to UTC if Intl is unavailable.
  function tzParts(dt) {
    try {
      var s = new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
      return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) };
    } catch (e) {
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
  }
  function dayOfYear(dt) {
    var p = tzParts(dt);
    return Math.floor((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(p.y, 0, 0)) / 86400000);
  }
  function mdKey(dt) {
    var p = tzParts(dt);
    return String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0");
  }
  function isoWeek(dt) {
    var d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    var day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    var ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var wk = Math.ceil((((d - ys) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(wk).padStart(2, "0");
  }

  // Resolve the active date, honouring ?doodle= override.
  function activeDate() {
    var p = new URLSearchParams(location.search).get("doodle");
    if (p) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(p)) { var d = new Date(p + "T12:00:00Z"); if (!isNaN(d)) return d; }
      var n = parseInt(p, 10);
      if (n >= 1 && n <= 366) { var y = new Date(); var dd = new Date(Date.UTC(y.getUTCFullYear(), 0, n, 12)); return dd; }
    }
    return new Date();
  }

  function stateForDate(dt) {
    var slot = dayOfYear(dt);
    var hol = CONFIG.holidays[mdKey(dt)] || null;
    var claim = CONFIG.claims[slot] || LIVE.claims[slot] || null;
    return {
      slot: slot, date: dt, holiday: hol, claim: claim,
      type: claim ? "claimed" : "placeholder",
      theme: hol ? hol.theme : null
    };
  }

  function spriteElement(state, dpx) {
    if (state.claim && state.claim.png) {
      var img = document.createElement("img");
      img.src = state.claim.png; img.width = 32 * dpx; img.height = 32 * dpx;
      img.alt = "Sprite by " + (state.claim.artist || "artist");
      img.style.cssText = "image-rendering:pixelated;display:block;width:" + (32 * dpx) + "px;height:" + (32 * dpx) + "px";
      return img;
    }
    return renderCanvas(state.slot, dpx, state.theme);
  }

  function slotsOpenThisWeek() {
    if (LIVE.openThisWeek != null) return LIVE.openThisWeek;
    var wk = isoWeek(new Date()), used = 0;
    for (var k in CONFIG.claims) { if (CONFIG.claims[k] && CONFIG.claims[k].week === wk) used++; }
    return Math.max(0, CONFIG.weeklyCap - used);
  }

  /* ------------------------------------------------------------------ *
   *  STYLES (namespaced dqd-*)                                          *
   * ------------------------------------------------------------------ */
  function injectStyle() {
    if (document.getElementById("dqd-style")) return;
    var s = document.createElement("style");
    s.id = "dqd-style";
    s.textContent = [
      ".dqd-mount{position:relative;display:inline-flex;align-items:center;margin-left:4px}",
      ".dqd-sprite{cursor:pointer;border-radius:7px;padding:1px;line-height:0;background:transparent;border:1px solid transparent;transition:border-color .15s,background .15s;animation:dqd-bob 2.8s ease-in-out infinite}",
      ".dqd-sprite:hover{border-color:var(--border);background:var(--panel)}",
      ".dqd-sprite:focus-visible{outline:2px solid var(--green);outline-offset:2px}",
      "@keyframes dqd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}",
      ".dqd-pop{position:absolute;top:calc(100% + 10px);left:0;z-index:60;width:320px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 12px 32px rgba(0,0,0,.45);font-size:13px;color:var(--text);line-height:1.55;font-weight:400;letter-spacing:normal;text-align:left}",
      ".dqd-pop:before{content:'';position:absolute;top:-7px;left:18px;width:12px;height:12px;background:var(--panel);border-left:1px solid var(--border);border-top:1px solid var(--border);transform:rotate(45deg)}",
      ".dqd-top{display:flex;gap:12px;align-items:center;margin-bottom:10px}",
      ".dqd-cap{margin-top:10px;font-size:12px;color:var(--gold);background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.35);border-radius:8px;padding:7px 10px}",
      ".dqd-frame{flex:none;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:5px;line-height:0}",
      ".dqd-tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid var(--border);color:var(--muted);background:var(--bg);margin-bottom:6px}",
      ".dqd-tag.art{color:var(--green);border-color:rgba(63,185,80,.4)}",
      ".dqd-h{font-size:14px;font-weight:700;color:var(--text);margin-bottom:3px}",
      ".dqd-sub{color:#c9d1d9;font-size:12.5px;font-weight:400}",
      ".dqd-btns{margin-top:11px;display:flex;flex-wrap:wrap;gap:7px}",
      ".dqd-btn{font-size:12px;text-decoration:none;padding:6px 11px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:transparent;white-space:nowrap}",
      ".dqd-btn.pri{background:var(--green);border-color:var(--green);color:#06210f;font-weight:600}",
      ".dqd-meta{margin-top:9px;font-size:11px;color:var(--muted)}",
      ".dqd-x{position:absolute;top:8px;right:10px;cursor:pointer;color:var(--muted);font-size:15px;line-height:1;background:none;border:none}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   *  DISCLOSURE POPOVER                                                 *
   * ------------------------------------------------------------------ */
  function buildPopover(state) {
    var pop = document.createElement("div");
    pop.className = "dqd-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "About today's sprite");

    var dstr = state.date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    var holName = state.holiday ? state.holiday.name : null;
    // Capacity is only ever surfaced once a week is full — never as an
    // "N of 5 open" count, so a slow week never looks empty to the world.
    var atCap = slotsOpenThisWeek() <= 0;
    var capNote = atCap
      ? '<div class="dqd-cap">This week&rsquo;s ' + CONFIG.weeklyCap + ' slots are claimed. New ones open Monday.</div>'
      : '';
    var mail = "mailto:" + CONFIG.contactEmail +
      "?subject=" + encodeURIComponent("DevQuest sprite slot #" + String(state.slot).padStart(3, "0")) +
      "&body=" + encodeURIComponent("Hi! I'd like to make the pixel sprite for slot #" + state.slot + " (" + dstr + ").\n\nPortfolio / links:\nHandle to credit:\n");

    var inner;
    if (state.type === "claimed") {
      inner =
        '<div class="dqd-top"><div class="dqd-frame" data-sprite="1"></div>' +
        '<div><span class="dqd-tag art">Community art</span>' +
        '<div class="dqd-h">Art by ' + esc(state.claim.artist) + '</div></div></div>' +
        '<div class="dqd-sub">Sprite #' + String(state.slot).padStart(3, "0") +
        (holName ? ' &middot; ' + esc(holName) : '') + ' in the DevQuest collection.</div>' +
        '<div class="dqd-btns">' +
        '<a class="dqd-btn pri" href="' + esc(state.claim.url) + '" target="_blank" rel="noopener">View portfolio →</a>' +
        '<a class="dqd-btn" href="' + CONFIG.galleryUrl + '">Browse the collection →</a>' +
        '</div>';
    } else {
      inner =
        '<div class="dqd-top"><div class="dqd-frame" data-sprite="1"></div>' +
        '<div><span class="dqd-tag">' + (holName ? esc(holName) + ' &middot; placeholder' : 'AI-generated placeholder') + '</span>' +
        '<div class="dqd-h">' + (holName ? esc(holName) + "'s stand-in" : 'A stand-in, for now') + '</div></div></div>' +
        '<div class="dqd-sub">This little one was generated by code. We&rsquo;re replacing every placeholder with original pixel art from working game artists, <b style="color:var(--text)">one sprite per artist</b>, each credited with a link to your portfolio.</div>' +
        capNote +
        '<div class="dqd-btns">' +
        '<a class="dqd-btn pri" href="' + CONFIG.claimPage + '?slot=' + (((state.slot + 6) % 365) + 1) + '">Claim a slot →</a>' +
        '<a class="dqd-btn" href="' + CONFIG.galleryUrl + '">See the collection →</a>' +
        '</div>' +
        '<div class="dqd-meta">$' + CONFIG.payPerSprite + ' USD &middot; one slot per artist</div>';
    }

    pop.innerHTML = '<button class="dqd-x" aria-label="Close">&times;</button>' + inner;
    var fr = pop.querySelector('.dqd-frame[data-sprite="1"]');
    if (fr) fr.appendChild(spriteElement(state, 2));
    return { pop: pop, close: pop.querySelector(".dqd-x") };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  /* ------------------------------------------------------------------ *
   *  HEADER MOUNT                                                       *
   * ------------------------------------------------------------------ */
  function mountHeader() {
    var host = document.getElementById("dqd-mount");
    if (!host) return; // mount span absent -> nothing happens (safe)
    injectStyle();
    host.className = "dqd-mount";
    var state = stateForDate(activeDate());

    var btn = document.createElement("button");
    btn.className = "dqd-sprite";
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-label", "Sprite of the day, click to learn about it" +
      (state.holiday ? " (" + state.holiday.name + ")" : ""));
    btn.title = state.holiday ? state.holiday.name : "Sprite of the day";
    btn.appendChild(spriteElement(state, 2)); // 64px in the header
    host.appendChild(btn);

    var openPop = null;
    function close() { if (openPop) { openPop.remove(); openPop = null; document.removeEventListener("click", onDoc, true); document.removeEventListener("keydown", onKey, true); } }
    function onDoc(e) { if (openPop && !openPop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); }
    function onKey(e) { if (e.key === "Escape") { close(); btn.focus(); } }
    function toggle() {
      if (openPop) { close(); return; }
      var b = buildPopover(stateForDate(activeDate()));
      host.appendChild(b.pop); openPop = b.pop;
      b.close.addEventListener("click", function () { close(); btn.focus(); });
      setTimeout(function () { document.addEventListener("click", onDoc, true); document.addEventListener("keydown", onKey, true); }, 0);
      try { window.dqTrack && window.dqTrack("doodle_open", { slot: state.slot }); } catch (e) {}
    }
    btn.addEventListener("click", toggle);

    // When the live feed resolves, swap in a posted sprite for today if one exists.
    claimsReady.then(function () {
      var s2 = stateForDate(activeDate());
      if (s2.type === "claimed" && btn.firstChild) { btn.replaceChild(spriteElement(s2, 2), btn.firstChild); }
    });
  }

  /* ------------------------------------------------------------------ *
   *  PUBLIC API (used by sprites.html)                                  *
   * ------------------------------------------------------------------ */
  window.DQDoodle = {
    config: CONFIG,
    gen: gen,
    renderCanvas: renderCanvas,
    stateForDate: stateForDate,
    spriteElement: spriteElement,
    dayOfYear: dayOfYear,
    slotsOpenThisWeek: slotsOpenThisWeek,
    claimsReady: claimsReady,
    liveClaimFor: function (slot) { return LIVE.claims[slot] || null; },
    // Map a slot number (1-366) to a {name,theme} holiday if it has one.
    holidayForSlot: function (slot) {
      var y = tzParts(new Date()).y;
      var dt = new Date(Date.UTC(y, 0, slot, 12));
      var h = CONFIG.holidays[mdKey(dt)];
      return h ? { name: h.name, theme: h.theme, date: dt } : null;
    },
    slotDateLabel: function (slot) {
      var y = tzParts(new Date()).y;
      var dt = new Date(Date.UTC(y, 0, slot, 12));
      return dt.toLocaleDateString("en-US", { timeZone: CONFIG.tz, month: "short", day: "numeric" });
    },
    injectStyle: injectStyle
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountHeader);
  else mountHeader();
})();
