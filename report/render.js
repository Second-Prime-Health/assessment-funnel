/* Renders the report model to a self-contained branded HTML page, plus the
   internal call-notes block.

   Nine sections per RESEARCH/REPORT_SHOWUP_RESEARCH.md §3.
   Brand rules from HANDOFF.md: Zodiak headlines, Satoshi body, teal palette,
   amber (#FF9500) as the only warm colour and only on the CTA. No pricing.
   No numeric score. No tier disclosure. */

'use strict';

var STATUS_LABEL = { solid: 'Solid', drift: 'Drifting', flag: 'Flagged' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(a) {
  var base = ((a.firstName || '') + '-' + (a.lastName || '')).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (base || 'lead') + '-' + new Date().toISOString().slice(0, 10);
}

function toList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

var FIELD_LABEL = {
  energy: 'Energy', focus: 'Focus', sleep: 'Sleep', drive: 'Drive',
  bodycomp: 'Body composition', familyList: 'Family history', labs: 'Testing depth'
};

function html(m) {
  var a = m.answers, r = m.reads;
  var first = esc(a.firstName || '');
  var fullName = esc(((a.firstName || '') + ' ' + (a.lastName || '')).trim());
  var longevity = toList(a.longevity);
  var goals = toList(a.goals);
  var date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  /* Section 3: worse bucket first, matching results.html:277. */
  var reads = [
    { key: 'risk', label: 'Risk', d: r.risk, sub: 'Heart, metabolic, and the blind spots between physicals.' },
    { key: 'perf', label: 'Performance', d: r.perf, sub: 'Energy, focus, sleep and drive. Your output, measured.' }
  ].sort(function (x, y) { return x.d.pct - y.d.pct; });

  var verdict;
  var statuses = [r.risk.status, r.perf.status];
  if (statuses.indexOf('flag') >= 0) verdict = 'The findings below are your body asking for a closer look \u2014 in your own words, and what each usually means in the labs.';
  else if (statuses.indexOf('drift') >= 0) verdict = 'You\u2019re drifting. Slowly enough that every year feels normal, and it\u2019s measurable.';
  else verdict = 'Nothing loud in your answers. The gaps worth closing are the quiet ones, and those only show up in blood.';

  var out = [];
  out.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />');
  out.push('<meta name="viewport" content="width=device-width,initial-scale=1" />');
  out.push('<meta name="robots" content="noindex,nofollow" />');
  out.push('<title>' + (first ? first + '\u2019s ' : '') + 'Report of Findings &middot; Second Prime</title>');
  out.push('<style>' + css() + '</style></head><body>');

  /* 1. COVER */
  out.push('<header class="cover">');
  out.push('<div class="wrap">');
  out.push('<div class="logo">SECOND PRIME</div>');
  out.push('<p class="eyebrow">Executive Longevity Assessment</p>');
  out.push('<h1>Report of Findings</h1>');
  out.push('<p class="who">' + (fullName || 'Your report') + ' &middot; ' + esc(date) + '</p>');
  if (longevity.length) {
    out.push('<blockquote class="cover-q">\u201cStill ' + esc(longevity[0].toLowerCase()) + ', at 85.\u201d<cite>What you told us you\u2019re working toward</cite></blockquote>');
  }
  out.push('</div></header>');

  out.push('<main class="wrap">');

  /* 2. WHAT YOU TOLD US */
  out.push('<section class="sec"><h2>What you told us</h2>');
  out.push('<p class="lede">Every line below is your own answer, unedited. Everything after this page is built from them.</p>');
  out.push('<ul class="told">');
  ['energy', 'focus', 'sleep', 'drive', 'bodycomp', 'labs'].forEach(function (k) {
    if (a[k]) out.push('<li><span class="k">' + esc(FIELD_LABEL[k]) + '</span><span class="v">' + esc(a[k]) + '</span></li>');
  });
  var fam = toList(a.familyList).filter(function (x) { return x !== 'None of these'; });
  if (fam.length) out.push('<li><span class="k">Family history</span><span class="v">' + esc(fam.join(', ')) + '</span></li>');
  if (a.triggerEvent) out.push('<li><span class="k">What prompted this</span><span class="v">' + esc(a.triggerEvent) + '</span></li>');
  if (goals.length) out.push('<li><span class="k">Working toward</span><span class="v">' + esc(goals.join(', ')) + '</span></li>');
  out.push('</ul></section>');

  /* 3. THE TWO READS — statuses only, never the 0-100 score. */
  out.push('<section class="sec"><h2>The two reads</h2>');
  out.push('<div class="chips">');
  reads.forEach(function (b) {
    out.push('<div class="chip is-' + b.d.status + '"><span class="chip-k">' + b.label + '</span>' +
      '<span class="chip-v">' + STATUS_LABEL[b.d.status] + '</span><span class="chip-s">' + esc(b.sub) + '</span></div>');
  });
  out.push('</div><p class="verdict">' + verdict + '</p></section>');

  /* 4. FINDINGS — the engine. Four beats each, efficacy close mandatory. */
  if (m.findings.length) {
    out.push('<section class="sec"><h2>Findings</h2>');
    out.push('<p class="lede">' + m.findings.length + ' things in your answers worth a closer look.</p>');
    m.findings.forEach(function (f, i) {
      out.push('<article class="finding">');
      out.push('<div class="f-num">' + (i + 1) + '</div><div class="f-body">');
      out.push('<p class="f-you">You told us: \u201c' + esc(f.answer) + '\u201d</p>');
      out.push('<p class="f-mean">' + esc(f.meaning) + '</p>');
      out.push('</div></article>');
    });
    out.push('</section>');
  }

  /* Cross-answer patterns — what a generic report cannot fake. */
  if (m.patterns.length) {
    out.push('<section class="sec"><h2>What they look like together</h2>');
    out.push('<p class="lede">Read one at a time, each answer above has an easy explanation. Read across them, and a pattern shows up.</p>');
    m.patterns.forEach(function (p) {
      out.push('<article class="pattern">');
      out.push('<h3>' + esc(p.title) + '</h3>');
      out.push('<p>' + esc(p.means) + '</p>');
      out.push('<p class="p-missed">' + esc(p.missed) + '</p>');
      /* Sourced evidence line, where the pattern has one. Rendered as a
         distinct block so it reads as a citation rather than a claim about
         them — every one of these is traceable to a PMID in
         RESEARCH/REPORT_CONTENT_LIBRARY.md §6 or the thread. */
      if (p.evidence) out.push('<p class="p-eviAdd">' + esc(p.evidence) + '</p>');
      out.push('<p class="p-eff">' + esc(p.efficacy) + '</p>');
      out.push('</article>');
    });
    out.push('</section>');
  }

  /* 5. THE GAP — quantify the gap, not the person. */
  out.push('<section class="sec gap"><h2>What this report cannot tell you</h2>');
  out.push('<p class="gap-line">' + esc(m.gapLine) + '</p>');
  out.push('<p>Symptoms are a lagging indicator. They show up years after the numbers start moving, which is exactly why the answers you gave us point at where to look but cannot say what\u2019s there.</p>');
  out.push('</section>');

  /* 6. WHAT WE'D TEST FIRST — named, capped at 5, deliberately uninterpreted. */
  if (m.leadMarkers.length) {
    out.push('<section class="sec"><h2>What we\u2019d test first, for you</h2>');
    out.push('<p class="lede">Not a generic panel. These are on your list because of what you told us.</p>');
    out.push('<ol class="markers">');
    m.leadMarkers.forEach(function (x) {
      out.push('<li><span class="m-name">' + esc(x.marker) + '</span><span class="m-why">' + esc(x.from.shortWhy || x.from.title) + '</span></li>');
    });
    out.push('</ol>');
    out.push('<p class="markers-note">We can tell you which markers matter for you and why. What yours actually say needs the blood drawn and someone to read it against optimal, not just the reference range.</p>');
    out.push('</section>');
  }

  /* 8. YOUR CALL.
     Length is a variable, never a constant: `lower` tier books the 30-minute
     calendar (api/book.js:6-8) and both booking.html:277 and thank-you.html:146
     already swap the word. Hardcoding "15 minutes" would ship a `lower` lead a
     report that contradicts their own booking page. It reads as a call length
     and nothing else — it must never disclose the tier. */
  out.push('<section class="sec cta-sec"><h2>Your ' + esc(m.callMinutes) + ' minutes</h2>');
  out.push('<p>We come armed with everything above. We tell you what we\u2019d test first and why, and you get a straight answer on whether we can help.</p>');
  out.push('<p class="not">It is not a results review, and there is no pitch at the end.</p>');
  out.push('<p class="autonomy">Here\u2019s what we\u2019d look at. What you do with it is your call.</p>');
  out.push('<a class="btn" href="' + esc(m.bookingUrl || 'https://assess.secondprime.io/book') + '">Pick your time &rarr;</a>');
  out.push('</section>');

  /* 9. DISCLAIMER — verbatim from results.html:178. */
  out.push('<footer class="foot">');
  out.push('<div class="logo">SECOND PRIME</div>');
  out.push('<p class="tag">Health &middot; Performance &middot; Longevity</p>');
  out.push('<p class="disc">This report is an educational self-assessment based on your answers. It is not a diagnosis and is not a substitute for medical care, diagnosis, or treatment. Individual results vary and are not typical or guaranteed.</p>');
  out.push('</footer>');

  out.push('</main></body></html>');
  return out.join('\n');
}

/* Internal only. Never rendered to the lead, never linked from the report. */
function callNotes(m) {
  var a = m.answers, r = m.reads;
  var L = [];
  L.push('# Call notes \u2014 ' + ((a.firstName || '') + ' ' + (a.lastName || '')).trim());
  L.push('');
  L.push('**INTERNAL ONLY.** Not in the lead-facing report.');
  L.push('');
  L.push('- Second Prime Score: **' + r.score + '** (internal triage only)');
  L.push('- Risk: ' + r.risk.pct + ' (' + r.risk.status + ') | Performance: ' + r.perf.pct + ' (' + r.perf.status + ')');
  if (a.email) L.push('- ' + a.email + (a.phone ? ' \u00b7 ' + a.phone : ''));
  L.push('');
  if (m.escalations.length) {
    L.push('## \u26a0\ufe0f Raise on the call');
    m.escalations.forEach(function (e) { L.push('- ' + e); });
    L.push('');
  }
  L.push('## Patterns fired');
  if (!m.allFired.length) L.push('- None. Low-urgency booking \u2014 lean on goals and the "at 85" answer.');
  m.allFired.forEach(function (p) {
    L.push('- **' + p.id + '** ' + p.title + (m.patterns.indexOf(p) >= 0 ? '' : '  _(not rendered \u2014 over the cap of 3)_'));
  });
  L.push('');
  L.push('## Full marker union (deduped)');
  L.push(m.fullUnion.length ? m.fullUnion.map(function (x) { return '- ' + x; }).join('\n') : '- none');
  L.push('');
  L.push('## Shown to the lead (top 5)');
  L.push(m.leadMarkers.map(function (x) { return '- ' + x.marker; }).join('\n') || '- none');
  L.push('');
  if (a.context) { L.push('## In their words'); L.push('> ' + a.context); L.push(''); }
  L.push('## Their stated goals');
  L.push('- Working toward: ' + (toList(a.goals).join(', ') || 'n/a'));
  L.push('- At 85: ' + (toList(a.longevity).join(', ') || 'n/a'));
  L.push('- Trigger: ' + (a.triggerEvent || 'n/a'));
  L.push('- Already tried: ' + (toList(a.alreadyTried).join(', ') || 'n/a'));
  return L.join('\n') + '\n';
}

function css() {
  return [
    ':root{--ink:#1F1F27;--gray:#686877;--near-black:#18181F;--bg-light:#F7F4F0;--border:#E5E3E0;',
    '--teal:#458D93;--teal-bright:#65C8D0;--teal-deep:#2B5C60;--sand:#D9C8AE;--sand-light:#FDFBF8;--amber:#FF9500;}',
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:"Satoshi",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--sand-light);line-height:1.6;-webkit-font-smoothing:antialiased}',
    '.wrap{max-width:720px;margin:0 auto;padding:0 28px}',
    'h1,h2,h3{font-family:"Zodiak",Georgia,serif;font-weight:400;line-height:1.15;letter-spacing:-0.01em}',
    /* cover */
    '.cover{background:var(--near-black);color:var(--sand-light);padding:72px 0 64px;margin-bottom:56px}',
    '.logo{font-family:"Zodiak",Georgia,serif;font-size:15px;letter-spacing:0.22em;margin-bottom:44px;opacity:.85}',
    '.eyebrow{font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:var(--teal-bright);margin-bottom:14px}',
    '.cover h1{font-size:clamp(38px,7vw,58px);margin-bottom:18px}',
    '.who{color:#A9A9B8;font-size:15px}',
    '.cover-q{margin-top:40px;padding-left:20px;border-left:2px solid var(--teal-bright);font-family:"Zodiak",Georgia,serif;font-size:21px;line-height:1.4}',
    '.cover-q cite{display:block;margin-top:12px;font-family:"Satoshi",sans-serif;font-style:normal;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#8A8A99}',
    /* sections */
    '.sec{margin-bottom:56px;padding-bottom:56px;border-bottom:1px solid var(--border)}',
    '.sec:last-of-type{border-bottom:none}',
    '.sec h2{font-size:clamp(25px,4.2vw,33px);margin-bottom:16px}',
    '.lede{color:var(--gray);margin-bottom:26px}',
    '.sec p+p{margin-top:14px}',
    /* what you told us */
    '.told{list-style:none}',
    '.told li{display:flex;gap:18px;padding:13px 0;border-bottom:1px solid var(--border)}',
    '.told li:last-child{border-bottom:none}',
    '.told .k{flex:0 0 148px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:var(--gray);padding-top:3px}',
    '.told .v{flex:1;font-weight:500}',
    /* chips */
    '.chips{display:grid;gap:14px;grid-template-columns:1fr 1fr}',
    '@media(max-width:560px){.chips{grid-template-columns:1fr}.told li{flex-direction:column;gap:3px}.told .k{flex:none}}',
    '.chip{padding:22px;border-radius:14px;background:#fff;border:1px solid var(--border);border-top:3px solid var(--teal)}',
    '.chip.is-flag{border-top-color:#C2603F}.chip.is-drift{border-top-color:var(--sand)}.chip.is-solid{border-top-color:var(--teal)}',
    '.chip-k{display:block;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:var(--gray)}',
    '.chip-v{display:block;font-family:"Zodiak",Georgia,serif;font-size:29px;margin:6px 0 8px}',
    '.chip-s{display:block;font-size:13px;color:var(--gray);line-height:1.45}',
    '.verdict{margin-top:24px;font-size:17px}',
    /* findings */
    '.finding{display:flex;gap:20px;padding:24px 0;border-bottom:1px solid var(--border)}',
    '.finding:last-child{border-bottom:none}',
    '.f-num{flex:0 0 34px;height:34px;border-radius:50%;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700}',
    '.f-body{flex:1}',
    '.f-you{font-family:"Zodiak",Georgia,serif;font-size:19px;margin-bottom:10px}',
    '.f-mean{color:var(--gray)}',
    /* patterns */
    '.pattern{background:#fff;border:1px solid var(--border);border-radius:14px;padding:26px;margin-bottom:16px}',
    '.pattern h3{font-size:21px;margin-bottom:12px;color:var(--teal-deep)}',
    '.p-missed{margin-top:14px;padding-left:16px;border-left:2px solid var(--sand);color:var(--gray);font-size:15px}',
    '.p-eviAdd{margin-top:14px;padding:14px 16px;background:var(--bg-light);border-radius:10px;font-size:14.5px;color:var(--teal-deep)}',
    '.p-eff{margin-top:14px;font-weight:500}',
    /* gap */
    '.gap{background:var(--near-black);color:var(--sand-light);margin:0 -28px 56px;padding:52px 28px;border-radius:0;border-bottom:none}',
    '.gap h2{color:#fff}.gap p{color:#C9C9D4}',
    '.gap-line{font-family:"Zodiak",Georgia,serif;font-size:23px;line-height:1.4;color:#fff!important;margin-bottom:18px}',
    /* markers */
    '.markers{list-style:none;counter-reset:m}',
    '.markers li{counter-increment:m;display:flex;align-items:baseline;gap:16px;padding:16px 0;border-bottom:1px solid var(--border)}',
    '.markers li::before{content:counter(m);font-size:12px;color:var(--teal);font-weight:700;flex:0 0 18px}',
    '.m-name{font-family:"Zodiak",Georgia,serif;font-size:20px;flex:0 0 auto}',
    '.m-why{font-size:13px;color:var(--gray);text-align:right;margin-left:auto}',
    '.markers-note{margin-top:22px;font-size:15px;color:var(--gray)}',
    /* cta */
    '.cta-sec{text-align:center}',
    '.not{color:var(--gray)}',
    '.autonomy{font-family:"Zodiak",Georgia,serif;font-size:19px;margin-top:20px!important}',
    '.btn{display:inline-block;margin-top:26px;background:var(--amber);color:#18181F;font-weight:700;font-size:16px;padding:16px 34px;border-radius:10px;text-decoration:none}',
    /* footer */
    '.foot{background:var(--near-black);color:#8A8A99;text-align:center;padding:48px 28px;margin-top:56px}',
    '.foot .logo{margin-bottom:10px}',
    '.tag{font-size:13px;letter-spacing:0.05em;margin-bottom:20px}',
    '.disc{font-size:11.5px;line-height:1.6;max-width:560px;margin:0 auto;color:#6E6E7D}',
    '@media print{body{background:#fff}.sec{page-break-inside:avoid}.pattern,.finding{page-break-inside:avoid}}'
  ].join('');
}

module.exports = { html: html, callNotes: callNotes, slug: slug };
