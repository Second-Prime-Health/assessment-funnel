# Report of Findings generator

Per-lead branded report for people who complete the Executive Longevity
Assessment. Node, no dependencies, no build step.

```bash
node report/generate.js --demo                       # sample lead
node report/generate.js lead.json --out report/out   # a real one
node report/test.js                                  # 38 tests
```

## Pulling a real lead

`report/pull.js` reads live leads through the same door the dashboard uses:
sign in as a `team` user, call the `dash-query` edge function. No service-role
key — `team` already has `leads` and `timeline`, which together carry the whole
report payload (`dash-query/index.ts:8-13`, `schema.sql:414-425`).

```bash
export SP_DASH_EMAIL=fizz@secondprime.io
export SP_DASH_PASSWORD=...                          # never in argv
node report/pull.js --list                           # recent leads + session ids
node report/pull.js --session <uuid>                 # inspect the payload
node report/pull.js --session <uuid> --generate      # straight to a report
```

Credentials come from the environment on purpose: argv is visible in `ps` and
lands in shell history.

Two files per lead:

| Output | Audience |
| --- | --- |
| `<slug>.html` | The lead. Self-contained, print-clean, hostable as a personal URL. |
| `<slug>.notes.md` | Andrew, before the call. Score, full marker union, escalations. **Never sent.** |

## Input

The `sp_assessment` payload shape from `localStorage`, or the equivalent
assembled from the `funnel-analytics` `leads` + `answers` rows:

```json
{ "tier": "core",
  "data": { "firstName": "", "lastName": "", "energy": "", "focus": "",
            "sleep": "", "drive": "", "bodycomp": "", "familyList": [],
            "labs": "", "longevity": [], "goals": [], "triggerEvent": "" } }
```

`score`/`perf`/`risk` are used when present and recomputed from the answers when
absent, using the same weights as `assessment.html:845-862`.

## Rules the code enforces (with tests)

- **No 0-100 score in lead-facing output.** Statuses only. The number stays in
  the call notes. (`HANDOFF.md:5-10`)
- **No tier disclosure, ever.** Call length and booking link derive from tier —
  `core` → 15 min + `/book`, `lower` → 30 min + `/book30` — and nothing a lead
  reads may say which one they landed in.
- **Findings ≤ 5, patterns ≤ 3, lead-facing markers ≤ 5.** Markers round-robin
  across patterns so every rendered pattern contributes one.
- **Markers are named, never interpreted.** The report says which markers matter
  and why. What theirs say needs the draw and the call.
- **Every pattern ends on an efficacy beat**, after any evidence line.
- **No unsourced claims.** Every statistic traces to a PMID.

## Where the content comes from

| Layer | File |
| --- | --- |
| Single-answer copy | `report/mirrors.js` — ported verbatim from `results.html:232-260` |
| Cross-answer patterns | `report/patterns.js` — `RESEARCH/REPORT_CONTENT_LIBRARY.md` |
| Section order | `report/render.js` — `RESEARCH/REPORT_SHOWUP_RESEARCH.md` §3 |

`mirrors.js` drops one clause present in `results.html`: the "half of heart
attack patients had normal cholesterol" statistic, which is unsourced. Honey
has since sourced the underlying finding (Sachdeva, *Am Heart J* 2009,
PMID 19081406 — "almost half" arrived with LDL <100, measured on admission, not
at a prior physical). The live line still overstates it; see the open item below.

## Not built yet

- **Hosting.** Reports render to disk. Serving them at a per-lead URL needs a
  route and a slug that isn't guessable — a lead's name plus the date is fine
  for a filename and wrong for a URL.
- **Supabase pull.** Manual JSON for now, per Andrew.
- **`report_view` tracking**, and the attendance write-back the `bookings` table
  still lacks. Until show-up is recorded per lead, none of this is measurable.
