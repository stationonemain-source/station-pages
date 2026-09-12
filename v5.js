/* STATION v5 runtime · round 3 — cart, shimmer, upgraded demos, FAQ, mobile nav */
(function () {
  "use strict";
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var f$ = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  function ready(fn){ if(document.readyState!=="loading") fn(); else document.addEventListener("DOMContentLoaded",fn); }

  /* ---------- ref capture -> stripe ---------- */
  var REF = null;
  var AFF_PUB = "stnpub-84cc5c8bdf9168da20e4923921d8743c";
  try {
    var q = new URLSearchParams(location.search);
    var fresh = (q.get("ref") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
    // 30 days, to match what the Scout is told their link is worth. sessionStorage died
    // with the tab, so a visitor who came back later counted for nobody.
    var TTL = 30 * 86400000;
    if (fresh) {
      REF = fresh;
      try { localStorage.setItem("station_ref", fresh);
            localStorage.setItem("station_ref_ts", String(Date.now())); } catch (e) {}
    } else {
      try {
        var saved = localStorage.getItem("station_ref");
        var ts = Number(localStorage.getItem("station_ref_ts") || 0);
        if (saved && ts && (Date.now() - ts) < TTL) REF = saved;
        else if (saved) { localStorage.removeItem("station_ref"); localStorage.removeItem("station_ref_ts"); }
      } catch (e) {}
    }
    if (REF) sessionStorage.setItem("station_ref", REF);   // kept: checkout still reads this
  } catch (e) {}
  // Count the visit itself. Once per tab, so a reload does not inflate the number.
  try {
    if (REF && !sessionStorage.getItem("station_ref_pinged")) {
      sessionStorage.setItem("station_ref_pinged", "1");
      var _p = JSON.stringify({ action: "attribute", pub: AFF_PUB, code: REF,
                                kind: "visit", label: location.pathname.slice(0, 60) });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("https://n8n.srv1748596.hstgr.cloud/webhook/station-affiliates",
                             new Blob([_p], { type: "application/json" }));
      } else {
        fetch("https://n8n.srv1748596.hstgr.cloud/webhook/station-affiliates",
              { method: "POST", mode: "no-cors",
                headers: { "Content-Type": "application/json" }, body: _p });
      }
    }
  } catch (e) {}
  function stripeUrl(u){
    if (REF && u && u.indexOf("client_reference_id") === -1)
      return u + (u.indexOf("?") > -1 ? "&" : "?") + "client_reference_id=" + encodeURIComponent(REF);
    return u;
  }
  ready(function () {
    document.querySelectorAll('a[href*="buy.stripe.com"]').forEach(function (a) {
      a.href = stripeUrl(a.getAttribute("href")); a.target = "_blank"; a.rel = "noopener";
    });
  });

  /* ---------- reveals ---------- */
  ready(function () {
    var els = document.querySelectorAll(".rv");
    if (!("IntersectionObserver" in window) || RM) { els.forEach(function (e) { e.classList.add("on"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("on"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach(function (e) { io.observe(e); });
  });

  /* ---------- catalog (shared by cart + configurator) ---------- */
  var CATALOG = window.STATION_CATALOG || [];
  function prod(k){ return CATALOG.find(function(p){ return p.k === k; }); }

  /* ---------- CART ---------- */
  function cartGet(){ try { return JSON.parse(localStorage.getItem("station_cart") || "[]"); } catch(e){ return []; } }
  function cartSet(c){ try { localStorage.setItem("station_cart", JSON.stringify(c)); } catch(e){} renderCartBadge(); renderCartBody(); }
  function cartAdd(k){ var c = cartGet(); if (c.indexOf(k) === -1) c.push(k); cartSet(c); openCart(); }
  function cartRemove(k){ cartSet(cartGet().filter(function(x){ return x !== k; })); }
  function renderCartBadge(){
    var n = cartGet().length;
    document.querySelectorAll(".cartbtn .n").forEach(function(b){
      b.textContent = n; b.classList.toggle("on", n > 0);
    });
    document.querySelectorAll(".addcart[data-add]").forEach(function(b){
      var inCart = cartGet().indexOf(b.getAttribute("data-add")) > -1;
      b.classList.toggle("in", inCart);
      /* The shelf's compact + carries its glyph in CSS (a plus that becomes a tick), so
         writing a label into it would blow the icon away on every badge render. It gets
         an accessible name instead — it has no visible text to read. */
      if (b.classList.contains("qadd")){
        var nm = b.getAttribute("data-name") || "";
        b.setAttribute("aria-label", (inCart ? "In cart: " : "Add to cart: ") + nm);
        return;
      }
      b.textContent = inCart ? "In cart ✓" : (b.getAttribute("data-label") || "Add to cart");
    });
  }
  var drawer, scrim;
  function openCart(){ if (drawer){ drawer.classList.add("open"); scrim.classList.add("open"); } }
  function closeCart(){ if (drawer){ drawer.classList.remove("open"); scrim.classList.remove("open"); } }
  function renderCartBody(){
    if (!drawer) return;
    var body = drawer.querySelector(".c-body"), foot = drawer.querySelector(".c-foot");
    var c = cartGet();
    if (!c.length){
      body.innerHTML = '<div class="c-empty">Your cart is empty.<br>Every product page has an Add-to-cart.</div>';
      foot.style.display = "none"; return;
    }
    foot.style.display = "";
    var mo = 0, once = 0, allTrial = true;
    body.innerHTML = c.map(function(k){
      var p = prod(k); if (!p) return "";
      mo += p.mo || 0; once += p.once || 0;
      var tr = p.mo > 0 && !(p.once > 0) && p.k !== "storefront";
      if (!tr) allTrial = false;
      return '<div class="c-item">' + (p.img ? '<img src="' + p.img + '" alt="">' : "") +
        '<div class="ci-m"><div class="ci-n">' + p.n + '</div><div class="ci-s">' + p.sub + '</div>' +
        '<div class="ci-p">' + p.pricelab + ' · live ' + p.ttl + (tr ? ' · <span class="ci-tr">7-day free trial</span>' : '') + '</div></div>' +
        '<button class="ci-x" data-rm="' + k + '" aria-label="Remove ' + p.n + '">×</button></div>';
    }).join("");
    var rows = drawer.querySelector(".c-rows");
    rows.innerHTML = '<div class="c-row"><span>Per month</span><b>' + f$(mo) + '/mo</b></div>' +
      (once ? '<div class="c-row"><span>One-time (builds &amp; setups)</span><b>' + f$(once) + '</b></div>' : '') +
      (allTrial && c.length ? '<div class="c-row tr"><span>Due today</span><b>$0 — 7-day free trial</b></div>' : '');
    drawer.querySelector(".c-nudge").classList.toggle("on", mo >= 800);
  }
  ready(function () {
    scrim = document.createElement("div"); scrim.className = "cart-scrim"; scrim.addEventListener("click", closeCart);
    drawer = document.createElement("aside"); drawer.className = "cart";
    drawer.innerHTML = '<div class="c-h"><b>Your cart</b><button class="c-x" aria-label="Close">×</button></div>' +
      '<div class="c-body"></div>' +
      '<div class="c-foot"><div class="c-rows"></div>' +
      '<div class="c-nudge"><b>This stack is bundle territory.</b> A line pass covers it for less — <a href="/station-pages/#bundles" style="color:inherit;font-weight:700">see the bundles</a>.</div>' +
      '<a class="btn dark c-go" href="/station-pages/checkout/">Continue to checkout →</a>' +
      '<p class="c-note">One secure Stripe payment for the whole cart. Subscriptions stay month-to-month and cancel any time — billing starts when your products are verified live.</p></div>';
    document.body.appendChild(scrim); document.body.appendChild(drawer);
    drawer.querySelector(".c-x").addEventListener("click", closeCart);
    drawer.addEventListener("click", function(e){
      var rm = e.target.getAttribute && e.target.getAttribute("data-rm");
      if (rm) cartRemove(rm);
    });
    document.addEventListener("click", function(e){
      var add = e.target.closest && e.target.closest("[data-add]");
      if (add){ e.preventDefault(); cartAdd(add.getAttribute("data-add")); return; }
      /* Buy-now used to be a raw buy.stripe.com payment link sitting next to Add to
         cart — a second, separate Stripe configuration for the same product. They had
         already drifted: six products advertise "free for 7 days" and the payment link
         billed immediately at full price, and storefront/map links missed their second
         price. One path now, so they cannot diverge again. */
      /* Bundles are a single Stripe price that grants many products, so they skip the
         cart and open a session directly. Their old buy.stripe.com links had been
         DEACTIVATED in Stripe - every bundle button led to "this link is no longer
         active", which is every bundle sale lost. */
      var bun = e.target.closest && e.target.closest("[data-bundle]");
      if (bun){
        e.preventDefault();
        var was = bun.textContent;
        bun.disabled = true; bun.textContent = "Building your secure checkout…";
        var bref = null; try { bref = sessionStorage.getItem("station_ref"); } catch (x) {}
        fetch("https://n8n.srv1748596.hstgr.cloud/webhook/cart-checkout", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prices: [bun.getAttribute("data-bundle")],
            has_recurring: true, has_onetime: false, trial: false, ref: bref || undefined })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.url) { location.href = d.url; }
          else { bun.disabled = false; bun.textContent = "Try again — " + was; }
        }).catch(function () { bun.disabled = false; bun.textContent = "Try again — " + was; });
        return;
      }
      var buy = e.target.closest && e.target.closest("[data-buynow]");
      if (buy){
        e.preventDefault();
        var k = buy.getAttribute("data-buynow"), c = cartGet();
        if (c.indexOf(k) === -1) { c.push(k); cartSet(c); }
        location.href = "/checkout/";
        return;
      }
      var cb = e.target.closest && e.target.closest(".cartbtn");
      if (cb){ e.preventDefault(); renderCartBody(); openCart(); }
    });
    renderCartBadge(); renderCartBody();
  });

  /* ---------- mobile nav sheet ---------- */
  ready(function () {
    var h = document.querySelector(".hamb"); if (!h) return;
    var sheet = document.createElement("div"); sheet.className = "msheet";
    sheet.innerHTML = '<a href="/station-pages/#shop">Shop all products</a><a href="/station-pages/frontdesk/">Frontdesk</a>' +
      '<a href="/station-pages/storefront/">Storefront</a><a href="/station-pages/#bundles">Bundles</a><a href="/station-pages/audit/">Free audit</a>' +
      '<a href="/station-pages/book/">Book a call</a><a href="/station-pages/#help">Build your line</a>';
    document.body.appendChild(sheet);
    h.addEventListener("click", function(e){ e.stopPropagation(); sheet.classList.toggle("open"); });
    document.addEventListener("click", function(){ sheet.classList.remove("open"); });
  });

  /* ---------- shimmer — RETIRED 2026-08-31 ----------
     Kept as history: the sweep's lightest stop is the text colour of whatever glyphs
     sit under it. Round one peaked at #EFC26A (1.52:1 on the page) and washed the
     headline out; round two re-peaked on --accent #8A5A00 (5.39:1 at the crest) and
     STILL measured 2.84:1 live, because the band's shoulders pass through lighter
     interpolations on every sweep. Two failed tunings on the first line every visitor
     reads is enough evidence: the effect is structurally at war with contrast. The h1
     now renders flat ink from v5.css and this block only cleans up any inline state
     an old cached stylesheet might have left. */
  ready(function () {
    var el = document.querySelector(".shimmer"); if (!el) return;
    el.style.backgroundImage = "none";
    el.style.webkitTextFillColor = "";
    el.style.color = "";
  });

  /* ---------- pp sticky bar — replaces the global nav while it's on ---------- */
  ready(function () {
    var b = document.getElementById("ppBar"); if (!b) return;
    addEventListener("scroll", function () {
      var on = scrollY > 520;
      b.classList.toggle("on", on);
      document.body.classList.toggle("ppbar", on);
    }, { passive: true });
  });

  /* ---------- calculator (unchanged contract) ---------- */
  ready(function () {
    var C = window.CALC, host = document.getElementById("calc");
    if (!C || !host) return;
    var sl = host.querySelector(".sliders");
    C.sliders.forEach(function (s) {
      var d = document.createElement("div"); d.className = "srow";
      d.innerHTML = '<label>' + s.label + ' <output id="o_' + s.id + '"></output></label>' +
        '<input type="range" id="s_' + s.id + '" min="' + s.min + '" max="' + s.max + '" step="' + (s.step || 1) + '" value="' + s.val + '">';
      sl.appendChild(d);
    });
    var lossEl = document.getElementById("calcLoss"), verEl = document.getElementById("calcVerdict");
    function run() {
      var vals = {};
      C.sliders.forEach(function (s) {
        var el = document.getElementById("s_" + s.id); vals[s.id] = +el.value;
        document.getElementById("o_" + s.id).textContent = (s.fmt ? s.fmt(+el.value) : el.value);
      });
      var r = C.compute(vals);
      lossEl.textContent = f$(r.loss) + "/mo";
      if (r.loss >= C.price * (C.clearAt || 2)) { verEl.className = "verdict yes";
        verEl.innerHTML = "<b>The math clears easily.</b> You're losing " + f$(r.loss) + " a month; this costs " + f$(C.price) + ". Keeping the problem is the expensive option.";
      } else if (r.loss >= C.price) { verEl.className = "verdict yes";
        verEl.innerHTML = "<b>It pays for itself.</b> " + f$(r.loss) + " lost vs " + f$(C.price) + " — tight but positive. Start on Standard and watch the first month's report.";
      } else { verEl.className = "verdict no";
        verEl.innerHTML = "<b>Honestly? Keep your money for now.</b> At your numbers this loses less than it costs. " + (C.refer || "");
      }
    }
    host.addEventListener("input", run); run();
  });

  /* ---------- configurator ---------- */
  ready(function () {
    var tilesEl = document.getElementById("tiles"); if (!tilesEl || !CATALOG.length) return;
    var on = {}, TICKET = 425;
    var PAIN = { calls: ["lineback","frontdesk","dial","pursuit"], noshows: ["slate","frontdesk","pursuit"],
      reviews: ["repute","map"], invisible: ["map","storefront","marquee","repute"],
      quiet: ["revive","dispatch","pursuit"], slow: ["radar","dispatch","marquee"] };
    var order = CATALOG.map(function (p) { return p.k; });
    function render() {
      tilesEl.innerHTML = "";
      order.forEach(function (k) {
        var p = prod(k); if (!p) return;
        var l = document.createElement("label");
        l.className = "tile" + (on[k] ? " on" : "");
        l.innerHTML = '<span class="t-hit"><input type="checkbox" data-k="' + k + '"' + (on[k] ? " checked" : "") + '>' +
          '<span><span class="t-name">' + p.n + '</span><br><span class="t-sub">' + p.sub + '</span></span>' +
          '<span class="t-price">' + p.pricelab + '<span class="t-ttl">' + p.ttl + ' · <a href="/station-pages/' + p.k + '/" style="color:inherit;text-decoration:underline">learn</a></span></span></span>';
        tilesEl.appendChild(l);
      });
    }
    function recalc() {
      var mo = 0, once = 0, names = [], count = 0;
      CATALOG.forEach(function (p) {
        if (!on[p.k]) return; count++;
        var m = p.mo;
        if (p.k === "slate" && on.frontdesk) m = 0;
        mo += m; once += (p.once || 0);
        names.push({ n: p.n, m: m, o: p.once || 0, inc: (p.k === "slate" && on.frontdesk) });
      });
      document.getElementById("rTotal").innerHTML = f$(mo) + '<small>/month</small>';
      document.getElementById("rDay").textContent = "$" + (mo / 30.4).toFixed(2);
      document.getElementById("rJobs").textContent = mo ? (mo / TICKET).toFixed(1) : "0";
      document.getElementById("rOnce").textContent = f$(once);
      var rows = document.getElementById("rRows");
      rows.innerHTML = count ? names.map(function (x) {
        return '<div class="r-row"><span>' + x.n + (x.inc ? ' <span class="inc">included</span>' : "") + '</span><b>' +
          (x.inc ? "$0" : (x.m ? f$(x.m) : f$(x.o) + " once")) + "</b></div>";
      }).join("") : '<div class="r-row"><span style="color:var(--faint)">Nothing yet — tick a product.</span></div>';
      var v = document.getElementById("rVerdict"), hit = false, t;
      if (!count) t = "Pick the one that fixes what hurt this week.";
      else if (mo >= 800) { hit = true; t = "<b>Bundle territory:</b> a line pass covers this for less. <a href='#bundles' style='color:inherit;font-weight:700'>See the bundles ↓</a>"; }
      else t = f$(mo) + "/mo is " + (mo / TICKET).toFixed(1) + " average jobs. Everything after that is yours.";
      v.className = "r-verdict" + (hit ? " hit" : ""); v.innerHTML = t;
      /* The shelf priced a line up and then offered no way to buy it - the visitor had
         to go find each product again. Hand the ticked keys straight to the cart. */
      var buy = document.getElementById("rBuy");
      if (buy) {
        buy.hidden = !count;
        buy.textContent = count === 1 ? "Continue with this →"
                                      : "Continue with these " + count + " →";
      }
    }
    var rBuy = document.getElementById("rBuy");
    if (rBuy) rBuy.addEventListener("click", function () {
      var picked = CATALOG.filter(function (p) { return on[p.k]; })
                          .map(function (p) { return p.k; });
      if (!picked.length) return;
      try { localStorage.setItem("station_cart", JSON.stringify(picked)); } catch (e) {}
      location.href = "/checkout/";
    });
    tilesEl.addEventListener("change", function (e) {
      var k = e.target.getAttribute("data-k"); if (!k) return;
      on[k] = e.target.checked; e.target.closest(".tile").classList.toggle("on", e.target.checked); recalc();
    });
    document.querySelectorAll(".q-chip[data-pain]").forEach(function (c) {
      c.addEventListener("click", function () {
        document.querySelectorAll(".q-chip[data-pain]").forEach(function (x) { x.classList.remove("on"); });
        c.classList.add("on");
        var pref = PAIN[c.getAttribute("data-pain")] || [];
        order = pref.concat(CATALOG.map(function (p) { return p.k; }).filter(function (k) { return pref.indexOf(k) === -1; }));
        render();
        Object.keys(on).forEach(function (k) {
          var el = tilesEl.querySelector('input[data-k="' + k + '"]');
          if (el) { el.checked = !!on[k]; el.closest(".tile").classList.toggle("on", !!on[k]); }
        });
        var first = pref[0];
        if (first && !on[first]) { var el2 = tilesEl.querySelector('input[data-k="' + first + '"]'); if (el2) { el2.checked = true; on[first] = true; el2.closest(".tile").classList.add("on"); } }
        recalc();
      });
    });
    render(); recalc();
  });

  /* ---------- FAQ tabs ---------- */
  ready(function () {
    var host = document.getElementById("faq"); if (!host || !window.STATION_FAQ) return;
    var cats = Object.keys(window.STATION_FAQ);
    var tabs = host.querySelector(".faq-tabs"), list = host.querySelector(".faq-list");
    function show(cat){
      tabs.querySelectorAll(".faq-tab").forEach(function(t){ t.classList.toggle("on", t.getAttribute("data-cat") === cat); });
      list.innerHTML = window.STATION_FAQ[cat].map(function(f){
        return '<div class="faq-item"><button class="faq-q" type="button"><span>' + f[0] + '</span><span class="pl">+</span></button>' +
          '<div class="faq-a"><p>' + f[1] + '</p></div></div>';
      }).join("");
    }
    cats.forEach(function(c, i){
      var b = document.createElement("button"); b.type = "button";
      b.className = "faq-tab" + (i === 0 ? " on" : ""); b.setAttribute("data-cat", c); b.textContent = c;
      b.addEventListener("click", function(){ show(c); });
      tabs.appendChild(b);
    });
    list.addEventListener("click", function(e){
      var q = e.target.closest(".faq-q"); if (!q) return;
      q.parentElement.classList.toggle("open");
    });
    show(cats[0]);
  });

  /* ---------- forms (n8n contract) + ?biz= prefill ---------- */
  var AUDIT_URL = "https://n8n.srv1748596.hstgr.cloud/webhook/free-audit";
  var AFF_URL = "https://n8n.srv1748596.hstgr.cloud/webhook/station-affiliates";
  ready(function () {
    try {
      var biz = new URLSearchParams(location.search).get("biz");
      if (biz) document.querySelectorAll('form[data-audit] input[name="business"]').forEach(function(i){ i.value = biz; });
    } catch(e){}
    var t0 = Date.now();
    document.querySelectorAll("form[data-audit]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!form.reportValidity()) return;
        var fd = new FormData(form);
        fd.set("_t", String(Date.now() - t0));
        try { fetch(AUDIT_URL, { method: "POST", mode: "no-cors", body: fd }); } catch (err) {}
        try {
          if (navigator.sendBeacon && REF) {
            navigator.sendBeacon(AFF_URL, new Blob([JSON.stringify({
              action: "attribute", pub: AFF_PUB, code: REF, kind: "audit-submit",
              label: "v5-" + (form.getAttribute("data-variant") || "form")
            })], { type: "application/json" }));
            // and register the actual lead, so the Scout's Leads count moves too
            var _em = (fd.get("email") || "").toString().trim();
            if (_em) {
              navigator.sendBeacon("https://n8n.srv1748596.hstgr.cloud/webhook/station-affiliates",
                new Blob([JSON.stringify({ action: "leadref", pub: AFF_PUB, code: REF, email: _em,
                  name: (fd.get("name") || fd.get("business") || "").toString().trim(),
                  phone: (fd.get("phone") || "").toString().trim() })],
                  { type: "application/json" }));
            }
          }
        } catch (err) {}
        form.querySelectorAll("input,textarea,button,select").forEach(function (el) { el.disabled = true; });
        var done = form.querySelector(".af-done"); if (done) done.hidden = false;
        try { localStorage.setItem("station_lead_done", "1"); } catch (e2) {}
      });
    });
  });

  /* ================= DEMOS ================= */


  ready(function () {

    /* REPUTE — Google-review composer + sentiment engine with common sense */
    var grev = document.querySelector(".grev");
    if (grev) {
      var stars = 0;
      var starBtns = grev.querySelectorAll("#grStars button");
      function paintStars(){ starBtns.forEach(function(b){ b.classList.toggle("on", +b.getAttribute("data-star") <= stars); }); }
      starBtns.forEach(function(b){
        b.addEventListener("click", function(){ stars = +b.getAttribute("data-star"); paintStars(); });
      });
      grev.querySelector("[data-rep-run]").addEventListener("click", function () {
        var txt = (document.getElementById("repDemoIn").value || "").trim();
        var tone = (grev.querySelector('input[name="repTone"]:checked') || {}).value || "warm";
        var out = document.getElementById("repDemoOut"), outT = out.querySelector(".gr-rt");
        if (!txt && !stars) { out.hidden = false; outT.textContent = "Tap a star rating or write a line first — good or bad, any review."; return; }
        var s = " " + txt.toLowerCase().replace(/[^a-z0-9$' ]/g, " ") + " ";
        function hits(list){ return list.filter(function(w){ return s.indexOf(" " + w) > -1 || s.indexOf(w + " ") > -1 || s.indexOf(w) > -1; }).length; }
        /* profanity is ALWAYS a negative signal, no matter what surrounds it */
        var PROF = ["fuck","fucking","fucked","shit","shitty","bullshit","ass","asshole","bitch","damn","dammit","crap","crappy","wtf","pissed","piss","sucks","suck","garbage","trash","hell"];
        var NEG = ["terrible","awful","bad","worst","rude","never again","slow","dirty","broken","refund","scam","scammed","horrible","poor","overpriced","disappoint","disappointed","disappointing","unprofessional","no show","noshow","damage","damaged","waste","wasted","avoid","don't use","dont use","mess","wrong","cancel","cancelled","late","ripoff","rip off","rip-off","liar","lied","lies","dishonest","incompetent","useless","joke","regret","stay away","not worth","never coming","won't be back","wont be back","unacceptable","ignored","ghosted","hung up","attitude","sloppy","lazy","overcharged","hidden fee","upsell","pressure","angry","furious","upset","frustrated"];
        var POS = ["great","amazing","excellent","fantastic","love","loved","perfect","awesome","best","professional","friendly","fast","quick","clean","recommend","recommended","wonderful","happy","thank","thanks","incredible","fair","honest","on time","early","polite","courteous","helpful","lifesaver","impressed","fantastic","five stars","5 stars","superb","outstanding","top notch","reasonable","affordable","went above","above and beyond"];
        var NEGATORS = ["not","no","never","hardly","barely","wasn't","wasnt","isn't","isnt","won't","wont"];
        var prof = hits(PROF), neg = hits(NEG), pos = hits(POS);
        /* "not great", "never recommend" — flip cheap positives that sit next to a negator */
        POS.forEach(function(w){
          NEGATORS.forEach(function(nw){ if (s.indexOf(nw + " " + w) > -1) { pos = Math.max(0, pos - 1); neg++; } });
        });
        var score = pos - neg - prof * 2;
        var mood; /* profanity or a net-negative text always wins over the stars */
        if (prof > 0 || score < 0) mood = "neg";
        else if (stars && stars <= 2) mood = "neg";
        else if (stars === 3 || (neg > 0 && pos > 0)) mood = "mixed";
        else if (score > 0 || stars >= 4) mood = "pos";
        else mood = stars ? (stars >= 4 ? "pos" : "mixed") : "mixed";
        var topic = "";
        var topics = { "wait|late|slow|no show|noshow|took forever|hours": "the wait", "price|overpriced|charge|expensive|fee|\\$|cost": "the pricing",
          "rude|unprofessional|attitude|disrespect": "how you were treated", "dirty|mess|damage|stain": "the state we left things in",
          "broken|wrong|fix|redo|leak|fail|didn't work|didnt work|doesn't work|doesnt work|not work": "the work itself",
          "call|phone|answer|response|ignored|ghosted|voicemail": "how hard we were to reach" };
        for (var pat in topics) { if (new RegExp(pat).test(s)) { topic = topics[pat]; break; } }
        var starRef = stars ? (stars <= 2 ? "A " + stars + "-star review stings, and it should — " : "") : "";
        var r;
        if (mood === "neg") {
          r = (tone === "warm")
            ? "Hi there — " + (starRef ? starRef.charAt(0).toLowerCase() + starRef.slice(1) : "") + "thank you for being straight with us" + (topic ? " about " + topic : "") + ". You're clearly frustrated, and reading this, I get why. That's not the standard we run this shop on and I won't make excuses for it. I'd like to fix it personally — call and ask for the owner, and we'll make it right this week."
            : "Thank you for the candid feedback" + (topic ? " regarding " + topic : "") + ". " + (starRef || "") + "This experience falls short of our standard and we take it seriously. Please contact us directly so the owner can resolve it promptly.";
        } else if (mood === "mixed") {
          r = "Thank you for the honest review — glad the good parts landed, and we hear you" + (topic ? " on " + topic : " on the rest") + ". We're on it, and we'd love another shot at all five stars.";
        } else {
          r = (tone === "warm")
            ? "Thank you" + (stars === 5 ? " — five stars genuinely made our week." : " — this genuinely made our week.") + " It was a pleasure doing the work, and we're a call away whenever you need us again."
            : "Thank you for the kind words and for trusting us with the work. We appreciate the review and look forward to serving you again.";
        }
        out.hidden = false; outT.textContent = ""; var i = 0;
        var iv = setInterval(function () { outT.textContent = r.slice(0, i += 3); if (i >= r.length) clearInterval(iv); }, 16);
      });
    }

    /* SLATE — month calendar */
    var cs = document.getElementById("slateSim");
    if (cs) {
      var dows = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
      var htmlCal = '<div class="mcal"><div class="mh"><span>August 2026</span><span style="color:var(--faint);font-weight:500;font-size:12px">Demo Plumbing Co.</span></div>' +
        '<div class="dow">' + dows.map(function(d){ return "<span>" + d + "</span>"; }).join("") + '</div><div class="days">';
      /* Aug 2026 starts Saturday */
      for (var pad = 0; pad < 5; pad++) htmlCal += "<button disabled></button>";
      for (var d = 1; d <= 31; d++) {
        var dow = (5 + (d - 1)) % 7;
        var closed = (dow === 6) || d < 3;
        htmlCal += '<button ' + (closed ? "disabled" : 'data-day="' + d + '"') + '>' + d + "</button>";
      }
      htmlCal += '</div><div class="slots"></div></div>';
      cs.innerHTML = htmlCal;
      var slotsEl = cs.querySelector(".slots");
      cs.querySelector(".days").addEventListener("click", function(e){
        var day = e.target.getAttribute && e.target.getAttribute("data-day"); if (!day) return;
        cs.querySelectorAll(".days button").forEach(function(b){ b.classList.remove("on"); });
        e.target.classList.add("on");
        slotsEl.classList.add("show");
        slotsEl.innerHTML = ["8:00 AM","9:30 AM","11:00 AM","1:00 PM","2:30 PM","4:00 PM"].map(function(t){
          return '<button data-slot="' + t + '" data-day="' + day + '">' + t + "</button>";
        }).join("");
        document.getElementById("slateOut").textContent = "";
      });
      slotsEl.addEventListener("click", function(e){
        var t = e.target.getAttribute && e.target.getAttribute("data-slot"); if (!t) return;
        slotsEl.querySelectorAll("button").forEach(function(b){ b.classList.remove("on"); });
        e.target.classList.add("on");
        document.getElementById("slateOut").textContent =
          "Booked ✓ Aug " + e.target.getAttribute("data-day") + " at " + t +
          '.\n\nAnd at 8 PM the night before, they get:\n"Reminder — ' + t + " tomorrow with Demo Plumbing Co. Reply C to confirm or R to reschedule.\"";
      });
    }




    /* TAP — amount → estimate → invoice → tap → receipt */
    var ts = document.getElementById("tapSim");
    if (ts) {
      ts.className = "tapsim";
      var amt = 425, step = 0;
      function render() {
        var el = ts.querySelector(".stage");
        if (step === 0) el.innerHTML = '<div><p style="margin:0 0 10px;color:var(--muted)">What would you charge for a typical job?</p>' +
          '<input id="tapAmt" type="number" value="' + amt + '" min="20" max="20000"> ' +
          '<button class="btn dark sm" data-next style="margin-left:8px">Send the estimate →</button></div>';
        if (step === 1) el.innerHTML = '<div><p class="k" style="margin-bottom:6px">Estimate · sent by text</p>' +
          '<div class="amt">' + f$(amt) + '</div><p style="color:var(--muted);font-size:13px;margin:6px 0 12px">Your customer opens it on their phone and taps…</p>' +
          '<button class="btn dark sm" data-next>Accept estimate ✓</button></div>';
        if (step === 2) el.innerHTML = '<div><p class="k" style="margin-bottom:6px">Invoice · auto-created from the estimate</p>' +
          '<div class="amt">' + f$(amt) + '</div><p style="color:var(--muted);font-size:13px;margin:6px 0 12px">Job\'s done. Time to get paid — tap their card on your phone:</p>' +
          '<div class="tapring go" data-next role="button" tabindex="0"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="6" width="14" height="10.5" rx="2.4"/><path d="M2 9.6h14M18.4 8.2a5.4 5.4 0 010 7.6"/></svg></div></div>';
        if (step === 3) el.innerHTML = '<div style="display:grid;place-items:center;gap:10px">' +
          '<div class="receiptcard">DEMO PLUMBING CO.<br>—————————————<br>Service&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' + f$(amt) +
          '<br>Card tap&nbsp;&nbsp;&nbsp;&nbsp;APPROVED<br>—————————————<br>Receipt texted ✓<br>Job marked won ✓<br>Review ask queued ✓</div>' +
          '<p style="color:var(--good);font-weight:600;font-size:14px;margin:0">Paid on the driveway — not "when I get to it."</p>' +
          '<button class="btn lite sm" data-reset>Run it again</button></div>';
      }
      ts.innerHTML = '<div class="stage"></div>'; render();
      ts.addEventListener("click", function (e) {
        if (e.target.closest("[data-next]")) {
          var inp = document.getElementById("tapAmt");
          if (inp) amt = Math.max(20, +inp.value || 425);
          step = Math.min(3, step + 1); render();
        }
        if (e.target.closest("[data-reset]")) { step = 0; render(); }
      });
    }


  });

  /* ---------- chat launcher ---------- */
  ready(function () {
    var fab = document.createElement("button");
    fab.className = "chat-fab"; fab.setAttribute("aria-label", "Chat with Station");
    fab.innerHTML = '<svg viewBox="0 0 100 100" fill="currentColor"><g transform="rotate(45 50 50)"><rect x="29.5" y="3" width="18" height="36" rx="8.5"/><rect x="52.5" y="3" width="18" height="36" rx="8.5"/><rect x="29.5" y="61" width="18" height="36" rx="8.5"/><rect x="52.5" y="61" width="18" height="36" rx="8.5"/><rect x="3" y="29.5" width="36" height="18" rx="8.5"/><rect x="3" y="52.5" width="36" height="18" rx="8.5"/><rect x="61" y="29.5" width="36" height="18" rx="8.5"/><rect x="61" y="52.5" width="36" height="18" rx="8.5"/></g><circle cx="50" cy="50" r="16.5" fill="#1D1D1F"/></svg>';
    var panel = document.createElement("div");
    panel.className = "chat-panel";
    panel.innerHTML = '<div class="ch-h"><svg viewBox="0 0 100 100" fill="currentColor" style="width:18px;height:18px"><g transform="rotate(45 50 50)"><rect x="29.5" y="3" width="18" height="36" rx="8.5"/><rect x="52.5" y="3" width="18" height="36" rx="8.5"/><rect x="29.5" y="61" width="18" height="36" rx="8.5"/><rect x="52.5" y="61" width="18" height="36" rx="8.5"/><rect x="3" y="29.5" width="36" height="18" rx="8.5"/><rect x="3" y="52.5" width="36" height="18" rx="8.5"/><rect x="61" y="29.5" width="36" height="18" rx="8.5"/><rect x="61" y="52.5" width="36" height="18" rx="8.5"/></g></svg> Station <span class="ch-live">● online</span></div>' +
      '<div class="ch-body" id="chBody"></div>' +
      '<div class="ch-chips" id="chChips"></div>' +
      '<div class="ch-in"><input type="text" id="chIn" placeholder="Ask anything — pricing, products, how fast…" maxlength="200" aria-label="Ask Station"><button id="chSend" aria-label="Send">↑</button></div>' +
      '<p class="ch-fine">This is our Greet product answering — the same one you can put on your site.</p>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    var chBody = panel.querySelector("#chBody"), chChips = panel.querySelector("#chChips"),
        chIn = panel.querySelector("#chIn"), chSend = panel.querySelector("#chSend");
    function msg(who, htmlStr, delay) {
      setTimeout(function () {
        var d = document.createElement("div"); d.className = "ch-m " + who; d.innerHTML = htmlStr;
        chBody.appendChild(d); chBody.scrollTop = chBody.scrollHeight;
      }, delay || 0);
    }
    function chips(arr) {
      chChips.innerHTML = "";
      arr.forEach(function (c) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = c;
        b.addEventListener("click", function () { ask(c); });
        chChips.appendChild(b);
      });
    }
    var CAT2 = window.STATION_CATALOG || [];
    function plink(k) { var p = CAT2.find(function (x) { return x.k === k; }); return p ? '<a href="/station-pages/' + k + '/">' + p.n + ' — ' + p.pricelab + ' →</a>' : ''; }
    function answer(q) {
      var s = q.toLowerCase();
      /* direct product hit first */
      var hit = CAT2.find(function (p) { return s.indexOf(p.n.toLowerCase()) > -1; });
      if (hit) return "<b>" + hit.n + "</b> — " + hit.sub + ". " + hit.pricelab + ", live " + hit.ttl + ", cancel anytime. Try it on the page before you buy:<br>" + plink(hit.k);
      if (/human|person|real|someone|talk|owner|agent/.test(s)) return "Easy — pick your speed:<br><a href='/book/'>Book the 15-min intro call →</a><a href='tel:+18444936381'>Call (844) 493-6381 →</a><a href='mailto:main@station.solutions'>Email us — main@station.solutions →</a>";
      if (/trial|free trial|try before/.test(s)) return "Every subscription product carries a <b>7-day free trial</b> at checkout — $0 today, cancel inside the week and you never pay. (Websites are built-to-order, so they're the one exception.)";
      if (/cancel|contract|lock/.test(s)) return "No contracts, ever. Everything is month-to-month, cancels in one click, and billing doesn't even start until the product is verified live on your account.";
      if (/bundle|package|deal|all of it|everything/.test(s)) return "Three line passes: <b>Core $750/mo</b> (six products), <b>Pro $1,500/mo</b> (adds the AI receptionist, Map and Marquee), <b>Custom $2,500/mo</b> (everything + a custom website + a named strategist).<br><a href='/#bundles'>See the bundles →</a>";
      if (/website|web site|site/.test(s)) return "Storefront: <b>$500 + $49/mo</b> premium build live in 48 hours, <b>$1,250</b> custom in 72 hours, <b>$10,000</b> enterprise flat. Real examples you can click:<br><a href='/portfolio/'>Open the portfolio →</a>";
      if (/price|cost|how much|pricing|\$/.test(s)) return "Products run <b>$29–$347/mo</b> a-la-carte, each priced on its own page — websites from <b>$500</b>. Stack four or more and a bundle usually wins.<br><a href='/#shop'>See every price →</a><a href='/#bundles'>See the bundles →</a>";
      if (/miss(ed)? call|voicemail|hang up/.test(s)) return "That's <b>Lineback</b> — every missed call gets an instant text-back, so the caller books with you instead of the next Google result. Call our line and hang up to feel it:<br>" + plink("lineback");
      if (/answer|reception|24|after hours|phone rings|ai voice|voice ai/.test(s)) return "That's <b>Frontdesk</b> — an AI receptionist that answers 24/7, books appointments and never puts anyone on hold. It's answering our real line right now:<br>" + plink("frontdesk");
      if (/review|stars|reputation/.test(s)) return "That's <b>Repute</b> — asks every happy customer for the review, catches the unhappy ones before they post, and drafts your replies. Try the live demo:<br>" + plink("repute");
      if (/no.?show|remind|book|calendar|appointment/.test(s)) return "That's <b>Slate</b> — real online booking plus reminders that cut no-shows hard:<br>" + plink("slate");
      if (/google|map|listing|found|rank|seo/.test(s)) return "That's <b>Map</b> — your Google Business Profile managed and defended, the single biggest local-visibility lever:<br>" + plink("map");
      if (/social|post|instagram|facebook|tiktok|content/.test(s)) return "That's <b>Marquee</b> — one post published to nine platforms at the same time, plus your brand board:<br>" + plink("marquee");
      if (/follow.?up|lead|quote|chase|went quiet/.test(s)) return "That's <b>Pursuit</b> — it chases every lead for 10 days and stops the second they reply:<br>" + plink("pursuit");
      if (/email|campaign|newsletter|blast/.test(s)) return "That's <b>Dispatch</b> — mass email campaigns with hundreds of real templates included:<br>" + plink("dispatch") + "<a href='/portfolio/emails/'>See the template gallery →</a>";
      if (/pay|card|invoice|estimate|charge customer|pos/.test(s)) return "That's <b>Tap</b> — estimate → invoice → tap their card on your phone → paid in the driveway:<br>" + plink("tap");
      if (/start|begin|first|recommend|which one|what should/.test(s)) return "Honest answer: start where it hurts most. Missing calls → <b>Lineback</b>. Nobody finds you → <b>Map</b>. Few reviews → <b>Repute</b>. Or answer one question and the shelf reorders itself:<br><a href='/#help'>Build my line →</a><a href='/audit/'>Or get the free audit →</a>";
      if (/audit|free|check/.test(s)) return "The free audit runs eleven checks on your listing, reviews, site and response speed — no card, no call, emailed to you:<br><a href='/audit/'>Get the free audit →</a>";
      if (/hi|hello|hey|yo\b/.test(s)) return "Hey! Ask me anything — what a product costs, what fixes missed calls, how fast things go live. Or tell me what's hurting and I'll point you at the fix.";
      return "Good question — here's the fastest path to a real answer:<br><a href='/audit/'>Get the free audit →</a><a href='/book/'>Book the 15-min call →</a><a href='mailto:main@station.solutions'>Email us →</a><br>Or try asking about a product by name, pricing, trials, or what fixes missed calls / no-shows / reviews.";
    }
    function ask(q) {
      if (!q) return;
      msg("me", q.replace(/[<>&]/g, "")); chIn.value = "";
      msg("biz", answer(q), 600 + Math.random() * 400);
    }
    chSend.addEventListener("click", function () { ask(chIn.value.trim()); });
    chIn.addEventListener("keydown", function (e) { if (e.key === "Enter") ask(chIn.value.trim()); });
    var booted = false;
    function toggle() {
      panel.classList.toggle("open");
      if (panel.classList.contains("open") && !booted) {
        booted = true;
        msg("biz", "Hey — Station here. Ask me anything, or tap one of these.", 300);
        chips(["What should I start with?", "Pricing", "How does the free trial work?", "Talk to a human"]);
        setTimeout(function () { chIn.focus(); }, 400);
      }
    }
    fab.addEventListener("click", toggle);
    document.querySelectorAll("[data-open-chat]").forEach(function (b) { b.addEventListener("click", toggle); });
  });

  /* ---------- newsletter popup ---------- */
  ready(function () {
    try {
      /* The second consent bar used to be built here. It wrote localStorage
         'station_cookies' and nothing ever read it, so its Accept/Deny were wired
         to nothing — while telling visitors nothing follows them around, on a page
         that also loads the Meta Pixel. The real, gated banner is analytics.js. */
      if (!localStorage.getItem("station_news") && !localStorage.getItem("station_lead_done")) {
        setTimeout(function () {
          if (localStorage.getItem("station_news")) return;
          var scr = document.createElement("div"); scr.className = "pop-scrim open";
          var pop = document.createElement("div"); pop.className = "pop open";
          pop.innerHTML = '<button class="x" aria-label="Close">×</button>' +
            '<div class="pop-mark" aria-hidden="true"><svg viewBox="0 0 100 100" fill="currentColor"><g transform="rotate(45 50 50)"><rect x="29.5" y="3" width="18" height="36" rx="8.5"/><rect x="52.5" y="3" width="18" height="36" rx="8.5"/><rect x="29.5" y="61" width="18" height="36" rx="8.5"/><rect x="52.5" y="61" width="18" height="36" rx="8.5"/><rect x="3" y="29.5" width="36" height="18" rx="8.5"/><rect x="3" y="52.5" width="36" height="18" rx="8.5"/><rect x="61" y="29.5" width="36" height="18" rx="8.5"/><rect x="61" y="52.5" width="36" height="18" rx="8.5"/></g><circle cx="50" cy="50" r="16.5" fill="#fff"/></svg></div>' +
            '<p class="pop-k">The Station newsletter</p>' +
            '<h3 style="font-family:var(--fd);font-weight:700">One useful note a month.</h3>' +
            '<p>What\'s actually working for businesses like yours, and what we ship next. No noise.</p>' +
            /* `data-audit` deliberately dropped: the global form[data-audit] binder posts to the
               free-audit intake, and this form must not go there — see the endpoint note below.
               It only ever bound forms present at DOM ready anyway, and this one is built later. */
            '<form data-variant="newsletter" class="audit-form" style="border:0;padding:0;margin-top:14px">' +
            '<div class="af-grid"><input name="email" type="email" placeholder="Email" required style="grid-column:1/-1">' +
            '<input name="phone" type="tel" placeholder="Phone (optional)" style="grid-column:1/-1"></div>' +
            '<input name="leak" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
            '<input type="hidden" name="_t" value=""><input type="hidden" name="variant" value="newsletter">' +
            '<label class="consent"><input type="checkbox" name="consent_email" value="yes" required><span>Email me the monthly note. Unsubscribe anytime.</span></label>' +
            '<label class="consent"><input type="checkbox" name="consent_sms" value="yes"><span>Text me Station tips &amp; offers too. Msg &amp; data rates may apply. Message frequency varies. Reply HELP for help, STOP to opt out. Consent is not a condition of purchase. <a href="/station-pages/legal/sms-terms.html" target="_blank">SMS terms</a> · <a href="/station-pages/legal/privacy.html" target="_blank">Privacy</a>.</span></label>' +
            '<button class="btn dark" type="submit" style="width:100%">Join the list</button>' +
            '<p class="af-done" hidden><b>You\'re on the list.</b> Nothing else to do.</p></form>';
          function close() { scr.remove(); pop.remove(); localStorage.setItem("station_news", "dismissed"); }
          pop.querySelector(".x").addEventListener("click", close);
          scr.addEventListener("click", close);
          pop.querySelector("form").addEventListener("submit", function (e) {
            e.preventDefault();
            var form = e.target; if (!form.reportValidity()) return;
            var fd = new FormData(form); fd.set("_t", "9999");
            /* NOT the free-audit intake. Its spam gate scores a missing name and business as
               two strikes, so an email-only signup was classified spam and dropped with no
               reply — every signup this popup ever took went nowhere. And anything that did
               pass had a website derived from the email domain and a paid audit report
               generated and emailed to it. /webhook/newsletter is the list endpoint: honeypot
               + email validity only, CRM upsert, SMS suppressed unless consent_sms is real. */
            fd.set("source", "newsletter");
            try { fetch("https://n8n.srv1748596.hstgr.cloud/webhook/newsletter", { method: "POST", mode: "no-cors", body: fd }); } catch (err) {}
            form.querySelectorAll("input,button").forEach(function (el) { el.disabled = true; });
            form.querySelector(".af-done").hidden = false;
            localStorage.setItem("station_news", "joined");
            setTimeout(close, 2600);
          });
          document.body.appendChild(scr); document.body.appendChild(pop);
        }, 22000);
      }
    } catch (e) {}
  });

  /* ---------- version pill — internal review tool, hidden from customers ----------
     This is a build-comparison switcher, not a product feature: shipping V5/V2/V3/V4
     toggles to a prospect makes a sales site look like a staging build. It stays one
     query string away for us — /?v=1 turns it on and remembers, /?v=0 turns it off. */
  ready(function () {
    var show = false;
    try {
      var q = new URLSearchParams(location.search).get("v");
      if (q === "1") localStorage.setItem("station_vswitch", "1");
      if (q === "0") localStorage.removeItem("station_vswitch");
      show = localStorage.getItem("station_vswitch") === "1";
    } catch (e) {}
    if (!show) return;
    if (document.querySelector("[data-vswitch]")) return;
    var path = location.pathname, active = 5, sub = path;
    if (path.indexOf("/v2/") === 0) { active = 2; sub = path.slice(3); }
    else if (path.indexOf("/v3/") === 0) { active = 3; sub = path.slice(3); }
    else if (path.indexOf("/v4/") === 0) { active = 4; sub = "/"; }
    if (!/^\/([a-z]+\/)?$/.test(sub)) sub = "/";
    var d = document.createElement("div");
    d.setAttribute("data-vswitch", "1");
    d.style.cssText = "position:fixed;z-index:80;display:flex;gap:2px;background:rgba(20,20,22,.85);backdrop-filter:blur(10px);border-radius:999px;padding:4px;font:600 11px Inter,'Segoe UI',sans-serif";
    [["", 5, "V5"], ["/v2", 2, "V2"], ["/v3", 3, "V3"], ["/v4", 4, "V4"]].forEach(function (v) {
      var a = document.createElement("a");
      a.href = (v[0] || "") + (v[1] === 4 ? "/" : sub);
      a.textContent = v[2];
      a.style.cssText = "text-decoration:none;padding:5px 11px;border-radius:999px;" +
        (active === v[1] ? "background:#fff;color:#111" : "color:#bbb");
      d.appendChild(a);
    });
    document.body.appendChild(d);
  });

  window.__ready = true;
})();


