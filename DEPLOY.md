# Deployment handoff

Everything needed to launch the Executive Longevity Assessment funnel: two
Vercel deploys, two DNS records, and one GoHighLevel workflow. No build step
anywhere.

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
   Check `/book` and `/start` resolve too; `vercel.json` rewrites them to
   `booking.html` and `assessment.html` so follow-up texts can carry a short
   link instead of a long one.
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

## 3. The follow-up workflow in GoHighLevel

Qualified people are sent straight to the booking page when they submit, and a
good number of them won't book on that first visit. This workflow brings them
back. Without it, every one of those people is a paid click that goes nowhere.

### What it has to do

**Trigger:** the assessment posts to an inbound webhook in GoHighLevel when
someone submits. A workflow with that trigger already exists and the funnel
posts to this URL, so build inside it rather than creating a new one:

```
https://services.leadconnectorhq.com/hooks/FlDP3vggPbCWokd7J6xc/webhook-trigger/152fcbfd-cb5a-4bd7-b31e-5f60a2c91073
```

If you do end up with a new webhook URL, send it to Andrew. The funnel has to
be repointed at it or nothing fires.

**Filter:** continue only when `application_source` is `Assessment Funnel V1`
**and** `qualified` is `Yes` or `Yes - lower tier`. Anyone with `qualified` set
to `No` gets nothing from this workflow.

**Branch on qualification, because the two tiers book different calls:**

| `qualified` | Booking link |
| --- | --- |
| `Yes` | `https://assess.secondprime.io/book` |
| `Yes - lower tier` | `https://assess.secondprime.io/book30` |

**Sequence:**

1. **Wait 10 minutes**, then check whether they've booked. If they have, they
   leave. If not, send a text and an email with their booking link.
2. **Wait 24 hours.** If they still haven't booked, send one more text.

The 10-minute delay matters. Plenty of people book within a minute or two of
submitting, and a text telling them to book something they just booked makes us
look like we aren't paying attention.

**Exit goal:** a contact leaves the sequence the moment an appointment is
booked on either calendar, or the tag `consult-booked` is added. Nobody who has
booked should ever receive another message from this.

**SMS window:** only send texts between 9am and 6pm in the contact's local
timezone.

### Two rules that aren't negotiable

**Never use a GoHighLevel calendar widget link in these messages.** Only the
two URLs in the table. A widget link creates the appointment inside
GoHighLevel, which means the funnel's own code never runs, the attribution tag
is never applied, and the booking is never counted. The call happens and the
dashboard shows nothing.

**Never send a link containing `tier=lower`.** That's why the lower-tier link
is `/book30`. Nothing a prospect can read should tell them which tier they were
sorted into.

### Copy to use

Plain text. No emoji, no exclamation marks, no all-caps. The only merge tag is
first name, because the other webhook fields are not mapped to contact fields
in this account.

**Text, 10 minutes after submit:**

> {{contact.first_name}}, we've got your assessment. Andrew's team reviews it
> before your call, so it's about you from the first minute. If you haven't
> picked a time yet, here's the link: [their booking link]

**Email, same time.** Subject: `{{contact.first_name}}, we've got your assessment`

> {{contact.first_name}},
>
> Your assessment is in. Someone on our team reads every answer before your
> call, so we're not starting from scratch when we get on the phone.
>
> Here's what the call is. Fifteen minutes, free, and you walk away knowing
> what we'd test first and why. If we can't help, we'll tell you that too.
> There's nothing to sit through at the end.
>
> If you haven't picked a time yet: [their booking link]
>
> Andrew Martin
> Founder and Biologist, Second Prime

On the lower-tier branch change "Fifteen minutes" to "Thirty minutes".

**Text, 24 hours later, only if still not booked:**

> {{contact.first_name}}, your call time is still open. 15 minutes and there's
> nothing to sit through at the end: [their booking link]

Lower tier: "30 minutes" instead of "15 minutes".

### Before you switch the SMS steps on

The assessment collects a phone number but doesn't currently tell people they
may receive a text. Flag that to Andrew before the first automated message
sends.

### One dependency

Andrew is building a second, separate workflow that reports bookings to the
analytics dashboard. This workflow's exit goal depends on GoHighLevel knowing
about the booking, not on that one, so the two can be built in either order.

---

## 4. After both are up

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
