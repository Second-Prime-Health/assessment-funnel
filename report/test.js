#!/usr/bin/env node
/* Tests for the report generator.

   These focus on the failures that would be invisible in a rendered page but
   damaging in front of a lead: a leaked score, a leaked tier, a backwards read,
   a contradicted call length, or an unsourced claim propagated from live copy.

   Run: node report/test.js */

'use strict';

var gen = require('./generate.js');
var render = require('./render.js');
var lib = require('./patterns.js');

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

function lead(over, tier) {
  return { tier: tier || 'core', data: Object.assign({
    firstName: 'Test', lastName: 'Lead',
    energy: 'Strong from morning to evening', focus: "As sharp as I've ever been",
    sleep: 'Rested and ready', drive: "Where they've always been",
    bodycomp: 'I feel good where I am', familyList: ['None of these'],
    labs: 'Deep panel in the last 12 months'
  }, over) };
}

console.log('\nscoring parity with assessment.html:845-862');
t('all-best answers score 100 / solid / solid', function () {
  var r = gen.computeScore(lead().data);
  eq(r.score, 100); eq(r.perf.status, 'solid'); eq(r.risk.status, 'solid');
});
t('all-worst answers hit the documented ~22 floor', function () {
  var r = gen.computeScore(lead({
    energy: "I'm running on coffee and willpower",
    focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', drive: 'A fraction of what they were',
    bodycomp: 'I need to lose 50+ lbs',
    familyList: ['Heart disease', 'Stroke'],
    labs: "It's been years since any real bloodwork"
  }).data);
  eq(r.perf.pts, 18); eq(r.risk.pts, 14); eq(r.score, 22);
});
t('pct is inverted: low pct means a bad read', function () {
  var bad = gen.computeScore(lead({ bodycomp: 'I need to lose 50+ lbs', labs: "It's been years since any real bloodwork", familyList: ['Heart disease', 'Stroke'] }).data);
  var good = gen.computeScore(lead().data);
  ok(bad.risk.pct < good.risk.pct, 'worse answers must yield a LOWER pct');
  eq(good.risk.pct, 100); eq(bad.risk.pct, 0);
});
t('family history: 1 entry = 2pts, 2+ = 4pts, None of these = 0', function () {
  eq(gen.computeScore(lead({ familyList: ['Heart disease'] }).data).risk.pts, 2);
  eq(gen.computeScore(lead({ familyList: ['Heart disease', 'Stroke', 'Cancer'] }).data).risk.pts, 4);
  eq(gen.computeScore(lead({ familyList: ['None of these'] }).data).risk.pts, 0);
});
t('familyList accepts the GHL comma-joined string shape', function () {
  var arr = gen.computeScore(lead({ familyList: ['Heart disease', 'Stroke'] }).data);
  var str = gen.computeScore(lead({ familyList: 'Heart disease, Stroke' }).data);
  eq(str.risk.pts, arr.risk.pts);
});
/* Supabase stores this answer under its form field name, `familyHistory`
   (assessment.html:202-208, dash/questions.js:14) — not `familyList`, which is
   only the localStorage shape. Reading the wrong key doesn't throw: it scores
   the family-history risk as zero and silently drops the M4 pattern, so a lead
   with heart disease in the family gets a calmer report than he should.
   These fixtures clear `familyList` because a real Supabase row has only the
   `familyHistory` key — leaving the default in would mask the bug. */
t('familyHistory (the Supabase question_id) scores same as familyList', function () {
  var want = gen.computeScore(lead({ familyList: ['Heart disease', 'Type 2 diabetes'] }).data).risk.pts;
  eq(want, 4, 'fixture must carry real family-history risk or this proves nothing');
  eq(gen.computeScore(lead({ familyList: undefined, familyHistory: ['Heart disease', 'Type 2 diabetes'] }).data).risk.pts, want);
  eq(gen.computeScore(lead({ familyList: undefined, familyHistory: 'Heart disease, Type 2 diabetes' }).data).risk.pts, want);
});
t('familyHistory fires the inherited-risk pattern (M4)', function () {
  function ids(key) {
    var d = { familyList: undefined, energy: 'The 3pm crash runs my calendar',
              bodycomp: 'I need to lose 25 to 50 lbs', labs: 'Standard annual physical only' };
    d[key] = ['Heart disease', 'Type 2 diabetes'];
    return gen.buildReport(lead(d)).patterns.map(function (p) { return p.id; });
  }
  var viaList = ids('familyList');
  if (viaList.indexOf('M4') < 0) throw new Error('fixture no longer fires M4; test is not proving anything');
  eq(ids('familyHistory').join(','), viaList.join(','));
});
t('exact value strings match, including the straight apostrophe', function () {
  var r = gen.computeScore(lead({ energy: "I'm running on coffee and willpower" }).data);
  eq(r.perf.pts, 5, 'straight-apostrophe value must score');
  var curly = gen.computeScore(lead({ energy: 'I\u2019m running on coffee and willpower' }).data);
  eq(curly.perf.pts, 0, 'curly display label must NOT match (guards a silent 0)');
});
t('stored score is preferred over recomputation when present', function () {
  var m = gen.buildReport({ tier: 'core', score: 61, perf: { pts: 6, pct: 67, status: 'drift' }, risk: { pts: 9, pct: 36, status: 'flag' }, data: lead().data });
  eq(m.reads.score, 61);
});

