/* STATION · exit intent — pricing/product pages and checkout ONLY.
 *
 * The offer is real on both surfaces:
 *   product page → the 7-day free trial that every subscription already has
 *   checkout     → the 24h price hold that is already running + save-by-email
 * No invented discount, no "wait!", no countdown theater beyond the hold that
 * genuinely exists server-side.
 *
 * Desktop signal: cursor leaves through the top of the viewport (toward the
 * URL bar / close button). Mobile has no cursor: a hard, fast scroll-up after
 * real downward progress is the strongest available proxy. We do NOT hijack
 * the back button — trapping history is the kind of sneaky that costs trust.
 *
 * Caps: never in the first 25s on page · once per session · max 2 shows per
 * 7 days across the site · never while the quiz or cart drawer is open.
 */
(function () {
  "use strict";

  var MIN_DWELL = 25e3, WEEK_CAP = 2, CAP_KEY = "station_exit_shows";

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function track(ev, label) { try { if (window.__rangeTrack) window.__rangeTrack(ev, label); } catch (e) {} }
  function cat(k) { return (window.STATION_CATALOG || []).find(function (p) { return p.k === k; }); }
  function cart() { try { return JSON.parse(ls("station_cart") || "[]"); } catch (e) { return []; } }
  function hold() { try { return JSON.parse(ls("station_hold") || "null"); } catch (e) { return null; } }

  /* which surface is this page? */
  var isCheckout = !!document.getElementById("coPay") || location.pathname.indexOf("/checkout") === 0;
  var pageKey = (function () {
    var seg = location.pathname.replace(/\/+$/, "").split("/").pop();
    return cat(seg) ? seg : null;
  })();
  if (!isCheckout && !pageKey) return;          // every other page: no exit popup, ever

  var loadedAt = Date.now(), shownThisSession = false, armedMobile = false, maxScroll = 0;

  function weekShows() {
    try {
      var v = JSON.parse(ls(CAP_KEY) || "[]").filter(function (t) { return t > Date.now() - 7 * 864e5; });
      return v;
    } catch (e) { return []; }
  }

  function canShow() {
    if (shownThisSession) return false;
    if (Date.now() - loadedAt < MIN_DWELL) return false;
    if (weekShows().length >= WEEK_CAP) return false;
    if (document.querySelector(".sq")) return false;                       // quiz open
    var drawer = document.querySelector(".cart");
    if (drawer && drawer.classList.contains("open")) return false;         // cart drawer open
    if (isCheckout && !cart().length) return false;                        // nothing to save
    return true;
  }

  var css = "" +
    ".sx-scrim{position:fixed;inset:0;background:rgba(20,20,22,.45);z-index:210;opacity:0;transition:opacity .18s}" +
    ".sx-scrim.on{opacity:1}" +
    ".sx{position:fixed;z-index:211;left:50%;top:50%;transform:translate(-50%,-46%) scale(.97);opacity:0;transition:all .2s;" +
    "width:min(480px,calc(100vw - 32px));background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.25);padding:26px}" +
    ".sx.on{transform:translate(-50%,-50%) scale(1);opacity:1}" +
    ".sx .sx-x{position:absolute;top:12px;right:14px;border:0;background:none;font-size:22px;color:#999;cursor:pointer;line-height:1}" +
    ".sx .sx-k{font:700 11px system-ui;letter-spacing:.13em;color:#8A8A8A;margin:0 0 6px}" +
    ".sx h3{margin:0 0 10px;font-size:19px;color:#1D1D1F}" +
    ".sx p{font-size:14px;color:#555;line-height:1.6;margin:0 0 14px}" +
    ".sx .sx-cta{display:flex;gap:9px;flex-wrap:wrap}" +
    ".sx .sx-cta a,.sx .sx-cta button{padding:11px 16px;border-radius:9px;font:600 13.5px system-ui;cursor:pointer;text-decoration:none;border:0}" +
    ".sx .sx-buy{background:#1D1D1F;color:#fff}" +
    ".sx .sx-see{background:none;border:1px solid #DDD9D0;color:#1D1D1F}";

  function show(reason) {
    if (!canShow()) return;
    shownThisSession = true;
    lsSet(CAP_KEY, JSON.stringify(weekShows().concat([Date.now()])));

    var st = document.getElementById("sx-style");
    if (!st) { st = document.createElement("style"); st.id = "sx-style"; st.textContent = css; document.head.appendChild(st); }
    var scrim = document.createElement("div"); scrim.className = "sx-scrim";
    var box = document.createElement("div"); box.className = "sx";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");

    function close() {
      scrim.classList.remove("on"); box.classList.remove("on");
      setTimeout(function () { scrim.remove(); box.remove(); }, 220);
    }

    if (isCheckout) {
      /* No countdown here either — the price does not expire, so promising a lock
         was inventing pressure we do not actually apply. */
      box.innerHTML = '<button class="sx-x" aria-label="Close">×</button>' +
        '<p class="sx-k">NO RUSH — GENUINELY</p>' +
        "<h3>Keep your cart, decide later.</h3>" +
        "<p>You don't have to decide this minute. Save the cart to your inbox and finish from any device — everything you picked comes with it.</p>" +
        '<div class="sx-cta"><button class="sx-buy" data-sx="save">Email me this cart</button>' +
        '<button class="sx-see" data-sx="stay">Back to checkout</button></div>';
    } else {
      var p = cat(pageKey);
      box.innerHTML = '<button class="sx-x" aria-label="Close">×</button>' +
        '<p class="sx-k">BEFORE YOU GO</p>' +
        "<h3>You don't have to decide today. Trial it for $0.</h3>" +
        "<p>Every Station subscription starts with a <b>7-day free trial</b> — $0 today, month-to-month after, cancel in one click. " +
        "Billing doesn't even start until " + p.n + " is verified live on your business.</p>" +
        '<div class="sx-cta"><button class="sx-buy" data-add="' + pageKey + '">Start the free trial — $0 today</button>' +
        '<button class="sx-see" data-sx="stay">Keep reading</button></div>';
    }

    document.body.appendChild(scrim); document.body.appendChild(box);
    requestAnimationFrame(function () { scrim.classList.add("on"); box.classList.add("on"); });
    scrim.addEventListener("click", close);
    box.querySelector(".sx-x").addEventListener("click", close);
    box.addEventListener("click", function (e) {
      var t = e.target;
      if (t.getAttribute("data-sx") === "stay") { close(); return; }
      if (t.getAttribute("data-sx") === "save") {
        close();
        var f = document.getElementById("cartSaveForm");
        if (f) { f.scrollIntoView({ behavior: "smooth", block: "center" });
                 setTimeout(function () { var i = f.querySelector("input[type=email]"); if (i) i.focus(); }, 450); }
        track("exit_intent_save_cart", "checkout");
        return;
      }
      if (t.getAttribute("data-add")) { setTimeout(close, 400); track("exit_intent_add_to_cart", pageKey); }
    });
    track("exit_intent_shown", (isCheckout ? "checkout" : pageKey) + ":" + reason);
  }

  /* desktop: cursor exits through the top */
  document.addEventListener("mouseout", function (e) {
    if (e.relatedTarget || e.toElement) return;
    if (e.clientY > 8) return;
    show("cursor-top");
  });

  /* mobile: hard scroll-up after real downward progress */
  var lastY = 0, lastT = 0;
  window.addEventListener("scroll", function () {
    var y = window.scrollY, t = Date.now();
    var doc = document.documentElement;
    var depth = (y + window.innerHeight) / Math.max(1, doc.scrollHeight);
    if (depth > maxScroll) maxScroll = depth;
    if (maxScroll > 0.45 && y > 300) armedMobile = true;
    if (armedMobile && lastT && y < lastY) {
      var v = (lastY - y) / Math.max(1, t - lastT);   // px per ms, upward
      if (v > 2.2 && y < lastY - 350) show("scroll-up");
    }
    lastY = y; lastT = t;
  }, { passive: true });
})();
