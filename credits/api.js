// DevQuest Credits — front-end API client.
// The site (devquest.gg) talks to the Worker API on its own domain. Auth is a
// bearer token stored in localStorage (set by signin.html after the magic link).
(function (w) {
  var API = "https://devquest-credits-api.balesdestin.workers.dev";
  var TOKEN_KEY = "dq_token";

  function getToken() { try { return w.localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { if (t) w.localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { w.localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function req(method, path, body) {
    var headers = { "Content-Type": "application/json" };
    var tok = getToken();
    if (tok) headers["Authorization"] = "Bearer " + tok;
    return fetch(API + path, {
      method: method, headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { status: r.status, ok: r.ok, data: j };
      });
    });
  }

  w.DQAPI = {
    base: API,
    getToken: getToken, setToken: setToken, clearToken: clearToken,
    isSignedIn: function () { return !!getToken(); },
    // auth
    requestLink: function (email) { return req("POST", "/auth/request", { email: email }); },
    me: function () { return req("GET", "/auth/me"); },
    logout: function () { clearToken(); return req("POST", "/auth/logout"); },
    // reads
    gameCredits: function (slug) { return req("GET", "/credits/game/" + encodeURIComponent(slug)); },
    personCredits: function (slug) { return req("GET", "/credits/person/" + encodeURIComponent(slug)); },
    searchPeople: function (q) { return req("GET", "/people/search?q=" + encodeURIComponent(q)); },
    searchGames: function (q) { return req("GET", "/games/search?q=" + encodeURIComponent(q)); },
    searchStudios: function (q) { return req("GET", "/studios/search?q=" + encodeURIComponent(q)); },
    // writes
    createCredit: function (payload) { return req("POST", "/credits", payload); },
    updateCredit: function (id, payload) { return req("PATCH", "/credits/" + id, payload); },
    deleteCredit: function (id) { return req("DELETE", "/credits/" + id); },
    reorderCredits: function (order) { return req("POST", "/credits/reorder", { order: order }); },
    vouch: function (creditId) { return req("POST", "/vouch", { credit_id: creditId }); },
    unvouch: function (creditId) { return req("DELETE", "/vouch", { credit_id: creditId }); },
    updateProfile: function (payload) { return req("PATCH", "/me", payload); },
  };
})(window);