/* ===================== ROUND 4 JS ===================== */
(function () {
  "use strict";
  function ready(fn){ if(document.readyState!=="loading") fn(); else document.addEventListener("DOMContentLoaded",fn); }
  var f$ = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };

  /* nav hide on scroll down, show on scroll up — and stay hidden while a product bar owns the top */
  ready(function () {
    var nav = document.querySelector(".nav"); if (!nav) return;
    var last = 0;
    addEventListener("scroll", function () {
      var y = scrollY;
      nav.classList.toggle("hide", (y > 140 && y > last) || document.body.classList.contains("ppbar"));
      last = y;
    }, { passive: true });
  });

  /* ---------- /checkout/ — the one-payment page: summary, trial, upsells, Stripe ---------- */
  ready(function () {
    var host = document.getElementById("coItems"); if (!host) return;
    var cat = window.STATION_CATALOG || [];
    var ups = document.getElementById("coUps"), rows = document.getElementById("coRows"),
        tot = document.getElementById("coTot"), tr = document.getElementById("coTrial"),
        pay = document.getElementById("coPay");
    function get() { try { return JSON.parse(localStorage.getItem("station_cart") || "[]"); } catch (e) { return []; } }
    function set(c) {
      try { localStorage.setItem("station_cart", JSON.stringify(c)); } catch (e) {}
      document.querySelectorAll(".cartbtn .n").forEach(function (b) { b.textContent = c.length; b.classList.toggle("on", c.length > 0); });
      render();
    }
    function P2(k) { return cat.find(function (x) { return x.k === k; }); }
    function trialable(p) { return p.mo > 0 && !(p.once > 0) && p.k !== "storefront"; }
    /* last-second pairings — what actually gets added together */
    var PAIR = { lineback: ["frontdesk", "dial"], frontdesk: ["slate", "repute"], storefront: ["greet", "map"],
      greet: ["slate", "pursuit"], slate: ["pursuit", "lineback"], pursuit: ["revive", "dispatch"],
      repute: ["map", "marquee"], map: ["repute", "marquee"], dispatch: ["revive", "radar"],
      revive: ["dispatch", "pursuit"], radar: ["dispatch", "dial"], dial: ["lineback", "tap"],
      tap: ["dial", "slate"], marquee: ["repute", "map"] };
    function render() {
      var c = get();
      if (!c.length) {
        host.innerHTML = '<div class="c-empty" style="padding:60px 10px">Your cart is empty — <a href="/station-pages/#shop">the shelf is this way</a>.</div>';
        ups.innerHTML = ""; rows.innerHTML = ""; tot.innerHTML = ""; tr.hidden = true; pay.disabled = true; return;
      }
      pay.disabled = false;
      var mo = 0, once = 0, allTrial = true;
      host.innerHTML = '<p class="k" style="margin-bottom:12px">Your line · ' + c.length + (c.length === 1 ? ' product' : ' products') + '</p>' + c.map(function (k) {
        var p = P2(k); if (!p) return "";
        mo += p.mo || 0; once += p.once || 0;
        var t = trialable(p); if (!t) allTrial = false;
        return '<div class="co-item">' + (p.img ? '<img src="' + p.img + '" alt="">' : '') +
          '<div class="co-m"><b>' + p.n + '</b><span>' + p.sub + '</span>' +
          '<span class="co-meta">' + p.pricelab + ' · live ' + p.ttl + '</span>' +
          (t ? '<span class="co-tr">7-day free trial — $0 today</span>' : '') + '</div>' +
          '<button class="ci-x" data-corm="' + k + '" aria-label="Remove ' + p.n + '">×</button></div>';
      }).join("");
      /* the last-second nudge: two highest-affinity products not yet in the cart */
      var sug = [];
      c.forEach(function (k) { (PAIR[k] || []).forEach(function (s) { if (c.indexOf(s) === -1 && sug.indexOf(s) === -1) sug.push(s); }); });
      sug = sug.slice(0, 2);
      ups.innerHTML = sug.length ? '<p class="k" style="margin:26px 0 10px">Added together 9 times out of 10</p>' + sug.map(function (k) {
        var p = P2(k); if (!p) return "";
        return '<div class="co-up">' + (p.img ? '<img src="' + p.img + '" alt="">' : '') +
          '<div class="co-m"><b>' + p.n + '</b><span>' + p.sub + '</span><span class="co-meta">' + p.pricelab +
          (trialable(p) ? ' · free for 7 days' : '') + '</span></div>' +
          '<button class="co-add" data-coadd="' + k + '">Add</button></div>';
      }).join("") : "";
      rows.innerHTML = '<div class="c-row"><span>Per month</span><b>' + f$(mo) + '/mo</b></div>' +
        (once ? '<div class="c-row"><span>One-time (builds &amp; setups)</span><b>' + f$(once) + '</b></div>' : '');
      tr.hidden = !allTrial;
      tot.innerHTML = allTrial
        ? '<span>Due today</span><b>$0</b><small>then ' + f$(mo) + '/mo after your 7-day trial — cancel anytime inside it</small>'
        : '<span>Due today</span><b>' + f$(once + mo) + '</b><small>' + f$(mo) + '/mo after — month to month, cancel anytime</small>';
      pay.setAttribute("data-trial", allTrial ? "1" : "");
    }
    document.addEventListener("click", function (e) {
      var rm = e.target.getAttribute && e.target.getAttribute("data-corm");
      if (rm) { set(get().filter(function (x) { return x !== rm; })); return; }
      var ad = e.target.getAttribute && e.target.getAttribute("data-coadd");
      if (ad) { var c = get(); if (c.indexOf(ad) === -1) c.push(ad); set(c); }
    });
    pay.addEventListener("click", function () {
      var c = get(); if (!c.length) return;
      var prices = [], hasRecurring = false, hasOnetime = false, allTrial = true;
      c.forEach(function (k) {
        var p = P2(k);
        if (p && (p.price_ids || p.price_id)) {
          /* storefront = $500 build + $49/mo care; map = $147/mo + $297 setup.
             Sending one id made storefront fail Stripe validation outright and made
             map quietly skip its setup fee. */
          (p.price_ids || [p.price_id]).forEach(function (id) { prices.push(id); });
          if (p.mo > 0) hasRecurring = true;
          if (p.once > 0) hasOnetime = true;
          if (!trialable(p)) allTrial = false;
        }
      });
      if (!prices.length) return;
      pay.disabled = true; pay.textContent = "Building your secure checkout…";
      var ref = null; try { ref = sessionStorage.getItem("station_ref"); } catch (e) {}
      fetch("https://n8n.srv1748596.hstgr.cloud/webhook/cart-checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: prices, has_recurring: hasRecurring, has_onetime: hasOnetime,
          trial: allTrial && hasRecurring && !hasOnetime, ref: ref || undefined })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.url) { location.href = d.url; }
        else { pay.disabled = false; pay.textContent = "Try again — continue to secure payment →"; }
      }).catch(function () {
        pay.disabled = false; pay.textContent = "Try again — continue to secure payment →";
      });
    });
    render();
  });

  /* HERO — the Osmo layered parallax, ported to vanilla.
     Same contract as the GSAP original: one scrubbed timeline over the layers box,
     start "0% 0%" -> end "100% 0%", each layer travelling a fixed share of its own
     height (yPercent 70 / 55 / 40 / 10, ease none). The title is layer 3, so it drifts
     with the art instead of sitting on top of it. */
  ready(function () {
    var box = document.querySelector("[data-parallax-layers]"); if (!box) return;
    var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (RM) return;
    var LAYERS = [[1, 70], [2, 55], [3, 40], [4, 10]].map(function (l) {
      return { el: box.querySelector('[data-parallax-layer="' + l[0] + '"]'), pct: l[1] / 100 };
    }).filter(function (l) { return l.el; });
    var ticking = false;
    function apply() {
      ticking = false;
      var r = box.getBoundingClientRect();
      /* progress 0 -> 1 as the box's top travels from the viewport top to fully past it */
      var p = Math.min(1, Math.max(0, -r.top / (r.height || 1)));
      /* travel is measured against the SCENE, not each plate's own height — the plates are
         cropped to different ridge bands, so per-element height would make the far layer
         drift slower than the mid one and invert the depth. */
      var H = box.offsetHeight || 1;
      LAYERS.forEach(function (l) {
        var d = p * l.pct * H;
        l.el.style.transform = l.el.classList.contains("parallax__layer-title")
          ? "translate(-50%,-50%) translateY(" + d + "px)"
          : "translateY(" + d + "px)";
      });
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    apply();
  });

  /* iphone2 — the old site's phone UI, interactive */
  function iphone2(hostId, cfg) {
    var host = document.getElementById(hostId); if (!host) return;
    var mark = '<svg viewBox="0 0 100 100" fill="currentColor"><g transform="rotate(45 50 50)"><rect x="29.5" y="3" width="18" height="36" rx="8.5"/><rect x="52.5" y="3" width="18" height="36" rx="8.5"/><rect x="29.5" y="61" width="18" height="36" rx="8.5"/><rect x="52.5" y="61" width="18" height="36" rx="8.5"/><rect x="3" y="29.5" width="36" height="18" rx="8.5"/><rect x="3" y="52.5" width="36" height="18" rx="8.5"/><rect x="61" y="29.5" width="36" height="18" rx="8.5"/><rect x="61" y="52.5" width="36" height="18" rx="8.5"/></g><circle cx="50" cy="50" r="16.5" fill="currentColor" opacity="0"/></svg>';
    host.className = "iphone2";
    host.innerHTML = '<div class="scr"><div class="isl"></div>' +
      '<div class="thead"><span class="av">' + mark + '</span><div><b>' + cfg.title + '</b><small>' + (cfg.sub || "") + '</small></div></div>' +
      '<div class="tbody"><div class="sysline">' + cfg.sys + '</div></div>' +
      '<div class="chips"></div>' +
      '<div class="tin"><input type="text" placeholder="' + (cfg.placeholder || "Text like a customer...") + '" maxlength="140"><button aria-label="Send">↑</button></div></div>';
    var body = host.querySelector(".tbody"), chips = host.querySelector(".chips");
    var input = host.querySelector(".tin input"), send = host.querySelector(".tin button");
    function bubble(who, text, delay) {
      setTimeout(function () {
        var b = document.createElement("div"); b.className = "pm-b " + who; b.textContent = text;
        body.appendChild(b); requestAnimationFrame(function(){ requestAnimationFrame(function(){ b.classList.add("show"); }); });
        body.scrollTop = body.scrollHeight;
        setTimeout(function(){ body.scrollTop = body.scrollHeight; }, delay ? 60 : 380);
      }, delay || 0);
    }
    function setChips(arr) {
      chips.innerHTML = "";
      (arr || []).forEach(function (c) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = c;
        b.addEventListener("click", function () { userSend(c); });
        chips.appendChild(b);
      });
    }
    function userSend(text) {
      if (!text) return;
      bubble("me", text); input.value = ""; setChips([]);
      var r = cfg.reply(text);
      if (r) { bubble("biz", r.text, 800 + Math.random() * 500); if (r.chips) setTimeout(function () { setChips(r.chips); }, 1100); }
    }
    send.addEventListener("click", function () { userSend(input.value.trim()); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") userSend(input.value.trim()); });
    /* the phone sits full-size from the start; the conversation begins when you scroll to it */
    if (cfg.picker) setChips(cfg.picker);
    function boot() {
      (cfg.opening || []).forEach(function (m, i) { bubble(m.who, m.t, 400 + i * 900); });
      if (cfg.chips) setTimeout(function () { setChips(cfg.chips); }, (cfg.opening || []).length * 900 + 500);
    }
    if (!("IntersectionObserver" in window)) boot();
    else {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); boot(); } });
      }, { threshold: 0.35 });
      io.observe(host);
    }
  }

  ready(function () {
    /* DIAL — pick a business, then text it */
    if (document.getElementById("dialPhone")) {
      var biz = null;
      var OPEN = { Plumber: "Do y'all clear main-line clogs?", Salon: "Any openings for a cut this week?",
        Dentist: "Do you take new patients?", "Auto shop": "How much for brakes on a Tacoma?",
        Gym: "What are day passes?", Restaurant: "Do you take reservations for 6?" };
      iphone2("dialPhone", {
        title: "Station business line", sub: "two-way texting demo",
        sys: "Station's business texting works for any business — pick one and text it like a customer.",
        picker: ["Plumber", "Salon", "Dentist", "Auto shop", "Gym", "Restaurant", "Something else"],
        reply: function (t) {
          if (!biz && (OPEN[t] || t === "Something else")) {
            biz = t === "Something else" ? "Local business" : t;
            return { text: "You're texting the " + biz.toLowerCase() + "'s business line now — go ahead, ask anything.", chips: OPEN[t] ? [OPEN[t], "What are your hours?"] : ["What are your hours?", "How much do you charge?"] };
          }
          var s = t.toLowerCase();
          if (/hour|open|close/.test(s)) return { text: "We're open Mon–Sat, 8 to 6. Want us to pencil you in?", chips: ["Yes — tomorrow?", "Just checking"] };
          if (/price|much|cost|\$|pass/.test(s)) return { text: "Depends on the job — we quote fast and flat. What's the address (or what are you after)?", chips: ["Send a quote request"] };
          if (/yes|tomorrow|book|reserve|opening|patient/.test(s)) return { text: "Done — you're on the books. Confirmation text lands the night before. That whole exchange? A business line, not somebody's personal cell." };
          return { text: "Happy to help with that. And notice — this thread lives on the business number, searchable forever, sharable with staff. What else?" };
        }
      });
    }
    /* PURSUIT — sequence plays, reply stops it */
    if (document.getElementById("pursuitPhone")) iphone2("pursuitPhone", {
      title: "Demo Plumbing Co.", sub: "day 1 → day 10, compressed",
      sys: "You asked about a water heater, then went quiet. Pursuit chases — reply and watch it stop.",
      opening: [
        { who: "biz", t: "Hi Sarah — got your request about the water heater. When works for a look, tomorrow or Thursday?" },
        { who: "biz", t: "(next morning) Morning! Still happy to help — mornings or afternoons better?" },
        { who: "biz", t: "(day 4) No rush — want me to pencil you in for early next week?" }
      ],
      chips: ["Yes sorry! Thursday works", "Who is this?", "STOP"],
      reply: function (t) {
        var s = t.toLowerCase();
        if (/^stop$/.test(s.trim())) return { text: "You're opted out — no more messages, automatically, always." };
        if (/who/.test(s)) return { text: "It's Demo Plumbing — you reached out about a water heater on our site. Want that quote?", chips: ["Yes — Thursday works"] };
        return { text: "SEQUENCE STOPPED ✓ The instant you replied, the automation ended and a human took the thread. That's the product." };
      }
    });

    /* SLATE — booked popup in the middle of the calendar */
    var cal = document.querySelector(".mcal");
    if (cal) {
      var pop = document.createElement("div");
      pop.className = "slate-pop";
      pop.innerHTML = '<div class="sp-ok">✓</div><b id="spTitle">Booked</b>' +
        '<div class="sp-rem" id="spRem"></div><button type="button">Nice — close</button>';
      cal.appendChild(pop);
      pop.querySelector("button").addEventListener("click", function () { pop.classList.remove("on"); });
      cal.addEventListener("click", function (e) {
        var t = e.target.getAttribute && e.target.getAttribute("data-slot");
        if (!t) return;
        var day = e.target.getAttribute("data-day");
        document.getElementById("spTitle").textContent = "Booked — Aug " + day + " at " + t;
        document.getElementById("spRem").innerHTML = "<b style='font-size:11px;letter-spacing:.06em;color:var(--faint)'>THE REMINDER THEY GET AT 8 PM THE NIGHT BEFORE</b><br>“Reminder — " + t + " tomorrow with Demo Plumbing Co. Reply C to confirm or R to reschedule.”";
        setTimeout(function(){ pop.classList.add("on"); }, 150);
        var out = document.getElementById("slateOut"); if (out) out.textContent = "";
      });
    }

    /* MAP v2 — search field + check cards */
    var mbtn2 = document.querySelector("[data-map2-run]");
    if (mbtn2) {
      var sf = document.querySelector(".searchf input");
      var sfw = document.querySelector(".searchf");
      if (sf) {
        sf.addEventListener("input", function(){ sfw.classList.toggle("has", !!sf.value); });
        sfw.querySelector(".clr").addEventListener("click", function(){ sf.value = ""; sfw.classList.remove("has"); sf.focus(); });
        sf.addEventListener("keydown", function(e){ if (e.key === "Enter") mbtn2.click(); });
      }
      mbtn2.addEventListener("click", function () {
        var v = (sf && sf.value || "").trim();
        var out = document.getElementById("mapChecks");
        if (!v) { sf && sf.focus(); return; }
        out.innerHTML = "";
        var CH = [
          ["📍", "Primary category", "The single biggest ranking lever — 6 in 10 listings we scan have the wrong one. The full audit pulls yours and verifies it."],
          ["🕐", "Hours drift", "Google accepts public “corrections” to your hours. We diff what Google shows against what you actually run."],
          ["✏️", "Public edits & duplicates", "Competitor edits, stale duplicates, spam rivals — we pull your listing's real edit exposure."]];
        CH.forEach(function (c, i) {
          var d = document.createElement("div"); d.className = "map-check";
          d.innerHTML = '<span class="ic">' + c[0] + '</span><div><b>' + c[1] + '</b><span>' + c[2] + '</span></div>';
          out.appendChild(d);
          setTimeout(function () { d.classList.add("show"); }, 250 + i * 420);
        });
        setTimeout(function () {
          var w = document.createElement("div"); w.className = "map-check";
          w.innerHTML = '<span class="ic">→</span><div><b>Checks 4–11 run against your real listing</b>' +
            '<span>Reviews vs your top 3 competitors, citations, site speed, response time and more — free, emailed to you.</span>' +
            '<a class="btn dark sm" style="margin-top:10px;display:inline-flex" href="/station-pages/audit/?biz=' + encodeURIComponent(v) + '">Run the full audit on ' + v + ' →</a></div>';
          out.appendChild(w);
          setTimeout(function () { w.classList.add("show"); }, 60);
        }, 250 + 3 * 420 + 300);
      });
    }

    /* REVIVE v2 — timeline cards */
    var rv2 = document.getElementById("reviveV2");
    if (rv2) {
      var touches = [["1", "It's been a while — want us to take a look before summer?"],
        ["4", "Quick nudge — our schedule's filling for the season."],
        ["8", "Past customers get priority booking this month."],
        ["12", "Anything we did last time you'd like re-checked?"],
        ["16", "Last one from us — we'll leave you be after this, promise."],
        ["21", "Text leg (consent-gated): Hi — it's Demo Plumbing. Want your spring check?"]];
      var wrap = document.createElement("div"); wrap.className = "rev2";
      touches.forEach(function (t) {
        var d = document.createElement("div"); d.className = "rt";
        d.innerHTML = '<span class="day">D' + t[0] + '</span><div class="card">' +
          '<div class="ch"><span>Email touch · click text to edit</span><span class="sent-tag">SENT ✓</span></div>' +
          '<div contenteditable="true" spellcheck="false"></div></div>';
        d.querySelector("[contenteditable]").textContent = t[1];
        wrap.appendChild(d);
      });
      rv2.appendChild(wrap);
      var play = document.createElement("button");
      play.className = "btn dark sm"; play.style.marginTop = "14px";
      play.textContent = "▶ Play the 3-week campaign";
      play.addEventListener("click", function () {
        var items = wrap.querySelectorAll(".rt");
        items.forEach(function (it) { it.classList.remove("sent"); });
        items.forEach(function (it, i) { setTimeout(function () { it.classList.add("sent"); }, 350 + i * 500); });
      });
      rv2.appendChild(play);
    }

    /* MARQUEE — one post fans out to nine platforms */
    var mqp = document.getElementById("mqPlats");
    if (mqp) {
      var PLATS = [["Facebook","facebook"],["Instagram","instagram"],["Google Business","google"],
        ["LinkedIn","linkedin"],["TikTok","tiktok"],["YouTube","youtube"],
        ["Pinterest","pinterest"],["Threads","threads"],["Bluesky","bluesky"]];
      mqp.innerHTML = PLATS.map(function(p){
        return '<div class="mq-pl"><img src="/station-pages/media/logos/' + p[1] + '.svg" alt="" loading="lazy" onerror="this.remove()">' +
          '<span>' + p[0] + '</span><i class="ck" aria-hidden="true">✓</i></div>';
      }).join("");
      var mqBtn = document.querySelector("[data-mq-post]");
      if (mqBtn) mqBtn.addEventListener("click", function(){
        var chips = mqp.querySelectorAll(".mq-pl");
        chips.forEach(function(c){ c.classList.remove("lit"); });
        mqBtn.disabled = true; mqBtn.textContent = "Publishing…";
        chips.forEach(function(c, i){ setTimeout(function(){ c.classList.add("lit"); }, 260 + i * 210); });
        setTimeout(function(){ mqBtn.disabled = false; mqBtn.textContent = "Delivered to all 9 ✓ — run it again"; }, 260 + chips.length * 210 + 300);
      });
    }

    /* DISPATCH — email draft with send + undo + scenario generator */
    var ed = document.getElementById("edraft");
    if (ed) {
      var SCEN = [
        ["Spring tune-up week", "Demo Plumbing Co.", "Your customer list · 400 people",
         "Subject: A/C ready for the first 95° day?\n\nWe’re doing tune-ups in your area next week — $89, takes an hour, and it’s the difference between June working and June waiting on parts.\n\nBook by Friday and we’ll bump you to the front of the line.\n\n— The Demo Plumbing crew"],
        ["We-miss-you win-back", "Riverside Salon", "Customers quiet 6+ months · 180 people",
         "Subject: It’s been a while — chair’s open\n\nWe did your hair two seasons ago and we’d love to see you back. This week only, returning clients get $15 off any service.\n\nTap below and pick your time — takes 20 seconds.\n\n— Riverside Salon"],
        ["Storm-response blast", "Summit Roofing", "Every past customer in ZIP 77433 · 260 people",
         "Subject: Hail came through last night — free roof checks this week\n\nIf last night’s storm hit your street, don’t wait for the ceiling stain. We’re running free 15-minute inspections in your neighborhood through Saturday.\n\nReply or book below — insurance photos included.\n\n— Summit Roofing"],
        ["Review thank-you + offer", "Demo Plumbing Co.", "Everyone who left 5 stars this year · 74 people",
         "Subject: Thank you (really)\n\nYour review means the world to a local shop. Here’s $25 off your next visit — no expiry, no fine print.\n\nIt’s attached to your number automatically. See you next time.\n\n— The Demo Plumbing crew"],
        ["Slow-season filler", "Peak HVAC", "Full list · 520 people",
         "Subject: The $89 tune-up that saves the $4,000 July\n\nOur calendar has a quiet week — your gain. Book a maintenance visit this week and we’ll waive the trip fee.\n\nFirst 20 bookings only, then the schedule’s full again.\n\n— Peak HVAC"],
        ["New service launch", "Cedar Lawn Co.", "Full list · 310 people",
         "Subject: We do that now.\n\nYou asked, we listened: irrigation installs and repair are officially on the menu, same crew you already trust.\n\nLaunch month: 10% off any irrigation job booked by the 31st.\n\n— Cedar Lawn Co."]
      ];
      var si = 0;
      function renderDraft() {
        var t = SCEN[si % SCEN.length];
        ed.innerHTML = '<h4>' + t[0] + '</h4>' +
          '<table><tr><td class="l">From</td><td>' + t[1] + '</td></tr>' +
          '<tr><td class="l">To</td><td>' + t[2] + '</td></tr></table>' +
          '<div class="esep"></div>' +
          '<div contenteditable="true" spellcheck="false"></div>' +
          '<div class="eact"><span class="status" style="margin-right:auto">Click the text — every word is editable</span>' +
          '<button class="btn lite sm" data-e-cancel>Cancel</button><button class="btn dark sm" data-e-send>Send campaign</button></div>';
        ed.querySelector("[contenteditable]").textContent = t[3];
      }
      renderDraft();
      var gen = document.querySelector("[data-e-gen]");
      if (gen) gen.addEventListener("click", function(){ si++; clearInterval(timer); renderDraft(); });
      var timer = null, count = 5;
      function act(){ return ed.querySelector(".eact"); }
      ed.addEventListener("click", function (e) {
        if (e.target.closest("[data-e-send]")) {
          count = 5;
          act().innerHTML = '<span class="status" style="margin-right:auto">Sending in <b id="eCount">5</b>s…</span><button class="btn lite sm" data-e-undo>Undo</button>';
          timer = setInterval(function () {
            count--;
            var c = document.getElementById("eCount");
            if (c) c.textContent = count;
            if (count <= 0) {
              clearInterval(timer);
              act().innerHTML = '<span class="ok" style="margin-left:auto">Sent to the whole list ✓ &nbsp;(not really — it’s a demo. But that’s the whole flow.)</span>';
            }
          }, 1000);
        }
        if (e.target.closest("[data-e-undo]")) {
          clearInterval(timer);
          act().innerHTML = '<span class="status" style="margin-right:auto">Caught it — nothing sent. That undo window ships on every campaign.</span><button class="btn dark sm" data-e-send>Send campaign</button>';
        }
        if (e.target.closest("[data-e-cancel]")) {
          act().innerHTML = '<span class="status" style="margin-right:auto">Draft kept. Click the text to keep editing.</span><button class="btn dark sm" data-e-send>Send campaign</button>';
        }
      });
    }
  });
})();


