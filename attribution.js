/* attribution.js — THE RANGE AT DAWN · paid-traffic attribution + consent evidence capture
   Capture only. This file NEVER sends anything and never fires a Meta or analytics event —
   film.js carries the values into the audit POST and analytics.js reads the shared event_id.

   Why first-touch lives in localStorage and last-touch in sessionStorage: a lead who sees the
   ad on Monday and converts on Friday must still credit Monday's ad, so the first touch has to
   outlive the tab. The last touch is the click that actually brought them back this visit, so it
   is deliberately session-scoped and overwritten on every tagged arrival.

   Cross-session memory is a consent decision, not a technical one: only a visitor who chose
   "Accept" (rangeConsent === "all") gets anything written to localStorage or to the _fbc cookie.
   A "Deny" visitor still gets full attribution for THIS session (held in sessionStorage + memory)
   so the CRM row is complete, but nothing of theirs survives the tab.

   Must never throw — Safari private mode, ITP and enterprise policy all make storage access
   itself throw, and an exception here would take the audit form down with it. */
(function () {
  "use strict";

  /* ---------------- config ---------------- */
  var LS_CONSENT = "rangeConsent";        // written by analytics.js — "all" | "essential"
  var K_FIRST = "stationAttrFirst";
  var K_LAST = "stationAttrLast";
  var K_SESSIONS = "stationAttrSessions";
  var K_SESSION_SEEN = "stationAttrSeen"; // per-tab flag so sessions_count bumps once
  var TRAIL_CAP = 60;

  /* The full capture list from the SCHEMA CONTRACT §6.5 — the Ads Manager URL-parameter line
     plus the other networks' click ids. Anything not in this list is ignored, so a stray query
     param on a shared link can never pollute attribution. */
  var ATTR_PARAMS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_term", "utm_content",
    "fb_campaign_id", "fb_campaign_name", "fb_adset_id", "fb_adset_name",
    "fb_ad_id", "fb_ad_name", "fb_placement", "fb_platform",
    "fbclid", "gclid", "ttclid"
  ];

  /* ---------------- storage that cannot throw ---------------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function consentAll() { return lsGet(LS_CONSENT) === "all"; }

  function parseJSON(raw) {
    if (!raw) return null;
    try { var o = JSON.parse(raw); return (o && typeof o === "object") ? o : null; } catch (e) { return null; }
  }

  /* ---------------- environment snapshot ---------------- */
  function readParams() {
    var out = {};
    try {
      var qs = new URLSearchParams(location.search);
      for (var i = 0; i < ATTR_PARAMS.length; i++) {
        var v = qs.get(ATTR_PARAMS[i]);
        if (v) out[ATTR_PARAMS[i]] = v;
      }
    } catch (e) {}
    return out;
  }

  function deviceClass() {
    var w = 0;
    try { w = window.innerWidth || 0; } catch (e) {}
    var ua = "";
    try { ua = navigator.userAgent || ""; } catch (e) {}
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (w >= 700 && w < 1024)) return "tablet";
    if (/Mobi|Android|iPhone|iPod/i.test(ua) || (w > 0 && w < 700)) return "mobile";
    return "desktop";
  }

  function viewport() {
    try { return (window.innerWidth || 0) + "x" + (window.innerHeight || 0); } catch (e) { return ""; }
  }

  function iso(ms) { try { return new Date(ms).toISOString(); } catch (e) { return ""; } }

  var NOW = Date.now();

  /* sessions_count is bumped once per tab. It lives in localStorage for an "Accept" visitor
     (that is the point of the number) and degrades to a session-only 1 for a Deny visitor. */
  function bumpSessions() {
    var persist = consentAll();
    var raw = persist ? lsGet(K_SESSIONS) : ssGet(K_SESSIONS);
    var n = parseInt(raw || "0", 10);
    if (!n || n < 0) n = 0;
    if (!ssGet(K_SESSION_SEEN)) {
      n = n + 1;
      ssSet(K_SESSION_SEEN, "1");
      if (persist) lsSet(K_SESSIONS, String(n)); else ssSet(K_SESSIONS, String(n));
    }
    return n || 1;
  }

  function touchRecord(params, sessions) {
    var r = {};
    for (var i = 0; i < ATTR_PARAMS.length; i++) {
      var k = ATTR_PARAMS[i];
      if (params[k]) r[k] = String(params[k]).slice(0, 300);
    }
    r.landing_path = location.pathname || "/";
    try { r.referrer = String(document.referrer || "").slice(0, 300); } catch (e) { r.referrer = ""; }
    r.device = deviceClass();
    r.viewport = viewport();
    r.sessions_count = sessions;
    r.first_seen = iso(NOW);
    r.ts = NOW;                 // ms — needed to rebuild _fbc from a stored fbclid
    return r;
  }

  function isTagged(params) {
    for (var i = 0; i < ATTR_PARAMS.length; i++) if (params[ATTR_PARAMS[i]]) return true;
    return false;
  }

  /* ---------------- first / last touch ---------------- */
  var params = readParams();
  var tagged = isTagged(params);
  var sessions = bumpSessions();
  var current = touchRecord(params, sessions);

  var mem = { first: null, last: null };

  function loadFirst() {
    /* Cross-session read is gated on consent too: a Deny visitor's session copy is the only
       one we are willing to look at, even if an older "Accept"-era record is still on disk. */
    var raw = consentAll() ? lsGet(K_FIRST) : null;
    if (!raw) raw = ssGet(K_FIRST);
    return parseJSON(raw);
  }

  function saveFirst(rec) {
    var s;
    try { s = JSON.stringify(rec); } catch (e) { return; }
    ssSet(K_FIRST, s);                    // always: keeps the tab consistent if localStorage is blocked
    if (consentAll()) lsSet(K_FIRST, s);  // cross-session ONLY on "all"
  }

  function saveLast(rec) {
    try { ssSet(K_LAST, JSON.stringify(rec)); } catch (e) {}
  }

  var stored = loadFirst();
  if (stored) {
    mem.first = stored;                   // write-once: a first touch is never overwritten
  } else {
    mem.first = current;
    saveFirst(mem.first);
  }

  var storedLast = parseJSON(ssGet(K_LAST));
  if (tagged) {
    mem.last = current;                   // every tagged arrival replaces the last touch
    saveLast(mem.last);
  } else {
    /* Untagged arrival: keep this session's existing last touch if there is one, otherwise
       mirror the first touch so the in-memory copy is never empty for downstream readers. */
    mem.last = storedLast || mem.first;
  }

  /* If the visitor accepts cookies AFTER landing, promote the in-memory first touch to disk so
     the ad click that brought them here survives the tab. Called from the public getters. */
  function upgradeIfConsented() {
    if (!consentAll()) return;
    if (!lsGet(K_FIRST) && mem.first) saveFirst(mem.first);
    if (!lsGet(K_SESSIONS)) lsSet(K_SESSIONS, String(mem.first && mem.first.sessions_count || sessions));
  }

  /* ---------------- Meta identifiers ---------------- */
  function cookie(name) {
    try {
      var parts = String(document.cookie || "").split(";");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].replace(/^\s+/, "");
        if (p.indexOf(name + "=") === 0) return decodeURIComponent(p.slice(name.length + 1));
      }
    } catch (e) {}
    return "";
  }

  /* §6.5: fb.1.<Date.now() MILLISECONDS>.<raw fbclid>. subdomain_index is 1 for
     station.solutions. The fbclid is NOT re-encoded — Meta wants it exactly as delivered. */
  function buildFbc(clid, ms) { return "fb.1." + ms + "." + clid; }

  var memFbc = "";
  (function initFbc() {
    if (params.fbclid) {
      /* A fresh click always wins, even over a stored cookie from an older click. */
      memFbc = buildFbc(params.fbclid, NOW);
      if (consentAll()) {
        /* 90 days matches Meta's own _fbc lifetime. No domain attribute: on localhost an
           explicit domain silently drops the cookie, and host-only is correct in production. */
        try { document.cookie = "_fbc=" + memFbc + "; path=/; max-age=7776000; SameSite=Lax"; } catch (e) {}
      }
      return;
    }
    var ck = cookie("_fbc");
    if (ck) { memFbc = ck; return; }
    /* No cookie (Deny visitor, or cleared) but we remember the click — rebuild it from the
       timestamp of the touch that carried the fbclid, never from "now". */
    var src = (mem.last && mem.last.fbclid) ? mem.last : ((mem.first && mem.first.fbclid) ? mem.first : null);
    if (src) memFbc = buildFbc(src.fbclid, src.ts || NOW);
  })();

  /* _fbp is written by the Pixel and must only ever be READ (§6.5). */
  function fbp() { return cookie("_fbp"); }
  function fbc() { return memFbc || cookie("_fbc"); }

  /* ---------------- shared event id (CAPI dedup key) ----------------
     One id per submit, handed to BOTH the browser Pixel Lead event and the server CAPI event.
     Cached so film.js and analytics.js — two separate submit listeners — read the same value. */
  var evId = "";
  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function eventId() { if (!evId) evId = uuid(); return evId; }
  function newEventId() { evId = uuid(); return evId; }

  /* ---------------- interaction trail ----------------
     Ordered evidence of how the form was actually filled in. Per the §6.3 research the
     consent checkbox's toggle history — ON and OFF both — is what demonstrates deliberation,
     so those entries are the last thing we are willing to drop when the cap is hit. */
  var trail = [];
  var trailT0 = Date.now();

  function labelFor(el) {
    if (!el) return "";
    var n = el.getAttribute && (el.getAttribute("name") || el.getAttribute("id"));
    if (n) return String(n).slice(0, 40);
    var tag = (el.tagName || "").toLowerCase();
    var txt = "";
    try { txt = String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24); } catch (e) {}
    return txt ? tag + ":" + txt : tag;
  }

  function pushTrail(kind, el, to) {
    if (trail.length >= TRAIL_CAP) {
      var idx = -1;
      for (var i = 0; i < trail.length; i++) { if (trail[i].e !== "toggle") { idx = i; break; } }
      trail.splice(idx < 0 ? 0 : idx, 1);
    }
    trail.push({ t: Date.now() - trailT0, e: kind, el: el, to: to || "" });
  }

  function inAuditForm(node) {
    try {
      if (node && node.closest) return !!node.closest("#audit-form");
      while (node) { if (node.id === "audit-form") return true; node = node.parentNode; }
    } catch (e) {}
    return false;
  }

  function recorder(kind) {
    return function (ev) {
      try {
        var t = ev.target;
        if (!inAuditForm(t)) return;
        if (kind === "submit") { pushTrail("submit", "audit-form", ""); return; }
        if (t && t.type === "checkbox") { pushTrail("toggle", labelFor(t), t.checked ? "on" : "off"); return; }
        if (kind === "change") return;   // non-checkbox change adds nothing focus/click didn't
        pushTrail(kind, labelFor(t), "");
      } catch (e) {}
    };
  }

  /* Capture phase on document: works whether or not the form existed when this file ran, and
     guarantees the "submit" entry lands in the trail BEFORE film.js's submit handler reads it.
     These listeners record and nothing else — no beacon, no fbq, no preventDefault. */
  try {
    document.addEventListener("focus", recorder("focus"), true);
    document.addEventListener("click", recorder("click"), true);
    document.addEventListener("change", recorder("change"), true);
    document.addEventListener("submit", recorder("submit"), true);
  } catch (e) {}

  /* ---------------- public surface ---------------- */
  function copy(o) {
    var out = {}, k;
    for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k]; }
    return out;
  }

  function flat() {
    upgradeIfConsented();
    var out = {}, k;
    var f = mem.first || {}, l = mem.last || {};
    for (k in f) {
      if (Object.prototype.hasOwnProperty.call(f, k) && f[k] !== "" && f[k] !== null) out["ft_" + k] = f[k];
    }
    for (k in l) {
      if (Object.prototype.hasOwnProperty.call(l, k) && l[k] !== "" && l[k] !== null) out["lt_" + k] = l[k];
    }
    return out;
  }

  window.__stationAttr = {
    first: function () { upgradeIfConsented(); return copy(mem.first || {}); },
    last: function () { upgradeIfConsented(); return copy(mem.last || {}); },
    flat: flat,
    fbp: fbp,
    fbc: fbc,
    eventId: eventId,
    newEventId: newEventId,
    trail: function () { return trail.slice(); },
    /* true when the landing URL carried paid-click params — the ad_visit event's condition */
    paid: function () { return tagged; },
    /* first_seen → now, in seconds. Read at submit time for time_to_lead_s. */
    timeToLeadS: function () {
      var f = mem.first || {};
      var t = f.ts || NOW;
      return Math.max(0, Math.round((Date.now() - t) / 1000));
    }
  };
})();
