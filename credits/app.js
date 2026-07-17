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
    var phref = un ? ('/credits/person.html?name=' + encodeURIComponent(r[1])) : ('/credits/' + encodeURIComponent(r[0]));
    var psub = un ? 'Unclaimed — tap to claim' : (r[2] + ' credit' + (r[2] === 1 ? '' : 's'));
    return '<a class="dq-row" href="' + phref + '"><span class="tag dq-tag-person">Person</span>' +
      '<span class="txt"><span class="nm">' + esc(r[1]) + '</span><span class="sb">' + psub + '</span></span></a>';
  }

  // Attach a live grouped dropdown to a text input. Jumps straight to an entity
  // on click/Enter; "See all" (or Enter with nothing highlighted) opens search.html.
  // A two-word alphabetic query ("art vandelay") is almost always a person searching for
  // themselves, not a game. Used to lead with the identity path and avoid pre-filling a
  // person's name into the game-title field.
  function looksLikeName(s) { s = String(s || "").trim(); if (!s) return false; if (/[0-9:_\/®™]/.test(s)) return false; var ws = s.split(/\s+/); return ws.length === 2 && ws.every(function (x) { return /^[A-Za-z][A-Za-z.'\-]*$/.test(x); }); }
  // Open the add-a-game / claim flow the identity-aware way: a name-like query pre-fills the
  // person field; anything else pre-fills the game title.
  function openAddFlow(q, asSelf) { var v = String(q || "").trim(); openClaim(asSelf ? { mode: "addGame", prefillName: looksLikeName(v) ? v : "" } : { mode: "addGame", prefillTitle: looksLikeName(v) ? "" : v }); }

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
      h += '<a class="dq-seeall dq-add" data-dqadd style="cursor:pointer;font-weight:800;color:var(--accent,#58a6ff);background:rgba(88,166,255,.09)">＋ Add a game you worked on</a>';
      h += '<a class="dq-seeall dq-self" data-dqself style="cursor:pointer;color:var(--muted,#8b98a9)">New here, or this is you? <b style="color:var(--accent,#58a6ff)">Start your profile →</b></a>';
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
    function seeAll() { var q = input.value.trim(); w.location.href = "/credits/search.html" + (q ? "?q=" + encodeURIComponent(q) : ""); }
    var t;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(refresh, 110); });
    input.addEventListener("focus", function () { preload(); if (input.value.trim()) refresh(); });
    input.addEventListener("keydown", function (e) {
      if (box.style.display === "none") { if (e.key === "Enter") seeAll(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHi(hi + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHi(hi - 1); }
      else if (e.key === "Enter") { var els = items(); if (hi >= 0 && els[hi]) { e.preventDefault(); if (els[hi].hasAttribute("data-dqadd") || els[hi].hasAttribute("data-dqself")) { box.style.display = "none"; openAddFlow(input.value.trim(), els[hi].hasAttribute("data-dqself")); } else if (els[hi].getAttribute("href")) { w.location.href = els[hi].getAttribute("href"); } else { seeAll(); } } else { seeAll(); } }
      else if (e.key === "Escape") { box.style.display = "none"; hi = -1; }
    });
    box.addEventListener("click", function (e) { var self = e.target.closest && e.target.closest("[data-dqself]"); var add = e.target.closest && e.target.closest("[data-dqadd]"); if (self || add) { e.preventDefault(); box.style.display = "none"; openAddFlow(input.value.trim(), !!self); } });
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
        if (!items.length) { box.innerHTML = '<div class="dq-ac-none">' + esc(opts.noneText ? opts.noneText(q) : "No match — it'll be added as new") + '</div>'; }
        else { box._items = items; box.innerHTML = items.map(function (it, i) { return '<button type="button" class="dq-ac-row" data-i="' + i + '">' + esc(it.label) + (it.sub ? ' <span class="dq-ac-sub">' + esc(it.sub) + '</span>' : '') + '</button>'; }).join(""); }
        box.style.display = "block";
      });
    }
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(render, 140); });
    input.addEventListener("focus", render);
    box.addEventListener("click", function (e) { var r = e.target.closest && e.target.closest(".dq-ac-row"); if (r) { var it = box._items[+r.dataset.i]; input.value = it.label; box.style.display = "none"; if (opts.onSelect) opts.onSelect(it); } });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) box.style.display = "none"; });
  }

  // Classify a role/title into the SAME disciplines the job board uses (mapDiscipline in
  // scrape.js), so credit filtering on game pages matches the jobs side exactly. Credits carry
  // only a title (no ATS department), so we run the title-based path: strong role-defining rules
  // first (audio/qa/art/animation/design before engineering), then a broad fallback.
  var DISCIPLINE_ORDER = ["Production", "Design", "Engineering", "Art", "Animation", "Audio", "QA", "Marketing", "Data & Analytics", "Player Support", "People & Ops", "IT & Security", "Other"];
  function discipline(title) {
    var t = String(title || "").toLowerCase();
    if (/developer (relations|engagement|evangelis|advocat|marketing|outreach|experience rep|support|solutions?)|\bdev ?rel\b|community developer|content developer|video content/.test(t)) return "Marketing";
    if (/\baudio\b|sound design|\bcomposer\b|music design/.test(t)) return "Audio";
    if (/\bqa\b|quality assurance|\bqc\b|quality control|\btester\b|\bsdet\b|test (engineer|analyst|lead|automation|specialist)|quality (engineer|analyst|specialist)/.test(t)) return "QA";
    if (/art director|\bartist\b|\bart lead\b|lead artist|concept art|\bvfx\b|\blighter\b|lighting (artist|lead)|environment artist|character artist|technical artist|technical art\b/.test(t)) return "Art";
    if (/\bai art\b|\bart (specialist|generalist|lead|director|manager|outsourc\w*|coordinator|supervisor)\b/.test(t)) return "Art";
    if (/\banimator\b|animation (director|lead|manager|supervisor)|\brigging\b|cinematics? (director|lead|supervisor|manager|animator|designer|editor|artist)|\bmocap\b|motion[ -]?capture/.test(t)) return "Animation";
    if (/game design|level design|systems? design|technical design|narrative design|\bwriter\b|encounter design|combat design|content design|economy design|gameplay design|ux design|ui design|world build|world design|environment design|game (direct(or|ion)|lead)|creative direct(or|ion)/.test(t)) return "Design";
    if (/\bfeature (team )?(lead|owner)\b|\bfeature design(er)?\b/.test(t)) return "Design";
    if ((/(engineers?|engineering|programmers?|programming|developers?|architects?)\b|tech(nical)? (director|lead|manager)|\bback[ -]?end\b|\bfront[ -]?end\b|\bfull[ -]?stack\b|\bcoder\b|\bcoding\b/.test(t)) && !/\bsales\b|business develop(er|ment)/.test(t)) return "Engineering";
    if (/\b(technology|technical) research\b|research (and|&) development|\br ?& ?d\b/.test(t)) return "Engineering";
    if (/machine learning|\bml\b ?(scientist|researcher|ops)|data scien|data analy(st|tics|sis)|business intelligence|\bbi analyst\b|insights? analyst|product analyst|\beconomist\b|deep learning|\bnlp\b|artificial intelligence|\bai (scientist|researcher|research)/.test(t)) return "Data & Analytics";
    if (/\bmodel(l)?er\b/.test(t) && !/\bdata\b|threat|financial|business|risk|econom|pricing/.test(t)) return "Art";
    if ((/\bdevelopment (director|manager|lead)\b/.test(t) || /\bdirector of (core|game|studio|title|content|product|live) development\b/.test(t)) && !/business|learning|talent|\bl&d\b|\bpeople\b/.test(t)) return "Production";
    if (/\b(manager|director|lead|owner|vp),?\s+product\b/.test(t) && !/marketing/.test(t)) return "Production";
    if (/\b(project|programme?|delivery|release|portfolio)\s+(manager|management|coordinator|lead|director)\b|\bproducer\b|production (coordinator|manager|director|assistant)|product (manager|owner|management|director|lead)|game manager/.test(t)) return "Production";
    if (/engineer|programmer|\bdeveloper|software|\bsre\b|devops|\bsdet\b/.test(t) && !/\bsales\b|business develop(er|ment)/.test(t)) return "Engineering";
    if (/product (manager|owner|management)|head of product/.test(t)) return "Production";
    if (/\blive ?ops\b|liveops|live operations/.test(t)) return "Production";
    if (/artist|concept|\bvfx\b|lighting|illustrat|sculpt/.test(t)) return "Art";
    if (/animator|animation|rigging/.test(t)) return "Animation";
    if (/\bux\b|\bui\b|user experience|user research/.test(t)) return "Design";
    if (/designer|design/.test(t)) return "Design";
    if (/producer|production/.test(t)) return "Production";
    if (/audio|sound|composer|\bmusic\b/.test(t)) return "Audio";
    if (/\bqa\b|quality|tester|\btest\b/.test(t)) return "QA";
    if (/locali[sz]ation\b/.test(t)) return "Production";
    if (/writer|narrative/.test(t)) return "Design";
    if (/\bdata\b|data scien|\banalytics\b|business intelligence|\bbi\b|insights/.test(t)) return "Data & Analytics";
    if (/player support|customer support|community support/.test(t)) return "Player Support";
    if (/market|\bbrand\b|public relations|\bpr\b|social media|communit|influencer|communication|esports|broadcast|\bgrowth\b/.test(t)) return "Marketing";
    return "Other";
  }

  function openClaim(opts) {
    opts = opts || {}; injectClaimStyles();
    var isAdd = opts.mode === "addGame";
    var selStudioSlug = null;
    // Expansion-of link (parent base game). Purely additive: an expansion is its own
    // catalogue entry linked to the base, not merged or blocked. autoDetected = we guessed
    // it from a "Base: Subtitle" title; parentTouched = the user has taken manual control
    // (picked/cleared), after which we never auto-change it.
    var selParentSlug = null, selParentTitle = null, selParentStudio = "";
    var autoDetected = false, parentTouched = false;
    var ident = getIdentity();
    var isGame = !!opts.game_title;
    var showRole = isGame || isAdd;
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">' + (isAdd ? 'Add a game and your credit' : isGame ? 'Claim your credit' : 'Claim this profile') + '</div>' +
      '<div class="dq-sub">' + (isAdd ? 'Not in the catalogue yet? Add the game and your role below.' : isGame ? 'On <b>' + esc(opts.game_title) + '</b>.' : '') + '</div>' +
      (showRole ? '<div style="font-size:12px;color:var(--muted,#8b98a9);margin:0 0 12px;line-height:1.5">Your credit goes live on your profile <b style="color:var(--text,#e6edf3);font-weight:600">right away</b>, and it stays yours to edit or remove anytime. It starts as awaiting confirmation and gains evidence as teammates who shipped the game confirm it. <a href="/credits/how-evidence-works.html" target="_blank" rel="noopener" style="color:var(--accent,#58a6ff);font-weight:600">How this works →</a></div>' : '') +
      (isAdd ? '<label>Game title</label><input id="dqc-gtitle" autocomplete="off" value="' + esc(titleCase(opts.prefillTitle || "")) + '" placeholder="e.g. City of Heroes"><div id="dqc-gexist"></div>' +
        '<label>Expansion of <span style="font-weight:400;color:var(--muted,#8b98a9)">— if this is an expansion, edition, or DLC of a base game, link it. Optional</span></label>' +
        '<div id="dqc-gparent-chip"></div>' +
        '<div id="dqc-gparent-wrap"><input id="dqc-gparent" autocomplete="off" placeholder="Search the base game…"></div>' +
        '<div class="dq-row2"><div><label>Studio <span style="font-weight:400;color:var(--muted,#8b98a9)">— search existing</span></label><input id="dqc-gstudio" autocomplete="off" value="' + esc(opts.prefillStudio || "") + '" placeholder="Start typing…"></div>' +
        '<div><label>Game\'s launch year <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><input id="dqc-gyear" placeholder="2004"></div></div>' +
        '<label>Platforms <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional, comma-separated</span></label><input id="dqc-gplat" placeholder="Microsoft Windows">' +
        '<div style="font-size:11.5px;color:var(--muted,#8b98a9);background:rgba(88,166,255,.06);border:1px solid var(--border,#2d333b);border-radius:8px;padding:9px 11px;margin:6px 0 2px;line-height:1.45">This is for a game that <b style="color:var(--text,#e6edf3);font-weight:600">shipped or was publicly announced</b>. Worked at a studio that never released a game? Skip this and use the <b style="color:var(--text,#e6edf3);font-weight:600">cancelled / unshipped</b> counter on your profile instead — it records the work without naming a title, so it stays NDA-safe.</div>' +
        '<div style="font-size:11.5px;color:var(--muted,#8b98a9);margin:2px 0 2px;line-height:1.45">Add a game or studio you <b style="color:var(--text,#e6edf3);font-weight:600">personally worked on</b> here. Spotted one that is missing but you were not part of? <a id="dqc-suggest-link" style="color:var(--accent);cursor:pointer;font-weight:600">Suggest it instead →</a></div>' : '') +
      '<label>Your name (as it should be credited)</label><input id="dqc-name" value="' + esc(opts.prefillName || opts.person_name || ident.name || "") + '" placeholder="Jane Doe">' +
      '<label>Your email</label><input id="dqc-email" type="email" value="' + esc(ident.email || "") + '" placeholder="you@example.com">' +
      ((ident.name || ident.email) ? '<div class="dq-idnote">Name and email remembered on this device · <a data-clearid style="cursor:pointer">Clear</a></div>' : '') +
      (showRole ? '<label>Primary role <span style="font-weight:400;color:var(--muted,#8b98a9)">— the role most people would know you for on this project</span></label><input id="dqc-role" list="dqc-roles-list" autocomplete="off" placeholder="Start typing a role…"><datalist id="dqc-roles-list">' + ROLES.map(function (r) { return '<option value="' + esc(r) + '"></option>'; }).join("") + '</datalist>' +
        '<label>Verification link <span style="font-weight:400;color:var(--muted,#8b98a9)">— LinkedIn, portfolio, studio bio, MobyGames, ArtStation. Anything that shows this is you. Optional</span></label><textarea id="dqc-proof" placeholder="https://linkedin.com/in/you"></textarea>' +
        // Two required questions, shown (not collapsed), because a wrong default here would
        // silently misrepresent the credit (a contractor reading as core, DLC-only as base game).
        // Nothing is pre-selected, so the person consciously answers.
        '<label>How were you involved? <span style="font-weight:400;color:var(--muted,#8b98a9)">— so your credit reads accurately</span></label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-involve" value="core" style="margin-right:7px;vertical-align:-1px">Studio employee <span style="color:var(--muted,#8b98a9)">(in-house at the studio that made it)</span></label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-involve" value="external" style="margin-right:7px;vertical-align:-1px">External partner or contractor <span style="color:var(--muted,#8b98a9)">(a co-dev or partner studio, not the primary developer)</span></label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-involve" value="both" style="margin-right:7px;vertical-align:-1px">Both, over time <span style="color:var(--muted,#8b98a9)">(started external, then joined the core team)</span></label>' +
        '<label style="margin-top:12px">What part did you work on?</label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-scope" value="base" style="margin-right:7px;vertical-align:-1px">The main release</label>' +
        '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqc-scope" value="partial" style="margin-right:7px;vertical-align:-1px">A specific part <span style="color:var(--muted,#8b98a9)">(DLC, expansion, port, or the live-service era, not the main release)</span></label>' +
        // Progressive disclosure: the remaining detail is optional and collapsed by default.
        '<a class="dq-more" data-sec="roles" data-label="I held other roles on this game" style="display:block;margin:12px 0 2px;color:var(--accent,#58a6ff);cursor:pointer;font-weight:600;font-size:13px">+ I held other roles on this game</a>' +
        '<div class="dq-sec" data-sec="roles" style="display:none"><input id="dqc-roles2" placeholder="Technical Support Lead, Game Designer, Content Manager"></div>' +
        '<a class="dq-more" data-sec="also" data-label="Ports, DLC, or live-service work" style="display:block;margin:10px 0 2px;color:var(--accent,#58a6ff);cursor:pointer;font-weight:600;font-size:13px">+ Ports, DLC, or live-service work</a>' +
        '<div class="dq-sec" data-sec="also" style="display:none">' +
          '<label style="margin-top:2px">Also contributed to <span style="font-weight:400;color:var(--muted,#8b98a9)">— check any that apply</span></label>' +
          '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="checkbox" id="dqc-also-dlc" style="margin-right:7px;vertical-align:-1px">DLC or expansions</label>' +
          '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="checkbox" id="dqc-also-ports" style="margin-right:7px;vertical-align:-1px">Ports or remasters</label>' +
          '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="checkbox" id="dqc-also-patch" style="margin-right:7px;vertical-align:-1px">Post-launch updates</label>' +
          '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="checkbox" id="dqc-live" style="margin-right:7px;vertical-align:-1px">Live-service content</label>' +
        '</div>' +
        '<a class="dq-more" data-sec="note" data-label="Add a note" style="display:block;margin:10px 0 2px;color:var(--accent,#58a6ff);cursor:pointer;font-weight:600;font-size:13px">+ Add a note</a>' +
        '<div class="dq-sec" data-sec="note" style="display:none"><textarea id="dqc-note" placeholder="Anything else worth noting about this credit"></textarea></div>' : '') +
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
    var suggestLink = ov.querySelector("#dqc-suggest-link");
    if (suggestLink) suggestLink.onclick = function () { close(); openSuggest({ prefillName: (ov.querySelector("#dqc-gtitle") || {}).value || "" }); };
    // Progressive-disclosure toggles: reveal / hide each optional section.
    Array.prototype.forEach.call(ov.querySelectorAll(".dq-more"), function (t) {
      t.onclick = function () {
        var key = t.getAttribute("data-sec");
        var sec = ov.querySelector('.dq-sec[data-sec="' + key + '"]');
        if (!sec) return;
        var willOpen = sec.style.display === "none";
        sec.style.display = willOpen ? "" : "none";
        t.textContent = (willOpen ? "− " : "+ ") + t.getAttribute("data-label");
      };
    });
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
        var relArr = [];
        var portsEl = ov.querySelector("#dqc-also-ports");
        if (portsEl && portsEl.checked) relArr.push("Ports / remasters");
        var dlcEl = ov.querySelector("#dqc-also-dlc");
        if (dlcEl && dlcEl.checked) relArr.push("DLC / expansion content");
        var patchEl = ov.querySelector("#dqc-also-patch");
        if (patchEl && patchEl.checked) relArr.push("Post-launch patches");
        var liveEl = ov.querySelector("#dqc-live");
        if (liveEl && liveEl.checked) relArr.push("Live service");
        var involveEl = ov.querySelector('input[name="dqc-involve"]:checked');
        if (involveEl && involveEl.value === "external") relArr.push("External contributor");
        else if (involveEl && involveEl.value === "both") relArr.push("External, then core team");
        relArr = uniq(relArr);
      var scopeEl = ov.querySelector('input[name="dqc-scope"]:checked');
      var p = { name: name, role: role, roles_other: rolesArr, verification: verification, source_url: proofArr[0] || "", links: proofArr, releases: relArr, scope: scopeEl ? scopeEl.value : "base" };
        if (isAdd) {
          p.new_game = { title: val("dqc-gtitle"), studio: val("dqc-gstudio"), year: val("dqc-gyear"),
            platforms: val("dqc-gplat") ? val("dqc-gplat").split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [],
            parent_slug: selParentSlug || null };
          p.game_title = val("dqc-gtitle"); p.studio = val("dqc-gstudio");
        } else if (isGame) { p.game_slug = opts.game_slug; p.game_title = opts.game_title; p.studio = opts.studio || null; }
        return p;
      }

      // --- live API path: save the credit for real ---
      if (w.DQAPI) {
        if (!isGame && !isAdd) { w.location.href = "/credits/signin.html"; return; }         // profile claim = sign in
        if (!role) { alert("Add your primary role first."); return; }
        // Involvement + scope are required so a credit never silently over-claims (a contractor
        // reading as core team, or DLC-only work reading as the full base game).
        if (!ov.querySelector('input[name="dqc-involve"]:checked')) { alert("Pick how you were involved: studio employee, external partner, or both."); return; }
        if (!ov.querySelector('input[name="dqc-scope"]:checked')) { alert("Pick what part you worked on: the main release or a specific part."); return; }
        if (!w.DQAPI.isSignedIn()) {
          // Stash the whole credit so sign-in can finish it, instead of losing the game.
          try { w.localStorage.setItem("dq_pending_credit", JSON.stringify(payload())); } catch (e) {}
          w.location.href = "/credits/signin.html"; return;
        }
        submitBtn.disabled = true; submitBtn.textContent = "Saving…";
        w.DQAPI.createCredit(payload()).then(function (r) {
          if (r.status === 201 || r.ok) {
            var slug = r.data && r.data.person_slug; close();
            w.location.href = slug ? ("/credits/person.html?slug=" + encodeURIComponent(slug)) : "/credits/";
          } else if (r.status === 401) { w.location.href = "/credits/signin.html"; }
          else { submitBtn.disabled = false; submitBtn.textContent = "Save my credit →"; alert((r.data && r.data.error) || "Could not save. Try again."); }
        }).catch(function () { submitBtn.disabled = false; submitBtn.textContent = "Save my credit →"; alert("Network error. Try again."); });
        return;
      }

      // No API present (shouldn't happen once deployed). NEVER open an email client.
      alert("Couldn't reach the sign-in service. Please reload the page and try again.");
    };
    if (isAdd) {
      // Search BOTH the static studios index and D1 user-added studios (from games_added),
      // deduped by slug (static first), so user-created studios like "Paragon Studios" show.
      function findStudios(q, cap) {
        cap = cap || 8;
        var statP = loadIndex("studios").then(function (rows) { return searchRows(rows, 1, q, cap * 3).rows; }).catch(function () { return []; });
        var liveP = (w.DQAPI && w.DQAPI.searchStudios)
          ? w.DQAPI.searchStudios(q).then(function (r) { return ((r.data && r.data.studios) || []).map(function (s) { return [s.slug, s.name, s.count || 0]; }); }).catch(function () { return []; })
          : Promise.resolve([]);
        return Promise.all([statP, liveP]).then(function (res) {
          var seen = {}, out = [];
          (res[0] || []).forEach(function (r) { var k = r[0]; if (k && !seen[k]) { seen[k] = 1; out.push(r); } });
          (res[1] || []).forEach(function (r) { var k = r[0]; if (k && !seen[k]) { seen[k] = 1; out.push(r); } });
          return out.slice(0, cap);
        });
      }
      var gstudio = ov.querySelector("#dqc-gstudio");
      if (gstudio) mkAutocomplete(gstudio, function (q) {
        return findStudios(q, 8).then(function (rows) {
          return rows.map(function (r) { return { label: r[1], slug: r[0], sub: (r[2] || 0) + " games" }; });
        });
      }, {
        onSelect: function (it) { selStudioSlug = it.slug; },
        onType: function () { selStudioSlug = null; },
        noneText: function (q) { return "No studio matches “" + q + "” — it'll be added as new"; }
      });
      var gtitle = ov.querySelector("#dqc-gtitle"), gexist = ov.querySelector("#dqc-gexist"), gt;
      var gpchip = ov.querySelector("#dqc-gparent-chip"), gpwrap = ov.querySelector("#dqc-gparent-wrap"), gparent = ov.querySelector("#dqc-gparent");
      // Search BOTH the static Wikidata index and D1 user-added games (games_added),
      // deduped by slug (static first), so user-added titles like "City of Heroes"
      // are found by the expansion auto-detect, the manual picker, and the dup warning.
      function findGames(q, cap) {
        cap = cap || 8;
        var statP = loadIndex("games").then(function (rows) { return searchRows(rows, 1, q, cap * 3).rows; }).catch(function () { return []; });
        var liveP = (w.DQAPI && w.DQAPI.searchGames)
          ? w.DQAPI.searchGames(q).then(function (r) { return ((r.data && r.data.games) || []).map(function (g) { return [g.slug, g.title, g.year || "", g.studio || ""]; }); }).catch(function () { return []; })
          : Promise.resolve([]);
        return Promise.all([statP, liveP]).then(function (res) {
          var seen = {}, out = [];
          (res[0] || []).forEach(function (r) { var k = r[0]; if (k && !seen[k]) { seen[k] = 1; out.push(r); } });
          (res[1] || []).forEach(function (r) { var k = r[0]; if (k && !seen[k]) { seen[k] = 1; out.push(r); } });
          return out.slice(0, cap);
        });
      }
      // Show either the confirmed, clearable "Expansion of X" chip or the manual picker.
      function renderParent() {
        if (!gpchip || !gpwrap) return;
        if (selParentSlug) {
          gpchip.innerHTML = '<div style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12.5px;background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.35);border-radius:8px;padding:7px 11px;margin:2px 0 4px">' +
            '<span>Expansion of <b>' + esc(selParentTitle || "") + '</b>' + (selParentStudio ? ' <span style="color:var(--muted,#8b98a9)">· ' + esc(selParentStudio) + '</span>' : '') + '</span>' +
            (autoDetected ? '<span style="color:var(--muted,#8b98a9);font-size:11px">auto-detected from the title</span>' : '') +
            '<a data-clearparent style="cursor:pointer;color:var(--accent,#58a6ff);font-weight:600">clear</a></div>';
          gpwrap.style.display = "none";
        } else {
          gpchip.innerHTML = "";
          gpwrap.style.display = "";
        }
      }
      // Split a "Base: Subtitle" title (colon, or a spaced dash / en-dash / em-dash) into its base.
      function splitBase(t) {
        t = String(t || "").trim();
        var m = t.match(/^(.+?)\s*:\s+.+$/) || t.match(/^(.+?)\s+[–—-]\s+.+$/);
        return m ? m[1].trim() : "";
      }
      // Reuse the same games-index lookup that powers #dqc-gexist to guess the base game.
      function detectParent() {
        if (parentTouched) return;                    // user took control — never auto-change
        if (selParentSlug && !autoDetected) return;   // a manual pick stands
        var base = splitBase(gtitle.value);
        if (base.length < 2) {
          if (autoDetected) { selParentSlug = selParentTitle = null; selParentStudio = ""; autoDetected = false; renderParent(); }
          return;
        }
        findGames(base, 8).then(function (m) {
          if (parentTouched || (selParentSlug && !autoDetected)) return;
          var bl = base.toLowerCase(), hit = null;
          for (var i = 0; i < m.length; i++) { if (String(m[i][1]).toLowerCase() === bl) { hit = m[i]; break; } }  // exact title wins
          if (!hit && m.length && rank(String(m[0][1]).toLowerCase(), bl) === 0) hit = m[0];                       // else top prefix hit
          if (hit) { selParentSlug = hit[0]; selParentTitle = hit[1]; selParentStudio = hit[3] || ""; autoDetected = true; renderParent(); }
          else if (autoDetected) { selParentSlug = selParentTitle = null; selParentStudio = ""; autoDetected = false; renderParent(); }
        }).catch(function () {});
      }
      // Manual search-picker for when the guess is wrong or absent.
      if (gparent) mkAutocomplete(gparent, function (q) {
        return findGames(q, 8).then(function (rows) {
          return rows.map(function (r) {
            return { label: r[1], slug: r[0], studio: r[3] || "", sub: (r[3] || "") + (r[2] ? (r[3] ? " · " : "") + r[2] : "") };
          });
        });
      }, {
        onSelect: function (it) { selParentSlug = it.slug; selParentTitle = it.label; selParentStudio = it.studio || ""; autoDetected = false; parentTouched = true; renderParent(); },
        onType: function () { parentTouched = true; },
        noneText: function (q) { return "No catalogue game matches “" + q + "”"; }
      });
      if (gpchip) gpchip.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-clearparent]");
        if (!a) return;
        e.preventDefault();
        selParentSlug = selParentTitle = null; selParentStudio = ""; autoDetected = false; parentTouched = true;
        if (gparent) gparent.value = "";
        renderParent();
      });
      var checkExist = function () {
        var q = gtitle.value.trim();
        if (q.length < 3) { gexist.innerHTML = ""; return; }
        findGames(q, 4).then(function (m) {
          if (!m.length) { gexist.innerHTML = ""; return; }
          gexist.innerHTML = '<div class="dq-warn"><b>Already in the catalogue?</b> If your game is here, claim it instead of adding a duplicate: ' +
            m.map(function (r) { return '<a href="/credits/game/' + encodeURIComponent(r[0]) + '" target="_blank" rel="noopener">' + esc(r[1]) + (r[3] ? ' · ' + esc(r[3]) : '') + '</a>'; }).join(" &nbsp;·&nbsp; ") + '</div>';
        });
      };
      renderParent();
      if (gtitle && gexist) { gtitle.addEventListener("input", function () { clearTimeout(gt); gt = setTimeout(function () { checkExist(); detectParent(); }, 300); }); checkExist(); detectParent(); }
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

  // Suggest a game or studio that's missing from the catalogue but you weren't personally
  // part of. Routes into the moderator queue (reason "suggest") with a required proof link,
  // it lands in the moderator queue for someone to act on (it isn't your own credit, so it can't
  // auto-publish). Distinct from the add flow, which is for your
  // own credits. opts.prefillName seeds the name from whatever they were typing.
  function openSuggest(opts) {
    opts = opts || {}; injectClaimStyles();
    var isStudioSuggest = opts.type === "studio";
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">Suggest a missing game or studio</div>' +
      '<div class="dq-sub">For something you did <b>not</b> personally work on. Add a proof link so we can add it to the catalogue correctly.</div>' +
      '<label>What is it?</label>' +
      '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqs-type" value="game"' + (isStudioSuggest ? '' : ' checked') + ' style="margin-right:7px;vertical-align:-1px">A game</label>' +
      '<label style="display:block;font-weight:400;font-size:13px;margin:6px 0;cursor:pointer"><input type="radio" name="dqs-type" value="studio"' + (isStudioSuggest ? ' checked' : '') + ' style="margin-right:7px;vertical-align:-1px">A studio</label>' +
      '<label>Name</label><input id="dqs-name" autocomplete="off" value="' + esc(opts.prefillName || "") + '" placeholder="e.g. Possibility Space">' +
      '<label>Proof link <span style="font-weight:400;color:var(--muted,#8b98a9)">— a page showing it exists (Wikipedia, Steam, studio site, press)</span></label><input id="dqs-proof" placeholder="https://…">' +
      '<label>Anything else worth noting <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional</span></label><textarea id="dqs-note" placeholder="Context that helps us add it correctly"></textarea>' +
      '<div class="dq-actions"><button class="dq-cancel">Cancel</button><button class="dq-submit">Send suggestion</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.querySelector(".dq-x").onclick = close;
    ov.querySelector(".dq-cancel").onclick = close;
    ov.querySelector(".dq-submit").onclick = function () {
      var btn = this;
      var typeEl = ov.querySelector('input[name="dqs-type"]:checked');
      var type = typeEl ? typeEl.value : "game";
      var name = (ov.querySelector("#dqs-name") || {}).value || ""; name = name.trim();
      var proof = (ov.querySelector("#dqs-proof") || {}).value || ""; proof = proof.trim();
      var note = (ov.querySelector("#dqs-note") || {}).value || "";
      if (!name) { alert("Add the name first."); return; }
      if (!proof) { alert("A proof link is required so we can add it correctly."); return; }
      if (!w.DQAPI) { alert("Suggestions aren't available right now."); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      w.DQAPI.reportEntity({ type: type, slug: slugify(name), name: name, reason: "suggest", suggested: proof, note: note }).then(function (r) {
        if (r && r.ok) {
          ov.querySelector(".dq-modal").innerHTML = '<button class="dq-x" aria-label="Close">×</button><div class="dq-mh">Thanks</div><div class="dq-sub">Got it. We\'ll add it to the catalogue if it checks out.</div><div class="dq-actions"><button class="dq-cancel">Close</button></div>';
          ov.querySelector(".dq-x").onclick = close; ov.querySelector(".dq-cancel").onclick = close;
        } else { btn.disabled = false; btn.textContent = "Send suggestion"; alert((r && r.data && r.data.error) || "Could not send. Try again."); }
      }).catch(function () { btn.disabled = false; btn.textContent = "Send suggestion"; alert("Network error. Try again."); });
    };
  }

  // "Ask a teammate to confirm you" — for one of your own credits. We never email anyone (their
  // address is private); instead this lists the claimed teammates on this game who could vouch,
  // and hands you a pre-written note + a deep link you send yourself. The link drops the recipient
  // on the game page with your row highlighted and the Vouch button ready.
  // opts: { game_slug, game_title, my_slug, my_name, already:[slugs who already vouched] }
  function openVouchRequest(opts) {
    opts = opts || {}; injectClaimStyles();
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">Ask a teammate to confirm you</div>' +
      '<div class="dq-sub">On <b>' + esc(opts.game_title || "this game") + '</b>. Anyone who also shipped it can confirm your credit. We don\'t email them for you, copy the note and send it however you\'d reach them.</div>' +
      '<div id="vreq-body"><div class="dq-ac-none" style="padding:14px">Finding teammates…</div></div>' +
      '<div class="dq-actions"><button class="dq-cancel">Close</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.querySelector(".dq-x").onclick = close;
    ov.querySelector(".dq-cancel").onclick = close;
    var body = ov.querySelector("#vreq-body");
    var link = w.location.origin + "/credits/game/" + encodeURIComponent(opts.game_slug) + "?vouch=" + encodeURIComponent(opts.my_slug || "");
    function msgFor(nm) { return "Hi " + (nm || "there") + ", we worked together on " + (opts.game_title || "a game") + ". I've added my credit on DevQuest Credits, would you vouch for me? " + link; }
    if (!w.DQAPI || !w.DQAPI.gameCredits) { body.innerHTML = '<div style="padding:14px;color:var(--muted,#8b98a9)">Not available right now.</div>'; return; }
    var already = opts.already || [];
    w.DQAPI.gameCredits(opts.game_slug).then(function (r) {
      var creds = (r.data && r.data.credits) || [];
      var mates = creds.filter(function (c) { return c.person_slug && c.person_slug !== opts.my_slug && already.indexOf(c.person_slug) < 0; });
      var inStyle = 'flex:1;min-width:0;background:var(--bg,#0b0e14);border:1px solid var(--border,#2d333b);border-radius:8px;padding:9px 11px;color:var(--text,#e6edf3);font-size:12.5px;font-family:inherit';
      var h = '<div style="font-size:12px;font-weight:700;margin:2px 0 8px;color:var(--muted,#8b98a9)">Your request link</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px"><input class="vreq-url" readonly value="' + esc(link) + '" style="' + inStyle + '"><span class="btn primary vreq-copylink" style="padding:8px 14px;white-space:nowrap">Copy link</span></div>';
      if (mates.length) {
        h += '<div style="font-size:12px;font-weight:700;margin:2px 0 4px;color:var(--muted,#8b98a9)">Teammates on this game you can ask</div>';
        mates.forEach(function (m) {
          h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border,#2d333b)">' +
            '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13.5px">' + esc(m.person_name || m.person_slug) + '</div>' + (m.role ? '<div style="color:var(--muted,#8b98a9);font-size:12px">' + esc(m.role) + '</div>' : '') + '</div>' +
            '<span class="btn ghost vreq-copy" data-nm="' + esc(m.person_name || "") + '" style="padding:6px 12px;font-size:12.5px;white-space:nowrap">Copy message</span>' +
          '</div>';
        });
      } else {
        h += '<div style="color:var(--muted,#8b98a9);font-size:13px;line-height:1.5;border-top:1px solid var(--border,#2d333b);padding-top:12px">No teammates here to ask yet, nobody else has claimed a credit on this game (or they\'ve already confirmed you). As more of the people you shipped it with join and claim this game, they\'ll show up here to ask.</div>';
      }
      body.innerHTML = h;
      var cl = body.querySelector(".vreq-copylink");
      if (cl) cl.onclick = function () { var i = body.querySelector(".vreq-url"); if (i) i.select(); try { navigator.clipboard.writeText(link); } catch (e) { try { document.execCommand("copy"); } catch (e2) {} } cl.textContent = "Copied ✓"; };
      Array.prototype.forEach.call(body.querySelectorAll(".vreq-copy"), function (el) {
        el.onclick = function () { try { navigator.clipboard.writeText(msgFor(el.getAttribute("data-nm"))); } catch (e) {} el.textContent = "Copied ✓"; };
      });
    }).catch(function () { body.innerHTML = '<div style="padding:14px;color:var(--pink,#f778ba)">Could not load teammates. Try again.</div>'; });
  }

  // Report / suggest-a-fix modal for a catalogue game or studio, or a person's credit
  // on a game (type "credit"). Anyone can file one. opts.gameTitle gives context for credits.
  function openReport(type, slug, name, opts) {
    opts = opts || {};
    injectClaimStyles();
    var isCredit = type === "credit";
    var isPerson = type === "person";
    var label = type === "studio" ? "studio" : (isPerson ? "profile" : "game");
    var subj = isCredit ? (esc(name) + (opts.gameTitle ? " on " + esc(opts.gameTitle) : "")) : esc(name || slug);
    var reasons = isCredit
      ? [["not_worked", "This person didn't work on this game"], ["wrong_role", "The role or details are wrong"], ["spam", "Not a real person / spam"], ["other", "Something else"]]
      : isPerson
      ? [["impersonation", "This isn't them / impersonation"], ["harassment", "Harassment or abusive content"], ["false_credits", "Claiming credits they didn't work on"], ["private_info", "Posting someone's private information"], ["other", "Something else"]]
      : [["not_real", "This " + label + " is not real / should not exist"], ["wrong_name", "The name is wrong (typo)"]]
          .concat(type === "game" ? [["wrong_studio", "It's under the wrong studio, or has none"]] : [])
          .concat([["other", "Something else"]]);
    var reasonHTML = reasons.map(function (r, i) {
      var checked = opts.reason ? (r[0] === opts.reason) : (i === 0);
      return '<label style="display:block;font-weight:400;font-size:13px;margin:5px 0;cursor:pointer"><input type="radio" name="dqr-reason" value="' + r[0] + '"' + (checked ? " checked" : "") + ' style="margin-right:7px;vertical-align:-1px">' + r[1] + '</label>';
    }).join("");
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">' +
      '<button class="dq-x" aria-label="Close">×</button>' +
      '<div class="dq-mh">' + (isCredit ? "Report this credit" : isPerson ? "Report this profile" : "Report or suggest a fix") + '</div>' +
      '<div class="dq-sub">For <b>' + subj + '</b>. A moderator reviews every report.</div>' +
      '<label>What\'s wrong?</label>' + reasonHTML +
      (isCredit || isPerson ? "" : '<label>Suggested correction <span style="font-weight:400;color:var(--muted,#8b98a9)">— optional (the correct name or studio)</span></label><input id="dqr-suggested" placeholder="Correct name or studio">') +
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
      w.DQAPI.reportEntity({ type: type, slug: slug, name: name || "", reason: reason, suggested: suggested, note: note, credit_id: (isCredit ? (opts.creditId || null) : null) }).then(function (r) {
        if (r && r.ok) {
          ov.querySelector(".dq-modal").innerHTML = '<button class="dq-x" aria-label="Close">×</button><div class="dq-mh">Thanks</div><div class="dq-sub">Your report was sent to the moderators.</div><div class="dq-actions"><button class="dq-cancel">Close</button></div>';
          ov.querySelector(".dq-x").onclick = close; ov.querySelector(".dq-cancel").onclick = close;
        } else { btn.disabled = false; btn.textContent = "Send report"; alert((r && r.data && r.data.error) || "Could not send. Try again."); }
      }).catch(function () { btn.disabled = false; btn.textContent = "Send report"; alert("Network error. Try again."); });
    };
  }

  // ---- Site-wide "confirm your teammates" nudge ----
  // A signed-in developer is prompted, on arrival, to confirm the teammates they can vouch for
  // across ALL their games (not only when they happen to open the right game page). Shown once
  // per session, dismissible; the list is cached in sessionStorage and updated as they confirm.
  function vGet(){ try { var s = w.sessionStorage.getItem("dq_vouchable"); return s ? JSON.parse(s) : null; } catch(e){ return null; } }
  function vSet(d){ try { w.sessionStorage.setItem("dq_vouchable", JSON.stringify(d)); } catch(e){} }
  function vDismissed(){ try { return w.sessionStorage.getItem("dq_vouch_dismissed") === "1"; } catch(e){ return false; } }
  function vBannerText(n){ return 'You shipped games with <b>'+n+'</b> developer'+(n===1?'':'s')+' who '+(n===1?"isn't":"aren't")+' confirmed yet. Confirm the ones you actually worked with.'; }

  function showVouchBanner(data){
    if(vDismissed() || !data || !data.count) return;
    if(document.getElementById("dq-vouchbar")) return;
    var bar = document.createElement("div");
    bar.id = "dq-vouchbar";
    bar.style.cssText = "position:relative;z-index:40;background:linear-gradient(90deg,rgba(63,185,80,.16),rgba(88,166,255,.10));border-bottom:1px solid var(--border,#2d333b);color:var(--text,#e6edf3);font-size:13.5px;line-height:1.4;padding:9px 16px;display:flex;align-items:center;gap:12px;justify-content:center;flex-wrap:wrap";
    bar.innerHTML = '<span class="dq-vbtxt">'+vBannerText(data.count)+'</span>'+
      '<a class="dq-vbreview" style="cursor:pointer;font-weight:800;color:#04220f;background:var(--green,#3fb950);border-radius:8px;padding:5px 14px;text-decoration:none">Review →</a>'+
      '<a class="dq-vbx" title="Dismiss" style="cursor:pointer;color:var(--muted,#8b98a9);font-size:18px;line-height:1;padding:0 4px;text-decoration:none">×</a>';
    var tb = document.querySelector(".topbar");
    if(tb && tb.parentNode){ tb.parentNode.insertBefore(bar, tb.nextSibling); } else { document.body.insertBefore(bar, document.body.firstChild); }
    bar.querySelector(".dq-vbreview").onclick = function(){ openVouchConfirm(); };
    bar.querySelector(".dq-vbx").onclick = function(){ try{ w.sessionStorage.setItem("dq_vouch_dismissed","1"); }catch(e){} bar.remove(); };
  }
  function updateVouchBanner(d){
    var bar = document.getElementById("dq-vouchbar");
    if(!bar) return;
    if(!d || !d.count){ bar.remove(); return; }
    var t = bar.querySelector(".dq-vbtxt"); if(t) t.innerHTML = vBannerText(d.count);
  }

  function openVouchConfirm(){
    injectClaimStyles();
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true">'+
      '<button class="dq-x" aria-label="Close">×</button>'+
      '<div class="dq-mh">Confirm your teammates</div>'+
      '<div class="dq-sub">People who claimed a credit on a game you also shipped. <b>Only confirm the ones you genuinely worked with</b>, a confirmation puts your name behind their credit.</div>'+
      '<div id="dq-vlist"></div>'+
      '<div class="dq-actions"><button class="dq-cancel">Done</button></div>'+
      '</div>';
    document.body.appendChild(ov);
    function close(){ ov.remove(); }
    ov.querySelector(".dq-x").onclick = close; ov.querySelector(".dq-cancel").onclick = close;
    var listEl = ov.querySelector("#dq-vlist");
    function render(){
      var items = (vGet()||{items:[]}).items || [];
      if(!items.length){ listEl.innerHTML = '<div style="padding:16px 2px;color:var(--muted,#8b98a9);font-size:14px">All caught up, nobody left to confirm right now.</div>'; return; }
      var byGame = {}, order = [];
      items.forEach(function(it){ if(!byGame[it.game_slug]){ byGame[it.game_slug] = { title: it.game_title, rows: [] }; order.push(it.game_slug); } byGame[it.game_slug].rows.push(it); });
      var h = '';
      order.forEach(function(gs){
        var g = byGame[gs];
        h += '<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#8b98a9);margin:14px 0 2px">'+esc(g.title)+'</div>';
        g.rows.forEach(function(it){
          h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border,#2d333b)">'+
            '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13.5px">'+esc(it.person_name)+'</div>'+(it.role?'<div style="color:var(--muted,#8b98a9);font-size:12px">'+esc(it.role)+'</div>':'')+'</div>'+
            '<span class="dq-vgo" data-cid="'+it.credit_id+'" style="cursor:pointer;font-size:12.5px;font-weight:800;color:#04220f;background:var(--green,#3fb950);border-radius:8px;padding:5px 14px;white-space:nowrap">Vouch</span>'+
          '</div>';
        });
      });
      listEl.innerHTML = h;
      Array.prototype.forEach.call(listEl.querySelectorAll(".dq-vgo"), function(btn){
        btn.onclick = function(){
          if(!(w.DQAPI && w.DQAPI.vouch)) return;
          var cid = btn.getAttribute("data-cid"); btn.textContent = "…";
          w.DQAPI.vouch(cid).then(function(r){
            if(r && r.ok){
              var d = vGet() || { items: [] }; d.items = (d.items||[]).filter(function(x){ return String(x.credit_id) !== String(cid); }); d.count = d.items.length; vSet(d);
              updateVouchBanner(d); render();
            } else { btn.textContent = "Vouch"; alert((r && r.data && r.data.error) || "Could not confirm. You can only confirm someone on a game you also shipped."); }
          }).catch(function(){ btn.textContent = "Vouch"; alert("Network error. Try again."); });
        };
      });
    }
    render();
  }

  function initVouchNudge(){
    if(!(w.DQAPI && w.DQAPI.isSignedIn && w.DQAPI.isSignedIn())) return;
    if(vDismissed()) return;
    var cached = vGet();
    if(cached){ showVouchBanner(cached); return; }
    if(!w.DQAPI.vouchable) return;
    w.DQAPI.vouchable().then(function(r){ var d = (r && r.data) || { count: 0, items: [] }; vSet(d); showVouchBanner(d); }).catch(function(){});
  }

  // ---- Import from MobyGames: paste your credits, we match them to the catalogue, you claim ----
  function openMobyImport(opts){
    opts = opts || {}; injectClaimStyles();
    var ov = document.createElement("div"); ov.className = "dq-modal-ov";
    ov.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true" style="max-width:640px">'+
      '<button class="dq-x" aria-label="Close">×</button>'+
      '<div class="dq-mh">Import from MobyGames</div>'+
      '<div class="dq-sub">Bring your whole gameography in at once. Open your <b>MobyGames profile</b>, select your list of credits, copy it, and paste it below. We’ll match each game to our catalogue for you to review. Nothing is claimed until you say so.</div>'+
      '<div id="mi-s1">'+
        '<label>Paste your MobyGames credits</label>'+
        '<textarea id="mi-paste" rows="7" placeholder="Game Title (Year, Platform)&#9;Role…"></textarea>'+
        '<label>Your name <span style="font-weight:400;color:var(--muted,#8b98a9)">(as it should appear on your profile)</span></label>'+
        '<input id="mi-name" placeholder="e.g. Eric Miller">'+
        '<div class="dq-actions"><button class="dq-cancel">Cancel</button><button class="dq-submit" id="mi-parse">Match my games →</button></div>'+
      '</div>'+
      '<div id="mi-s2" style="display:none"></div>'+
      '</div>';
    document.body.appendChild(ov);
    function close(){ ov.remove(); }
    ov.querySelector(".dq-x").onclick = close;
    ov.querySelector("#mi-s1 .dq-cancel").onclick = close;
    ov.addEventListener("click", function(e){ if(e.target===ov) close(); });
    if(w.DQAPI && w.DQAPI.isSignedIn && w.DQAPI.isSignedIn() && w.DQAPI.me){
      w.DQAPI.me().then(function(r){ var ni=ov.querySelector("#mi-name"); if(ni && !ni.value && r && r.data && r.data.person && r.data.person.name) ni.value=r.data.person.name; }).catch(function(){});
    }

    var THANKS=/thank/i;
    function parseMoby(text){
      var lines=String(text||"").split(/\r?\n/), out=[];
      lines.forEach(function(raw){
        var line=raw.replace(/\s+$/,""); if(!line.trim()) return;
        var m=line.match(/^(.*?)\s*\((\d{4}),\s*([^)]*)\)[\t]+(.*)$/) || line.match(/^(.*?)\s*\((\d{4}),\s*([^)]*)\)\s{2,}(.*)$/);
        if(m){ out.push({title:m[1].trim(), year:+m[2], role:m[4].trim()}); }
      });
      var by={}, order=[];
      out.forEach(function(r){ var k=r.title.toLowerCase()+"|"+r.year; if(!by[k]){ by[k]={title:r.title,year:r.year,role:r.role}; order.push(k); } });
      return order.map(function(k){ return by[k]; });
    }
    function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/^(a|an|the) /,"").trim(); }
    function matchGame(cat,nmap,g){
      var ex=nmap[norm(g.title)];
      if(ex && ex.length){ var by=ex.slice().sort(function(a,b){ return Math.abs((+a[2]||0)-g.year)-Math.abs((+b[2]||0)-g.year); }); var best=by[0]; return {m:best, conf:(Math.abs((+best[2]||0)-g.year)<=1?2:1)}; }
      var res=searchRows(cat,1,g.title,40); if(!res.rows.length) return {m:null,conf:0};
      var near=res.rows.slice().sort(function(a,b){ return Math.abs((+a[2]||0)-g.year)-Math.abs((+b[2]||0)-g.year); });
      return {m:near[0], conf:0};
    }

    ov.querySelector("#mi-parse").onclick=function(){
      var games=parseMoby(ov.querySelector("#mi-paste").value);
      if(!games.length){ alert("Couldn’t find any credits in that paste. Copy the list of games and roles from your MobyGames profile and paste it here."); return; }
      var credits=games.filter(function(g){ return !THANKS.test(g.role); });
      var thanks=games.filter(function(g){ return THANKS.test(g.role); });
      var b=this; b.disabled=true; b.textContent="Matching…";
      loadIndex("games").then(function(cat){
        cat=cat||[]; var nmap=Object.create(null); cat.forEach(function(r){ var n=norm(r[1]); if(n){ (nmap[n]||(nmap[n]=[])).push(r); } });
        credits.forEach(function(g){ var mm=matchGame(cat,nmap,g); g.match=mm.m; g.conf=mm.conf; });
        renderReview(credits, thanks);
      }).catch(function(){ b.disabled=false; b.textContent="Match my games →"; alert("Couldn’t load the catalogue right now. Try again in a moment."); });
    };

    function xrow(g, checked, note){
      var slug=g.match[0], mt=g.match[1], my=g.match[2];
      return '<label style="display:flex;gap:11px;align-items:flex-start;padding:11px 2px;border-top:1px solid var(--border,#242c38)">'+
        '<input type="checkbox" class="mi-ck" data-slug="'+esc(slug)+'" data-title="'+esc(mt)+'" '+(checked?"checked":"")+'>'+
        '<span style="flex:1;min-width:0">'+
          '<span style="font-weight:700;font-size:14px;color:var(--text,#eef3fa)">'+esc(g.title)+' <span style="font-weight:400;font-size:12px;color:var(--muted,#8b98a9)">('+g.year+')</span></span>'+
          '<span style="display:block;font-size:12px;color:var(--muted,#8b98a9);margin-top:1px">'+note+' <b style="color:var(--text,#eef3fa)">'+esc(mt)+'</b>'+(my?(' · '+my):'')+'</span>'+
          '<input class="mi-role" data-slug="'+esc(slug)+'" value="'+esc(g.role)+'" style="margin-top:6px;font-size:13px;padding:7px 10px">'+
        '</span></label>';
    }
    function renderReview(credits, thanks){
      ov.querySelector("#mi-s1").style.display="none";
      var s2=ov.querySelector("#mi-s2"); s2.style.display="block";
      var matched=credits.filter(function(g){ return g.match; });
      var conf=matched.filter(function(g){ return g.conf>=1; });
      var maybe=matched.filter(function(g){ return g.conf===0; });
      var none=credits.filter(function(g){ return !g.match; });
      var GRP='font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#8b98a9);margin:16px 0 2px';
      var html='';
      if(conf.length){ html+='<div style="'+GRP+'">Ready to claim ('+conf.length+')</div>'+conf.map(function(g){ return xrow(g,true,"Matched to"); }).join(''); }
      if(maybe.length){ html+='<div style="'+GRP+'">Confirm these matches ('+maybe.length+')</div>'+maybe.map(function(g){ return xrow(g,false,"Closest match:"); }).join(''); }
      if(none.length){ html+='<div style="'+GRP+'">Not in our catalogue ('+none.length+')</div>'+none.map(function(g){ return '<div style="padding:9px 2px;border-top:1px solid var(--border,#242c38);font-size:13px"><b>'+esc(g.title)+'</b> <span style="color:var(--muted,#8b98a9)">('+g.year+') — you can add it from the site after importing</span></div>'; }).join(''); }
      if(thanks.length){ html+='<div style="'+GRP+'">Acknowledgments — not claimed ('+thanks.length+')</div><div style="font-size:12px;color:var(--muted,#8b98a9);margin:2px 0 3px">“Special Thanks” isn’t a work credit, so these are left out.</div>'+thanks.map(function(g){ return '<div style="padding:6px 2px;border-top:1px solid var(--border,#242c38);font-size:12.5px;color:var(--muted,#8b98a9)">'+esc(g.title)+' ('+g.year+')</div>'; }).join(''); }
      s2.innerHTML='<div style="max-height:44vh;overflow:auto;margin:4px 0 2px">'+html+'</div>'+
        '<div id="mi-status" style="font-size:13px;min-height:16px;margin:6px 0"></div>'+
        '<div class="dq-actions"><button class="dq-cancel" id="mi-back">Back</button><button class="dq-submit" id="mi-claim">Claim selected →</button></div>';
      s2.querySelector("#mi-back").onclick=function(){ s2.style.display="none"; ov.querySelector("#mi-s1").style.display="block"; var pb=ov.querySelector("#mi-parse"); pb.disabled=false; pb.textContent="Match my games →"; };
      s2.querySelector("#mi-claim").onclick=doClaim;
    }
    function doClaim(){
      if(!(w.DQAPI && w.DQAPI.isSignedIn && w.DQAPI.isSignedIn())){ alert("Please sign in first, then run the import."); w.location.href="/credits/signin.html"; return; }
      var s2=ov.querySelector("#mi-s2");
      var name=((ov.querySelector("#mi-name")||{}).value||"").trim();
      var roles={}; Array.prototype.forEach.call(s2.querySelectorAll(".mi-role"), function(ri){ roles[ri.getAttribute("data-slug")]=ri.value; });
      var cks=Array.prototype.filter.call(s2.querySelectorAll(".mi-ck"), function(c){ return c.checked && c.getAttribute("data-slug"); });
      if(!cks.length){ alert("Pick at least one game to claim."); return; }
      var jobs=cks.map(function(c){ var sl=c.getAttribute("data-slug"); return {slug:sl, title:c.getAttribute("data-title"), role:(roles[sl]||"").trim()}; });
      var status=s2.querySelector("#mi-status"), btn=s2.querySelector("#mi-claim"); btn.disabled=true;
      var added=0, skipped=0, failed=0, lastSlug=null;
      (function next(i){
        if(i>=jobs.length){ status.innerHTML='<span style="color:var(--green,#3fb950)">Imported '+added+' credit'+(added===1?'':'s')+(skipped?', '+skipped+' already on your profile':'')+(failed?', '+failed+' skipped':'')+'.</span>';
          setTimeout(function(){ w.location.href = lastSlug ? ("/credits/person.html?slug="+encodeURIComponent(lastSlug)) : "/credits/"; }, 1100); return; }
        var j=jobs[i]; status.textContent="Importing "+(i+1)+" of "+jobs.length+"…";
        if(!j.role){ failed++; return next(i+1); }
        w.DQAPI.createCredit({ name:name, role:j.role, game_slug:j.slug, game_title:j.title, scope:"base", roles_other:[], verification:[], links:[], releases:[] }).then(function(r){
          if(r.status===201||r.ok){ added++; if(r.data&&r.data.person_slug) lastSlug=r.data.person_slug; }
          else if(r.status===409) skipped++;
          else failed++;
          next(i+1);
        }).catch(function(){ failed++; next(i+1); });
      })(0);
    }
  }

  w.DQ = {
    bkt: bkt, qs: qs, getJSON: getJSON, loadEntity: loadEntity, loadIndex: loadIndex, openReport: openReport,
    rank: rank, searchRows: searchRows, attachSuggest: attachSuggest, openClaim: openClaim, openSuggest: openSuggest, openVouchRequest: openVouchRequest, openVouchConfirm: openVouchConfirm,
    discipline: discipline, DISCIPLINE_ORDER: DISCIPLINE_ORDER,
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
    a.href = "/credits/signin.html";
    nav.insertBefore(a, nav.firstChild);
    if (w.DQAPI.isSignedIn()) {
      w.DQAPI.me().then(function (r) {
        if (r.ok && r.data.authenticated) { a.textContent = r.data.person ? ("✓ " + r.data.person.name) : "Account"; a.href = "/credits/signin.html"; }
        else { w.DQAPI.clearToken(); a.textContent = "Sign in"; }
      }).catch(function () {});
    }
  })();

  // Prompt signed-in developers to confirm teammates they can vouch for (once per session).
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initVouchNudge); else initVouchNudge();

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

