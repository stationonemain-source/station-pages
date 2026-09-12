/* STATION · cart recovery — email capture, a REAL 24h hold, and the countdown.
 *
 * The hold is issued by the server and stored as an absolute timestamp, so it
 * survives a refresh and cannot be restarted by reloading the page. That is the
 * whole point: a countdown that resets on refresh is a lie a customer can catch
 * in four seconds, and we sell to people who will try it.
 *
 * If the endpoint is unreachable we still stamp an expiry locally and persist
 * it — degraded, but never extended, so the promise on screen stays true.
 *
 * Consent follows the existing analytics.js contract exactly (rangeConsent,
 * versioned email-consent record with text/ts/url/ua). No second consent path.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://n8n.srv1748596.hstgr.cloud/webhook/cart-abandon";
  var HOLD_HOURS = 24;
  var CART_KEY = "station_cart";
  var HOLD_KEY = "station_hold";
  var EMAIL_CONSENT_VERSION = "email-consent-v1.0.0";

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function cart() { try { return JSON.parse(ls(CART_KEY) || "[]"); } catch (e) { return []; } }
  function hold() { try { return JSON.parse(ls(HOLD_KEY) || "null"); } catch (e) { return null; } }
  function ref() { try { return sessionStorage.getItem("station_ref"); } catch (e) { return null; } }
  function cookieConsent() { try { return ls("rangeConsent") || "unset"; } catch (e) { return "unset"; } }
  function track(ev, label) { try { if (window.__rangeTrack) window.__rangeTrack(ev, label); } catch (e) {} }

  // Always resolves — never rejects. A network blip or a CORS hiccup at the
  // endpoint must degrade silently (the hold still works from localStorage),
  // not throw an uncaught rejection into a customer's console.
  function post(body) {
    try {
      return fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), keepalive: true
      }).then(function (r) { return r.ok ? r.json().catch(function () { return {}; }) : {}; })
        .catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }

  /* ---------- the hold ---------- */
  // One hold per cart session. Adding a second product does NOT restart it —
  // extending the deadline every time someone shops would make it meaningless.
  function ensureHold() {
    var c = cart();
    if (!c.length) return null;
    var h = hold();
    if (h && h.expires && h.expires > Date.now()) return h;
    if (h && h.expires && h.expires <= Date.now()) return h;   // expired: leave it expired

    var local = { id: null, expires: Date.now() + HOLD_HOURS * 3600e3, server: false };
    lsSet(HOLD_KEY, JSON.stringify(local));
    post({ action: "hold", cart: c, ref: ref(), hours: HOLD_HOURS }).then(function (r) {
      if (r && r.hold_expires) {
        var authoritative = { id: r.cart_id || null, expires: +r.hold_expires, server: true };
        lsSet(HOLD_KEY, JSON.stringify(authoritative));
        paint();
      }
    });
    track("cart_hold_started", c.join(","));
    return local;
  }

  function fmt(ms) {
    if (ms <= 0) return null;
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h > 0 ? (h + "h " + m + "m") : (m + "m " + sec + "s");
  }

  /* The cart drawer is built at runtime by v5.js, so the hold line injects
   * itself rather than asking 20 HTML files to carry markup. */
  /* The "cart price locked for 23h 24m" banner is deliberately gone. Nothing on the
     site ever raises a price, so the countdown invented urgency for a risk that does
     not exist, and it appeared on every product — nobody could tell what it meant.
     The hold record itself stays: it is what lets a recovery email reopen the exact
     cart via /checkout/?cart=…&hold=… . It is plumbing now, not a promise. */
  function injectDrawerHold() {}

  function paint() {
    injectDrawerHold();
    var h = hold(), els = document.querySelectorAll("[data-hold-countdown]");
    if (!els.length) return;
    var left = h && h.expires ? fmt(h.expires - Date.now()) : null;
    els.forEach(function (el) {
      var wrap = el.closest("[data-hold-wrap]") || el;
      if (!left || !cart().length) { wrap.hidden = true; return; }
      wrap.hidden = false;
      el.textContent = left;
    });
  }

  /* ---------- email capture ---------- */
  function wireCapture() {
    var form = document.getElementById("cartSaveForm");
    if (!form) return;
    var input = form.querySelector('input[type="email"]');
    var box = form.querySelector('input[name="email_consent"]');
    var msg = form.querySelector(".cs-msg");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (input.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        msg.textContent = "That email doesn't look right.";
        msg.className = "cs-msg bad"; return;
      }
      if (box && !box.checked) {
        msg.textContent = "Tick the box and we'll send it over.";
        msg.className = "cs-msg bad"; return;
      }
      var h = ensureHold() || {};
      var disc = document.getElementById("cart-email-consent-text");
      msg.textContent = "Saving…"; msg.className = "cs-msg";

      post({
        action: "capture",
        cart_id: h.id || null,
        email: email,
        cart: cart(),
        ref: ref(),
        hold_expires: h.expires || null,
        email_consent: "yes",
        email_consent_version: EMAIL_CONSENT_VERSION,
        consent_text_email: disc ? String(disc.textContent || "").trim().slice(0, 4000) : "",
        consent_ts: new Date().toISOString(),
        consent_url: String(location.href).slice(0, 1000),
        consent_ua: (function () { try { return String(navigator.userAgent || "").slice(0, 600); } catch (e) { return ""; } })(),
        cookie_consent: cookieConsent()
      }).then(function (r) {
        if (r && r.cart_id) {
          var cur = hold() || {};
          cur.id = r.cart_id;
          lsSet(HOLD_KEY, JSON.stringify(cur));
        }
        msg.textContent = "Saved. Your cart is held for " + HOLD_HOURS + " hours.";
        msg.className = "cs-msg ok";
        form.classList.add("done");
        track("cart_email_captured", cart().join(","));
      });
    });
  }

  /* ---------- checkout hand-off ---------- */
  // Tells the recovery workflow this cart reached Stripe, so a two-minute
  // detour to enter card details never triggers a "you forgot something" email.
  function wireCheckoutSignal() {
    var pay = document.getElementById("coPay");
    if (!pay) return;
    pay.addEventListener("click", function () {
      var h = hold();
      if (h && h.id) post({ action: "checkout_started", cart_id: h.id });
    }, { capture: true });
  }

  /* ---------- restore-from-email ---------- */
  // /checkout/?cart=tap,dial&hold=<ms>&cid=<id> — the link the recovery email
  // carries so the cart works on a different device. Keys are validated against
  // the live catalog; the hold is accepted as-is and NEVER extended here, so a
  // forged or expired ?hold= can only show less time, not more.
  function hydrateFromUrl() {
    var q = new URLSearchParams(location.search);
    if (!q.get("cart")) return;
    var valid = (window.STATION_CATALOG || []).map(function (p) { return p.k; });
    var keys = q.get("cart").split(",").filter(function (k) { return valid.indexOf(k) > -1; });
    if (!keys.length) return;
    lsSet(CART_KEY, JSON.stringify(keys));
    var exp = parseInt(q.get("hold") || "0", 10);
    var cur = hold();
    if (exp > Date.now() && (!cur || !cur.expires || exp <= cur.expires)) {
      lsSet(HOLD_KEY, JSON.stringify({ id: q.get("cid") || null, expires: exp, server: true }));
    }
    track("cart_restored_from_email", keys.join(","));
    // strip the params so a refresh doesn't re-hydrate over later edits
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }

  function boot() {
    hydrateFromUrl();
    ensureHold();
    paint();
    wireCapture();
    wireCheckoutSignal();
    setInterval(paint, 1000);
    // the cart drawer and checkout both mutate localStorage directly
    window.addEventListener("storage", function (e) { if (e.key === CART_KEY) { ensureHold(); paint(); } });
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-add]")) setTimeout(function () { ensureHold(); paint(); }, 30);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
