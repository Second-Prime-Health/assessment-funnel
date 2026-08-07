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

console.log('\npattern library revisions (2026-08-07, ratified in-thread)');
/* M2 rule B. The old second clause was `a.energy !== 'Strong from morning to
   evening'` — a negation 29 of 36 real leads passed by default, firing M2 at
   69%. These tests exist to make a revert fail loudly rather than quietly
   re-inflate the rate. */
t('M2 needs a real second signal — drive alone does not fire it', function () {
  var m = gen.buildReport(lead({ drive: 'A fraction of what they were' }));
  eq(m.allFired.map(function (p) { return p.id; }).indexOf('M2'), -1,
     'drive-bad with good energy and good bodycomp must NOT fire M2 (rule B)');
});
t('M2 fires on drive + bad energy', function () {
  ['The 3pm crash runs my calendar', "I'm running on coffee and willpower"].forEach(function (e) {
    var m = gen.buildReport(lead({ drive: 'Noticeably lower', energy: e }));
    ok(m.allFired.some(function (p) { return p.id === 'M2'; }), 'M2 should fire for energy=' + e);
  });
});
t('M2 fires on drive + heavy bodycomp even when energy is strong', function () {
  var m = gen.buildReport(lead({
    drive: 'Noticeably lower', energy: 'Strong from morning to evening',
    bodycomp: 'I need to lose 50+ lbs'
  }));
  ok(m.allFired.some(function (p) { return p.id === 'M2'; }));
});
t('M2 does not fire on the mid energy answer alone (the old negation would have)', function () {
  /* `Good mornings, fading after lunch` is not `Strong from morning to
     evening`, so the pre-rule-B clause fired here. Rule B must not. */
  var m = gen.buildReport(lead({ drive: 'Noticeably lower', energy: 'Good mornings, fading after lunch' }));
  eq(m.allFired.map(function (p) { return p.id; }).indexOf('M2'), -1,
     'the double-negative clause has come back');
});

/* M5 split. The single pattern fired 10x on real leads but only 4 carried
   dementia history; the other 6 inherited inherited-risk framing and a dementia
   guardrail that did not describe them. */
t('M5a fires only with dementia family history', function () {
  var m = gen.buildReport(lead({
    focus: 'Foggy. Words go missing, focus drifts, most days',
    familyList: ["Dementia or Alzheimer's"]
  }));
  var ids = m.allFired.map(function (p) { return p.id; });
  ok(ids.indexOf('M5a') >= 0, 'M5a should fire');
  eq(ids.indexOf('M5b'), -1, 'M5a supersedes M5b');
});
t('M5b fires on fog + broken sleep with no family history', function () {
  var m = gen.buildReport(lead({
    focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights'
  }));
  var ids = m.allFired.map(function (p) { return p.id; });
  ok(ids.indexOf('M5b') >= 0, 'M5b should fire');
  eq(ids.indexOf('M5a'), -1, 'no dementia history — M5a must not fire');
});
t('M5b copy carries no family-history or ApoE framing', function () {
  var m5b = lib.PATTERNS.filter(function (p) { return p.id === 'M5b'; })[0];
  ok(m5b, 'M5b must exist');
  var copy = [m5b.title, m5b.means, m5b.why, m5b.missed, m5b.efficacy].join(' ');
  eq(/family|inherited|dementia|alzheimer|ApoE/i.test(copy), false,
     'M5b must not hand this lead a frame he did not report');
});
t('a fog lead with both dementia history and broken sleep gets one finding, not two', function () {
  var m = gen.buildReport(lead({
    focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', familyList: ["Dementia or Alzheimer's"]
  }));
  var ids = m.allFired.map(function (p) { return p.id; });
  eq(ids.filter(function (i) { return i === 'M5a' || i === 'M5b'; }).length, 1);
});

/* M6 fallback arm — shipped in the same change as rule B, because tightening
   M2 alone left four real leads with an empty report. */
