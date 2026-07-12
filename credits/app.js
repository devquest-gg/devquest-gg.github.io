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
    return getJSON("/credits/data/site/" + kind + "/" + bkt(slug, n) + ".json").then(function (m) { return m[slug] || null; });
  }

  // Only allow safe link schemes into an href. Blocks javascript:, data:, etc.,
  // which esc() alone would not (it escapes quotes/brackets, not the scheme).
  function safeUrl(u) {
    u = String(u == null ? "" : u).trim();
    return /^(https?:\/\/|mailto:)/i.test(u) ? u : "#";
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
    idxCache[kind] = getJSON("/credits/data/site/" + f);
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
      return '<a class="dq-row" href="/credits/game/' + encodeURIComponent(r[0]) + '"><span class="tag dq-tag-game">Game</span>' +
        '<span class="txt"><span class="nm">' + esc(r[1]) + '</span>' + (sub ? '<span class="sb">' + esc(sub) + '</span>' : '') + '</span></a>';
    }
    if (kind === "studios") {
      return '<a class="dq-row" href="/credits/studio/' + encodeURIComponent(r[0]) + '"><span class="tag dq-tag-studio">Studio</span>' +
        '<span class="txt"><span class="nm">' + esc(r[1]) + '</span><span class="sb">' + Number(r[2]).toLocaleString() + ' game' + (r[2] === 1 ? '' : 's') + '</span></span></a>';
    }
    var un = r[3];
    var phref = un ? ('/credits/game/' + encodeURIComponent(un)) : ('/credits/' + encodeURIComponent(r[0]));
    var psub = un ? 'Unclaimed — tap to claim' : (r[2] + ' credit' + (r[2] === 1 ? '' : 's'));
    return '<a class="dq-row" href="' + phref + '"><span class="tag dq-tag-person">Person</span>' +
      '<span class="txt"><span class="nm">' + esc(r[1]) + '</span><span class="sb">' + psub + '</span></span></a>';
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
    var data = { games: null, studios: null, people: null, liveGames: null, liveStudios: null, livePeople: null }, hi = -1, loaded = false;

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
    // Merge static catalogue rows with live (API) rows, deduping by slug (catalogue wins).
    function mergeRows(catRows, liveRows, cap) {
      var seen = {}, out = [];
      (catRows || []).forEach(function (r) { var k = r[0]; if (!seen[k]) { seen[k] = 1; out.push(r); } });
      (liveRows || []).forEach(function (r) { var k = r[0]; if (!seen[k]) { seen[k] = 1; out.push(r); } });
      return { total: out.length, rows: out.slice(0, cap) };
    }
    function liveFilter(rows, q) {
      if (!rows) return [];
      var ql = q.toLowerCase();
      return rows.filter(function (r) { return String(r[1] || "").toLowerCase().indexOf(ql) !== -1; });
    }
    function build(q) {
      var p = mergeRows(searchRows(data.people || [], 1, q, CAP.people * 4).rows, liveFilter(data.livePeople, q), CAP.people);
      var g = mergeRows(searchRows(data.games, 1, q, CAP.games * 4).rows, liveFilter(data.liveGames, q), CAP.games);
      var s = mergeRows(searchRows(data.studios, 1, q, CAP.studios * 4).rows, liveFilter(data.liveStudios, q), CAP.studios);
      var h = "";
      if (p.total) h += '<div class="grp">People</div>' + p.rows.map(function (r) { return suggestRowHTML("people", r); }).join("");
      if (g.total) h += '<div class="grp">Games</div>' + g.rows.map(function (r) { return suggestRowHTML("games", r); }).join("");
      if (s.total) h += '<div class="grp">Studios</div>' + s.rows.map(function (r) { return suggestRowHTML("studios", r); }).join("");
      if (!h) h = '<div class="dq-empty">No matches' + (data.games ? '' : ' (loading catalogue…)') + '</div>';
      h += '<a class="dq-seeall" href="search.html?q=' + encodeURIComponent(q) + '">See all results for “' + esc(q) + '” →</a>';
      h += '<a class="dq-seeall dq-add" data-dqadd style="cursor:pointer">＋ Add a game you worked on</a>';
      return h;
    }
    function refresh() {
      var q = input.value.trim();
      if (!q) { box.style.display = "none"; box.innerHTML = ""; hi = -1; return; }
      data.livePeople = data.liveGames = data.liveStudios = null;   // reset live results for the new query
      box.innerHTML = build(q); box.style.display = "block"; hi = -1;
      // Live user-added people, games, and studios from the backend, merged into the groups.
      if (w.DQAPI) {
        var myq = q;
        var repaint = function () { if (input.value.trim() === myq && box.style.display !== "none") box.innerHTML = build(myq); };
        if (w.DQAPI.searchPeople) w.DQAPI.searchPeople(q).then(function (r) { var pl = ((r.data && r.data.people) || []).map(function (p) { return [p.slug, p.name, p.credit_count || 0, ""]; }); var ul = ((r.data && r.data.unclaimed) || []).map(function (p) { return ["u:" + String(p.name).toLowerCase(), p.name, p.credit_count || 0, p.game_slug || ""]; }); data.livePeople = pl.concat(ul); repaint(); }).catch(function () {});
        if (w.DQAPI.searchGames) w.DQAPI.searchGames(q).then(function (r) { data.liveGames = ((r.data && r.data.games) || []).map(function (g) { return [g.slug, g.title, g.year || "", g.studio || ""]; }); repaint(); }).catch(function () {});
        if (w.DQAPI.searchStudios) w.DQAPI.searchStudios(q).then(function (r) { data.liveStudios = ((r.data && r.data.studios) || []).map(function (s) { return [s.slug, s.name, s.count || 0]; }); repaint(); }).catch(function () {});
      }
    }
    function seeAll() { var q = input.value.trim(); w.location.href = "search.html" + (q ? "?q=" + encodeURIComponent(q) : ""); }
    var t;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(refresh, 110); });
    input.addEventListener("focus", function () { preload(); if (input.value.trim()) refresh(); });
    input.addEventListener("keydown", function (e) {
      if (box.style.display === "none") { if (e.key === "Enter") seeAll(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHi(hi + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHi(hi - 1); }
      else if (e.key === "Enter") { var els = items(); if (hi >= 0 && els[hi]) { e.preventDefault(); if (els[hi].hasAttribute("data-dqadd")) { box.style.display = "none"; openClaim({ mode: "addGame", prefillTitle: input.value.trim() }); } else { w.location.href = els[hi].getAttribute("href"); } } else { seeAll(); } }
      else if (e.key === "Escape") { box.style.display = "none"; hi = -1; }
    });
    box.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-dqadd]")) { e.preventDefault(); box.style.display = "none"; openClaim({ mode: "addGame", prefillTitle: input.value.trim() }); } });
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
      ".dq-modal input[type=checkbox],.dq-modal input[type=radio]{width:auto;background:none;border:0;border-radius:0;padding:0;margin:0 7px 0 0;vertical-align:-1px}",
      ".dq-modal input:focus,.dq-modal select:focus,.dq-modal textarea:focus{border-color:var(--accent,#58a6ff)}",
      ".dq-modal textarea{resize:vertical;min-height:54px}",
      ".dq-row2{display:flex;gap:12px}.dq-row2>div{flex:1}",
      ".dq-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}",
      ".dq-cancel{background:none;border:1px solid var(--border,#242c38);color:var(--text,#eef3fa);border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer}",
      ".dq-submit{background:linear-gradient(135deg,var(--accent,#58a6ff),var(--purple,#a371f7));color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:800;font-size:14px;cursor:pointer}",
      ".dq-submit:hover{filter:brightness(1.08)}",
      ".dq-foot{font-size:12px;color:var(--muted,#8b98a9);margin-top:14px;text-align:center}.dq-foot a{color:var(--accent,#58a6ff)}",
      ".dq-ac{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:210;background:var(--panel,#141a23);border:1px solid var(--border,#242c38);border-radius:9px;max-height:220px;overflow:auto;box-shadow:0 14px 40px rgba(0,0,0,.5)}",
      ".dq-ac-row{display:block;width:100%;text-align:left;background:none;border:none;color:var(--text,#eef3fa);font-size:13.5px;padding:8px 11px;cursor:pointer;font-family:inherit}",
      ".dq-ac-row:hover{background:rgba(88,166,255,.10)}",
      ".dq-ac-sub{color:var(--muted,#8b98a9);font-size:11.5px;margin-left:6px}",
      ".dq-ac-none{padding:9px 11px;color:var(--muted,#8b98a9);font-size:12.5px;font-style:italic}",
      ".dq-warn{margin-top:8px;font-size:12.5px;color:#c4cfdd;background:rgba(224,178,58,.08);border:1px solid rgba(224,178,58,.3);border-radius:9px;padding:9px 11px}",
      ".dq-warn a{color:var(--accent,#58a6ff);font-weight:600}.dq-warn b{color:var(--gold,#e0b23a)}",
      ".dq-idnote{font-size:11.5px;color:var(--muted,#8b98a9);margin-top:6px}.dq-idnote a{color:var(--accent,#58a6ff)}",
      "@media(max-width:600px){.dq-modal-ov{padding:3vh 10px}.dq-modal{padding:18px}.dq-mh{font-size:18px;margin-right:26px}.dq-row2{flex-direction:column;gap:0}}"
    ].join("");
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }

  // Remember the person's name+email on THIS device so they don't retype it on
  // every claim. Stays local until they submit an email; cleared on demand.
  function getIdentity() { try { return JSON.parse(w.localStorage.getItem("dq_identity") || "null") || {}; } catch (e) { return {}; } }
  function setIdentity(name, email) { try { if (name && email) w.localStorage.setItem("dq_identity", JSON.stringify({ name: name, email: email })); } catch (e) {} }
  function clearIdentity() { try { w.localStorage.removeItem("dq_identity"); } catch (e) {} }

  var ROLES = ["Producer","Executive Producer","Associate Producer","Production Director","Game Designer","Lead Designer","Design Director","Systems Designer","Level Designer","Narrative Designer","Content Designer","Combat Designer","Encounter Designer","Programmer","Gameplay Programmer","Engine Programmer","Graphics Programmer","Network Programmer","Tools Programmer","AI Programmer","Lead Programmer","Technical Director","Artist","Concept Artist","Environment Artist","Character Artist","Technical Artist","Art Director","Animator","Lead Artist","VFX Artist","UI Artist","UI/UX Designer","Audio Designer","Composer","Sound Designer","Audio Director","Writer","Narrative Director","QA Tester","QA Lead","QA Analyst","Community Manager","Live Operations","Product Manager","Creative Director","Studio Head","Technical Support Lead","Localization","Marketing"];

  function titleCase(s) {
    var small = { a:1,an:1,and:1,as:1,at:1,but:1,by:1,for:1,from:1,if:1,in:1,into:1,nor:1,of:1,on:1,onto:1,or:1,over:1,the:1,to:1,vs:1,via:1,with:1 };
    return String(s || "").trim().toLowerCase().split(/\s+/).filter(Boolean)
      .map(function (w, i) { return (i > 0 && small[w]) ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }

  // Lightweight autocomplete for a modal text field. itemsFn(q) -> [{label,slug,sub}].
  function mkAutocomplete(input, itemsFn, opts) {
    opts = opts || {};
    var wrap = input.parentNode; wrap.style.position = "relative";
    var box = document.createElement("div"); box.className = "dq-ac"; box.style.display = "none"; wrap.appendChild(box);
    var t;
    function render() {
      var q = input.value.trim();
      if (opts.onType) opts.onType(q);
      if (q.length < 2) { box.style.display = "none"; return; }
      Promise.resolve(itemsFn(q)).then(function (items) {
        items = items || [];
        if (!items.length) { box.innerHTML = '<div class="dq-ac-none">' + esc(opts.noneText ? opts.noneText(q) : "No match — will be added as new (reviewed)") + '</div>'; }
        else { box._items = items; box.innerHTML = items.map(function (it, i) { return '<button type="button" class="dq-ac-row" data-i="' + i + '">' + esc(it.label) + (it.sub ? ' <span class="dq-ac-sub">' + esc(it.sub) + '</span>' : '') + '</button>'; }).join(""); }
        box.style.display = "block";
      });
    }
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(render, 140); });
    input.addEventListener("focus", render);
    box.addEventListener("click", function (e) { var r = e.target.closest && e.target.closest(".dq-ac-row"); if (r) { var it = box._items[+r.dataset.i]; input.value = it.label; box.style.display = "none"; if (opts.onSelect) opts.onSelect(it); } });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) box.style.display = "none"; });
  }

  function openClaim(opts) {
    opts = opts || {}; injectClaimStyles();
    var isAdd = opts.mode === "addGame";
    var selStudioSlug = null;
    var ident = getIdentity();
    var isGame = !!opts.game_title;
    var showRole = isGame || isAdd;
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">' + (isAdd ? 'Add a game and your credit' : isGame ? 'Claim your credit' : 'Claim this profile') + '</div>' +
      '<div class="dq-sub">' + (isAdd ? 'Not in the catalogue yet? Add the game and your role. ' : isGame ? 'On <b>' + esc(opts.game_title) + '</b>. ' : '') +
        'A person reviews every submission — nothing appears on the site until we verify it (usually within a day).</div>' +
      (isAdd ? '<label>Game title</label><input id="dqc-gtitle" autocomplete="off" value="' + esc(titleCase(opts.prefillTitle || "")) + '" placeholder="e.g. City of Heroes"><div id="dqc-gexist"></div>' +
        '<div class="dq-row2"><div><label>Studio <span style="font-weight:400;color:var(--muted,#8b98a9)">— search existing</span></label><input id="dqc-gstudio" autocomplete="off" value="' + esc(opts.prefillStudio || "") + '" placeholder="Start typing…"></div>' +
        '<div><label>Game\'s launch year <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><input id="dqc-gyear" placeholder="2004"></div></div>' +
        '<label>Platforms <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional, comma-separated</span></label><input id="dqc-gplat" placeholder="Microsoft Windows">' : '') +
      '<label>Your name (as it should be credited)</label><input id="dqc-name" value="' + esc(opts.prefillName || opts.person_name || ident.name || "") + '" placeholder="Jane Doe">' +
      '<label>Your email</label><input id="dqc-email" type="email" value="' + esc(ident.email || "") + '" placeholder="you@example.com">' +
      ((ident.name || ident.email) ? '<div class="dq-idnote">Name and email remembered on this device · <a data-clearid style="cursor:pointer">Clear</a></div>' : '') +
      (showRole ? '<label>Your headline role <span style="font-weight:400;color:var(--muted,#8b98a9)">— the title to show first; your call</span></label><input id="dqc-role" list="dqc-roles-list" autocomplete="off" placeholder="Start typing a role…"><datalist id="dqc-roles-list">' + ROLES.map(function (r) { return '<option value="' + esc(r) + '"></option>'; }).join("") + '</datalist>' +
        '<label>Other titles you held on this game <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional, comma-separated</span></label><input id="dqc-roles2" placeholder="Technical Support Lead, Game Designer, Content Manager">' +
        '<label>Ports &amp; expansions <span style="font-weight:400;color:var(--muted,#8b98a9)">— named ports, remasters, or expansions you worked on. Comma-separated, optional</span></label><input id="dqc-release" list="dqc-release-list" autocomplete="off" placeholder="e.g. PC port  ·  Trials of Atlantis, Catacombs"><datalist id="dqc-release-list"><option value="PC port"></option><option value="Console port"></option><option value="Remaster"></option><option value="DLC"></option><option value="Expansion"></option></datalist>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:8px 0;cursor:pointer"><input type="checkbox" id="dqc-live" style="margin-right:7px;vertical-align:-1px">I worked on this game\'s live-service / post-launch period</label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:8px 0;cursor:pointer"><input type="checkbox" id="dqc-external" style="margin-right:7px;vertical-align:-1px">I worked on this as an outsourced or external contributor</label>' +
        '<label style="margin-top:10px">What did you work on?</label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-scope" value="base" checked style="margin-right:7px;vertical-align:-1px">The base game <span style="color:var(--muted,#8b98a9)">— including if you also worked on expansions, ports, or live service</span></label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-scope" value="partial" style="margin-right:7px;vertical-align:-1px">Only a specific part, not the base game <span style="color:var(--muted,#8b98a9)">— a port, an expansion, or the live-service era</span></label>' : '') +
      '<label>Links that help show this is you <span style="font-weight:400;color:var(--muted,#8b98a9)">— LinkedIn, portfolio / ArtStation, studio team page. One per line, optional</span></label><textarea id="dqc-proof" placeholder="https://linkedin.com/in/you&#10;https://yourstudio.com/team"></textarea>' +
      '<label>Anything else for our reviewer <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><textarea id="dqc-note" placeholder="Context that helps us verify you"></textarea>' +
      '<div style="font-size:11px;color:var(--muted,#8b98a9);margin-top:12px;line-height:1.4">Only add work you\'re free to disclose. Leave off anything under NDA or not publicly announced.</div>' +
      '<div class="dq-actions"><button class="dq-cancel">Cancel</button><button class="dq-submit">Save my credit →</button></div>' +
      '<div class="dq-foot">Saved to your account — you can edit or remove it anytime.</div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    // Intentionally NOT closing on backdrop click — too easy to lose a filled-in form.
    ov.querySelector(".dq-x").onclick = close;
    ov.querySelector(".dq-cancel").onclick = close;
    if (w.DQAPI) {
      var sb0 = ov.querySelector(".dq-submit"); if (sb0) sb0.textContent = (isGame || isAdd) ? "Save my credit →" : "Sign in →";
      var ft0 = ov.querySelector(".dq-foot"); if (ft0) ft0.innerHTML = (isGame || isAdd) ? "Saved to your account — you can edit or remove it anytime." : "You'll sign in to manage your page.";
    }
    ov.querySelector(".dq-submit").onclick = function () {
      var submitBtn = this;
      function val(id) { var el = ov.querySelector("#" + id); return el ? el.value.trim() : ""; }
      var name = val("dqc-name"), email = val("dqc-email"), role = val("dqc-role"),
          rolesOther = val("dqc-roles2"),
          proof = val("dqc-proof"), note = val("dqc-note");
      setIdentity(name, email);
      var rolesArr = rolesOther ? rolesOther.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [];
      var proofArr = proof ? proof.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
      var verification = proofArr.some(function (u) { return /linkedin\.com/i.test(u); }) ? ["linkedin_self"] : [];
      function payload() {
        var relArr = uniq(val("dqc-release") ? val("dqc-release").split(",").map(function (s) { return s.trim(); }).filter(Boolean) : []);
        var liveEl = ov.querySelector("#dqc-live");
        if (liveEl && liveEl.checked && relArr.indexOf("Live service") === -1) relArr.push("Live service");
        var extEl = ov.querySelector("#dqc-external");
        if (extEl && extEl.checked && relArr.indexOf("External contributor") === -1) relArr.push("External contributor");
      var scopeEl = ov.querySelector('input[name="dqc-scope"]:checked');
      var p = { name: name, role: role, roles_other: rolesArr, verification: verification, source_url: proofArr[0] || "", links: proofArr, releases: relArr, scope: scopeEl ? scopeEl.value : "base" };
        if (isAdd) {
          p.new_game = { title: val("dqc-gtitle"), studio: val("dqc-gstudio"), year: val("dqc-gyear"),
            platforms: val("dqc-gplat") ? val("dqc-gplat").split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [] };
          p.game_title = val("dqc-gtitle"); p.studio = val("dqc-gstudio");
        } else if (isGame) { p.game_slug = opts.game_slug; p.game_title = opts.game_title; p.studio = opts.studio || null; }
        return p;
      }

      // --- live API path: save the credit for real ---
      if (w.DQAPI) {
        if (!isGame && !isAdd) { w.location.href = "signin.html"; return; }         // profile claim = sign in
        if (!role) { alert("Add your headline role first."); return; }
        if (!w.DQAPI.isSignedIn()) {
          // Stash the whole credit so sign-in can finish it, instead of losing the game.
          try { w.localStorage.setItem("dq_pending_credit", JSON.stringify(payload())); } catch (e) {}
          w.location.href = "signin.html"; return;
        }
        submitBtn.disabled = true; submitBtn.textContent = "Saving…";
        w.DQAPI.createCredit(payload()).then(function (r) {
          if (r.status === 201 || r.ok) {
            var slug = r.data && r.data.person_slug; close();
            w.location.href = slug ? ("/credits/person.html?slug=" + encodeURIComponent(slug)) : "/credits/";
          } else if (r.status === 401) { w.location.href = "signin.html"; }
          else { submitBtn.disabled = false; submitBtn.textContent = "Save my credit →"; alert((r.data && r.data.error) || "Could not save. Try again."); }
        }).catch(function () { submitBtn.disabled = false; submitBtn.textContent = "Save my credit →"; alert("Network error. Try again."); });
        return;
      }

      // No API present (shouldn't happen once deployed). NEVER open an email client.
      alert("Couldn't reach the sign-in service. Please reload the page and try again.");
    };
    if (isAdd) {
      var gstudio = ov.querySelector("#dqc-gstudio");
      if (gstudio) mkAutocomplete(gstudio, function (q) {
        return loadIndex("studios").then(function (rows) {
          return searchRows(rows, 1, q, 8).rows.map(function (r) { return { label: r[1], slug: r[0], sub: (r[2] || 0) + " games" }; });
        });
      }, {
        onSelect: function (it) { selStudioSlug = it.slug; },
        onType: function () { selStudioSlug = null; },
        noneText: function (q) { return "No studio matches “" + q + "” — it'll be added as new (reviewed)"; }
      });
      var gtitle = ov.querySelector("#dqc-gtitle"), gexist = ov.querySelector("#dqc-gexist"), gt;
      var checkExist = function () {
        var q = gtitle.value.trim();
        if (q.length < 3) { gexist.innerHTML = ""; return; }
        loadIndex("games").then(function (rows) {
          var m = searchRows(rows, 1, q, 4).rows;
          if (!m.length) { gexist.innerHTML = ""; return; }
          gexist.innerHTML = '<div class="dq-warn"><b>Already in the catalogue?</b> If your game is here, claim it instead of adding a duplicate: ' +
            m.map(function (r) { return '<a href="/credits/game/' + encodeURIComponent(r[0]) + '" target="_blank" rel="noopener">' + esc(r[1]) + (r[3] ? ' · ' + esc(r[3]) : '') + '</a>'; }).join(" &nbsp;·&nbsp; ") + '</div>';
        });
      };
      if (gtitle && gexist) { gtitle.addEventListener("input", function () { clearTimeout(gt); gt = setTimeout(checkExist, 300); }); checkExist(); }
    }
    var clr = ov.querySelector("[data-clearid]");
    if (clr) clr.onclick = function (e) { e.preventDefault(); clearIdentity(); var n = ov.querySelector("#dqc-name"), em = ov.querySelector("#dqc-email"), nt = ov.querySelector(".dq-idnote"); if (n) n.value = ""; if (em) em.value = ""; if (nt) nt.remove(); if (n) n.focus(); };
    // if we already know who you are, jump focus to the game (add) or role
    var firstEl = ov.querySelector(isAdd ? "#dqc-gtitle" : ((ident.name && ident.email && showRole) ? "#dqc-role" : "#dqc-name")); if (firstEl) firstEl.focus();
  }

  // De-dupe a list case-insensitively, keeping first + trimmed.
  function uniq(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (x) { var t = String(x).trim(), k = t.toLowerCase(); if (!t || seen[k]) return; seen[k] = 1; out.push(t); });
    return out;
  }
  // Classify a release pill into one of four restrained categories.
  function releaseClass(label) {
    var s = String(label || "").toLowerCase();
    if (/\bport\b|remaster/.test(s)) return "port";
    if (/live|season|update|patch/.test(s)) return "live";
    if (/xdev|x-dev|outsourc|co-?dev|external|support studio/.test(s)) return "xdev";
    return "content";                                   // DLC, expansions, named releases
  }

  // Report / suggest-a-fix modal for a catalogue game or studio, or a person's credit
  // on a game (type "credit"). Anyone can file one. opts.gameTitle gives context for credits.
  function openReport(type, slug, name, opts) {
    opts = opts || {};
    injectClaimStyles();
    var isCredit = type === "credit";
    var label = type === "studio" ? "studio" : "game";
    var subj = isCredit ? (esc(name) + (opts.gameTitle ? " on " + esc(opts.gameTitle) : "")) : esc(name || slug);
    var reasons = isCredit
      ? [["not_worked", "This person didn't work on this game"], ["wrong_role", "The role or details are wrong"], ["spam", "Not a real person / spam"], ["other", "Something else"]]
      : [["not_real", "This " + label + " is not real / should not exist"], ["wrong_name", "The name is wrong (typo)"]]
          .concat(type === "game" ? [["wrong_studio", "It's under the wrong studio"]] : [])
          .concat([["other", "Something else"]]);
    var reasonHTML = reasons.map(function (r, i) {
      return '<label style="display:block;font-weight:400;font-size:13px;margin:5px 0;cursor:pointer"><input type="radio" name="dqr-reason" value="' + r[0] + '"' + (i === 0 ? " checked" : "") + ' style="margin-right:7px;vertical-align:-1px">' + r[1] + '</label>';
    }).join("");
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">' + (isCredit ? "Report this credit" : "Report or suggest a fix") + '</div>' +
      '<div class="dq-sub">For <b>' + subj + '</b>. A moderator reviews every report.</div>' +
      '<label>What\'s wrong?</label>' + reasonHTML +
      (isCredit ? "" : '<label>Suggested correction <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional (the correct name or studio)</span></label><input id="dqr-suggested" placeholder="Correct name or studio">') +
      '<label>Details <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><textarea id="dqr-note" placeholder="Anything that helps us verify"></textarea>' +
      '<div class="dq-actions"><button class="dq-cancel">Cancel</button><button class="dq-submit">Send report</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.querySelector(".dq-x").onclick = close;
    ov.querySelector(".dq-cancel").onclick = close;
    ov.querySelector(".dq-submit").onclick = function () {
      var btn = this;
      var reasonEl = ov.querySelector('input[name="dqr-reason"]:checked');
      var reason = reasonEl ? reasonEl.value : "other";
      var suggested = (ov.querySelector("#dqr-suggested") || {}).value || "";
      var note = (ov.querySelector("#dqr-note") || {}).value || "";
      if (isCredit && opts.gameTitle) note = "On " + opts.gameTitle + (opts.creditId ? " (credit #" + opts.creditId + ")" : "") + ". " + note;
      if (!w.DQAPI) { alert("Reporting isn't available right now."); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      w.DQAPI.reportEntity({ type: type, slug: slug, name: name || "", reason: reason, suggested: suggested, note: note }).then(function (r) {
        if (r && r.ok) {
          ov.querySelector(".dq-modal").innerHTML = '<button class="dq-x" aria-label="Close">×</button><div class="dq-mh">Thanks</div><div class="dq-sub">Your report was sent to the moderators.</div><div class="dq-actions"><button class="dq-cancel">Close</button></div>';
          ov.querySelector(".dq-x").onclick = close; ov.querySelector(".dq-cancel").onclick = close;
        } else { btn.disabled = false; btn.textContent = "Send report"; alert((r && r.data && r.data.error) || "Could not send. Try again."); }
      }).catch(function () { btn.disabled = false; btn.textContent = "Send report"; alert("Network error. Try again."); });
    };
  }

  w.DQ = {
    bkt: bkt, qs: qs, getJSON: getJSON, loadEntity: loadEntity, loadIndex: loadIndex, openReport: openReport,
    rank: rank, searchRows: searchRows, attachSuggest: attachSuggest, openClaim: openClaim,
    uniq: uniq, releaseClass: releaseClass,
    esc: esc, safeUrl: safeUrl, initials: initials, slugify: slugify,
    SIG_LABEL: {
      in_game_credits: "In-game credits", studio_website: "Studio site", press_kit: "Press kit",
      linkedin_self: "LinkedIn (self)", peer_vouch: "Peer vouch", community: "Community"
    }
  };

  // Inject a Sign in / Account link into the top nav (any page that loads app.js).
  (function () {
    var nav = document.querySelector(".topnav");
    if (!nav || !w.DQAPI) return;
    var a = document.createElement("a");
    a.className = "back"; a.style.cursor = "pointer";
    a.textContent = w.DQAPI.isSignedIn() ? "Account" : "Sign in";
    a.href = "signin.html";
    nav.insertBefore(a, nav.firstChild);
    if (w.DQAPI.isSignedIn()) {
      w.DQAPI.me().then(function (r) {
        if (r.ok && r.data.authenticated) { a.textContent = r.data.person ? ("✓ " + r.data.person.name) : "Account"; a.href = "signin.html"; }
        else { w.DQAPI.clearToken(); a.textContent = "Sign in"; }
      }).catch(function () {});
    }
  })();

  // Clean-URL links (/credits/<slug>, /credits/game/<slug>, /credits/studio/<slug>) are what
  // we render for copy/hover/share, but the real files live at *.html?slug=. Intercept a
  // plain left-click and go straight to the real file, so internal navigation skips the
  // 404-redirect bounce. Modified clicks and new-tab opens fall through to the clean URL,
  // which the 404.html router resolves.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a || a.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute("href") || "", m, real = null;
    if ((m = href.match(/^\/credits\/game\/([^\/?#]+)$/))) real = "/credits/game.html?slug=" + m[1];
    else if ((m = href.match(/^\/credits\/studio\/([^\/?#]+)$/))) real = "/credits/studio.html?slug=" + m[1];
    else if ((m = href.match(/^\/credits\/([^\/?#.]+)$/))) real = "/credits/person.html?slug=" + m[1];
    if (real) { e.preventDefault(); w.location.href = real; }
  });
})(window);
