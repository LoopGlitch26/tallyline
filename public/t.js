/*! Tallyline tracker | <script defer data-site="PROPERTY_ID" src="https://YOUR-TALLYLINE/t.js"></script> */
(function (win, doc) {
  'use strict';

  var me = doc.currentScript;
  if (!me) return;

  var cfg = {
    site: me.getAttribute('data-site'),
    endpoint: me.getAttribute('data-endpoint') || new URL(me.src).origin + '/api/collect',
    allowLocal: me.hasAttribute('data-allow-local'),
    cookieDomain: me.getAttribute('data-cookie-domain'),
  };
  var UID = 'tl_uid', VSN = 'tl_vsn';
  var YEAR_S = 365 * 86400, VISIT_S = 30 * 60;
  var pendingCalls = (win.tally && win.tally.q) || [];
  var loc = win.location;

  function off() {
    var stub = function () {};
    stub.ids = function () { return {}; };
    win.tally = stub;
  }

  // ---- opt-out: visit any page once with ?tally_off=1 (undo with ?tally_off=0)
  var store = null;
  try { store = win.localStorage; } catch (e) {}
  try {
    var flag = new URLSearchParams(loc.search).get('tally_off');
    if (store && flag === '1') store.setItem('tally_off', '1');
    if (store && flag === '0') store.removeItem('tally_off');
  } catch (e) {}
  var optedOut = !!(store && store.getItem('tally_off') === '1');
  var isLocal = loc.protocol === 'file:' || /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\])$|\.local$/.test(loc.hostname);

  if (!cfg.site || optedOut || win.navigator.webdriver || (isLocal && !cfg.allowLocal)) return off();

  // ---- first-party cookies, scoped to the registrable domain so app.example.com and example.com match
  function getCookie(name) {
    var parts = doc.cookie ? doc.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (parts[i].slice(0, eq) === name) return decodeURIComponent(parts[i].slice(eq + 1));
    }
    return null;
  }
  function widestDomain() {
    if (cfg.cookieDomain) return cfg.cookieDomain;
    var labels = loc.hostname.split('.');
    if (labels.length < 2 || /^\d+$/.test(labels[labels.length - 1])) return null;
    // Try example.com, then shop.example.com... the first one the browser accepts is the root.
    for (var n = 2; n <= labels.length; n++) {
      var candidate = labels.slice(-n).join('.');
      doc.cookie = 'tl_probe=1; path=/; domain=' + candidate + '; SameSite=Lax';
      if (getCookie('tl_probe')) {
        doc.cookie = 'tl_probe=; path=/; domain=' + candidate + '; max-age=0';
        return candidate;
      }
    }
    return null;
  }
  var rootDomain = widestDomain();
  function putCookie(name, value, seconds) {
    var c = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + seconds + '; SameSite=Lax';
    if (rootDomain) c += '; domain=' + rootDomain;
    if (loc.protocol === 'https:') c += '; Secure';
    doc.cookie = c;
  }
  function randomId() {
    var c = win.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    var hex = '';
    for (var j = 0; j < 16; j++) hex += (b[j] + 256).toString(16).slice(1);
    return hex;
  }
  /** Current ids; refreshes the 30-minute visit cookie on every call (sliding window). */
  function ids() {
    var uid = getCookie(UID) || randomId();
    var vsn = getCookie(VSN) || randomId();
    putCookie(UID, uid, YEAR_S);
    putCookie(VSN, vsn, VISIT_S);
    return { uid: uid, vsn: vsn };
  }

  // ---- sending
  // Query params that may carry personal data never leave the browser.
  var SENSITIVE = /^(e-?mail|name|first_?name|last_?name|phone|password|pass|pwd|token|access_token|id_token|refresh_token|auth|code|secret|key|api_key|license|license_key)$/i;
  function scrub(href) {
    try {
      var u = new URL(href);
      Array.from(u.searchParams.keys()).forEach(function (k) { if (SENSITIVE.test(k)) u.searchParams.delete(k); });
      return u.href;
    } catch (e) { return href; }
  }
  function ship(kind, fields, useBeacon) {
    var id = ids();
    var data = { site: cfg.site, kind: kind, url: scrub(loc.href), uid: id.uid, vsn: id.vsn, sw: win.screen ? win.screen.width : 0 };
    if (fields) for (var k in fields) if (fields[k] !== undefined) data[k] = fields[k];
    var payload = JSON.stringify(data);
    // text/plain = "simple" CORS request: no preflight, and sendBeacon accepts it.
    if (useBeacon && win.navigator.sendBeacon) {
      try { if (win.navigator.sendBeacon(cfg.endpoint, new Blob([payload], { type: 'text/plain' }))) return; } catch (e) {}
    }
    try {
      win.fetch(cfg.endpoint, { method: 'POST', body: payload, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } })
        .catch(function () {});
    } catch (e) {}
  }

  // ---- engaged time: counted only while the tab is in the foreground
  var engaged = { since: doc.visibilityState === 'visible' ? Date.now() : 0, banked: 0, beats: 0 };
  function bank() {
    if (engaged.since) {
      engaged.banked += Date.now() - engaged.since;
      engaged.since = doc.visibilityState === 'visible' ? Date.now() : 0;
    }
  }
  function beat(useBeacon) {
    bank();
    if (engaged.banked < 1000) return;
    ship('beat', { ms: Math.round(engaged.banked) }, useBeacon);
    engaged.banked = 0;
  }
  doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState === 'visible') engaged.since = Date.now();
    else beat(true);
  });
  win.addEventListener('pagehide', function () { beat(true); });
  // Heartbeat each minute (max 30 per page) so long reads count even if the tab is never hidden.
  setInterval(function () {
    if (doc.visibilityState === 'visible' && engaged.beats < 30) { engaged.beats++; beat(false); }
  }, 60 * 1000);

  // ---- page views, including client-side routing
  var currentPage = null, sentFirst = false;
  function view() {
    var page = loc.pathname + loc.search;
    if (page === currentPage) return;
    if (currentPage !== null) beat(false);
    currentPage = page;
    engaged.beats = 0;
    ship('view', { ref: sentFirst ? '' : doc.referrer });
    sentFirst = true;
  }
  if (win.history && win.history.pushState) {
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = win.history[method];
      win.history[method] = function () {
        var out = original.apply(this, arguments);
        setTimeout(view, 0);
        return out;
      };
    });
    win.addEventListener('popstate', view);
  }

  // ---- goals
  function conversion(name, meta) {
    if (!name) return;
    ship('conversion', { label: String(name).slice(0, 64), meta: meta || undefined }, true);
  }

  // ---- Dodo Payments checkout links: carry the visitor ids into the payment metadata.
  // Tagged as soon as links appear (not only on click), because other scripts may read href first.
  function isDodo(host) { return host === 'dodopayments.com' || /\.dodopayments\.com$/.test(host); }
  function tagLink(a) {
    try {
      var u = new URL(a.href);
      if (!isDodo(u.hostname)) return;
      var id = ids();
      u.searchParams.set('metadata_tl_uid', id.uid);
      u.searchParams.set('metadata_tl_vsn', id.vsn);
      if (a.href !== u.href) a.href = u.href;
    } catch (e) {}
  }
  function tagAll() {
    var links = doc.querySelectorAll('a[href*="dodopayments.com"]');
    for (var i = 0; i < links.length; i++) tagLink(links[i]);
  }
  var tagTimer = 0;
  function scheduleTag() {
    if (tagTimer) return;
    tagTimer = setTimeout(function () { tagTimer = 0; tagAll(); }, 60);
  }
  if (win.MutationObserver) {
    new MutationObserver(scheduleTag).observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', tagAll);
  else tagAll();

  function closestLink(target) { return target && target.closest ? target.closest('a[href]') : null; }
  // Re-tag right before navigation starts, in case the visit id rolled over while the page sat idle.
  doc.addEventListener('pointerdown', function (e) { var a = closestLink(e.target); if (a) tagLink(a); }, true);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var a = closestLink(e.target); if (a) tagLink(a); } }, true);

  // ---- clicks: data-tally goals and outbound links
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var goalEl = t.closest('[data-tally]');
    if (goalEl) {
      var meta = {}, hasMeta = false;
      for (var i = 0; i < goalEl.attributes.length; i++) {
        var attr = goalEl.attributes[i];
        if (attr.name.indexOf('data-tally-') === 0) { meta[attr.name.slice(11)] = attr.value.slice(0, 255); hasMeta = true; }
      }
      conversion(goalEl.getAttribute('data-tally'), hasMeta ? meta : undefined);
    }
    var a = closestLink(t);
    if (!a) return;
    tagLink(a);
    try {
      var dest = new URL(a.href, loc.href);
      var internal = dest.hostname === loc.hostname || (rootDomain && (dest.hostname === rootDomain || dest.hostname.slice(-rootDomain.length - 1) === '.' + rootDomain));
      if ((dest.protocol === 'http:' || dest.protocol === 'https:') && !internal) ship('exit', { label: dest.origin + dest.pathname }, true);
    } catch (err) {}
  }
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true);

  // ---- public API: tally('event', name, meta) | tally('identify', {...}) | tally('view') | tally.ids()
  function tally(command, a, b) {
    switch (command) {
      case 'event':
      case 'goal':
        conversion(a, b);
        break;
      case 'identify':
        if (a) ship('who', { meta: { user_id: a.user_id || a.id, email: a.email, name: a.name } });
        break;
      case 'view':
        currentPage = null;
        view();
        break;
    }
  }
  tally.ids = function () {
    var id = ids();
    return { tl_uid: id.uid, tl_vsn: id.vsn };
  };
  win.tally = tally;

  view();
  for (var q = 0; q < pendingCalls.length; q++) tally.apply(null, pendingCalls[q]);
})(window, document);
