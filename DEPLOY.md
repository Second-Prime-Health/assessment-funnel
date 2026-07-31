# Deployment handoff

Everything needed to put the Executive Longevity Assessment funnel and its
dashboard on their own subdomains. Two repos, two Vercel projects, two DNS
records. No build step anywhere.

Written for Reno, July 2026. Questions go to Andrew.

---

## 1. assess.secondprime.io — the funnel

**Repo:** `Second-Prime-Health/assessment-funnel`, branch `main`, files at repo
root.

### Vercel must run this, not static hosting

`api/slots.js` and `api/book.js` are serverless functions. They proxy the
GoHighLevel calendar API so the booking page can show real availability and
take a booking inside our own UI.

On static hosting those files are inert, and the booking page **silently**
falls back to an embedded GoHighLevel widget. No error, nothing in the console,
it just quietly stops being the thing we built. That is exactly what is
happening on the old tests.secondprime.io copy today.

### Project settings

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Build command | none (leave empty) |
| Output directory | leave empty, files are at root |
| Install command | none |
| Root directory | `/` |

### Environment variables

Andrew will send these privately. They are not in the repo and must not be
committed.

| Variable | Required | What it is |
| --- | --- | --- |
| `GHL_API_KEY` | yes | GoHighLevel private integration token |
| `GHL_LOCATION_ID` | yes | The `Second-Prime` sub-account location id |
| `GHL_CALENDAR_ID` | no | 15-minute call calendar, defaults in code |
| `GHL_CALENDAR_ID_LOWER` | no | 30-minute call calendar, defaults in code |

Set all of them for Production. Preview deployments hitting the live calendar
would create real appointments, so either leave Preview unset or point it at a
test calendar.

### DNS

Add the record Vercel shows you for `assess.secondprime.io`, normally a CNAME
to `cname.vercel-dns.com`. Let Vercel issue the certificate.

### Verify before calling it done

1. `https://assess.secondprime.io/` loads, amber "Start My Assessment" button.
2. `https://assess.secondprime.io/api/slots?startDate=2026-08-01&endDate=2026-08-20`
   returns JSON with real slots, not a 404 and not an error object.
3. On `booking.html`, the calendar is the dark teal two-week grid. If you see a
   white embedded GoHighLevel widget, the functions are not running. Check the
   env vars first.
4. Make one real test booking, confirm it lands in GoHighLevel, then delete it.

---

## 2. dash.secondprime.io — the analytics dashboard

**Repo:** `Second-Prime-Health/funnel-analytics` (private), branch `main`.

Serve the **`dash/` folder only**. Pure static HTML, CSS and JS. No build, no
package.json, no environment variables. It talks to Supabase directly from the
browser and has its own email and password login.

Simplest setup is a second Vercel project on the same repo with **Root
Directory** set to `dash`. Everything else empty, same as above.

### DNS

Same as the funnel: whatever record Vercel gives you for
`dash.secondprime.io`.

### Please add two protections

This dashboard displays real lead names, email addresses, phone numbers and
health answers. The app has its own login, but a public subdomain holding that
data should not rely on a single layer.

1. **`noindex`** so it never reaches a search engine.
2. **A second gate** in front of it, Vercel password protection or Cloudflare
   Access, whichever you normally use.

If either is a problem, tell Andrew before it goes live rather than after.

---

## 3. After both are up

Tell Andrew, and he will run an end-to-end test on the live domain: a full pass
through the assessment, a real calendar booking, and confirmation that the Meta
pixel fires on the production domain. The pixel is deliberately suppressed on
localhost, `github.io` and `tests.secondprime.io`, so production is the first
place it can be verified.

The old preview at `tests.secondprime.io/assessment-funnel/` gets retired once
`assess.secondprime.io` is confirmed working. It runs on fake calendar data and
should not outlive the real thing.

---

## Notes for whoever edits this funnel later

`HANDOFF.md` in this repo records decisions that look arbitrary in the code and
are easy to undo by accident. `TRACKING.md` lists the rules that keep the
analytics contract intact: renaming a form field or a `data-cta` value breaks
the dashboard silently. Read both before changing anything.

Any edit to a CSS or JS file needs its `?v=` query bumped on every page that
loads it, or browsers will keep serving the old copy.
