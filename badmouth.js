/**
 * badmouth-v1.js — First-party tracking script for the Badmouth Attribution Engine.
 *
 * Install (DEFAULT — use this):
 *   <script
 *     data-key="bm_pub_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *     src="https://t.badmetryx.com/badmouth-v1.js"
 *     defer
 *   ></script>
 *
 * data-key ONLY. Badmouth clients load Meta Pixel + GA4 through their GTM container,
 * so this script must NOT init them too — that double-fires every PageView and Lead,
 * which corrupts the client's data and degrades Meta's optimization.
 *
 * Escape hatch — ONLY for a site with no GTM container, where this script is the sole
 * tracker. Requires an explicit opt-in flag; the id attributes alone do nothing:
 *   <script
 *     data-key="bm_pub_..."
 *     data-init-tags="1"          <-- required, or the ids below are ignored
 *     data-pixel-id="123456789"
 *     data-ga4-id="G-XXXXXXXXXX"
 *     src="https://t.badmetryx.com/badmouth-v1.js"
 *     defer
 *   ></script>
 *
 * What it does:
 *  - Persistent visitor UUID (_bm_vid, 2-year cookie + localStorage)
 *  - Per-session UUID (_bm_sid, sessionStorage)
 *  - First-touch UTM capture (localStorage)
 *  - Cross-domain stitching via ?_bm= / ?_bm_src= URL params
 *  - Auto page_view on load + scroll depth (25/50/75/100) + sampled web vitals (10%)
 *  - Auto lead event on [data-funnel-form] submit (extracts email + phone)
 *  - Outbound link injection so visitor follows across all installed domains
 *  - Optional Meta Pixel + GA4 init alongside our own ingest
 *  - Public API: window.bm.track(eventName, props)
 *
 * v1.0.0
 */
