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

  // ---- interim claim modal (beta: drafts a hand-reviewed email, no backend) --
  var claimStyled = false;
  function injectClaimStyles() {
    if (claimStyled) return; claimStyled = true;
    var css = [
      ".dq-modal-ov{position:fixed;inset:0;z-index:200;background:rgba(4,6,10,.66);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}",
      ".dq-modal{width:100%;max-width:520px;background:var(--panel,#141a23);border:1px solid var(--border,#242c38);border-radius:16px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.6);position:relative}",
      ".dq-x{position:absolute;top:10px;right:14px;background:none;border:none;color:var(--muted,#8b98a9);font-size:24px;cursor:pointer;line-height:1}",
      ".dq-mh{font-size:20px;font-weight:850;letter-spacing:-.4px;margin:0 30px 6px 0}",
      ".dq-sub{font-size:13.5px;color:var(--muted,#8b98a9);margin-bottom:16px}.dq-sub b{color:var(--text,#eef3fa)}",
      ".dq-modal label{display:block;font-size:12px;font-weight:700;color:var(--text,#eef3fa);margin:12px 0 5px}",
      ".dq-modal input,.dq-modal select,.dq-modal textarea{width:100%;background:var(--bg,#0b0e14);border:1px solid var(--border,#242c38);border-radius:9px;padding:10px 12px;color:var(--text,#eef3fa);font-size:14px;font-family:inherit;outline:none}",
      ".dq-modal input:focus,.dq-modal select:focus,.dq-modal textarea:focus{border-color:var(--accent,#58a6ff)}",
      ".dq-modal textarea{resize:vertical;min-height:54px}",
      ".dq-row2{display:flex;gap:12px}.dq-row2>div{flex:1}",
      ".dq-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}",
      ".dq-cancel{background:none;border:1px solid var(--border,#242c38);color:var(--text,#eef3fa);border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer}",
      ".dq-submit{background:linear-gradient(135deg,var(--accent,#58a6ff),var(--purple,#a371f7));color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:800;font-size:14px;cursor:pointer}",
      ".dq-submit:hover{filter:brightness(1.08)}",
      ".dq-foot{font-size:12px;color:var(--muted,#8b98a9);margin-top:14px;text-align:center}.dq-foot a{color:var(--accent,#58a6ff)}"
    ].join("");
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }

  function openClaim(opts) {
    opts = opts || {}; injectClaimStyles();
    var isAdd = opts.mode === "addGame";
    var isGame = !!opts.game_title;
    var showRole = isGame || isAdd;
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">' + (isAdd ? 'Add a game and your credit' : isGame ? 'Claim your credit' : 'Claim this profile') + '</div>' +
      '<div class="dq-sub">' + (isAdd ? 'Not in the catalogue yet? Add the game and your role. ' : isGame ? 'On <b>' + esc(opts.game_title) + '</b>. ' : '') +
        'A person reviews every submission — nothing appears on the site until we verify it (usually within a day).</div>' +
      (isAdd ? '<label>Game title</label><input id="dqc-gtitle" value="' + esc(opts.prefillTitle || "") + '" placeholder="e.g. City of Heroes">' +
        '<div class="dq-row2"><div><label>Studio</label><input id="dqc-gstudio" placeholder="e.g. Paragon Studios"></div>' +
        '<div><label>Year <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><input id="dqc-gyear" placeholder="2004"></div></div>' +
        '<label>Platforms <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional, comma-separated</span></label><input id="dqc-gplat" placeholder="Microsoft Windows">' : '') +
      '<label>Your name (as it should be credited)</label><input id="dqc-name" value="' + esc(opts.person_name || "") + '" placeholder="Jane Doe">' +
      '<label>Your email</label><input id="dqc-email" type="email" placeholder="you@example.com">' +
      (showRole ? '<label>Your headline role <span style="font-weight:400;color:var(--muted,#8b98a9)">— the title to show first; your call</span></label><input id="dqc-role" placeholder="e.g. Content Lead">' +
        '<label>Other titles you held on this game <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional, comma-separated</span></label><input id="dqc-roles2" placeholder="Technical Support Lead, Game Designer, Content Manager">' : '') +
      '<label>Links that help show this is you <span style="font-weight:400;color:var(--muted,#8b98a9)">— LinkedIn, portfolio / ArtStation, studio team page. One per line, optional</span></label><textarea id="dqc-proof" placeholder="https://linkedin.com/in/you&#10;https://yourstudio.com/team"></textarea>' +
      '<label>Anything else for our reviewer <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><textarea id="dqc-note" placeholder="Context that helps us verify you"></textarea>' +
      '<div class="dq-actions"><button class="dq-cancel">Cancel</button><button class="dq-submit">Open email to submit →</button></div>' +
      '<div class="dq-foot">Nothing is sent automatically — this just drafts an email. Or write <a href="mailto:studios@devquest.gg">studios@devquest.gg</a>.</div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".dq-x").onclick = close;
    ov.querySelector(".dq-cancel").onclick = close;
    ov.querySelector(".dq-submit").onclick = function () {
      function val(id) { var el = ov.querySelector("#" + id); return el ? el.value.trim() : ""; }
      var name = val("dqc-name"), email = val("dqc-email"), role = val("dqc-role"),
          rolesOther = val("dqc-roles2"),
          proof = val("dqc-proof"), note = val("dqc-note");
      var subj = isAdd ? ("New game + credit: " + (val("dqc-gtitle") || "(untitled)"))
              : isGame ? ("Credit claim: " + opts.game_title)
              : ("Profile claim: " + (name || opts.person_name || ""));
      var lines = ["DevQuest Credits — " + (isAdd ? "new game + claim" : "claim") + " (beta, hand-reviewed)", ""];
      if (isAdd) {
        lines.push("NEW GAME (not yet in catalogue)");
        lines.push("Title: " + val("dqc-gtitle"));
        lines.push("Studio: " + val("dqc-gstudio"));
        if (val("dqc-gyear")) lines.push("Year: " + val("dqc-gyear"));
        if (val("dqc-gplat")) lines.push("Platforms: " + val("dqc-gplat"));
      } else if (isGame) { lines.push("Game: " + opts.game_title); if (opts.game_slug) lines.push("Slug: " + opts.game_slug); if (opts.game_qid) lines.push("Wikidata: " + opts.game_qid); }
      else { lines.push("Profile: " + (opts.person_name || name)); }
      lines.push("----------------------------------------", "");
      lines.push("Name (as credited): " + name);
      lines.push("Email: " + email);
      if (showRole) { lines.push("Headline role: " + role); if (rolesOther) lines.push("Other roles: " + rolesOther); }
      if (proof) { lines.push("Proof links:"); proof.split(/\n+/).forEach(function (u) { u = u.trim(); if (u) lines.push("  " + u); }); }
      else { lines.push("Proof links: (none provided)"); }
      lines.push("Note: " + note);
      w.location.href = "mailto:studios@devquest.gg?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(lines.join("\n"));
      close();
    };
    var firstEl = ov.querySelector(isAdd ? "#dqc-gtitle" : "#dqc-name"); if (firstEl) firstEl.focus();
  }

  w.DQ = {
    bkt: bkt, qs: qs, getJSON: getJSON, loadEntity: loadEntity, loadIndex: loadIndex,
    rank: rank, searchRows: searchRows, attachSuggest: attachSuggest, openClaim: openClaim,
    esc: esc, initials: initials, slugify: slugify,
    SIG_LABEL: {
      in_game_credits: "In-game credits", studio_website: "Studio site", press_kit: "Press kit",
      linkedin_self: "LinkedIn (self)", peer_vouch: "Peer vouch", community: "Community"
    }
  };
})(window);