/* ===================== ROUND 5 JS ===================== */
(function () {
  "use strict";
  function ready(fn){ if(document.readyState!=="loading") fn(); else document.addEventListener("DOMContentLoaded",fn); }

  /* ---------- site search (nav) ---------- */
  ready(function () {
    var btn = document.querySelector(".searchbtn"), bar = document.getElementById("searchbar");
    if (!btn || !bar) return;
    var input = document.getElementById("searchIn"), res = document.getElementById("searchRes");
    var cat = window.STATION_CATALOG || [];
    var INDEX = cat.map(function (p) {
      return { t: p.n, s: p.sub + " · " + p.pricelab, u: "/" + p.k + "/", kw: (p.n + " " + p.sub + " " + p.k).toLowerCase() };
    }).concat([
      { t: "Bundles — Core / Pro / Custom", s: "Ride the whole line for less", u: "/#bundles", kw: "bundle bundles core pro custom package deal line pass price" },
      { t: "Free audit", s: "Eleven checks on your front office — free", u: "/audit/", kw: "audit free check listing reviews report" },
      { t: "Book a call", s: "15 minutes with a human", u: "/book/", kw: "book call appointment intro talk human meeting" },
      { t: "Website portfolio", s: "Real premium templates, clickable", u: "/portfolio/", kw: "portfolio website templates examples work roofing pool auto golf" },
      { t: "Email template gallery", s: "Real campaign templates included with Dispatch", u: "/portfolio/emails/", kw: "email templates campaigns newsletter examples dispatch" },
      { t: "Contact", s: "Write to the humans at Station", u: "/contact/", kw: "contact email support help question human" },
      { t: "Checkout", s: "Your cart, one payment", u: "/checkout/", kw: "checkout cart pay buy purchase" }
    ]);
    function open() {
      bar.hidden = false; btn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(function(){ bar.classList.add("open"); input.focus(); });
    }
    function close() {
      bar.classList.remove("open"); btn.setAttribute("aria-expanded", "false");
      setTimeout(function(){ bar.hidden = true; }, 200);
      input.value = ""; res.innerHTML = "";
    }
    function run() {
      var q = input.value.trim().toLowerCase();
      if (!q) { res.innerHTML = ""; return; }
      var words = q.split(/\s+/).filter(Boolean).map(function (w) { return w.replace(/(ies|es|s)$/, ""); });
      var hits = INDEX.filter(function (i) {
        var hay = (i.kw + " " + i.t).toLowerCase();
        return i.kw.indexOf(q) > -1 || i.t.toLowerCase().indexOf(q) > -1 ||
          words.every(function (w) { return w.length > 1 && hay.indexOf(w) > -1; });
      }).slice(0, 7);
      res.innerHTML = hits.length
        ? hits.map(function (h) { return '<a href="' + h.u + '" role="option"><b>' + h.t + '</b><span>' + h.s + '</span></a>'; }).join("")
        : '<div class="sb-none">Nothing on the shelf matches "' + q.replace(/[<>&]/g, "") + '" — try a product name, or <a href="/station-pages/audit/">get the free audit</a>.</div>';
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); bar.hidden ? open() : close(); });
    input.addEventListener("input", run);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
      if (e.key === "Enter") { var a = res.querySelector("a"); if (a) location.href = a.getAttribute("href"); }
    });
    bar.querySelector(".sb-x").addEventListener("click", close);
    document.addEventListener("click", function (e) { if (!bar.hidden && !bar.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/input|textarea/i.test((document.activeElement || {}).tagName || "") ) { e.preventDefault(); open(); }
    });
    /* mobile: a Search row in the sheet opens the same bar */
    var sheet = document.querySelector(".msheet");
    if (sheet) {
      var sl = document.createElement("a"); sl.href = "#"; sl.textContent = "Search";
      sl.addEventListener("click", function (e) { e.preventDefault(); sheet.classList.remove("open"); open(); });
      sheet.insertBefore(sl, sheet.firstChild);
    }
  });

  /* ---------- scroll-open dropdown cards (activity-dropdown port) ---------- */
  ready(function () {
    var cards = document.querySelectorAll("[data-sdrop]");
    if (!cards.length) return;
    function setOpen(card, on) {
      card.classList.toggle("open", on);
      var h = card.querySelector(".sd-h"); if (h) h.setAttribute("aria-expanded", on ? "true" : "false");
    }
    cards.forEach(function (card) {
      var h = card.querySelector(".sd-h");
      if (h) {
        h.addEventListener("click", function () { setOpen(card, !card.classList.contains("open")); });
        h.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(card, !card.classList.contains("open")); } });
      }
    });
    if (!("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      cards.forEach(function (c) { setOpen(c, true); });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) { setOpen(en.target, true); io.unobserve(en.target); }
      });
    }, { threshold: 0.45 });
    cards.forEach(function (c) { io.observe(c); });
  });
})();
