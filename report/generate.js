#!/usr/bin/env node
/* Per-lead Report of Findings generator.

   Usage:
     node report/generate.js <lead.json> [--out DIR]
     node report/generate.js --demo

   Input is the assessment payload (the same shape stored in localStorage under
   `sp_assessment`, or assembled from the funnel-analytics `leads` + `answers`
   rows). Output is a self-contained HTML report plus an internal call-notes
   block that is never rendered to the lead.

   Structure follows RESEARCH/REPORT_SHOWUP_RESEARCH.md §3 (nine sections).
   Clinical copy comes from RESEARCH/REPORT_CONTENT_LIBRARY.md via patterns.js.

   Decisions enforced here:
   - No 0-100 score in lead-facing output. Statuses only. (HANDOFF.md:5-10)
   - No tier disclosure anywhere a lead can read. (HANDOFF.md, RESULTS-EMAIL.md)
   - Findings capped at 5, patterns at 3, section-6 markers at 5.
   - Every finding keeps its efficacy close even if truncated. */

'use strict';

var fs = require('fs');
var path = require('path');
var lib = require('./patterns.js');

var MIRRORS = require('./mirrors.js');

/* ---------- helpers ---------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* familyList arrives as an array from localStorage but as a comma-joined
   string from the GHL webhook (assessment.html:900). Normalize both. */