t('M6 fallback catches a no-deep-panel lead who matched nothing else', function () {
  /* Drive down plus a mid energy/focus answer: 7 perf points, so `drift` rather
     than `solid` — the base M6 arm cannot reach him. Under rule B nothing else
     fires either (energy is not in ENERGY_BAD, bodycomp is fine), so without
     the fallback arm this lead gets an empty report. */
  var m = gen.buildReport(lead({
    energy: 'Good mornings, fading after lunch', focus: 'A step slower than I was',
    drive: 'Noticeably lower', labs: 'Standard annual physical only'
  }));
  eq(m.reads.perf.status, 'drift', 'fixture must not be solid or the base arm covers it');
  var ids = m.allFired.map(function (p) { return p.id; });
  eq(ids, ['M6'], 'the fallback arm must recover this lead');
  ok(m.patterns[0].fallback === true, 'must be flagged as the fallback arm');
});
t('the fallback arm drops the "your answers hold up" claim', function () {
  var m = gen.buildReport(lead({
    energy: 'Good mornings, fading after lunch', focus: 'A step slower than I was',
    drive: 'Noticeably lower', labs: 'Standard annual physical only'
  }));
  var p = m.patterns[0];
  eq(p.fallback, true);
  eq(/answers hold up/i.test(p.title + ' ' + p.means), false,
     'a drift/flag lead must not be told his answers hold up');
  ok(/not the same as nothing being there|lagging indicator/i.test(p.means),
     'fallback copy should lead on the gap');
  eq(/answers hold up/i.test(render.html(m)), false, 'the false claim reached the page');
});
t('the base M6 arm keeps its earned-credibility opening', function () {
  var m = gen.buildReport(lead({ labs: 'Standard annual physical only' }));
  var ids = m.allFired.map(function (p) { return p.id; });
  eq(ids, ['M6']);
  eq(m.patterns[0].fallback, undefined, 'a genuinely solid lead is not the fallback case');
  ok(/answers hold up/i.test(m.patterns[0].means));
});
t('the fallback never fires for a lead with a recent deep panel', function () {
  var m = gen.buildReport(lead({ drive: 'Noticeably lower' }));
  eq(m.allFired.length, 0, 'deep-panel leads correctly reach the zero-pattern fallback');
});
t('the fallback never displaces a real pattern', function () {
  var m = gen.buildReport(lead({
    sleep: 'Broken sleep, most nights', bodycomp: 'I need to lose 50+ lbs',
    labs: 'Standard annual physical only'
  }));
  ok(m.allFired.some(function (p) { return p.id === 'M3'; }), 'M3 should fire');
  ok(m.allFired.every(function (p) { return !p.fallback; }), 'fallback must not appear alongside a real match');
});

/* Drop-priority (§3.3). Before this existed the cap sorted by bucket alone,
   which dropped M7 — the top-priority pattern — on 2 of 36 real leads. */
t('the cap drops by clinical priority, not by bucket', function () {
  var m = gen.buildReport(lead({
    energy: "I'm running on coffee and willpower",
    focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', drive: 'A fraction of what they were',
    bodycomp: 'I need to lose 50+ lbs',
    familyList: ['Heart disease', 'Type 2 diabetes', "Dementia or Alzheimer's"],
    labs: "It's been years since any real bloodwork"
  }));
  ok(m.allFired.length > 3, 'fixture must exceed the cap');
  var kept = m.patterns.map(function (p) { return p.id; });
  eq(kept.length, 3);
  ok(kept.indexOf('M7') >= 0, 'M7 is top priority and must never be dropped');
  /* Every kept pattern outranks every dropped one. */
  var dropped = m.allFired.filter(function (p) { return m.patterns.indexOf(p) < 0; });
  var worstKept = Math.max.apply(null, m.patterns.map(function (p) { return lib.priorityOf(p.id); }));
  dropped.forEach(function (p) {
    ok(lib.priorityOf(p.id) > worstKept, p.id + ' was dropped despite outranking a kept pattern');
  });
});
t('drop-priority covers every pattern id in the library', function () {
  lib.PATTERNS.forEach(function (p) {
    ok(lib.DROP_PRIORITY.indexOf(p.id) >= 0, p.id + ' is missing from DROP_PRIORITY');
  });
});
t('rendered patterns still display worse-bucket-first after capping', function () {
  var m = gen.buildReport(lead({
    energy: "I'm running on coffee and willpower",
    focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', drive: 'A fraction of what they were',
    bodycomp: 'I need to lose 50+ lbs', familyList: ['Heart disease', 'Type 2 diabetes'],
    labs: "It's been years since any real bloodwork"
  }));
  for (var i = 1; i < m.patterns.length; i++) {
    ok(m.reads[m.patterns[i - 1].bucket].pct <= m.reads[m.patterns[i].bucket].pct,
       'render order must stay ascending by pct');
  }
});
t('call notes do not mark the fallback pattern as dropped', function () {
  /* The fallback arm returns a fresh clone rather than the shared library
     object, so buildReport must call selectPatterns ONCE. Calling it twice
     yields two non-identical clones, `m.patterns.indexOf(p)` returns -1, and
     the only pattern this lead has gets labelled "not rendered" in the notes. */
  var m = gen.buildReport(lead({
    energy: 'Good mornings, fading after lunch', focus: 'A step slower than I was',
    drive: 'Noticeably lower', labs: 'Standard annual physical only'
  }));
  eq(m.patterns[0].fallback, true, 'fixture must reach the fallback arm');
  eq(m.allFired[0], m.patterns[0], 'allFired and patterns must share object identity');
  eq(/not rendered/.test(render.callNotes(m)), false,
     'the fallback pattern is rendered and must not be marked as dropped');
});
t('call notes still mark over-cap patterns as not rendered', function () {
  /* Guards the object-identity coupling: buildReport must call selectPatterns
     once, or m.patterns.indexOf(p) fails for every pattern. */
  var m = gen.buildReport(lead({
    energy: "I'm running on coffee and willpower",
    focus: 'Foggy. Words go missing, focus drifts, most days',
    sleep: 'Broken sleep, most nights', drive: 'A fraction of what they were',
    bodycomp: 'I need to lose 50+ lbs', familyList: ['Heart disease', 'Type 2 diabetes'],
    labs: "It's been years since any real bloodwork"
  }));
  var n = render.callNotes(m);
  var notRendered = n.split('\n').filter(function (l) { return /not rendered/.test(l); });
  eq(notRendered.length, m.allFired.length - m.patterns.length,
     'exactly the dropped patterns should be marked');
  m.patterns.forEach(function (p) {
    var line = n.split('\n').filter(function (l) { return l.indexOf('**' + p.id + '**') >= 0; })[0];
    ok(line && !/not rendered/.test(line), p.id + ' is rendered but marked as dropped');
  });
});

