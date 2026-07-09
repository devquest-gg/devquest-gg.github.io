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

  w.DQ = {
    bkt: bkt, qs: qs, getJSON: getJSON, loadEntity: loadEntity,
    esc: esc, initials: initials, slugify: slugify,
    ATTR_LABEL: { credited: "Credited", special_thanks: "Special thanks", uncredited: "Uncredited" },
    SIG_LABEL: {
      in_game_credits: "In-game credits", studio_website: "Studio site", press_kit: "Press kit",
      linkedin_self: "LinkedIn (self)", peer_vouch: "Peer vouch", community: "Community"
    }
  };
})(window);
