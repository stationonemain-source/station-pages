/* analytics.js — THE RANGE AT DAWN
   Cookie consent banner + consent-gated analytics, advertising AND attribution.

   Two choices on the banner:
     • "Accept"          → first-party analytics + advertising/retargeting.
                            Loads the Meta (Facebook) Pixel so we can build
                            retargeting audiences and run Meta ads to visitors
                            who showed interest. label = "accepted".
     • "Essentials only" → strictly-necessary storage only. No analytics events,
                            no Pixel, no ad tracking. label = "essentials".

   WHAT FLOWS NOW (all consent-gated except the lead beacon at the bottom):

     the funnel   pageview · ad_visit (paid arrival) · scroll_depth 25/50/75/100 ·
                  film_complete · cta_click · demo_use · popup · calc_use ·
                  form_start → either form_abandon OR audit_submit + consent_sms.
                  audit_view and unsubscribe are the same schema but are fired
                  from elsewhere (the hosted audit report page and the unsub
                  endpoint) through window.__rangeTrack(ev, label).

     every event  utm_source · utm_campaign · fbclid_seen · device · event_id.
                  event_id is the dedup key: a server-side CAPI copy of the same
                  action carries the same id, so Events Manager counts the action
                  once instead of twice.

     the lead     the form fields, PLUS the consent evidence (sms/email consent,
                  timestamp, disclosure version, page URL, user agent, cookie
                  choice) and the attribution (ft_/lt_ touches, _fbp/_fbc,
                  time_to_lead_s). The dashboard record has to be able to stand
                  next to the CRM record and agree with it — "checkbox = true"
                  with no evidence is worthless in a carrier audit.

   Attribution itself is owned by attribution.js (window.__stationAttr) — first
   touch in localStorage, last touch in sessionStorage. That file is loaded
   separately and may not be on the page, so every read here feature-detects it
   and falls back to reading the landing URL directly. A paid click must never
   lose its source just because one file didn't ship.

   First-party events beacon to a collector that feeds the Circle Command
   Center analytics board (per-session, incl. which sessions accepted
   retargeting). Locally that's the Station World server (:8790) directly; in
   production it's the n8n relay ("Station - Range Analytics Relay"), which
   Station World pulls from — visitors' browsers never talk to the operator's
   machine. Both the relay and the collector WHITELIST event names and lead
   fields, so an event or field added here must be added there too or it is
   dropped without an error anywhere (SCHEMA_CONTRACT §0, the five-place rule).
   Meta retargeting itself is handled by the Pixel — Meta builds the audience on
   their side; we never store a visitor's name/email here (that only arrives when
   someone submits the audit form → the CRM + the leads board). */