console.log('\npattern selection');
t('M7 supersedes M6 — never both', function () {
  var m = gen.buildReport(lead({ labs: "It's been years since any real bloodwork", bodycomp: 'I need to lose 50+ lbs', familyList: ['Heart disease', 'Stroke'] }));
  var ids = m.allFired.map(function (p) { return p.id; });
  ok(ids.indexOf('M7') >= 0, 'M7 should fire');
  eq(ids.indexOf('M6'), -1, 'M6 must be suppressed');
});
t('rendered patterns capped at 3', function () {
  var m = gen.buildReport(lead({
    energy: "I'm running on coffee and willpower", focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', drive: 'A fraction of what they were',
    bodycomp: 'I need to lose 50+ lbs', familyList: ['Heart disease', 'Type 2 diabetes', "Dementia or Alzheimer's"],
    labs: "It's been years since any real bloodwork"
  }));
  ok(m.allFired.length > 3, 'this lead should fire more than 3 patterns');
  eq(m.patterns.length, 3);
});
t('findings capped at 5', function () {
  var m = gen.buildReport(lead({
    energy: "I'm running on coffee and willpower", focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', drive: 'A fraction of what they were',
    bodycomp: 'I need to lose 50+ lbs', familyList: ['Heart disease', 'Stroke'],
    labs: "It's been years since any real bloodwork"
  }));
  eq(m.findings.length, 5);
});
t('lead-facing markers capped at 5 and drawn from every rendered pattern', function () {
  var m = gen.buildReport(lead({
    energy: 'The 3pm crash runs my calendar', sleep: 'Broken sleep, most nights',
    bodycomp: 'I need to lose 25 to 50 lbs', familyList: ['Heart disease', 'Type 2 diabetes'],
    labs: 'Standard annual physical only'
  }));
  eq(m.leadMarkers.length, 5);
  var sources = {};
  m.leadMarkers.forEach(function (x) { sources[x.from.id] = 1; });
  eq(Object.keys(sources).length, m.patterns.length, 'every rendered pattern must contribute a marker');
});
t('markers are deduplicated', function () {
  var m = gen.buildReport(lead({ energy: 'The 3pm crash runs my calendar', bodycomp: 'I need to lose 50+ lbs', familyList: ['Heart disease'], labs: 'Standard annual physical only' }));
  var names = m.leadMarkers.map(function (x) { return x.marker.toLowerCase(); });
  eq(names.length, new Set(names).size, 'no repeated marker');
  eq(m.fullUnion.length, new Set(m.fullUnion.map(function (s) { return s.toLowerCase(); })).size);
});
t('zero patterns on a clean lead with recent deep panel', function () {
  eq(gen.buildReport(lead()).allFired.length, 0);
});
t('G1 always escalates — unintentional weight loss is never auto-reassured', function () {
  var m = gen.buildReport(lead({ bodycomp: 'I need to gain weight' }));
  ok(m.escalations.some(function (e) { return e.indexOf('G1') >= 0; }));
});
t('M3 + severe drive drop raises the sleep-first cross escalation', function () {
  var m = gen.buildReport(lead({ sleep: 'Broken sleep, most nights', bodycomp: 'I need to lose 50+ lbs', drive: 'A fraction of what they were' }));
  ok(m.escalations.some(function (e) { return /sleep before hormones/i.test(e); }));
});
t('every pattern ends on an efficacy beat', function () {
  lib.PATTERNS.forEach(function (p) {
    ok(p.efficacy && p.efficacy.trim().length > 0, p.id + ' missing efficacy close');
  });
});
t('every pattern has a shortWhy for the marker list', function () {
  lib.PATTERNS.forEach(function (p) {
    ok(p.shortWhy && /^because /.test(p.shortWhy), p.id + ' missing or malformed shortWhy');
  });
});
t('evidence lines keep the agreed wording discipline', function () {
  /* PESA measures presence of plaque, not destiny (Honey, thread 2026-08-07).
     The rule is prevalence language, not one specific verb: "found
     atherosclerosis" and "had atherosclerosis" both state what was measured.
     What's banned is any verb that turns prevalence into a forecast. */
  var DESTINY = /headed for|will have|destined|on track for|heart attack waiting|going to have|leads to a heart attack/i;
  var PREVALENCE = /\b(found|had|have|present in|detected)\b/i;
  lib.PATTERNS.forEach(function (p) {
    if (!p.evidence) return;
    eq(DESTINY.test(p.evidence), false, p.id + ': evidence line forecasts an outcome');
    if (/atheroscler/i.test(p.evidence)) {
      ok(PREVALENCE.test(p.evidence), p.id + ': atherosclerosis claim needs a prevalence verb');
    }
    eq(/decade before|ten years before|10 years before/i.test(p.evidence), false,
       p.id + ': unsourced decade interval');
    eq(/which means you (might|may|could)/i.test(p.evidence), false,
       p.id + ': hands the reader an inference instead of stopping at the fact');
  });
});
t('the efficacy close is the last line of a rendered pattern', function () {
  var m = gen.buildReport(lead({ energy: 'The 3pm crash runs my calendar', bodycomp: 'I need to lose 25 to 50 lbs', familyList: ['Heart disease'], labs: 'Standard annual physical only' }));
  var h = render.html(m);
  m.patterns.forEach(function (p) {
    if (!p.evidence) return;
    ok(h.indexOf(esc(p.evidence)) < h.indexOf(esc(p.efficacy)),
       p.id + ': evidence must come before the efficacy close, never after');
  });
});
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