function toList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function oxford(items) {
  var a = items.slice();
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return a[0] + ' and ' + a[1];
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

/* ---------- scoring ----------
   Mirrors computeScore() at assessment.html:845-862 exactly so a report can be
   generated from raw answers when the stored score is absent. Point values are
   the data-pts attributes at assessment.html:133-221. */

var PTS = {
  energy: { 'Strong from morning to evening': 0, 'Good mornings, fading after lunch': 2, 'The 3pm crash runs my calendar': 4, "I'm running on coffee and willpower": 5 },
  focus: { "As sharp as I've ever been": 0, 'A step slower than I was': 2, 'Foggy. Words go missing, focus drifts, most days': 4 },
  sleep: { 'Rested and ready': 0, 'I sleep 7-8 hours and still wake up tired': 3, 'Broken sleep, most nights': 4 },
  drive: { "Where they've always been": 0, 'Noticeably lower': 3, 'A fraction of what they were': 5 },
  bodycomp: { 'I feel good where I am': 0, 'I need to lose 5 to 25 lbs': 2, 'I need to lose 25 to 50 lbs': 4, 'I need to lose 50+ lbs': 5, 'I need to gain weight': 2 },
  labs: { 'Deep panel in the last 12 months': 0, 'Standard annual physical only': 3, "It's been years since any real bloodwork": 5 }
};
var PERF_MAX = 18, RISK_MAX = 14;

function familyPts(list) {
  var real = toList(list).filter(function (x) { return x && x !== 'None of these'; });
  return real.length >= 2 ? 4 : real.length === 1 ? 2 : 0;
}
function bucketStatus(share) { return share >= 0.6 ? 'flag' : share >= 0.28 ? 'drift' : 'solid'; }

function computeScore(a) {
  var perf = (PTS.energy[a.energy] || 0) + (PTS.focus[a.focus] || 0) +
             (PTS.sleep[a.sleep] || 0) + (PTS.drive[a.drive] || 0);
  var risk = (PTS.bodycomp[a.bodycomp] || 0) + familyPts(a.familyList || a.family) +
             (PTS.labs[a.labs] || 0);
  return {
    score: Math.round(100 - ((perf + risk) / (PERF_MAX + RISK_MAX)) * 78),
    /* pct is INVERTED: high pct = good read. Do not re-invert downstream. */
    perf: { pts: perf, pct: Math.round(100 - (perf / PERF_MAX) * 100), status: bucketStatus(perf / PERF_MAX) },
    risk: { pts: risk, pct: Math.round(100 - (risk / RISK_MAX) * 100), status: bucketStatus(risk / RISK_MAX) }
  };
}

/* ---------- section 5: the gap, keyed to their labs answer ----------
   REPORT_CONTENT_LIBRARY.md §8. Quantify the gap, not the person. */
var GAP_LINES = {
  'Deep panel in the last 12 months': "You\u2019ve had real bloodwork done \u2014 more than most. Worth knowing: a deep panel still typically runs a few hundred markers. We measure 1,000+, and we read them against optimal instead of the reference range.",
  'Standard annual physical only': "Your last physical checked roughly 40 markers. The Executive Longevity Assessment measures 1,000+. Below are a few of the other 960 we\u2019d start with.",
  "It's been years since any real bloodwork": "There is no current data on you. Not a thin picture \u2014 none. That means everything in this report is inference, and one draw replaces all of it with facts."
};

/* ---------- assembly ---------- */

function selectPatterns(a, r) {
  var fired = lib.PATTERNS.filter(function (p) {
    try { return p.when(a, r); } catch (_) { return false; }
  });
  /* M7 supersedes M6 — never render both. (§3 rule 1) */
  if (fired.some(function (p) { return p.id === 'M7'; })) {
    fired = fired.filter(function (p) { return p.id !== 'M6'; });
  }
  /* Worse bucket first, matching results.html:277 (ascending pct = worse first). */
  fired.sort(function (x, y) { return r[x.bucket].pct - r[y.bucket].pct; });
  return fired;
}

/* Findings (section 4): single-answer mirrors, capped at 5, worse bucket first. */
var FINDING_FIELDS = [
  { key: 'energy', bucket: 'perf' }, { key: 'focus', bucket: 'perf' },
  { key: 'sleep', bucket: 'perf' }, { key: 'drive', bucket: 'perf' },
  { key: 'bodycomp', bucket: 'risk' }, { key: 'familyList', bucket: 'risk' },
  { key: 'labs', bucket: 'risk' }
];

function selectFindings(a, r) {
  var out = [];
  FINDING_FIELDS.forEach(function (f) {
    var ans = f.key === 'familyList' ? toList(a.familyList || a.family).join(', ') : a[f.key];
    if (!ans) return;
    var m = MIRRORS[f.key];
    var meaning = m && (f.key === 'familyList' ? MIRRORS.familyMeaning(toList(a.familyList || a.family)) : m[ans]);
    if (!meaning) return;
    var pts = f.key === 'familyList' ? familyPts(a.familyList || a.family) : (PTS[f.key] ? PTS[f.key][ans] || 0 : 0);
    out.push({ field: f.key, bucket: f.bucket, answer: ans, meaning: meaning, pts: pts });
  });
  /* Worst answers first within worst bucket first. */
  out.sort(function (x, y) {
    var bd = r[x.bucket].pct - r[y.bucket].pct;
    if (bd !== 0) return bd;
    return y.pts - x.pts;
  });
  return out.filter(function (f) { return f.pts > 0; }).slice(0, 5);
}

function buildReport(payload) {
  var a = payload.data || payload;
  a = Object.assign({}, a);
  a.familyList = toList(a.familyList || a.family);

  var r = (payload.perf && payload.risk)
    ? { score: payload.score, perf: payload.perf, risk: payload.risk }
    : computeScore(a);

  var patterns = selectPatterns(a, r).slice(0, 3);
  var allFired = selectPatterns(a, r);
  var findings = selectFindings(a, r);

  /* Section 6: merged, deduped marker shortlist, capped at 5. (§8 revision)
     Round-robin across patterns rather than draining the first one: taking the
     top 5 in pattern order would fill the whole list from M4 and silently drop
     the sleep and metabolic markers, so a lead whose report discusses three
     patterns would see a shortlist that only addresses one. Highest-priority
     pattern still leads. */
  var seen = Object.create(null);
  var shortlist = [];
  var depth = 0;
  var maxLen = patterns.reduce(function (n, p) { return Math.max(n, p.markers.length); }, 0);
  while (depth < maxLen && shortlist.length < 5) {
    for (var pi = 0; pi < patterns.length && shortlist.length < 5; pi++) {
      var mk = patterns[pi].markers[depth];
      if (!mk) continue;
      var key = mk.toLowerCase();
      if (seen[key]) continue;
      seen[key] = 1;
      shortlist.push({ marker: mk, from: patterns[pi] });
    }
    depth++;
  }
  var leadMarkers = shortlist;

  /* Internal call notes get the full deduped union — length is free there. */
  var fullSeen = Object.create(null);
  var fullUnion = [];
  allFired.forEach(function (p) {
    p.markers.forEach(function (m) {
      var k = m.toLowerCase();
      if (!fullSeen[k]) { fullSeen[k] = 1; fullUnion.push(m); }
    });
  });

  var escalations = [];
  allFired.forEach(function (p) {
    if (p.escalate && p.escalate(a)) escalations.push('[' + p.id + '] ' + p.escalateNote);
  });
  lib.crossEscalations(a, allFired).forEach(function (e) { escalations.push(e); });

  /* Call length and booking link both derive from tier, and neither may leak it.
     `lower` books the 30-minute calendar (api/book.js:6-8). The bare /book30
     path is the lower-tier link per RESULTS-EMAIL.md:47-52 — never a URL
     containing `tier=lower`, because it sits in the lead's address bar. */
  var tier = payload.tier || a.tier || 'core';
  var isLower = tier === 'lower';
  var callMinutes = isLower ? 30 : 15;
  var bookingUrl = 'https://assess.secondprime.io/' + (isLower ? 'book30' : 'book');

  return {
    answers: a, reads: r, patterns: patterns, allFired: allFired,
    findings: findings, leadMarkers: leadMarkers, fullUnion: fullUnion,
    escalations: escalations, tier: tier,
    callMinutes: callMinutes, bookingUrl: bookingUrl,
    gapLine: GAP_LINES[a.labs] || GAP_LINES['Standard annual physical only']
  };
}

module.exports = { buildReport: buildReport, computeScore: computeScore, toList: toList, esc: esc, oxford: oxford, GAP_LINES: GAP_LINES };

/* ---------- CLI ---------- */
if (require.main === module) {
  var render = require('./render.js');
  var args = process.argv.slice(2);
  var outDir = 'report/out';
  var oi = args.indexOf('--out');
  if (oi >= 0) { outDir = args[oi + 1]; args.splice(oi, 2); }

  var payload;
  if (args[0] === '--demo') {
    payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-lead.json'), 'utf8'));
  } else if (args[0]) {
    payload = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    console.error('usage: node report/generate.js <lead.json> [--out DIR]   |   --demo');
    process.exit(1);
  }

  var model = buildReport(payload);
  var slug = render.slug(model.answers);
  fs.mkdirSync(outDir, { recursive: true });
  var htmlPath = path.join(outDir, slug + '.html');
  fs.writeFileSync(htmlPath, render.html(model));
  var notesPath = path.join(outDir, slug + '.notes.md');
  fs.writeFileSync(notesPath, render.callNotes(model));
  console.log(JSON.stringify({
    report: htmlPath, call_notes: notesPath,
    patterns: model.patterns.map(function (p) { return p.id; }),
    findings: model.findings.length,
    markers: model.leadMarkers.map(function (m) { return m.marker; }),
    escalations: model.escalations,
    internal_score: model.reads.score,
    risk: model.reads.risk.status, performance: model.reads.perf.status
  }, null, 2));
}
