/* Clinical pattern library for the per-lead Report of Findings.
   Copy and logic are Bumble's, from RESEARCH/REPORT_CONTENT_LIBRARY.md.
   Structure follows Honey's 4-beat finding shape (RESEARCH/REPORT_SHOWUP_RESEARCH.md §3.4).

   MATCHING RULE: every answer string below is the exact `value` attribute from
   assessment.html:133-221, not the display label. The display labels use curly
   punctuation (&rsquo;, &ndash;); the values use straight apostrophes and plain
   hyphens. Match on the value. Never normalize, never match the label. */

'use strict';

var STATUS_LABEL = { solid: 'Solid', drift: 'Drifting', flag: 'Flagged' };

/* Answer-set helpers. `has` guards against undefined/null answers. */
function has(v, list) { return !!v && list.indexOf(v) >= 0; }
function anyOf(arr, list) {
  if (!arr) return false;
  var a = Array.isArray(arr) ? arr : String(arr).split(',').map(function (s) { return s.trim(); });
  return a.some(function (x) { return list.indexOf(x) >= 0; });
}
function countOf(arr, list) {
  if (!arr) return 0;
  var a = Array.isArray(arr) ? arr : String(arr).split(',').map(function (s) { return s.trim(); });
  return a.filter(function (x) { return list.indexOf(x) >= 0; }).length;
}

var ENERGY_BAD = ['The 3pm crash runs my calendar', "I'm running on coffee and willpower"];
var BODY_HEAVY = ['I need to lose 25 to 50 lbs', 'I need to lose 50+ lbs'];
var SLEEP_BAD = ['Broken sleep, most nights', 'I sleep 7-8 hours and still wake up tired'];
var DRIVE_BAD = ['Noticeably lower', 'A fraction of what they were'];
var LABS_THIN = ['Standard annual physical only', "It's been years since any real bloodwork"];
var CARDIOMETABOLIC = ['Heart disease', 'Type 2 diabetes', 'Stroke', 'High blood pressure'];

/* Each pattern: when(a, r) -> bool, plus the four beats Honey specified.
   `bucket` decides ordering (worse bucket first, matching results.html:277).
   `efficacy` is mandatory — no finding ever ends on the fear (Tannenbaum 2015). */