console.log('\nno lead in the live answer space gets an empty report');
/* The M2/M6 coupling is the reason this exists: rule B without the fallback arm
   left four real leads with nothing. Rather than pin the live population (which
   moves), enumerate the answer space and assert that any lead without a recent
   deep panel always gets at least one pattern. Leads WITH a deep panel are
   allowed to be empty — that is the §3.6 low-urgency case, by design. */
t('every no-deep-panel combination yields at least one pattern', function () {
  var DOMAIN = {
    energy: ['Strong from morning to evening', 'Good mornings, fading after lunch',
             'The 3pm crash runs my calendar', "I'm running on coffee and willpower"],
    focus: ["As sharp as I've ever been", 'A step slower than I was', 'Foggy. Words go missing, focus drifts, most days'],
    sleep: ['Rested and ready', 'I sleep 7-8 hours and still wake up tired', 'Broken sleep, most nights'],
    drive: ["Where they've always been", 'Noticeably lower', 'A fraction of what they were'],
    bodycomp: ['I feel good where I am', 'I need to lose 5 to 25 lbs', 'I need to lose 25 to 50 lbs', 'I need to lose 50+ lbs', 'I need to gain weight'],
    labs: ['Standard annual physical only', "It's been years since any real bloodwork"],
    familyList: [['None of these'], ['Heart disease'], ["Dementia or Alzheimer's"], ['Heart disease', 'Stroke']]
  };
  var empties = 0, total = 0;
  DOMAIN.energy.forEach(function (energy) {
    DOMAIN.focus.forEach(function (focus) {
      DOMAIN.sleep.forEach(function (sleep) {
        DOMAIN.drive.forEach(function (drive) {
          DOMAIN.bodycomp.forEach(function (bodycomp) {
            DOMAIN.labs.forEach(function (labs) {
              DOMAIN.familyList.forEach(function (familyList) {
                total++;
                var m = gen.buildReport(lead({
                  energy: energy, focus: focus, sleep: sleep, drive: drive,
                  bodycomp: bodycomp, labs: labs, familyList: familyList
                }));
                if (!m.allFired.length) empties++;
              });
            });
          });
        });
      });
    });
  });
  ok(total > 1000, 'should have enumerated the answer space, got ' + total);
  eq(empties, 0, empties + ' of ' + total + ' no-deep-panel combinations produce an empty report');
});
t('deep-panel leads are still allowed to be empty (the low-urgency case)', function () {
  eq(gen.buildReport(lead()).allFired.length, 0);
});

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