console.log('\nlead-facing output must not leak');
function renderFor(payload) { return render.html(gen.buildReport(payload)); }

t('the 0-100 score never appears in the HTML', function () {
  var p = lead({ energy: 'The 3pm crash runs my calendar', bodycomp: 'I need to lose 25 to 50 lbs', familyList: ['Heart disease'], labs: 'Standard annual physical only' });
  var m = gen.buildReport(p);
  var h = render.html(m);
  ok(m.reads.score > 0, 'score should exist internally');
  eq(new RegExp('\\b' + m.reads.score + '\\b').test(h.replace(/<style>[\s\S]*?<\/style>/, '')), false,
     'internal score ' + m.reads.score + ' leaked into lead-facing HTML');
  ok(/Second Prime Score/.test(render.callNotes(m)), 'score must still be in internal call notes');
});
t('neither pct value leaks into the HTML body', function () {
  var m = gen.buildReport(lead({ energy: 'The 3pm crash runs my calendar', bodycomp: 'I need to lose 25 to 50 lbs', familyList: ['Heart disease'], labs: 'Standard annual physical only' }));
  var body = render.html(m).replace(/<style>[\s\S]*?<\/style>/, '');
  eq(/\b(Risk|Performance)\s*[:·&middot;]*\s*\d+\b/.test(body), false, 'a numeric read leaked');
});
t('tier is never disclosed to the lead', function () {
  ['core', 'lower'].forEach(function (tr) {
    var h = renderFor(lead({ energy: 'The 3pm crash runs my calendar', bodycomp: 'I need to lose 25 to 50 lbs' }, tr));
    eq(/tier/i.test(h.replace(/<style>[\s\S]*?<\/style>/, '')), false, tr + ': the word "tier" appears');
    eq(/tier=lower/.test(h), false, tr + ': tier=lower in a URL');
  });
});
t('call length follows tier: core 15, lower 30', function () {
  var core = gen.buildReport(lead({}, 'core'));
  var low = gen.buildReport(lead({}, 'lower'));
  eq(core.callMinutes, 15); eq(low.callMinutes, 30);
  ok(/Your 15 minutes/.test(render.html(core)));
  ok(/Your 30 minutes/.test(render.html(low)), 'lower tier must not be told 15 minutes');
  eq(/15 minutes/.test(render.html(low).replace(/<style>[\s\S]*?<\/style>/, '')), false);
});
t('booking link matches tier and carries no query string', function () {
  eq(gen.buildReport(lead({}, 'core')).bookingUrl, 'https://assess.secondprime.io/book');
  eq(gen.buildReport(lead({}, 'lower')).bookingUrl, 'https://assess.secondprime.io/book30');
});
t('the unsourced cholesterol stat is not propagated', function () {
  var h = renderFor(lead({ familyList: ['Heart disease', 'Stroke'], labs: 'Standard annual physical only' }));
  eq(/half of heart attack/i.test(h), false, 'unsourced stat present');
  eq(/normal.{0,3} cholesterol/i.test(h), false, 'unsourced cholesterol claim present');
});
t('no pricing anywhere', function () {
  var h = renderFor(lead({ energy: 'The 3pm crash runs my calendar' }));
  eq(/\$\d/.test(h), false, 'a dollar figure appears in the report');
});
t('disclaimer always renders', function () {
  ok(/not a diagnosis/i.test(renderFor(lead())));
});
t('HTML-escapes hostile input in name and free-text', function () {
  var h = renderFor(lead({ firstName: '<script>alert(1)</script>', context: '"><img onerror=x>' }));
  eq(/<script>alert/.test(h), false, 'unescaped script tag');
  ok(/&lt;script&gt;/.test(h), 'name should be escaped and present');
});
t('markers are named but never interpreted with a value', function () {
  var h = renderFor(lead({ energy: 'The 3pm crash runs my calendar', bodycomp: 'I need to lose 25 to 50 lbs', familyList: ['Heart disease'], labs: 'Standard annual physical only' }));
  ok(/ApoB|Fasting insulin|STOP-Bang/.test(h), 'markers must be named');
  eq(/mg\/dL|mmol|ng\/dL|your (ApoB|Lp\(a\)|insulin) (is|was)/i.test(h), false, 'a marker value was interpreted');
});

