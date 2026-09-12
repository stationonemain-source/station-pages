/* STATION · scroll-triggered free-audit offer — content pages only.
 *
 * Fires once a reader has genuinely engaged: 60% scroll depth AND 45s on the
 * page. The offer is the free audit that already exists — the lead magnet this
 * site is built around — not an invented discount.
 *
 * Asks for TWO fields: website + email. The website is the one input the audit
 * engine actually needs to produce a real report; email-only would generate a
 * lead the engine can't act on. Posts the same FormData contract as the main
 * audit forms (v5.js), flagged minimal=1 / source=scroll-popup so the intake
 * gate knows name/business were never asked (gate patched 2026-08-08).
 *
 * Suppressed for: anyone who already submitted a lead (station_lead_done),
 * open quiz/exit/cart UI, and capped 1/session + 2/week.
 */
(function () {
  "use strict";

  var AUDIT_URL = "https://n8n.srv1748596.hstgr.cloud/webhook/free-audit";
  var MIN_DWELL = 45e3, MIN_DEPTH = 0.6, WEEK_CAP = 2, CAP_KEY = "station_audit_pop_shows";
  var PAGES = ["/", "/portfolio/", "/portfolio/emails/"];

  var path = location.pathname.replace(/\/+$/, "/");
  if (path === "") path = "/";
  if (PAGES.indexOf(path) < 0) return;

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function track(ev, label) { try { if (window.__rangeTrack) window.__rangeTrack(ev, label); } catch (e) {} }

  if (ls("station_lead_done") === "1") return;

  var loadedAt = Date.now(), shown = false;

  function weekShows() {
    try { return JSON.parse(ls(CAP_KEY) || "[]").filter(function (t) { return t > Date.now() - 7 * 864e5; }); }
    catch (e) { return []; }
  }

  var css = "" +
    ".sa{position:fixed;z-index:205;right:18px;bottom:18px;width:min(360px,calc(100vw - 36px));background:#fff;border-radius:14px;" +
    "box-shadow:0 18px 60px rgba(0,0,0,.22);padding:20px;transform:translateY(16px);opacity:0;transition:all .25s;border:1px solid #E7E4DD}" +
    ".sa.on{transform:none;opacity:1}" +
    ".sa .sa-x{position:absolute;top:8px;right:11px;border:0;background:none;font-size:20px;color:#999;cursor:pointer;line-height:1}" +
    ".sa .sa-k{font:700 10.5px system-ui;letter-spacing:.13em;color:#8A8A8A;margin:0 0 5px}" +
    ".sa h4{margin:0 0 6px;font-size:16px;color:#1D1D1F}" +
    ".sa p{margin:0 0 10px;font-size:12.5px;color:#666;line-height:1.55}" +
    ".sa input{width:100%;padding:9px 11px;border:1px solid #D8D5CE;border-radius:8px;font:13.5px system-ui;margin-bottom:7px;box-sizing:border-box}" +
    ".sa button[type=submit]{width:100%;padding:10px;border:0;border-radius:8px;background:#1D1D1F;color:#fff;font:600 13.5px system-ui;cursor:pointer}" +
    ".sa label{display:flex;gap:7px;align-items:flex-start;margin:7px 0 0;font-size:10.5px;color:#888;cursor:pointer}" +
    ".sa .sa-msg{font-size:12px;margin-top:6px;min-height:14px}" +
    ".sa .sa-msg.ok{color:#1A7F4B}.sa .sa-msg.bad{color:#B33A3A}" +
    ".sa .hpfield{position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden}";

  function show() {
    if (shown || ls("station_lead_done") === "1") return;
    if (weekShows().length >= WEEK_CAP) return;
    if (document.querySelector(".sq") || document.querySelector(".sx")) return;
    var drawer = document.querySelector(".cart");
    if (drawer && drawer.classList.contains("open")) return;
    shown = true;
    lsSet(CAP_KEY, JSON.stringify(weekShows().concat([Date.now()])));

    var st = document.getElementById("sa-style");
    if (!st) { st = document.createElement("style"); st.id = "sa-style"; st.textContent = css; document.head.appendChild(st); }
    var box = document.createElement("div"); box.className = "sa";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Free audit offer");
    box.innerHTML = '<button class="sa-x" aria-label="Close">×</button>' +
      '<p class="sa-k">SINCE YOU\'RE STILL READING</p>' +
      "<h4>Want the free audit of your own setup?</h4>" +
      "<p>Drop your website and we'll run the same audit we sell — what's broken, what it costs you, what to fix first. Free, in your inbox, no call required.</p>" +
      '<form novalidate>' +
      '<div class="hpfield" aria-hidden="true"><input type="text" name="company_url" tabindex="-1" autocomplete="off"></div>' +
      '<input type="url" name="website" placeholder="yourbusiness.com" autocomplete="url" required>' +
      '<input type="email" name="email" placeholder="you@business.com" autocomplete="email" required>' +
      '<button type="submit">Send my free audit</button>' +
      '<label><input type="checkbox" name="email_consent"><span id="audit-pop-consent-text">Email me my audit report. That\'s the email — not a newsletter. Unsubscribe link included anyway.</span></label>' +
      '<p class="sa-msg" role="status"></p></form>';
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.classList.add("on"); });
    track("audit_popup_shown", path);

    box.querySelector(".sa-x").onclick = function () { box.classList.remove("on"); setTimeout(function () { box.remove(); }, 260); };
    var form = box.querySelector("form"), msg = box.querySelector(".sa-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var site = (form.website.value || "").trim(), email = (form.email.value || "").trim();
      if (!/\./.test(site)) { msg.textContent = "What's the website address?"; msg.className = "sa-msg bad"; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "That email doesn't look right."; msg.className = "sa-msg bad"; return; }
      if (!form.email_consent.checked) { msg.textContent = "Tick the box and it's on its way."; msg.className = "sa-msg bad"; return; }
      var fd = new FormData();
      fd.set("email", email);
      fd.set("website", /^https?:\/\//.test(site) ? site : "https://" + site);
      fd.set("business", site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
      fd.set("company_url", form.company_url.value || "");        // honeypot passthrough
      fd.set("minimal", "1");
      fd.set("source", "scroll-popup");
      fd.set("_t", String(loadedAt));                             // absolute epoch: the gate's too-fast check works
      fd.set("email_consent", "yes");
      fd.set("email_consent_version", "email-consent-v1.0.0");
      fd.set("consent_text_email", String(document.getElementById("audit-pop-consent-text").textContent || "").trim());
      fd.set("consent_ts", new Date().toISOString());
      fd.set("consent_url", String(location.href).slice(0, 1000));
      try { fd.set("consent_ua", String(navigator.userAgent || "").slice(0, 600)); } catch (e2) {}
      // no-cors is fire-and-forget: the reply is opaque and unreadable either
      // way, so the only thing to handle is the rejection itself.
      try { fetch(AUDIT_URL, { method: "POST", mode: "no-cors", body: fd, keepalive: true }).catch(function () {}); } catch (err) {}
      lsSet("station_lead_done", "1");
      form.querySelectorAll("input,button").forEach(function (el) { el.disabled = true; });
      msg.textContent = "On its way — audits usually land within the hour.";
      msg.className = "sa-msg ok";
      track("audit_popup_submitted", path);
      setTimeout(function () { box.classList.remove("on"); setTimeout(function () { box.remove(); }, 260); }, 3200);
    });
  }

  var maxDepth = 0;
  window.addEventListener("scroll", function () {
    var doc = document.documentElement;
    var depth = (window.scrollY + window.innerHeight) / Math.max(1, doc.scrollHeight);
    if (depth > maxDepth) maxDepth = depth;
    if (maxDepth >= MIN_DEPTH && Date.now() - loadedAt >= MIN_DWELL) show();
  }, { passive: true });
  setInterval(function () {
    if (maxDepth >= MIN_DEPTH && Date.now() - loadedAt >= MIN_DWELL) show();
  }, 5000);
})();
