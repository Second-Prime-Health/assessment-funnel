/* Second Prime first-party funnel tracker. Vanilla JS, no dependencies.
   - Session id in localStorage (sp_sid), attribution captured first-touch (sp_attr)
   - Events queue and flush in batches via sendBeacon (text/plain to avoid preflight)
   - The Meta pixel is a separate system and is NOT touched by this file.
   - Assessment answers flow ONLY here (our own database), never to the pixel.
   See TRACKING.md for the taxonomy. */
(function () {
  var ENDPOINT = 'https://abqvlsxosdvdqrkixoqm.supabase.co/functions/v1/track';
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                   'fbclid', 'campaign_id', 'adset_id', 'ad_id', 'placement'];

  function store(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  // ---- Session id ----
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  var sid = read('sp_sid');
  if (!sid) { sid = uuid(); store('sp_sid', sid); }

  // ---- Attribution: first touch wins, persisted across pages ----
  var attr = {};
  try { attr = JSON.parse(read('sp_attr') || '{}'); } catch (_) {}
  var qs = new URLSearchParams(location.search);
  var sawNewParams = false;
  ATTR_KEYS.forEach(function (k) {
    var v = qs.get(k);
    if (v && !attr[k]) { attr[k] = v; sawNewParams = true; }
  });
  if (!attr.landing_page) { attr.landing_page = location.pathname; sawNewParams = true; }
  if (!attr.referrer && document.referrer && document.referrer.indexOf(location.host) === -1) {
    attr.referrer = document.referrer.slice(0, 300); sawNewParams = true;
  }
  if (sawNewParams) store('sp_attr', JSON.stringify(attr));

  // ---- Environment + device ----
  var host = location.hostname;
  var env = (host === 'localhost' || host === '127.0.0.1') ? 'local'
    : (host === 'tests.secondprime.io' || /github\.io$/.test(host)) ? 'preview' : 'prod';
  var ua = navigator.userAgent || '';
  var device = /Mobi|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop';
  var os = /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'other';
  var browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'other';

  function sessionPayload() {
    return {
      id: sid, env: env,
      landing_page: attr.landing_page, referrer: attr.referrer,
      utm_source: attr.utm_source, utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign, utm_content: attr.utm_content, utm_term: attr.utm_term,
      fbclid: attr.fbclid,
      campaign_id: attr.campaign_id, campaign_name: attr.utm_campaign,
      adset_id: attr.adset_id, adset_name: attr.utm_term,
      ad_id: attr.ad_id, ad_name: attr.utm_content,
      placement: attr.placement,
      variant: window.spVariant || 'control',
      device: device, os: os, browser: browser, ua: ua
    };
  }

  // ---- Queue + flush ----
  var queue = [];
  var flushTimer = null;
  function doFlush() {
    flushTimer = null;
    if (!queue.length) return;
    var batch = queue.splice(0, 50);
    var body = JSON.stringify({ session: sessionPayload(), events: batch });
    var sent = false;
    /* text/plain keeps this a CORS "simple request": no preflight, so
       sendBeacon delivers even as the page unloads. The server parses JSON
       from the raw body regardless of content type. */
    if (navigator.sendBeacon) {
      try { sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' })); } catch (_) {}
    }
    if (!sent) {
      try {
        fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true,
          headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
      } catch (_) {}
    }
  }
  function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(doFlush, 2500);
  }

  window.spTrack = function (event, props) {
    queue.push({ event: event, ts: new Date().toISOString(),
      page: location.pathname.split('/').pop() || 'index.html', props: props || {} });
    scheduleFlush();
  };
  window.spFlush = doFlush;
  window.spSession = function () {
    var s = sessionPayload();
    return {
      session_id: s.id, variant: s.variant,
      utm_source: s.utm_source || '', utm_medium: s.utm_medium || '',
      utm_campaign: s.utm_campaign || '', utm_content: s.utm_content || '', utm_term: s.utm_term || '',
      fbclid: s.fbclid || '', campaign_id: s.campaign_id || '',
      adset_id: s.adset_id || '', ad_id: s.ad_id || ''
    };
  };

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') doFlush();
  });
  window.addEventListener('pagehide', doFlush);

  // ---- Automatic events ----
  window.spTrack('page_view', { title: document.title });

  // Any element with data-cta fires a labeled click.
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-cta]') : null;
    if (el) { window.spTrack('cta_click', { cta_id: el.getAttribute('data-cta') }); doFlush(); }
  }, true);

  // Vimeo engagement: play + 25/50/75/95 milestones per video, once each.
  function bindVimeo() {
    if (!window.Vimeo || !window.Vimeo.Player) return;
    var frames = document.querySelectorAll('iframe[src*="player.vimeo.com"]');
    Array.prototype.forEach.call(frames, function (frame) {
      if (frame.dataset.spBound) return;
      frame.dataset.spBound = '1';
      var idMatch = (frame.src || '').match(/video\/(\d+)/);
      var vid = idMatch ? idMatch[1] : 'unknown';
      try {
        var player = new Vimeo.Player(frame);
        var fired = {};
        function mark(m) {
          if (fired[m]) return; fired[m] = true;
          window.spTrack('video_progress', { video_id: vid, milestone: m });
        }
        player.on('play', function () { mark('play'); });
        player.on('timeupdate', function (d) {
          if (!d.duration) return;
          var pct = d.seconds / d.duration * 100;
          if (pct >= 95) mark('95'); else if (pct >= 75) mark('75');
          else if (pct >= 50) mark('50'); else if (pct >= 25) mark('25');
        });
      } catch (_) {}
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(bindVimeo, 400); });
  } else { setTimeout(bindVimeo, 400); }
})();
