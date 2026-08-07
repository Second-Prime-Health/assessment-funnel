/* Single-answer interpretation copy.

   Ported VERBATIM from results.html:232-260 so the report and the summary page
   a lead already saw never contradict each other. Keys are the exact `value`
   attribute strings from assessment.html:133-221 — straight apostrophes, plain
   hyphens. The display labels use curly punctuation; do not key on those.

   ONE DELIBERATE DEVIATION from results.html: the two-or-more family history
   line there ends with "...half of heart attack patients had 'normal'
   cholesterol on their last labs." That statistic is unsourced — flagged in
   RESEARCH/REPORT_CONTENT_LIBRARY.md §6. It is dropped here rather than
   propagated into a new artifact. The rest of the sentence is unchanged. */

'use strict';

module.exports = {
  energy: {
    'Good mornings, fading after lunch': 'An afternoon fade this consistent is usually blood sugar or cortisol rhythm. Both show up in labs long before they show up in your calendar.',
    'The 3pm crash runs my calendar': 'A crash you can set a clock by is chemistry: blood sugar, cortisol rhythm, thyroid. It stops being a discipline problem when it\u2019s measurable.',
    "I'm running on coffee and willpower": 'Caffeine is a loan against tomorrow\u2019s energy. The balance owed is measurable: cortisol, blood sugar, thyroid, and usually more than one at once.'
  },
  focus: {
    'A step slower than I was': 'A step slower at your age is worth measuring, because the usual drivers (hormones, inflammation, glucose swings) respond fast once they\u2019re named.',
    'Foggy. Words go missing, focus drifts, most days': 'Fog like this has a driver we can usually name: hormones, inflammation, or glucose swings. Clients describe it as walking through corn syrup. It clears when the driver gets fixed.'
  },
  sleep: {
    'I sleep 7-8 hours and still wake up tired': 'Waking up tired after a full night points inside the night: cortisol, blood sugar dips, breathing. All testable, and almost never checked.',
    'Broken sleep, most nights': 'Broken sleep is both a symptom and an accelerant. Every other number on this page gets worse until it\u2019s fixed, and the drivers are measurable.'
  },
  drive: {
    'Noticeably lower': 'Drive tracks testosterone closer than almost any symptom, and testosterone falls about 1% a year from your mid-30s. Yours is telling you where to look.',
    'A fraction of what they were': 'Drive at a fraction of what it was is a lab finding waiting to be run. It shows up everywhere: muscle, confidence, decision speed, the edge you built the business with.'
  },
  bodycomp: {
    'I need to lose 5 to 25 lbs': 'Weight that crept up on the same habits usually means something upstream shifted. Caught at this stage it\u2019s one of the most fixable things we see.',
    'I need to lose 25 to 50 lbs': '25+ lbs that ignores effort is insulin talking. It shows up in blood years before glucose gets flagged, and most physicals never order the test.',
    'I need to lose 50+ lbs': '50+ lbs usually means insulin resistance is already established. The road ends at a diagnosis unless the numbers get read early, and it responds fast once they are.',
    'I need to gain weight': 'Struggling to hold weight on has drivers worth naming: appetite, hormones, absorption. All measurable.'
  },
  labs: {
    'Standard annual physical only': 'A standard physical checks a few dozen markers. The answers usually live in the other 960.',
    "It's been years since any real bloodwork": 'Right now your risk picture is a guess. That\u2019s fixable in one blood draw.'
  },

  /* Family history is computed, not looked up: the copy depends on how many
     lines of history they reported. Mirrors the branch at results.html:288-292.

     `familyList` MUST also exist as a key below. selectFindings looks up
     `MIRRORS[field]` before calling this function, so a missing key made the
     whole finding vanish silently — see the familyList note there. */
  familyMeaning: function (list) {
    var real = (list || []).filter(function (x) { return x && x !== 'None of these'; });
    if (!real.length) return null;
    /* SECOND DELIBERATE DEVIATION from results.html:291. The live line ends
       "...show up in blood about a decade before symptoms." That clause is
       RETIRED, not sourced: REPORT_CONTENT_LIBRARY.md §6 and
       REPORT_SHOWUP_RESEARCH.md §7 both establish the measured interval is
       3-6 years (Whitehall II, PMID 19515410), so "about a decade" overstates
       it. The two-plus line uses the M4a wording from §2 instead, which is
       sourced to Sachdeva (PMID 19081406). Do not reintroduce the decade. */
    return real.length >= 2
      ? 'More than one line of family history is the strongest reason to look early. In 136,905 hospitalizations for coronary artery disease, almost half arrived with LDL under 100 mg/dL \u2014 the number most people are told is fine. The markers that show whether you\u2019re on that path are measurable today.'
      : 'One family diagnosis is reason enough to look early. The markers that show whether you\u2019re on the same path are measurable today.';
  },

  /* Presence key only — the copy itself comes from familyMeaning() above.
     selectFindings gates on `MIRRORS[f.key]` being truthy, so without this the
     family-history finding never rendered for ANY lead, even though scoring
     counted it. 24 of 37 live leads reported real family history and none of
     them saw it in their report. Same silent-drop class as the
     familyList/familyHistory scoring bug: no throw, just a quieter report. */
  familyList: true
};