console.log('\ninternal call notes');
t('call notes carry the score, full union and escalations', function () {
  var m = gen.buildReport(lead({ bodycomp: 'I need to gain weight', labs: "It's been years since any real bloodwork" }));
  var n = render.callNotes(m);
  ok(/INTERNAL ONLY/.test(n));
  ok(/Second Prime Score/.test(n));
  ok(/Raise on the call/.test(n), 'G1 escalation should surface');
  ok(m.fullUnion.length >= m.leadMarkers.length, 'union is at least the shortlist');
});

console.log('\nsupabase payload shaping');
/* Mirrors the fn_session_timeline shape (schema.sql:414-425): answer rows keyed
   by question_id, multi-selects as arrays, lead row alongside. If Supabase ever
   renames a question_id this is the test that should go red. */
var pull = require('./pull.js');
function timelineFixture(over) {
  return {
    lead: Object.assign({
      first_name: 'Michael', last_name: 'Reeves', email: 'm@example.com', phone: '+15125550142',
      tier: 'core', score: 41, perf_pct: 38, perf_status: 'drift', risk_pct: 22, risk_status: 'flag'
    }, (over || {}).lead),
    answers: (over || {}).answers || [
      { question_id: 'energy', answer: 'The 3pm crash runs my calendar' },
      { question_id: 'bodycomp', answer: 'I need to lose 25 to 50 lbs' },
      { question_id: 'familyHistory', answer: ['Heart disease', 'Type 2 diabetes'] },
      { question_id: 'labs', answer: 'Standard annual physical only' }
    ]
  };
}
t('timeline rows shape into a payload the generator accepts', function () {
  var p = pull.toPayload(timelineFixture());
  eq(p.tier, 'core');
  eq(p.data.firstName, 'Michael');
  eq(p.data.familyHistory, ['Heart disease', 'Type 2 diabetes']);
});
t('a real timeline payload still fires the family-history pattern', function () {
  var m = gen.buildReport(pull.toPayload(timelineFixture()));
  ok(m.patterns.some(function (x) { return x.id === 'M4'; }),
     'M4 must fire from the Supabase familyHistory key, not just familyList');
});
t('stored dashboard score is carried through, not recomputed', function () {
  var p = pull.toPayload(timelineFixture());
  eq(p.score, 41);
  eq(gen.buildReport(p).reads.score, 41, 'report must agree with the dashboard for the same lead');
});
t('a lead with no stored score falls back to recomputation', function () {
  var p = pull.toPayload(timelineFixture({ lead: { score: null, perf_status: null, risk_status: null } }));
  ok(p.score === undefined, 'no partial score should be forwarded');
  ok(typeof gen.buildReport(p).reads.score === 'number', 'generator recomputes instead');
});

console.log('\nrobustness');
t('a partial payload does not throw', function () {
  var h = render.html(gen.buildReport({ data: { firstName: 'Half' } }));
  ok(h.indexOf('Report of Findings') > 0);
});
t('an empty payload does not throw', function () {
  ok(render.html(gen.buildReport({ data: {} })).length > 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