(function () {
  'use strict';

  var script  = document.currentScript;
  var KEY     = (script && script.getAttribute('data-key'))      || window._bmKey;

  // Tag fan-out is OPT-IN. Without data-init-tags, the pixel/GA4 ids are ignored and we
  // stay ingest-only. Default assumption: the site runs GTM and GTM owns Meta + GA4.
  // Opting in on a GTM site double-fires PageView/Lead — see the install docblock.
  var INIT_TAGS = !!(script && script.getAttribute('data-init-tags')) || !!window._bmInitTags;
  var PIXEL   = INIT_TAGS ? ((script && script.getAttribute('data-pixel-id')) || window._bmPixelId) : null;
  var GA4     = INIT_TAGS ? ((script && script.getAttribute('data-ga4-id'))   || window._bmGa4Id)   : null;

  // Default endpoint = same host the script is loaded from (t.badmetryx.com → /api/track).
  // Override with data-track-url if hosting on a different domain.
  var TRACK_URL = (script && script.getAttribute('data-track-url'))
               || (script && script.src ? new URL('/api/track', script.src).toString() : '/api/track');

  if (!KEY) return; // silent no-op without a tenant key

  // ── UUID generation ───────────────────────────────────────────────────────

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // RFC4122 v4 fallback for older browsers
    var d = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ── Cookie + storage helpers ──────────────────────────────────────────────

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + encodeURIComponent(value || '')
      + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
  }
  function getCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(prefix) === 0) return decodeURIComponent(c.slice(prefix.length));
    }
    return null;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return getCookie(k); } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { setCookie(k, v, 365); } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  // ── IDs ───────────────────────────────────────────────────────────────────

  function getVisitorId() {
    var v = lsGet('_bm_vid') || getCookie('_bm_vid');
    if (!v || !UUID_RE.test(v)) {
      v = uuid();
      lsSet('_bm_vid', v);
      setCookie('_bm_vid', v, 730); // 2 years
    }
    return v;
  }
  function getSessionId() {
    var s = ssGet('_bm_sid');
    if (!s || !UUID_RE.test(s)) {
      s = uuid();
      ssSet('_bm_sid', s);
    }
    return s;
  }

  // ── UTM capture (first-touch persisted, last-touch from current URL) ──────

  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id'];

  function captureUTMs() {
    var p = new URLSearchParams(window.location.search);
    var src = p.get('utm_source');
    if (src && !lsGet('_bm_utm_source')) {
      lsSet('_bm_utm_source',   src);
      lsSet('_bm_utm_medium',   p.get('utm_medium')   || '');
      lsSet('_bm_utm_campaign', p.get('utm_campaign') || '');
      lsSet('_bm_utm_term',     p.get('utm_term')     || '');
      lsSet('_bm_utm_content',  p.get('utm_content')  || '');
      lsSet('_bm_referrer',     document.referrer     || '');
    }
    for (var i = 0; i < CLICK_IDS.length; i++) {
      var id = CLICK_IDS[i];
      var value = p.get(id);
      if (value && !lsGet('_bm_' + id)) lsSet('_bm_' + id, value);
    }
  }
  function getUTMs() {
    var p = new URLSearchParams(window.location.search);
    var data = {
      first_utm_source:   lsGet('_bm_utm_source')   || '',
      first_utm_medium:   lsGet('_bm_utm_medium')   || '',
      first_utm_campaign: lsGet('_bm_utm_campaign') || '',
      first_utm_term:     lsGet('_bm_utm_term')     || '',
      first_utm_content:  lsGet('_bm_utm_content')  || '',
      last_utm_source:    p.get('utm_source')   || '',
      last_utm_medium:    p.get('utm_medium')   || '',
      last_utm_campaign:  p.get('utm_campaign') || '',
      last_utm_term:      p.get('utm_term')     || '',
      last_utm_content:   p.get('utm_content')  || ''
    };
    for (var i = 0; i < CLICK_IDS.length; i++) {
      var id = CLICK_IDS[i];
      data[id] = p.get(id) || lsGet('_bm_' + id) || '';
    }
    return data;
  }

  // ── Cross-domain visitor handoff ──────────────────────────────────────────

  function handleIncomingId() {
    var p = new URLSearchParams(window.location.search);
    var incoming = p.get('_bm');
    if (incoming && UUID_RE.test(incoming)) {
      lsSet('_bm_vid', incoming);
      setCookie('_bm_vid', incoming, 730);
      var crossSrc = p.get('_bm_src');
      if (crossSrc) {
        lsSet('_bm_utm_source',   crossSrc);
        lsSet('_bm_utm_medium',   p.get('_bm_med') || '');
        lsSet('_bm_utm_campaign', p.get('_bm_cmp') || '');
      }
    }
  }
  function injectOutboundLinks() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el || !el.href) return;
      try {
        var url = new URL(el.href);
        if (
          url.hostname !== window.location.hostname &&
          url.protocol !== 'mailto:' &&
          url.protocol !== 'tel:'
        ) {
          url.searchParams.set('_bm', getVisitorId());
          var src = lsGet('_bm_utm_source');
          if (src) {
            url.searchParams.set('_bm_src', src);
            url.searchParams.set('_bm_med', lsGet('_bm_utm_medium')   || '');
            url.searchParams.set('_bm_cmp', lsGet('_bm_utm_campaign') || '');
          }
          el.href = url.toString();
        }
      } catch (err) {}
    });
  }

  // ── Meta Pixel / GA4 (optional) ───────────────────────────────────────────

  function initMetaPixel(id) {
    if (!id) return;
    // Someone else (almost always GTM) already loaded the pixel. Re-initing here would
    // fire a second PageView for the same visit. Bail and say why.
    if (window.fbq) {
      if (window.console && console.warn) {
        console.warn('[badmouth] Meta Pixel already initialized (likely GTM). Skipping ' +
          'init to avoid double-firing PageView. Remove data-pixel-id/data-init-tags.');
      }
      return;
    }
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', id); window.fbq('track', 'PageView');
  }
  function initGA4(id) {
    if (!id) return;
    // gtag already present means GTM (or another gtag snippet) owns GA4. A second
    // gtag('config', id) re-sends page_view for that measurement id. Bail.
    if (window.gtag) {
      if (window.console && console.warn) {
        console.warn('[badmouth] gtag already present (likely GTM). Skipping GA4 config ' +
          'to avoid double-counting page_view. Remove data-ga4-id/data-init-tags.');
      }
      return;
    }
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
  }

  // ── Device + viewport ─────────────────────────────────────────────────────

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|mini|windows\sce|palm/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getPageType() {
    var explicit = document.body && document.body.getAttribute('data-bm-page-type');
    if (explicit) return explicit;
    var meta = document.querySelector('meta[name="bm:page_type"], meta[property="bm:page_type"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    var path = window.location.pathname.toLowerCase();
    if (/thank|success|confirmed/.test(path)) return 'thank_you';
    if (/book|calendar|appointment|schedule/.test(path)) return 'booking';
    if (/apply|application|intake/.test(path)) return 'application';
    if (/quiz|scorecard|assessment/.test(path)) return 'quiz';
    if (/case-stud|testimonial/.test(path)) return 'case_study';
    if (/blog|resources|article|guide/.test(path)) return 'content';
    if (path === '/' || path === '') return 'home';
    return 'page';
  }

  function getPageCategory() {
    return (document.body && document.body.getAttribute('data-bm-page-category'))
      || (document.querySelector('meta[name="bm:page_category"]') || {}).content
      || '';
  }

  // ── Core track ────────────────────────────────────────────────────────────

  function track(eventName, props) {
    var loc = window.location;
    var payload = {
      key:         KEY,
      event_name:  eventName,
      visitor_id:  getVisitorId(),
      session_id:  getSessionId(),
      client_ts:   new Date().toISOString(),
      url:         loc.href,
      path:        loc.pathname + loc.search,
      referrer:    document.referrer || '',
      properties:  Object.assign({
        event_id:        uuid(),
        title:           document.title,
        page_type:       getPageType(),
        page_category:   getPageCategory(),
        device_type:     getDeviceType(),
        screen_w:        window.screen ? window.screen.width  : null,
        screen_h:        window.screen ? window.screen.height : null,
        viewport_w:      window.innerWidth,
        viewport_h:      window.innerHeight,
        language:        navigator.language,
        timezone_offset: new Date().getTimezoneOffset()
      }, getUTMs(), props || {})
    };
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(TRACK_URL, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(TRACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});
    }
    if (eventName === 'lead.created' || eventName === 'lead' || eventName === 'quiz.completed') {
      if (window.fbq) window.fbq('track', 'Lead');
      if (window.gtag && GA4) window.gtag('event', 'generate_lead', { send_to: GA4 });
    }
    if (eventName === 'call.booked') {
      if (window.fbq) window.fbq('track', 'Schedule');
      if (window.gtag && GA4) window.gtag('event', 'generate_lead', { send_to: GA4, event_category: 'booking' });
    }
    if (eventName === 'purchase.completed') {
      var value = props && props.value ? props.value : 0;
      if (window.fbq) window.fbq('track', 'Purchase', { value: value, currency: (props && props.currency) || 'USD' });
      if (window.gtag && GA4) window.gtag('event', 'purchase', { send_to: GA4, value: value, currency: (props && props.currency) || 'USD' });
    }
  }

  // ── Funnel form auto-capture ──────────────────────────────────────────────

  function interceptFunnelForms() {
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !(form.getAttribute('data-funnel-form') || form.getAttribute('data-bm-lead-form') || form.getAttribute('data-bm-form'))) {
        if (!form || !form.querySelector('input[type="email"], input[name*="email" i], input[type="tel"], input[name*="phone" i]')) return;
      }
      var email = '', phone = '';
      var inputs = form.querySelectorAll('input, select, textarea');
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        var name = (el.name || el.type || '').toLowerCase();
        var val = el.value ? el.value.trim() : '';
        if (!val) continue;
        if (!email && (el.type === 'email' || name.indexOf('email') !== -1)) email = val;
        if (!phone && (el.type === 'tel'   || name.indexOf('phone') !== -1)) phone = val;
      }
      if (email || phone) {
        track('lead.created', {
          email: email || undefined,
          phone: phone || undefined,
          form_id: form.id || '',
          form_name: form.getAttribute('name') || '',
          lead_magnet: form.getAttribute('data-bm-lead-magnet') || form.getAttribute('data-lead-magnet') || getPageType()
        });
      }
    }, true);
  }

  function trackImportantClicks() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.nodeType === 3) el = el.parentElement;
      while (el && el.tagName !== 'A' && !(el.getAttribute && el.getAttribute('data-bm-click'))) el = el.parentElement;
      if (!el) return;
      var href = el.href || '';
      var label = (el.getAttribute('data-bm-click') || el.textContent || '').trim().slice(0, 120);
      try {
        var url = href ? new URL(href, window.location.href) : null;
        if (href.indexOf('tel:') === 0) return track('click.phone', { href: href, label: label });
        if (href.indexOf('mailto:') === 0) return track('click.email', { href: href, label: label });
        if (url && /calendly|calendar|book|schedule|appointment/i.test(url.href)) return track('click.booking', { href: url.href, label: label });
        if (url && url.hostname !== window.location.hostname) return track('click.outbound', { href: url.href, label: label });
      } catch (err) {}
      if (el.getAttribute('data-bm-click')) track('click.cta', { label: label });
    }, true);
  }

  // ── Scroll depth ──────────────────────────────────────────────────────────

  function trackScrollDepth() {
    var thresholds = [25, 50, 75, 100];
    var fired = {};
    function pct() {
      var dh = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      var wh = window.innerHeight;
      var st = window.pageYOffset || document.documentElement.scrollTop;
      if (dh <= wh) return 100;
      return Math.round((st / (dh - wh)) * 100);
    }
    var t;
    window.addEventListener('scroll', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var p = pct();
        for (var i = 0; i < thresholds.length; i++) {
          var d = thresholds[i];
          if (p >= d && !fired[d]) { fired[d] = true; track('scroll_depth', { depth: d }); }
        }
      }, 200);
    }, { passive: true });
  }

  // ── Web vitals (10% sampled) ──────────────────────────────────────────────

  function collectWebVitals() {
    if (Math.random() > 0.1) return;
    var m = {}; var sent = false;
    function flush() {
      if (sent || !m.lcp || m.cls === undefined) return;
      sent = true;
      var ct = '';
      try { var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection; if (c) ct = c.effectiveType || ''; } catch (e) {}
      track('web_vitals', {
        lcp_ms: Math.round(m.lcp),
        cls_score: Math.round(m.cls * 1000) / 1000,
        inp_ms: m.inp ? Math.round(m.inp) : null,
        ttfb_ms: m.ttfb ? Math.round(m.ttfb) : null,
        connection_type: ct || null
      });
    }
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav) m.ttfb = nav.responseStart - nav.requestStart;
    } catch (e) {}
    if (typeof PerformanceObserver === 'undefined') return;
    try { new PerformanceObserver(function (l) { var es = l.getEntries(); if (es.length) { m.lcp = es[es.length - 1].startTime; flush(); } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
    try { var cv = 0; new PerformanceObserver(function (l) { var es = l.getEntries(); for (var i = 0; i < es.length; i++) if (!es[i].hadRecentInput) cv += es[i].value; m.cls = cv; flush(); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
    try { new PerformanceObserver(function (l) { var es = l.getEntries(); if (es.length) { m.inp = es[es.length - 1].duration; flush(); } }).observe({ type: 'event', buffered: true }); } catch (e) {}
    setTimeout(function () { if (!sent && (m.lcp || m.cls !== undefined)) { if (m.cls === undefined) m.cls = 0; if (!m.lcp) m.lcp = 0; flush(); } }, 10000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  handleIncomingId();
  captureUTMs();
  initMetaPixel(PIXEL);
  initGA4(GA4);
  injectOutboundLinks();

  function bootstrap() {
    track('page_view');
    interceptFunnelForms();
    trackImportantClicks();
    trackScrollDepth();
    collectWebVitals();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  function identify(props) {
    track('lead.identified', props || {});
  }

  // Public API
  window.bm = { track: track, identify: identify };
  window.badmouth = window.bm;
})();