// ---------------------------------------------------------------------------
// First-party, cookieless pageview beacon. One ping per credits page load to your
// own analytics Worker (the same one the jobs board uses), carrying only the
// referring host and a coarse page type. No cookies, no full URLs, no third party.
// Powers the DAU / WAU / MAU + "where visitors come from" panel on the stats page.
// Honors the site-wide owner self-exclude (visit devquest.gg/?dqstat=off once per
// browser); that flag is shared across the whole devquest.gg origin, credits included.
// ---------------------------------------------------------------------------
(function () {
  var STAT_URL = "https://devquest-alerts.balesdestin.workers.dev/cevent";
  try { if (window.localStorage && localStorage.getItem("dq-nostat") === "1") return; } catch (e) {}
  try {
    var host = location.hostname.replace(/^www\./, "");
    var ref = "(direct)";
    if (document.referrer) {
      try { var rh = new URL(document.referrer).hostname.replace(/^www\./, ""); ref = (rh === host) ? "(internal)" : rh; }
      catch (e) { ref = "(unknown)"; }
    }
    var p = location.pathname, pt = "other";
    if (/^\/credits\/?$/.test(p) || /\/credits\/index\.html$/.test(p)) pt = "home";
    else if (/^\/credits\/game\//.test(p)) pt = "game";
    else if (/^\/credits\/studio\//.test(p)) pt = "studio";
    else if (/^\/credits\/search/.test(p)) pt = "search";
    else if (/^\/credits\/how-evidence/.test(p)) pt = "explainer";
    else if (/^\/credits\/(signin|claim|moderate)/.test(p)) pt = "other";
    else if (/^\/credits\/[^\/]+$/.test(p)) pt = "profile";
    var payload = JSON.stringify({ name: "pv", props: { ref: ref, pt: pt } });
    if (navigator.sendBeacon) navigator.sendBeacon(STAT_URL, payload);
    else fetch(STAT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
  } catch (e) {}
})();
