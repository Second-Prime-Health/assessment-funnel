#!/usr/bin/env node
/* Pull a real lead out of funnel-analytics and shape it for generate.js.
 *
 * Reads through the same door the dashboard uses: sign in as a `team` user and
 * call the `dash-query` edge function. No service-role key — `team` already has
 * `leads` and `timeline`, which together hold the whole report payload
 * (dash-query/index.ts:8-13, schema.sql:414-425).
 *
 *   SP_DASH_EMAIL=... SP_DASH_PASSWORD=... node report/pull.js --list
 *   SP_DASH_EMAIL=... SP_DASH_PASSWORD=... node report/pull.js --session <uuid>
 *   ... node report/pull.js --session <uuid> --generate
 *
 * Credentials come from the environment, never argv: argv shows up in `ps` and
 * in shell history.
 */
'use strict';

var SB = 'https://abqvlsxosdvdqrkixoqm.supabase.co';
/* Public by design — every call is still gated by the caller's JWT and role
   server-side (dash/dash.js:2-6). */
var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFicXZsc3hvc2R2ZHFya2l4b3FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTk2OTUsImV4cCI6MjEwMTAzNTY5NX0.Mcr8bAyorG8E2BBVwOBCut2HlQG-soTIUc63ka2Hyeg';

async function login(email, password) {
  var res = await fetch(SB + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  });
  var d = await res.json();
  if (!res.ok) throw new Error('login failed: ' + (d.error_description || d.msg || res.status));
  return d.access_token;
}

async function api(token, action, params) {
  var res = await fetch(SB + '/functions/v1/dash-query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, params: params || {} })
  });
  var d = await res.json();
  if (!res.ok) throw new Error(action + ': ' + (d.error || res.status));
  return d;
}

/* Supabase keys answers by question_id — the form field names. generate.js
   normalizes the family-history aliases itself (familyOf), so pass the answer
   keys straight through rather than renaming them here: a rename is exactly
   how the familyList/familyHistory bug got in. */
function toPayload(timeline) {
  var lead = timeline.lead || {};
  var answers = {};
  (timeline.answers || []).forEach(function (a) {
    answers[a.question_id] = a.answer;
  });
  var data = Object.assign({}, answers, {
    firstName: lead.first_name || '',
    lastName: lead.last_name || '',
    email: lead.email || '',
    phone: lead.phone || ''
  });
  var payload = { tier: lead.tier || null, data: data };
  /* Prefer the stored score over recomputation when the row carries one, so the
     report agrees with what the dashboard shows for the same lead. */
  if (lead.score != null && lead.perf_status && lead.risk_status) {
    payload.score = lead.score;
    payload.perf = { pts: null, pct: lead.perf_pct, status: lead.perf_status };
    payload.risk = { pts: null, pct: lead.risk_pct, status: lead.risk_status };
  }
  return payload;
}

module.exports = { toPayload: toPayload };

async function main() {
  var args = process.argv.slice(2);
  var email = process.env.SP_DASH_EMAIL, password = process.env.SP_DASH_PASSWORD;
  if (!email || !password) {
    console.error('set SP_DASH_EMAIL and SP_DASH_PASSWORD in the environment');
    process.exit(1);
  }
  var token = await login(email, password);

  if (args.indexOf('--list') >= 0) {
    var rows = await api(token, 'leads', { limit: 25 });
    console.log(JSON.stringify((rows || []).map(function (r) {
      return { name: r.first_name + ' ' + r.last_name, session: r.session_id,
               tier: r.tier, booked: r.bkd, submitted: r.submitted_at };
    }), null, 2));
    return;
  }

  var si = args.indexOf('--session');
  if (si < 0) {
    console.error('usage: pull.js --list | --session <uuid> [--generate] [--out DIR]');
    process.exit(1);
  }
  var timeline = await api(token, 'timeline', { session: args[si + 1] });
  var payload = toPayload(timeline);

  if (args.indexOf('--generate') < 0) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  var gen = require('./generate.js');
  var render = require('./render.js');
  var fs = require('fs'), path = require('path');
  var oi = args.indexOf('--out');
  var outDir = oi >= 0 ? args[oi + 1] : 'report/out';
  var model = gen.buildReport(payload);
  var slug = render.slug(model.answers);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, slug + '.html'), render.html(model));
  fs.writeFileSync(path.join(outDir, slug + '.notes.md'), render.callNotes(model));
  console.log(JSON.stringify({
    report: path.join(outDir, slug + '.html'),
    call_notes: path.join(outDir, slug + '.notes.md'),
    patterns: model.patterns.map(function (p) { return p.id; }),
    markers: model.leadMarkers.map(function (m) { return m.marker; }),
    escalations: model.escalations
  }, null, 2));
}

if (require.main === module) {
  main().catch(function (e) { console.error(String(e.message || e)); process.exit(1); });
}