var PATTERNS = [
  {
    id: 'M3',
    shortWhy: 'because you told us a full night doesn\u2019t restore you',
    bucket: 'perf',
    title: 'A full night that doesn\u2019t restore you',
    when: function (a) { return has(a.sleep, SLEEP_BAD) && has(a.bodycomp, BODY_HEAVY); },
    quotes: ['sleep', 'bodycomp'],
    means: 'A full night that doesn\u2019t restore you, alongside carried weight, is the single combination we most want to rule out before anything else \u2014 because if it\u2019s there, it quietly drags every other number on this page down with it, and no hormone or metabolic work holds while it\u2019s running.',
    markers: ['STOP-Bang screen', 'Home sleep apnea test', 'Overnight oximetry', 'Morning cortisol', 'hs-CRP', 'Ferritin'],
    why: 'A large share of obstructive sleep apnea is never diagnosed, and STOP-Bang is the validated eight-question way to decide who needs the home test. Cheap to rule out, expensive to miss.',
    missed: 'A standard physical asks how you slept. It does not measure what happened while you were asleep.',
    efficacy: 'It is also one of the few things on this list you can confirm at home, in a single night.'
  },
  {
    id: 'M1',
    shortWhy: 'because of the afternoon crash and the weight that won\u2019t move',
    bucket: 'perf',
    title: 'The afternoon crash, and weight that stopped responding',
    when: function (a) { return has(a.energy, ENERGY_BAD) && has(a.bodycomp, BODY_HEAVY); },
    quotes: ['energy', 'bodycomp'],
    means: 'Separately, either one is easy to explain away. Together they describe one thing: your body is working harder than it should to keep blood sugar steady, and it\u2019s burning your afternoon to do it.',
    markers: ['Fasting insulin', 'HOMA-IR', 'HbA1c', 'Fasting glucose', 'Triglyceride:HDL ratio'],
    why: 'Fasting insulin is the one most standard physicals never order. Glucose and HbA1c can both sit inside the reference range while insulin is already elevated \u2014 so a normal glucose panel is not evidence of a normal metabolism.',
    missed: 'Your physical almost certainly checked glucose. It almost certainly did not check insulin.',
    /* Tabak et al., Lancet 2009, PMID 19515410 (Whitehall II, n=6,538, 505
       incident cases). Insulin sensitivity falls steeply across the 5 years
       before diagnosis; fasting glucose only turns up sharply at ~3 years.
       Replaces the unsourced "years before glucose gets flagged" — the
       interval is 3-6 years, not a decade. Do not inflate it. */
    evidence: 'Insulin sensitivity is already falling about five years before glucose moves enough for anyone to flag it.',
    efficacy: 'This is the most common pattern we see in owners, and the most reversible when it\u2019s caught at this stage.'
  },
  {
    id: 'M2',
    shortWhy: 'because drive and energy moved together',
    bucket: 'perf',
    title: 'Drive, energy and body composition moving together',
    when: function (a) {
      return has(a.drive, DRIVE_BAD) &&
        (a.energy !== 'Strong from morning to evening' || has(a.bodycomp, BODY_HEAVY));
    },
    quotes: ['drive', 'energy'],
    means: 'Drive down, energy down, and body composition moving the wrong way on the same habits. Those three travel together for a reason \u2014 they share an axis. Drive is usually the first one men notice and the last one they mention.',
    markers: ['Total testosterone', 'Free testosterone', 'SHBG', 'LH', 'FSH', 'Estradiol (sensitive assay)', 'Thyroid panel (TSH, free T3, free T4)'],
    why: 'Total testosterone alone is a thin read. SHBG determines how much of that total is actually bioavailable, and free testosterone declines roughly twice as fast as total with age \u2014 so a \u201cnormal\u201d total can hide a low free. LH and FSH separate a testicular cause from a pituitary one, which changes what you do about it entirely.',
    missed: 'If anyone has tested your testosterone, it was almost certainly total only.',
    efficacy: 'It is also the pattern that maps most directly onto numbers we can pull and track.'
  },
  {
    id: 'M5',
    shortWhy: 'because of the fog, most days',
    bucket: 'perf',
    title: 'Fog most days',
    when: function (a) {
      return a.focus === 'Foggy. Words go missing, focus drifts, most days' &&
        (anyOf(a.familyList, ["Dementia or Alzheimer's"]) || a.sleep === 'Broken sleep, most nights');
    },
    quotes: ['focus'],
    means: 'We are not going to pretend a questionnaire can tell you anything about your brain. What we will say is that the drivers of fog that we can measure \u2014 glucose swings, inflammation, thyroid, B12, sleep quality, hormones \u2014 are all measurable now.',
    markers: ['Fasting insulin', 'HbA1c', 'hs-CRP', 'Homocysteine', 'B12', 'Folate', 'Full thyroid panel', 'Vitamin D'],
    why: 'These are the drivers worth excluding before anyone reaches for a scarier explanation. Every one of them is treatable.',
    missed: 'Homocysteine and a full thyroid panel are not part of a standard physical. Neither is fasting insulin.',
    efficacy: 'Fog with a measurable driver behind it is a solvable problem, and the measuring is one draw.'
  },
  {
    id: 'M4',
    shortWhy: 'because of your family history, with nothing measured against it',
    bucket: 'risk',
    title: 'Family history, and no data',
    when: function (a) { return anyOf(a.familyList, CARDIOMETABOLIC) && has(a.labs, LABS_THIN); },
    quotes: ['familyList', 'labs'],
    means: 'You know what runs in your family, and right now there is no data telling you whether you\u2019re on that road or off it. That\u2019s not a health problem yet \u2014 it\u2019s an information problem.',
    markers: ['ApoB', 'Lp(a)', 'Full lipid panel', 'hs-CRP', 'Fasting insulin', 'HbA1c', 'Homocysteine'],
    why: 'ApoB counts the actual number of atherogenic particles rather than the cholesterol carried inside them, and the two disagree often enough that LDL-C alone misclassifies real risk. Lp(a) is largely genetically set, needs measuring only once in a lifetime, and is the single most relevant marker for a man with family heart history who has never been tested. Almost nobody gets it ordered.',
    missed: 'Your physical measured LDL-C. It did not count particles, and it has never once looked at your Lp(a).',
    /* PESA, Circulation 2015, PMID 25882487: 4,184 asymptomatic adults aged
       40-54 imaged with vascular ultrasound + coronary calcium CT.
       Wording discipline (Honey, thread 2026-08-07): say "found
       atherosclerosis", never "headed for a heart attack" — the study measures
       presence of plaque, not destiny, and most subclinical plaque never
       produces an event. Spanish cohort, so absolute prevalence may not
       transfer exactly to the US. Do not add adjectives; the number is enough. */
    evidence: 'In 4,184 asymptomatic adults aged 40 to 54, imaging found atherosclerosis in 71% of the men. Even among those the standard risk calculator rated low-risk, 58% already had it.',
    efficacy: 'It is the cheapest gap on this page to close. One draw closes it.',
    escalate: function (a) { return countOf(a.familyList, CARDIOMETABOLIC) >= 2; },
    escalateNote: 'Two or more inherited cardiometabolic risks. Open on family history.'
  },
  {
    id: 'M7',
    shortWhy: 'because there is no current data on you at all',
    bucket: 'risk',
    title: 'Flagged answers, and nothing measured',
    when: function (a, r) { return a.labs === "It's been years since any real bloodwork" && r.risk.status === 'flag'; },
    quotes: ['labs'],
    means: 'Flagged answers and no current data. Everything on this page is inference from what you told us \u2014 good inference, but inference. Your real numbers exist; they just haven\u2019t been measured.',
    markers: ['ApoB', 'Lp(a)', 'Full lipid panel', 'hs-CRP', 'Fasting insulin', 'HbA1c', 'Full thyroid panel', 'Testosterone + free T', 'CMP', 'CBC', 'Vitamin D'],
    why: 'This is a full baseline, because there is nothing to build on. Every marker here is standard to draw and none of them are standard to order.',
    missed: 'There is no gap between what your physical found and what\u2019s true, because there was no physical.',
    efficacy: 'That\u2019s the whole gap, and it\u2019s one appointment wide.'
  },
  {
    id: 'M6',
    shortWhy: 'because feeling good is not the same as testing well',
    bucket: 'risk',
    title: 'Your answers hold up',
    when: function (a, r) { return r.perf.status === 'solid' && has(a.labs, LABS_THIN); },
    quotes: ['labs'],
    means: 'Your answers hold up. That\u2019s real, and it\u2019s rarer than you\u2019d think in this group. It also means symptoms aren\u2019t going to be your early warning system \u2014 you don\u2019t have any. The men we test who feel exactly like you do are the ones where we most often find something worth acting on, precisely because nothing was prompting them to look.',
    markers: ['ApoB', 'Lp(a)', 'Fasting insulin', 'HbA1c', 'hs-CRP', 'Full thyroid panel', 'Testosterone panel', 'Vitamin D', 'Ferritin', 'CMP'],
    why: 'Feeling good and testing well are different findings. Only one of them is evidence.',
    missed: 'Nothing in a standard physical is designed to find a problem in someone who feels fine.',
    /* Same source as M4's evidence line (PESA, Circulation 2015, PMID 25882487;
       registry NCT01410318 — a Banco de Santander employee cohort, i.e. working
       and asymptomatic, which is a closer analogue to our reader than a
       clinical cohort). Spanish cohort, so absolute prevalence may not transfer.

       Deliberately FLATTER than M4's version (Bumble, thread 2026-08-07): M6's
       reader feels fine and is right to. The statistic describes people exactly
       like him and contains no warning. Do not append "which means you might" —
       handing him the inference is what turns a fact into a pitch, and this
       cohort can smell it. It stops after the number, on purpose. */
    evidence: 'Feeling fine is not the same as being clear. When 4,184 adults aged 40 to 54 with no symptoms were actually imaged, 71% of the men had atherosclerosis \u2014 including 58% of the ones a standard risk calculator had called low-risk.',
    efficacy: 'A clean baseline is worth having on file. If it is clean, you get to stop wondering.'
  },
  {
    id: 'G1',
    shortWhy: 'because holding weight on has causes worth naming',
    bucket: 'risk',
    title: 'Holding weight on, not taking it off',
    when: function (a) { return a.bodycomp === 'I need to gain weight'; },
    quotes: ['bodycomp'],
    means: 'Struggling to hold weight on is a different question from carrying too much, and it gets asked far less often. The drivers are measurable: absorption, thyroid, appetite signalling, testosterone, and occasionally something inflammatory that nobody has gone looking for.',
    markers: ['CMP', 'CBC', 'Full thyroid panel', 'Testosterone + free T', 'Ferritin', 'Celiac panel (tTG-IgA)', 'hs-CRP', 'Vitamin D', 'B12'],
    why: 'This is a panel built to find a cause rather than confirm a number. Most of it has never been run on you.',
    missed: 'A standard physical records your weight. It does not ask why it won\u2019t move.',
    efficacy: 'Causes here are usually specific and usually addressable once they are named.',
    escalate: function () { return true; },
    escalateNote: 'Unintentional weight loss \u2014 ask directly on the call. Do not reassure by default.'
  }
];

/* Escalations that depend on more than one pattern firing. */
function crossEscalations(a, fired) {
  var out = [];
  var ids = fired.map(function (p) { return p.id; });
  if (ids.indexOf('M3') >= 0 && a.drive === 'A fraction of what they were') {
    out.push('Sleep pattern plus severe drive drop \u2014 raise sleep before hormones.');
  }
  return out;
}

module.exports = {
  PATTERNS: PATTERNS,
  STATUS_LABEL: STATUS_LABEL,
  crossEscalations: crossEscalations,
  _test: { has: has, anyOf: anyOf, countOf: countOf }
};
