/* STATION · the worst-week quiz — 4 questions, one prescription.
 *
 * The homepage promise is "bring your worst week, we'll tell you which SINGLE
 * product fixes the most of it — and if the honest answer is 'none yet', we'll
 * say that too." So this quiz returns exactly one product, never a bundle
 * pitch, and it has a real "none yet" path (very low ticket + nothing hurting
 * → free audit instead of a forced sale).
 *
 * The result is NEVER gated behind the email field. Email is an optional step
 * after the answer is already on screen, consent-first, same record shape as
 * the rest of the site.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://n8n.srv1748596.hstgr.cloud/webhook/cart-abandon";
  var EMAIL_CONSENT_VERSION = "email-consent-v1.0.0";

  function cat(k) { return (window.STATION_CATALOG || []).find(function (p) { return p.k === k; }); }
  function track(ev, label) { try { if (window.__rangeTrack) window.__rangeTrack(ev, label); } catch (e) {} }

  /* ---------- questions ---------- */
  var QS = [
    { id: "pain", q: "What actually hurt this week?",
      a: [
        { t: "Calls we couldn't answer", v: "calls" },
        { t: "Booked jobs that didn't show", v: "noshows" },
        { t: "Competitors outrank us on Google", v: "google" },
        { t: "Quotes that never replied", v: "quotes" },
        { t: "Old customers gone quiet", v: "quiet" },
        { t: "Chasing invoices to get paid", v: "paid" }
      ] },
    { id: "phone", q: "When you can't pick up, what happens to that call?",
      a: [
        { t: "Voicemail — and most don't leave one", v: "vm" },
        { t: "Nothing. It just rings out", v: "nothing" },
        { t: "We call back when we can", v: "callback" },
        { t: "Calls aren't really our channel", v: "nochannel" }
      ] },
    { id: "found", q: "Where do most new customers come from today?",
      a: [
        { t: "Google search / Maps", v: "google" },
        { t: "Word of mouth and referrals", v: "referral" },
        { t: "Social media", v: "social" },
        { t: "Honestly — not sure", v: "unsure" }
      ] },
    { id: "ticket", q: "What's a typical job worth to you?",
      a: [
        { t: "Under $150", v: "s" },
        { t: "$150 – $500", v: "m" },
        { t: "$500 – $2,000", v: "l" },
        { t: "Over $2,000", v: "xl" }
      ] }
  ];

  /* ---------- scoring ---------- */
  // One product wins. Weights favor the pain answer 2:1 — the other questions
  // break ties and catch contradictions (e.g. "missed calls" but phones aren't
  // their channel).
  function prescribe(ans) {
    var s = { lineback: 0, frontdesk: 0, slate: 0, pursuit: 0, revive: 0, map: 0, repute: 0, tap: 0, greet: 0, storefront: 0 };
    var why = [];

    switch (ans.pain) {
      case "calls":  s.lineback += 4; s.frontdesk += 3; why.push("missed calls are the wound"); break;
      case "noshows": s.slate += 4; why.push("no-shows are the wound"); break;
      case "google": s.map += 4; s.repute += 2; why.push("Google visibility is the wound"); break;
      case "quotes": s.pursuit += 4; why.push("un-chased quotes are the wound"); break;
      case "quiet":  s.revive += 4; why.push("a dormant list is the wound"); break;
      case "paid":   s.tap += 4; why.push("slow payment is the wound"); break;
    }
    switch (ans.phone) {
      case "vm": case "nothing": s.lineback += 2; s.frontdesk += 1; break;
      case "callback": s.frontdesk += 1; break;
      case "nochannel": s.lineback -= 3; s.frontdesk -= 3; s.greet += 2; break;
    }
    switch (ans.found) {
      case "google": s.map += 1; s.repute += 1; break;
      case "referral": s.repute += 2; break;
      case "social": s.greet += 1; break;
      case "unsure": s.map += 1; break;
    }
    // big-ticket businesses bleed more per miss — phone products scale up;
    // tiny tickets make an AI receptionist hard to justify
    if (ans.ticket === "xl") { s.frontdesk += 2; s.pursuit += 1; }
    if (ans.ticket === "l") { s.frontdesk += 1; }
    if (ans.ticket === "s") { s.frontdesk -= 2; }

    var ranked = Object.keys(s).sort(function (a, b) { return s[b] - s[a]; });
    var top = ranked[0];
    // the honest "none yet" path
    if (s[top] < 3) return { none: true };
    return { k: top, runner: ranked[1], why: why[0] || "" };
  }

  /* ---------- UI ---------- */
  var css = "" +
    ".sq-scrim{position:fixed;inset:0;background:rgba(20,20,22,.45);z-index:200;opacity:0;transition:opacity .2s}" +
    ".sq-scrim.on{opacity:1}" +
    ".sq{position:fixed;z-index:201;left:50%;top:50%;transform:translate(-50%,-46%) scale(.97);opacity:0;transition:all .22s;" +
    "width:min(520px,calc(100vw - 32px));background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.25);padding:26px 26px 22px}" +
    ".sq.on{transform:translate(-50%,-50%) scale(1);opacity:1}" +
    ".sq .sq-x{position:absolute;top:12px;right:14px;border:0;background:none;font-size:22px;color:#999;cursor:pointer;line-height:1}" +
    ".sq .sq-k{font:700 11px system-ui;letter-spacing:.13em;color:#8A8A8A;margin:0 0 6px}" +
    ".sq h3{margin:0 0 16px;font-size:19px;color:#1D1D1F}" +
    ".sq .sq-a{display:grid;gap:8px}" +
    ".sq .sq-a button{display:block;width:100%;text-align:left;padding:12px 14px;border:1px solid #DDD9D0;border-radius:10px;" +
    "background:#FAF9F7;font:500 14px system-ui;color:#1D1D1F;cursor:pointer}" +
    ".sq .sq-a button:hover{border-color:#1D1D1F}" +
    ".sq .sq-dots{display:flex;gap:5px;margin-top:16px}" +
    ".sq .sq-dots i{width:22px;height:3px;border-radius:2px;background:#E4E1DA}" +
    ".sq .sq-dots i.on{background:#1D1D1F}" +
    ".sq .sq-res b.nm{font-size:21px}" +
    ".sq .sq-price{color:#555;font-size:13.5px;margin:2px 0 12px}" +
    ".sq .sq-cta{display:flex;gap:9px;flex-wrap:wrap;margin:14px 0 4px}" +
    ".sq .sq-cta a,.sq .sq-cta button{padding:11px 16px;border-radius:9px;font:600 13.5px system-ui;cursor:pointer;text-decoration:none}" +
    ".sq .sq-buy{background:#1D1D1F;color:#fff;border:0}" +
    ".sq .sq-see{background:none;border:1px solid #DDD9D0;color:#1D1D1F}" +
    ".sq .sq-mail{margin-top:16px;padding-top:14px;border-top:1px solid #EEEBE4}" +
    ".sq .sq-mail p{margin:0 0 8px;font-size:12.5px;color:#666}" +
    ".sq .sq-mail .row{display:flex;gap:8px}" +
    ".sq .sq-mail input[type=email]{flex:1;min-width:0;padding:10px 12px;border:1px solid #D8D5CE;border-radius:8px;font:14px system-ui}" +
    ".sq .sq-mail label{display:flex;gap:7px;align-items:flex-start;margin-top:8px;font-size:11px;color:#888;cursor:pointer}" +
    ".sq .sq-msg{font-size:12px;margin-top:6px;min-height:14px}" +
    ".sq .sq-msg.ok{color:#1A7F4B}.sq .sq-msg.bad{color:#B33A3A}";

  var scrim, box, ans = {}, step = 0;

  function close() {
    if (scrim) { scrim.classList.remove("on"); box.classList.remove("on"); }
    setTimeout(function () { if (scrim) { scrim.remove(); box.remove(); scrim = box = null; } }, 240);
  }

  function dots() {
    var h = '<div class="sq-dots">';
    for (var i = 0; i < QS.length; i++) h += '<i class="' + (i <= step ? "on" : "") + '"></i>';
    return h + "</div>";
  }

  function renderQ() {
    var q = QS[step];
    box.innerHTML = '<button class="sq-x" aria-label="Close">×</button>' +
      '<p class="sq-k">THE 60-SECOND DIAGNOSIS · ' + (step + 1) + " OF " + QS.length + "</p>" +
      "<h3>" + q.q + "</h3>" +
      '<div class="sq-a">' + q.a.map(function (o) {
        return '<button data-v="' + o.v + '">' + o.t + "</button>";
      }).join("") + "</div>" + dots();
    box.querySelector(".sq-x").onclick = close;
    box.querySelectorAll(".sq-a button").forEach(function (b) {
      b.onclick = function () {
        ans[q.id] = b.getAttribute("data-v");
        step++;
        if (step < QS.length) renderQ(); else renderResult();
      };
    });
  }

  function renderResult() {
    var r = prescribe(ans);
    track("quiz_completed", r.none ? "none" : r.k);
    if (r.none) {
      box.innerHTML = '<button class="sq-x" aria-label="Close">×</button>' +
        '<p class="sq-k">THE HONEST ANSWER</p>' +
        "<h3>None yet — and we said we'd tell you.</h3>" +
        '<p style="font-size:14px;color:#555;line-height:1.6">Nothing you told us points at one product hard enough to be worth your money this month. ' +
        "The free audit looks at your actual web presence and phone setup and names the first real gap — no purchase attached.</p>" +
        '<div class="sq-cta"><a class="sq-buy" href="/station-pages/audit/">Get the free audit</a>' +
        '<a class="sq-see" href="/station-pages/book/">Book a 15-min call</a></div>';
      box.querySelector(".sq-x").onclick = close;
      return;
    }
    var p = cat(r.k) || { n: r.k, sub: "", pricelab: "", mo: 0 };
    var day = p.mo ? "$" + (p.mo / 30.4).toFixed(2) + " a day" : "";
    box.innerHTML = '<button class="sq-x" aria-label="Close">×</button>' +
      '<p class="sq-k">YOUR ONE-PRODUCT PRESCRIPTION</p>' +
      '<div class="sq-res"><b class="nm">' + p.n + "</b> — " + p.sub +
      '<p class="sq-price">' + p.pricelab + (day ? " · " + day : "") + " · month-to-month, 7-day free trial</p>" +
      '<p style="font-size:14px;color:#555;line-height:1.6;margin:0">Because ' + (r.why || "of what you told us") +
      ", this is the single product that fixes the most of it. Start here; add nothing else until it pays for itself.</p></div>" +
      '<div class="sq-cta"><button class="sq-buy" data-add="' + r.k + '">Add to cart — price held 24h</button>' +
      '<a class="sq-see" href="/station-pages/' + r.k.replace("_", "-") + '/">See how it works</a></div>' +
      '<div class="sq-mail"><p>Want this prescription in writing? We\'ll email it — nothing else.</p>' +
      '<form class="row" novalidate><input type="email" placeholder="you@business.com" autocomplete="email">' +
      '<button class="sq-buy" type="submit" style="padding:10px 14px">Send</button></form>' +
      '<label><input type="checkbox"><span id="quiz-email-consent-text">Email me this recommendation. One email, no list — unsubscribe link included anyway.</span></label>' +
      '<p class="sq-msg" role="status"></p></div>';
    box.querySelector(".sq-x").onclick = close;
    // data-add is handled by v5.js's global click handler — the cart just works
    box.querySelector(".sq-buy[data-add]").addEventListener("click", function () {
      track("quiz_add_to_cart", r.k); setTimeout(close, 450);
    });
    var form = box.querySelector("form"), msg = box.querySelector(".sq-msg"),
        em = form.querySelector("input[type=email]"), ck = box.querySelector('label input[type=checkbox]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (em.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "That email doesn't look right."; msg.className = "sq-msg bad"; return; }
      if (!ck.checked) { msg.textContent = "Tick the box and it's on its way."; msg.className = "sq-msg bad"; return; }
      msg.textContent = "Sending…"; msg.className = "sq-msg";
      fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quiz_lead", email: email, product: r.k, answers: ans,
          email_consent: "yes", email_consent_version: EMAIL_CONSENT_VERSION,
          consent_text_email: String(document.getElementById("quiz-email-consent-text").textContent || "").trim(),
          consent_ts: new Date().toISOString(), consent_url: String(location.href).slice(0, 1000),
          consent_ua: String(navigator.userAgent || "").slice(0, 600)
        }), keepalive: true })
      .then(function (x) { return x.ok ? x.json() : {}; })
      .then(function () { msg.textContent = "Done — check your inbox."; msg.className = "sq-msg ok"; track("quiz_email_captured", r.k); })
      .catch(function () { msg.textContent = "Couldn't send just now — the prescription is on screen though."; msg.className = "sq-msg bad"; });
    });
  }

  function open() {
    if (box) return;
    ans = {}; step = 0;
    var st = document.getElementById("sq-style");
    if (!st) { st = document.createElement("style"); st.id = "sq-style"; st.textContent = css; document.head.appendChild(st); }
    scrim = document.createElement("div"); scrim.className = "sq-scrim"; scrim.onclick = close;
    box = document.createElement("div"); box.className = "sq"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    document.body.appendChild(scrim); document.body.appendChild(box);
    requestAnimationFrame(function () { scrim.classList.add("on"); box.classList.add("on"); });
    renderQ();
    track("quiz_opened", location.pathname);
  }

  window.STATION_QUIZ = { open: open };
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-quiz]");
    if (t) { e.preventDefault(); open(); }
  });
})();