(function () {
  "use strict";

  /* ============================ CONFIG ============================ */
  var IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
  // Local dev → straight into the Station World collector. Production → the
  // n8n relay, which Circle's server pulls on its own schedule.
  var ENDPOINT = IS_LOCAL
    ? "http://127.0.0.1:8790/api/range-analytics"
    : "https://n8n.srv1748596.hstgr.cloud/webhook/range-event";
  var LEAD_ENDPOINT = IS_LOCAL
    ? "http://127.0.0.1:8790/api/website-lead"
    : "https://n8n.srv1748596.hstgr.cloud/webhook/range-lead";
  var LS_KEY = "rangeConsent"; // "all" (analytics + ads) | "essential"
  // Paste the numeric Pixel ID from Meta Events Manager, e.g. "1234567890".
  // Leave "" to keep the Pixel off (analytics still works).
  // 2026-07-29: the previous value (1014141208194048) was NOT a pixel this business owned —
  // Events Manager showed "No data sources", so it collected nothing and no retargeting
  // audience was ever building. Replaced with the real "Station Web" dataset.
  var META_PIXEL_ID = "1368388388773065";
  // Disclosure version ids — fixed cross-agent contract. These identify the
  // wording a lead actually saw, so they get bumped when the rendered
  // disclosure text changes, never when this file changes. If the form itself
  // ships a consent_version input, that value wins (it is closer to the text).
  var SMS_CONSENT_VERSION = "sms-consent-v1.0.0";
  var EMAIL_CONSENT_VERSION = "email-consent-v1.0.0";
  // Per-field length caps for anything copied off the form, mirroring the
  // collector's own caps so neither end is the one that truncates the evidence.
  var FIELD_CAPS = { consent_text_sms: 4000, consent_text_email: 4000,
                     consent_url: 1000, consent_ua: 600, interaction_trail: 4000,
                     ft_attr: 2000, lt_attr: 2000 };
  /* =============================================================== */

  function consent() {
    try { return localStorage.getItem(LS_KEY); } catch (e) { return null; }
  }

  /* A DURABLE per-browser id, where sid() below is per-VISIT. Without it every
     number on the analytics board counted visits and was read as people: the
     retargeting pool showed 35 when it was a handful of browsers -- mostly ours --
     coming back, which is exactly the shape of a vanity metric. Anonymous: a random
     string, never a name or an email, and it only ever leaves the browser inside an
     event that full consent already allowed. Cleared with site data, same as the
     consent choice itself. */
  function vid() {
    try {
      var v = localStorage.getItem("rangeVid");
      if (!v) {
        v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem("rangeVid", v);
      }
      return v;
    } catch (e) { return ""; }
  }

  function sid() {
    try {
      var s = sessionStorage.getItem("rangeSid");
      if (!s) {
        s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        sessionStorage.setItem("rangeSid", s);
      }
      return s;
    } catch (e) { return "anon"; }
  }

  /* ---- internal self-visit exclusion -------------------------------------
     Our own visits were the bulk of what the 2026-08-25 analytics wipe cleared.
     A browser opts out for good by visiting any page once with

         ?station_optout=1

     which sets a durable localStorage flag (?station_optout=0 clears it again).
     The check sits inside beacon(), the single chokepoint BOTH the event and the
     lead endpoints funnel through, so an opted-out browser sends nothing at all
     rather than sending something the collector then has to recognise and drop.

     Deliberately client-side: it must work without asking the collector to trust
     a self-declared "I am internal" field, which the relay's field whitelist
     would strip anyway. Clearing site data re-enables tracking, same as any
     analytics opt-out. */
  var OPTOUT_KEY = "stationInternalOptOut";

  function optedOut() {
    try {
      var m = /[?&]station_optout=([01])/.exec(location.search);
      if (m) {
        if (m[1] === "1") localStorage.setItem(OPTOUT_KEY, "1");
        else localStorage.removeItem(OPTOUT_KEY);
        // say so out loud: an opt-out you cannot confirm is one you will not trust
        try {
          console.info("[station] analytics opt-out "
            + (m[1] === "1" ? "ENABLED for this browser" : "cleared for this browser"));
        } catch (e) {}
      }
      return localStorage.getItem(OPTOUT_KEY) === "1";
    } catch (e) { return false; }
  }

  // text/plain keeps sendBeacon CORS-safelisted (no preflight) AND gives the
  // collector a content-type it will actually parse (a type-less Blob arrives
  // as an empty body at n8n). Fire-and-forget: an unreachable collector must
  // never affect the visitor.
  function beacon(url, obj) {
    if (optedOut()) return;
    var data = JSON.stringify(obj);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([data], { type: "text/plain" }))) return;
    } catch (e) {}
    try {
      fetch(url, { method: "POST", body: data, keepalive: true, mode: "no-cors",
                   headers: { "Content-Type": "text/plain" } }).catch(function () {});
    } catch (e) {}
  }

  function post(obj) { beacon(ENDPOINT, obj); }

  // The verbatim disclosure, read out of the rendered DOM (§2.1) — never a constant in this
  // file, because a hardcoded copy would drift from the paragraph actually on screen and the
  // snapshot's only value is being what the lead saw. Whitespace collapsed (the markup wraps
  // the sentence over many lines); capped at the same 4000 the collector uses (§7.4).
  function disclosureText(id) {
    try {
      var el = document.getElementById(id);
      if (!el) return "";
      var cap = FIELD_CAPS.consent_text_sms || 4000;
      return String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, cap);
    } catch (e) { return ""; }
  }

  /* ---------------- attribution (attribution.js, or our own eyes) ----------------
     attribution.js publishes functions on window.__stationAttr. Read every one
     through attrCall so a different build shape (plain value instead of getter)
     or a missing file degrades to null instead of throwing inside a click
     handler and taking the form down with it. */
  function attrCall(name) {
    var A = window.__stationAttr;
    if (!A) return null;
    try {
      var v = A[name];
      if (typeof v === "function") return v.call(A);
      return (v === undefined) ? null : v;
    } catch (e) { return null; }
  }
  function flatAttr() { var o = attrCall("flat"); return (o && typeof o === "object") ? o : null; }
  function lastAttr() { var o = attrCall("last"); return (o && typeof o === "object") ? o : null; }

  var TOUCH_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_term",
                    "utm_content", "fbclid", "gclid", "ttclid",
                    "fb_campaign_id", "fb_campaign_name", "fb_adset_id", "fb_adset_name",
                    "fb_ad_id", "fb_ad_name", "fb_placement", "fb_platform"];

  // The landing query string, read at load into memory only. Nothing is written
  // to storage from here: a "Deny" visitor must leave nothing behind, and this
  // runs before the banner has even been answered.
  var LANDING = {};
  var LANDING_PAID = false;
  (function readLanding() {
    try {
      var qs = new URLSearchParams(location.search), i, v;
      for (i = 0; i < TOUCH_KEYS.length; i++) {
        v = qs.get(TOUCH_KEYS[i]);
        if (v) { LANDING[TOUCH_KEYS[i]] = String(v).slice(0, 300); LANDING_PAID = true; }
      }
      // any utm_*, not just the ones we name — a hand-built ad link still counts
      // as a paid arrival even if it uses a param we never listed.
      qs.forEach(function (val, key) {
        if (val && key.indexOf("utm_") === 0) LANDING_PAID = true;
      });
    } catch (e) {}
  })();

  // Same three buckets attribution.js uses, so the two files never disagree
  // about what "mobile" means on the same visit.
  var DEVICE = (function () {
    var w = 0, ua = "";
    try { w = window.innerWidth || 0; } catch (e) {}
    try { ua = navigator.userAgent || ""; } catch (e2) {}
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (w >= 700 && w < 1024)) return "tablet";
    if (/Mobi|Android|iPhone|iPod/i.test(ua) || (w > 0 && w < 700)) return "mobile";
    return "desktop";
  })();

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

  // Built once at load so the timestamp is the arrival, not whenever a form was
  // submitted. Only used when attribution.js isn't there to own it (§6.5:
  // fb.1.<ms>.<raw fbclid>, subdomain index 1; _fbp is READ ONLY, never built).
  var FBC_LOCAL = LANDING.fbclid ? "fb.1." + Date.now() + "." + LANDING.fbclid : "";
  function fbIds() {
    var fbp = attrCall("fbp") || cookie("_fbp");
    var fbc = attrCall("fbc") || cookie("_fbc") || FBC_LOCAL;
    return { fbp: String(fbp || ""), fbc: String(fbc || "") };
  }

  function isPaid() {
    var A = window.__stationAttr;
    if (A && A.paid !== undefined) {
      var v = attrCall("paid");
      if (v !== null) return !!v;
    }
    return LANDING_PAID;
  }

  /* Fallback touch memory — used ONLY when attribution.js is absent, so the two
     files can never fight over the same keys. Persisted after consent only:
     until then the in-memory LANDING copy carries this pageview. */
  var FT_KEY = "rangeFallbackFirstTouch";  // localStorage — outlives the tab (§3)
  var LT_KEY = "rangeFallbackLastTouch";   // sessionStorage — this visit
  function storedTouch(store, key) {
    try {
      var raw = store.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
  }
  function rememberTouch() {
    if (window.__stationAttr) return;   // attribution.js owns persistence
    if (consent() !== "all") return;    // nothing of a Deny visitor's survives
    if (!LANDING_PAID) return;
    try {
      var raw = JSON.stringify(LANDING);
      if (!localStorage.getItem(FT_KEY)) localStorage.setItem(FT_KEY, raw);
      sessionStorage.setItem(LT_KEY, raw);
    } catch (e) {}
  }
  function fallbackLast() {
    if (LANDING_PAID) return LANDING;   // this pageview's own click wins
    var s = null;
    try { s = storedTouch(sessionStorage, LT_KEY); } catch (e) {}
    return s || LANDING;
  }
  function fallbackFirst() {
    var s = null;
    try { s = storedTouch(localStorage, FT_KEY); } catch (e) {}
    return s || (LANDING_PAID ? LANDING : null);
  }

  // One last-touch value, whichever layer knows it.
  function ltVal(k) {
    var l = lastAttr();
    if (l && l[k]) return String(l[k]);
    var f = flatAttr();
    if (f && f["lt_" + k]) return String(f["lt_" + k]);
    if (window.__stationAttr) return "";
    var o = fallbackLast();
    return (o && o[k]) ? String(o[k]) : "";
  }
  function ftVal(k) {
    var f = flatAttr();
    if (f && f["ft_" + k]) return String(f["ft_" + k]);
    if (window.__stationAttr) {
      var o = attrCall("first");
      return (o && typeof o === "object" && o[k]) ? String(o[k]) : "";
    }
    var g = fallbackFirst();
    return (g && g[k]) ? String(g[k]) : "";
  }

  // The five fields every event record gains (§4).
  function attrCore() {
    return { utm_source: ltVal("utm_source").slice(0, 120),
             utm_campaign: ltVal("utm_campaign").slice(0, 120),
             fbclid_seen: !!(ltVal("fbclid") || ftVal("fbclid") || LANDING.fbclid),
             device: DEVICE };
  }

  // Copy the whole attribution picture onto a record. Attribution columns are
  // emitted under ONE shape only — the ft_/lt_ prefixed spellings attribution.js
  // publishes, which §7.1 makes canonical. Carrying a second plain spelling of
  // the same column looked free but is precisely how a concept ends up defined
  // twice and read once, so a value silently vanishes at some later hop.
  function addAttribution(rec) {
    var i, k, lv, fv;
    // Verbatim pass-through first: whatever attribution.js publishes under ft_/lt_
    // travels untouched (it also carries landing_path, referrer, first_seen and
    // sessions_count per touch). This file must not become a second, competing
    // definition of the attribution schema.
    var flat = flatAttr();
    if (flat) {
      for (k in flat) {
        if (!Object.prototype.hasOwnProperty.call(flat, k)) continue;
        if (k.indexOf("ft_") !== 0 && k.indexOf("lt_") !== 0) continue;
        var fval = flat[k];
        if (fval === null || fval === undefined || fval === "") continue;
        if (typeof fval === "object" || typeof fval === "function") continue;
        if (!rec[k]) rec[k] = (typeof fval === "boolean") ? fval : String(fval).slice(0, 300);
      }
      // The untruncated blobs. The flat columns above are for grouping; these are
      // the record of what the browser actually held at submit time.
      var fo = attrCall("first"), lo = attrCall("last");
      try { if (fo && !rec.ft_attr) rec.ft_attr = JSON.stringify(fo).slice(0, 2000); } catch (e) {}
      try { if (lo && !rec.lt_attr) rec.lt_attr = JSON.stringify(lo).slice(0, 2000); } catch (e2) {}
      // Ordered evidence of how the form was filled — the checkbox toggle history
      // is what shows deliberation if a consent record is ever challenged.
      var tr = attrCall("trail");
      try {
        if (tr && tr.length && !rec.interaction_trail) {
          rec.interaction_trail = JSON.stringify(tr).slice(0, 4000);
        }
      } catch (e3) {}
    }
    for (i = 0; i < TOUCH_KEYS.length; i++) {
      k = TOUCH_KEYS[i];
      lv = ltVal(k); fv = ftVal(k);
      if (lv && !rec["lt_" + k]) rec["lt_" + k] = lv.slice(0, 300);
      if (fv && !rec["ft_" + k]) rec["ft_" + k] = fv.slice(0, 300);
    }
    // fbclid is the one click id that also travels PLAIN: §7.6 names it as a top-level key on
    // the flat CAPI relay contract, alongside fbp/fbc. Every other touch key ships ft_/lt_
    // prefixed only — carrying two spellings of the same column is what made the same concept
    // vanish between hops (§7.1).
    if (!rec.fbclid) {
      var clid = ltVal("fbclid") || ftVal("fbclid") || LANDING.fbclid || "";
      if (clid) rec.fbclid = String(clid).slice(0, 300);
    }
    if (!rec.landing_path) rec.landing_path = ltVal("landing_path") || location.pathname || "/";
    if (!rec.referrer) {
      try { rec.referrer = String(document.referrer || "").slice(0, 300); } catch (e) { rec.referrer = ""; }
    }
    if (!rec.device) rec.device = DEVICE;
    if (!rec.viewport) {
      try { rec.viewport = (window.innerWidth || 0) + "x" + (window.innerHeight || 0); } catch (e2) {}
    }
    // sessions_count and first_seen already travelled above as ft_/lt_ columns out of flat().
    // The plain spellings that used to be added here were a second name for the same value —
    // dropped so there is one vocabulary end to end (§7.1).
    var ttl = attrCall("timeToLeadS");
    if (ttl !== null && ttl !== "" && !rec.time_to_lead_s) rec.time_to_lead_s = ttl;
    return rec;
  }

  // Unique per event record. Only has to be unique enough that Meta can match a
  // browser event to the CAPI copy of it — no PII, no ordering meaning.
  function eid() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* Once-per-session gates live in sessionStorage so a reload can't re-fire a
     funnel step. Only ever consulted AFTER the consent check, otherwise a
     visitor who accepts late would have already burned their first event. */
  function firstTime(key) {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
      return true;
    } catch (e) { return true; }
  }

  /* ---------------- the event schema ----------------
     This set IS the schema (five-place rule, place 3). The relay and the
     collector whitelist the same names, so a typo would vanish silently
     downstream — better to catch it here, loudly, in dev. */
  var EVENTS = { pageview: 1, consent: 1, film_complete: 1, cta_click: 1, audit_submit: 1,
                 demo_use: 1, popup: 1,
                 form_start: 1, form_abandon: 1, consent_sms: 1, calc_use: 1,
                 scroll_depth: 1, ad_visit: 1, audit_view: 1, unsubscribe: 1 };

  function track(ev, label) {
    if (consent() !== "all") return "";
    if (!EVENTS[ev]) {
      if (IS_LOCAL && window.console && console.warn) console.warn("[analytics] unknown event:", ev);
      return "";
    }
    var a = attrCore();
    var id = eid();
    post({ ev: ev, label: label || "", sid: sid(), vid: vid(), path: location.pathname,
           ref: new URLSearchParams(location.search).get("ref") || "",
           utm_source: a.utm_source, utm_campaign: a.utm_campaign,
           fbclid_seen: a.fbclid_seen, device: a.device, event_id: id });
    return id;
  }
  // Public so pages that aren't this one can file an event against the same
  // session and schema — the hosted audit report page fires
  // window.__rangeTrack("audit_view", "<audit-slug>"), and the unsubscribe
  // confirmation fires window.__rangeTrack("unsubscribe", "email"|"sms").
  // Returns the event_id (or "" when the visitor didn't accept).
  window.__rangeTrack = track;

  /* ---------------- Meta (Facebook) Pixel — ad retargeting ----------------
     Only loads when the visitor accepted ("all") AND a Pixel ID is set.
     Loads once per page. Safe no-op if either condition isn't met. */
  var pixelLoaded = false;
  function loadMetaPixel() {
    if (pixelLoaded || !META_PIXEL_ID || consent() !== "all") return;
    pixelLoaded = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    try {
      window.fbq("init", META_PIXEL_ID);
      window.fbq("track", "PageView");
    } catch (e) {}
  }
  // Fire a Meta event (standard or custom) only when the Pixel is live. The
  // optional 4th argument is Meta's own envelope — {eventID: id} is what lets
  // the server-side CAPI copy of an action dedup against this browser event
  // instead of showing up as a second conversion in Events Manager. Omitted
  // entirely when not supplied, because fbq treats a present-but-empty envelope
  // as an eventID of undefined.
  function fbTrack(kind, event, params, opts) {
    if (!window.fbq) return;
    try {
      if (opts) window.fbq(kind, event, params || {}, opts);
      else window.fbq(kind, event, params || {});
    } catch (e) {}
  }

  /* ---------------- consent banner ---------------- */
  function showBanner() {
    var el = document.createElement("div");
    el.id = "ck";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Cookie and advertising choices");
    el.innerHTML =
      '<div class="ck-txt"><b>Cookies &amp; ads.</b> ' +
      /* Desktop keeps the full explanation; on phones it covered ~40% of the viewport as the
         very first impression (2026-08-31 audit), so small screens get one accurate line that
         still names Meta advertising — the detail stays one tap away in the Cookie notice.
         The short span is inline-hidden so pages that load this file without v5.css (the
         generated /a/ audits) render exactly as before. */
      '<span class="ck-long">Essentials keep the site working. ' +
      'Accept and we also turn on first-party analytics <b>and advertising</b> — that means the ' +
      'Meta&nbsp;Pixel, so we can show you Station ads on Facebook &amp; Instagram after your visit. ' +
      'Your choice, and you can pick essentials only.</span> ' +
      '<span class="ck-short" style="display:none">Accept adds first-party analytics &amp; Meta advertising; Deny keeps essentials only.</span> ' +
      '<a href="/station-pages/legal/cookies.html" target="_blank" rel="noopener">Cookie notice</a> · ' +
      '<a href="/station-pages/legal/privacy.html" target="_blank" rel="noopener">Privacy</a></div>' +
      '<div class="ck-actions">' +
      '<button class="ck-accept" id="ck-accept">Accept</button>' +
      '<button class="ck-min" id="ck-min">Deny</button></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add("up"); });
    });
    function choose(val) {
      try { localStorage.setItem(LS_KEY, val); } catch (e) {}
      // Consent choice is logged WITH the session id now, so the Command Center
      // can show which sessions accepted retargeting (still anonymous — a random
      // per-visit id, no name/email). "accepted" = analytics + ads.
      // Deliberately WITHOUT the §4 attribution fields: this one record is sent
      // for a Deny visitor too, and recording which ad brought someone in is
      // exactly what they just declined.
      /* vid deliberately absent: this one record is sent for a Deny visitor too, and
         a durable id is the thing they just declined. An accepted visitor's browser
         id arrives on their next event, which only fires under full consent. */
      post({ ev: "consent", label: val === "all" ? "accepted" : "essentials",
             sid: sid(), path: location.pathname,
             ref: new URLSearchParams(location.search).get("ref") || "" });
      el.classList.remove("up");
      setTimeout(function () { el.remove(); }, 400);
      if (val === "all") boot();
    }
    document.getElementById("ck-accept").addEventListener("click", function () { choose("all"); });
    document.getElementById("ck-min").addEventListener("click", function () { choose("essential"); });
  }

  /* ---------------- form funnel state ----------------
     Shared at module scope because the submit side of it lives in
     wireAuditLead() — adding a second submit listener would mean two browser
     Lead events, and the one without the shared eventID could never dedup
     against the server event (§6.5). */
  var formStarted = false;
  var formSubmitted = false;
  var formLastField = "";
  var abandonSent = false;

  function wireFormFunnel(form) {
    form.addEventListener("focusin", function (e) {
      var t = e.target;
      var n = t && t.name;
      if (!n || n === "company_url" || n === "_t") return;  // honeypot/timestamp aren't the funnel
      formLastField = n;
      if (formStarted) return;
      formStarted = true;
      if (firstTime("rangeFormStart")) track("form_start", n);
    });
  }

  function wireFormAbandon() {
    function bail() {
      if (!formStarted || formSubmitted || abandonSent) return;
      abandonSent = true;
      if (firstTime("rangeFormAbandon")) track("form_abandon", formLastField || "unknown");
    }
    // pagehide + visibilitychange, never unload: unload is unreliable on mobile
    // Safari, kills sendBeacon, and disqualifies the page from the back/forward
    // cache. A tab-hide isn't strictly an abandon, which is why this is capped
    // once per session — switching tabs can't spam the funnel.
    window.addEventListener("pagehide", bail);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") bail();
    });
  }

  function wireCalc() {
    var ids = ["c-calls", "c-value", "c-close"];
    for (var i = 0; i < ids.length; i++) {
      (function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var timer = null;
        el.addEventListener("input", function () {
          // dragging a range input fires "input" on every pixel — debounce so
          // one drag is one event, not two hundred.
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () {
            if (firstTime("rangeCalc:" + id)) track("calc_use", id);
          }, 500);
        });
      })(ids[i]);
    }
  }

  function wireScrollDepth() {
    var marks = [25, 50, 75, 100], hit = {};
    function check() {
      var doc = document.documentElement;
      var full = Math.max(doc.scrollHeight || 0, document.body ? (document.body.scrollHeight || 0) : 0);
      var h = full - (window.innerHeight || 0);
      // A page shorter than the viewport is 100% read the moment it loads.
      var pct = h > 0 ? ((window.pageYOffset || doc.scrollTop || 0) / h) * 100 : 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (hit[m] || pct < m - 0.5) continue;
        hit[m] = true;
        if (firstTime("rangeDepth:" + m)) track("scroll_depth", String(m));
      }
    }
    var t = null;
    window.addEventListener("scroll", function () {
      // the film scrubs on every frame; a 250ms throttle keeps this off the
      // scroll path entirely.
      if (t) return;
      t = setTimeout(function () { t = null; check(); }, 250);
    }, { passive: true });
    check();
  }

  /* ---------------- consent-gated wiring ---------------- */
  var booted = false;
  function boot() {
    if (booted || consent() !== "all") return;
    booted = true;

    loadMetaPixel();     // ad retargeting (only if a Pixel ID is set)
    rememberTouch();     // no-op when attribution.js is on the page
    track("pageview");

    // Paid arrival. Fires on the FIRST pageview of an ad click, not just a later
    // one, because the landing query string was read into memory at load —
    // before the banner was answered — so accepting late doesn't lose it.
    if (isPaid() && firstTime("rangeAdVisit")) {
      var src = ltVal("utm_source") || ftVal("utm_source");
      track("ad_visit", src || ((ltVal("fbclid") || LANDING.fbclid) ? "fbclid" : "unknown"));
    }

    // film watched to the end = the content landing scrolled into view
    if ("IntersectionObserver" in window) {
      var landing = document.getElementById("landing");
      if (landing) {
        var seen = false;
        var io = new IntersectionObserver(function (en) {
          if (!seen && en[0].isIntersecting) {
            seen = true; track("film_complete");
            fbTrack("track", "ViewContent", { content_name: "intro film complete" });
            io.disconnect();
          }
        }, { threshold: 0.1 });
        io.observe(landing);
      }
    }

    // CTA clicks (booking links, amber buttons, audit jumps)
    document.addEventListener("click", function (e) {
      var b = e.target.closest(".btn-primary,.btn-audit,.js-book,.btn-ghost");
      if (b) {
        var label = (b.textContent || "").trim().slice(0, 40);
        track("cta_click", label);
        fbTrack("trackCustom", "CTAClick", { label: label });
      }
    });

    // how far down the page they actually got
    wireScrollDepth();

    // worth-calculator sliders — the strongest on-page intent signal we have
    wireCalc();

    // audit-form funnel: first focus in, and leaving without submitting.
    // (the submit side is in wireAuditLead below — one listener, one Lead event)
    var af = auditForm();
    if (af) { wireFormFunnel(af); wireFormAbandon(); }

    // demo usage — first message per surface per visit
    var used = {};
    function demoUse(which) {
      if (used[which]) return;
      used[which] = true;
      track("demo_use", which);
    }
    var pf = document.getElementById("p-form"), pc = document.getElementById("p-chips");
    if (pf) pf.addEventListener("submit", function () { demoUse("phone"); });
    if (pc) pc.addEventListener("click", function (e) { if (e.target.closest(".chip-btn")) demoUse("phone"); });
    var wf = document.getElementById("aiw-form"), wc = document.getElementById("aiw-chips");
    if (wf) wf.addEventListener("submit", function () { demoUse("faq"); });
    if (wc) wc.addEventListener("click", function (e) { if (e.target.closest(".chip-btn")) demoUse("faq"); });

    // popup lifecycle (dispatched by the inline script)
    document.addEventListener("range:popup", function (e) {
      track("popup", (e.detail && e.detail.action) || "shown");
    });
  }

  /* The live pages ship <form class="audit-form" data-audit ...> with NO id, but
     both call sites below looked the form up by getElementById("audit-form") --
     so form_start/form_abandon never fired and wireAuditLead() never bound, on
     every page. Verified 2026-08-25: zero id matches on / or /audit/, which is
     why the Funnel panel read empty and the n8n intake node was the ONLY feeder
     of the consent ledger.

     Deliberately ONE resolver shared by both call sites: they were duplicated
     lookups before, which is exactly how they came to disagree with the markup
     and stay wrong. #audit-form stays first so any page still on the old id
     keeps working. */
  function auditForm() {
    return document.getElementById("audit-form")
        || document.querySelector("form[data-audit]")
        || document.querySelector("form.audit-form");
  }

  /* ---------------- audit-form lead capture (NOT consent-gated) ----------------
     A lead typing their details into the audit form and pressing submit is a
     direct request for contact — that's first-party form data, not tracking, so
     it's captured regardless of the cookie choice (same as the intake webhook the
     form already posts to). Bots that fill the honeypot are dropped, matching
     film.js.

     The consent evidence and the attribution ride along on this beacon so the
     dashboard record carries the same proof as the CRM record on the other path.
     Two records that disagree about whether someone consented are worse than
     one record, and the cookie choice has no bearing on either: consenting to
     be texted is not consenting to be tracked. */
  function leadEventId(form) {
    // ONE id per submit, shared three ways: this beacon, the Pixel's Lead
    // eventID, and the event_id film.js posts to the intake webhook (which the
    // CAPI relay later echoes). Whoever minted it first wins — minting a second
    // one here would break exactly the dedup it exists for.
    var id = attrCall("eventId") || attrCall("event_id");
    if (id) return String(id);
    var f = form && form.querySelector('input[name="event_id"]');
    if (f && f.value) return String(f.value);
    return eid();
  }

  function wireAuditLead() {
    var form = auditForm();
    if (!form) return;
    form.addEventListener("submit", function () {
      formSubmitted = true;      // they submitted: no form_abandon on the way out
      // §7.3 — .checked is settable on a DISABLED input, and the SMS box ships disabled today
      // because {{LEGAL_ENTITY}} is unresolved. Reading .checked alone would let an extension, a
      // replayed DOM or a half-finished go-live edit manufacture consent against a placeholder
      // disclosure, so disabled always means no. Mirrors film.js smsConsentGranted() exactly —
      // the two paths must never disagree about the same checkbox.
      var smsBox = form.querySelector('input[name="sms_consent"]');
      var granted = !!(smsBox && smsBox.checked && !smsBox.disabled);
      var emailBox = form.querySelector('input[name="email_consent"]');
      var emailGranted = !!(emailBox && emailBox.checked && !emailBox.disabled);
      var eventId = leadEventId(form);
      try {
        var hp = form.querySelector('input[name="company_url"]');
        if (hp && hp.value) return;                       // honeypot → bot, drop
        // only beacon a VALID submit — film.js blocks sends with empty required
        // fields, so an invalid attempt must not produce a half-filled lead row
        var missing = false;
        var reqd = form.querySelectorAll("[required]");
        for (var ri = 0; ri < reqd.length; ri++) {
          if (!String(reqd[ri].value || "").trim()) { missing = true; break; }
        }
        if (missing) return;
        var lead = { ev: "lead", path: location.pathname, sid: sid(),
                     ref: new URLSearchParams(location.search).get("ref") || "" };
        try {
          var fd = new FormData(form);
          fd.forEach(function (v, k) {
            if (k === "company_url" || k === "_t") return;
            if (typeof v !== "string") return;
            // 300 was sized for a business name. If the form ships the verbatim
            // disclosure as a field, clipping it to 300 would destroy the very
            // evidence it exists to be — so the proof fields keep their tail.
            lead[k] = String(v).slice(0, FIELD_CAPS[k] || 300);
          });
        } catch (e) {}
        // Consent proof. An unchecked checkbox is simply absent from FormData,
        // which downstream reads as "unknown" — so record the explicit no. The
        // form's own values win where it has them (it is closer to the rendered
        // disclosure than this file is).
        lead.sms_consent = granted ? "yes" : "no";
        // §7.1 — email_consent is the OPTIONAL MARKETING checkbox and nothing else. The
        // transactional basis for sending the audit is a separate thing entirely: it is implied
        // by the submission and needs no field at all. Hard-coding "yes" here conflated the two
        // and wrote consent nobody gave into the file whose only purpose is being evidence —
        // while film.js was correctly posting "no" to the CRM on the very same submit.
        lead.email_consent = emailGranted ? "yes" : "no";
        // §2.1 — the verbatim disclosure IS the evidence, so the dashboard row carries the same
        // snapshot the CRM row does. film.js has already written these into the hidden inputs by
        // the time this handler runs, so the FormData copy above normally supplies them; reading
        // the DOM here is the fallback for a page where those inputs are missing.
        if (!lead.consent_text_sms) lead.consent_text_sms = disclosureText("sms-consent-text");
        if (!lead.consent_text_email) lead.consent_text_email = disclosureText("email-consent-text");
        if (!lead.consent_ts) lead.consent_ts = new Date().toISOString();
        if (!lead.consent_version) lead.consent_version = SMS_CONSENT_VERSION;
        if (!lead.email_consent_version) lead.email_consent_version = EMAIL_CONSENT_VERSION;
        // Caps match the collector's own (_LEAD_FIELD_CAPS): a truncated proof is
        // not proof, so the query string stays intact and the UA isn't clipped.
        if (!lead.consent_url) lead.consent_url = String(location.href).slice(0, 1000);
        if (!lead.consent_ua) {
          try { lead.consent_ua = String(navigator.userAgent || "").slice(0, 600); } catch (e2) {}
        }
        lead.cookie_consent = consent() || "unset";
        lead.event_id = eventId;
        var fb = fbIds();
        lead.fbp = fb.fbp;
        lead.fbc = fb.fbc;
        addAttribution(lead);
        beacon(LEAD_ENDPOINT, lead);
      } catch (e) {}
      track("audit_submit");
      track("consent_sms", granted ? "granted" : "declined");
      // MODIFIED, not duplicated: the same Lead call as before, now carrying the
      // shared eventID so the CAPI copy of this lead dedups against it.
      fbTrack("track", "Lead", { content_name: "audit request" }, { eventID: eventId });
    });
  }
  wireAuditLead();

  var QS = new URLSearchParams(location.search);
  if (QS.get("demo") === "cookies") {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    setTimeout(showBanner, 300);
  } else {
    var c = consent();
    if (c === "all") boot();
    else if (c === null && !QS.has("jump")) {
      // banner stays out of the QA harness unless explicitly demoed
      setTimeout(showBanner, 1400);
    }
  }
})();
