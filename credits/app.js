/* DevQuest Credits - shared front-end helpers for the /credits pages.
   Pages fetch exactly the one shard they need; the bucket hash below MUST
   stay byte-identical to bkt() in credits/tools/build-site.js. */
(function (w) {
  var SHARDS = { games: 256, studios: 64, people: 16 };

  // FNV-1a 32-bit - identical to the builder.
  function bkt(s, n) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h % n;
  }

  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(w.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  var cache = {};
  function getJSON(url) {
    if (cache[url]) return cache[url];
    cache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });
    return cache[url];
  }

  // Load one entity by slug from its shard. kind = "games" | "studios" | "people".
  function loadEntity(kind, slug) {
    var n = SHARDS[kind];
    return getJSON("data/site/" + kind + "/" + bkt(slug, n) + ".json").then(function (m) { return m[slug] || null; });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map(function (x) { return x[0] || ""; }).join("").toUpperCase() || "?";
  }
  function slugify(s) {
    return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  }

  // ---- search index loading (whole-index, for typeahead + search page) ----
  var idxCache = {};
  function loadIndex(kind) {
    if (idxCache[kind]) return idxCache[kind];
    var f = kind === "games" ? "index.json" : kind === "studios" ? "studios-index.json" : "people-index.json";
    idxCache[kind] = getJSON("data/site/" + f);
    return idxCache[kind];
  }

  // Rank a match: 0 = prefix, 1 = word-start, 2 = substring, -1 = no match.
  function rank(hayLower, ql) {
    var i = hayLower.indexOf(ql);
    if (i < 0) return -1;
    if (i === 0) return 0;
    if (hayLower.charAt(i - 1) === " ") return 1;
    return 2;
  }
  // Search index rows on column `at`. Returns {total, rows:capped}.
  function searchRows(rows, at, q, cap) {
    if (!rows || !rows.length || !q) return { total: 0, rows: [] };
    var ql = q.toLowerCase(), out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rank(String(rows[i][at]).toLowerCase(), ql);
      if (r >= 0) { out.push([r, rows[i]]); if (out.length > 6000) break; }
    }
    out.sort(function (a, b) { return a[0] - b[0] || String(a[1][at]).length - String(b[1][at]).length; });
    return { total: out.length, rows: out.slice(0, cap || out.length).map(function (x) { return x[1]; }) };
  }

  // ---- live combined typeahead dropdown -----------------------------------
  var stylesInjected = false;
  function injectSuggestStyles() {
    if (stylesInjected) return; stylesInjected = true;
    var css = [
      ".dq-suggest{position:absolute;top:calc(100% + 8px);left:0;width:100%;z-index:70;background:var(--panel,#141a23);",
      "border:1px solid var(--border,#242c38);border-radius:13px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;max-height:60vh;overflow-y:auto}",
      ".dq-suggest .grp{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#8b98a9);padding:12px 15px 5px}",
      ".dq-row{display:flex;align-items:center;gap:11px;padding:9px 14px;text-decoration:none;color:inherit}",
      ".dq-row:hover,.dq-row.hi{background:rgba(88,166,255,.10)}",
      ".dq-row .tag{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border-radius:6px;padding:2px 7px;flex:none}",
      ".dq-tag-game{color:var(--accent,#58a6ff);border:1px solid rgba(88,166,255,.4);background:rgba(88,166,255,.09)}",
      ".dq-tag-studio{color:var(--gold,#e0b23a);border:1px solid rgba(224,178,58,.4);background:rgba(224,178,58,.09)}",
      ".dq-tag-person{color:var(--green,#3fb950);border:1px solid rgba(63,185,80,.4);background:rgba(63,185,80,.09)}",
      ".dq-row .txt{min-width:0;flex:1;display:flex;flex-direction:column}",
      ".dq-row .nm{font-weight:700;font-size:14.5px;color:var(--text,#eef3fa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dq-row .sb{font-size:12px;color:var(--muted,#8b98a9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dq-seeall{display:block;padding:11px 15px;font-size:13px;font-weight:700;color:var(--accent,#58a6ff);",
      "border-top:1px solid var(--border,#242c38);text-decoration:none}",
      ".dq-seeall:hover,.dq-seeall.hi{background:rgba(88,166,255,.08)}",
      ".dq-empty{padding:15px;color:var(--muted,#8b98a9);font-size:13.5px}"
    ].join("");
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }

  function suggestRowHTML(kind, r) {
    if (kind === "games") {
      var sub = (r[3] || "") + (r[2] ? (r[3] ? " · " : "") + r[2] : "");
      return '<a class="dq-row" href="game.html?slug=' + encodeURIComponent(r[0]) + '"><span class="tag dq-tag-game">Game</span>' +
        '<span class="txt"><span class="nm">' + esc(r[1]) + '</span>' + (sub ? '<span class="sb">' + esc(sub) + '</span>' : '') + '</span></a>';
    }
    if (kind === "studios") {
      return '<a class="dq-row" href="studio.html?slug=' + encodeURIComponent(r[0]) + '"><span class="tag dq-tag-studio">Studio</span>' +
        '<span class="txt"><span class="nm">' + esc(r[1]) + '</span><span class="sb">' + Number(r[2]).toLocaleString() + ' game' + (r[2] === 1 ? '' : 's') + '</span></span></a>';
    }
    return '<a class="dq-row" href="person.html?slug=' + encodeURIComponent(r[0]) + '"><span class="tag dq-tag-person">Person</span>' +
      '<span class="txt"><span class="nm">' + esc(r[1]) + '</span><span class="sb">' + r[2] + ' credit' + (r[2] === 1 ? '' : 's') + '</span></span></a>';
  }

  // Attach a live grouped dropdown to a text input. Jumps straight to an entity
  // on click/Enter; "See all" (or Enter with nothing highlighted) opens search.html.
  function attachSuggest(input, opts) {
    opts = opts || {};
    injectSuggestStyles();
    var CAP = { games: opts.games || 5, studios: opts.studios || 4, people: opts.people || 4 };
    var wrap = input.closest(".search") || input.parentNode;
    wrap.style.position = "relative";
    var box = document.createElement("div"); box.className = "dq-suggest"; box.style.display = "none";
    wrap.appendChild(box);
    var data = { games: null, studios: null, people: null }, hi = -1, loaded = false;

    function preload() {
      if (loaded) return; loaded = true;
      ["games", "studios", "people"].forEach(function (k) {
        loadIndex(k).then(function (rows) { data[k] = rows; if (box.style.display !== "none") refresh(); }).catch(function () {});
      });
    }
    function items() { return box.querySelectorAll(".dq-row,.dq-seeall"); }
    function setHi(n) {
      var els = items(); if (!els.length) { hi = -1; return; }
      hi = (n + els.length) % els.length;
      els.forEach(function (e, i) { e.classList.toggle("hi", i === hi); });
      els[hi].scrollIntoView({ block: "nearest" });
    }
    function build(q) {
      var g = searchRows(data.games, 1, q, CAP.games),
          s = searchRows(data.studios, 1, q, CAP.studios),
          p = (data.people && data.people.length) ? searchRows(data.people, 1, q, CAP.people) : { total: 0, rows: [] };
      var h = "";
      if (g.total) h += '<div class="grp">Games</div>' + g.rows.map(function (r) { return suggestRowHTML("games", r); }).join("");
      if (s.total) h += '<div class="grp">Studios</div>' + s.rows.map(function (r) { return suggestRowHTML("studios", r); }).join("");
      if (p.total) h += '<div class="grp">People</div>' + p.rows.map(function (r) { return suggestRowHTML("people", r); }).join("");
      if (!h) h = '<div class="dq-empty">No matches' + (data.games ? '' : ' (loading catalogue…)') + '</div>';
      h += '<a class="dq-seeall" href="search.html?q=' + encodeURIComponent(q) + '">See all results for “' + esc(q) + '” →</a>';
      return h;
    }
    function refresh() {
      var q = input.value.trim();
      if (!q) { box.style.display = "none"; box.innerHTML = ""; hi = -1; return; }
      box.innerHTML = build(q); box.style.display = "block"; hi = -1;
    }
    function seeAll() { var q = input.value.trim(); w.location.href = "search.html" + (q ? "?q=" + encodeURIComponent(q) : ""); }
    var t;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(refresh, 110); });
    input.addEventListener("focus", function () { preload(); if (input.value.trim()) refresh(); });
    input.addEventListener("keydown", function (e) {
      if (box.style.display === "none") { if (e.key === "Enter") seeAll(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHi(hi + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHi(hi - 1); }
      else if (e.key === "Enter") { var els = items(); if (hi >= 0 && els[hi]) { e.preventDefault(); w.location.href = els[hi].getAttribute("href"); } else { seeAll(); } }
      else if (e.key === "Escape") { box.style.display = "none"; hi = -1; }
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) { box.style.display = "none"; hi = -1; } });
    return { seeAll: seeAll };
  }

  w.DQ = {
    bkt: bkt, qs: qs, getJSON: getJSON, loadEntity: loadEntity, loadIndex: loadIndex,
    rank: rank, searchRows: searchRows, attachSuggest: attachSuggest,
    esc: esc, initials: initials, slugify: slugify,
    ATTR_LABEL: { credited: "Credited", special_thanks: "Special thanks", uncredited: "Uncredited" },
    SIG_LABEL: {
      in_game_credits: "In-game credits", studio_website: "Studio site", press_kit: "Press kit",
      linkedin_self: "LinkedIn (self)", peer_vouch: "Peer vouch", community: "Community"
    }
  };
})(window);
