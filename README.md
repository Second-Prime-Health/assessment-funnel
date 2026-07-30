# Executive Longevity Assessment funnel

Cold-traffic funnel for Second Prime, built for Meta ads. Static HTML, CSS and
JS with no build step and no framework. Open `index.html` and it runs.

**Live:** assess.secondprime.io

## The flow

`index.html` → `assessment.html` (14 questions, 4 dynamic interstitials) →
`booking.html` → `thank-you.html`. People who don't qualify land on
`results.html` instead, a soft path with no booking CTA.

Open `FLOW.html` in a browser for a visual map of every step and branch.

## Read these before changing anything

| File | What's in it |
|---|---|
| `HANDOFF.md` | How the funnel works, the positioning rules, what's still unwired |
| `RESULTS-EMAIL.md` | The GHL follow-up emails, both variants plus the 24-hour nudge |
| `VIDEO-SCRIPTS.md` | Scripts for the two video slots |

`HANDOFF.md` is the important one. It records decisions that look arbitrary in
the code (why no score is ever shown, why the CTA says what it says, which
statistics are substantiated) and those are easy to undo by accident.

## Hosting

Static hosting works, but the booking page falls back to the embedded
GoHighLevel widget because `api/` needs a serverless runtime.

For the custom calendar, deploy to Vercel. `api/slots.js` and `api/book.js`
proxy the GHL calendar API and need three environment variables:

| Variable | What it is |
|---|---|
| `GHL_API_KEY` | GoHighLevel private integration token |
| `GHL_LOCATION_ID` | The Second-Prime sub-account location id |
| `GHL_CALENDAR_ID` | 15-minute call calendar (optional, defaults in code) |
| `GHL_CALENDAR_ID_LOWER` | 30-minute call calendar (optional, defaults in code) |

No keys are committed. The two calendar ids that are hardcoded as fallbacks are
the same public ids in the GHL booking widget URLs.

## Conventions

- New styles go in `css/assess.css` only. Bump the `?v=` on every page when you
  edit it, or browsers will serve the old file.
- Zodiak for headlines, Satoshi for everything else, both loaded locally.
- No pricing on any page. The call is 15 minutes everywhere except the
  lower-tier path, which is 30.
- The Meta pixel is suppressed on localhost, `github.io` and
  `tests.secondprime.io` so previews stay out of the ad data.
