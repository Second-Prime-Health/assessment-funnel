# Funnel tracking — do not break this

First-party analytics for the assessment funnel. Every page loads
`js/experiments.js` then `js/track.js`; events flow to our own Supabase
database (project `abqvlsxosdvdqrkixoqm`), NOT to the Meta pixel. The pixel
keeps its four neutral events (`PageView`, `intake_started`,
`CompleteRegistration`, `Schedule`) and never receives answer data. Where they
fire: PageView on every page except the lower-tier thank-you view;
`intake_started` on the first answer; `CompleteRegistration` when a CORE-tier
lead lands on booking.html (contact info captured, not yet booked; once per
browser via `sp_cr_fired`); `Schedule` on thank-you.html only with an `eid`.
Lower tier is deliberately invisible to Meta end to end. CompleteRegistration
is browser-only: do NOT add a CR node to any GHL CAPI workflow or it
double-counts, same trap as Schedule. Dashboard
and server code live in the `funnel-analytics` repo in this org.

## Rules for anyone editing these pages

1. Keep the two script tags in every page head, experiments before track.
2. Keep `data-cta` attributes on landing CTAs (`nav`, `hero`, `mid1`, `mid2`,
   `final`, `sticky`). New CTA = new `data-cta` value, never reuse.
3. The assessment page's tracking hooks live inside the main script: the
   `spStepView` call in `paint()`, the two `form` change listeners, the slider
   `change` listener, and the submit-handler block. Renaming a form field
   renames the `question_id` in the database; don't rename without updating
   the dashboard labels.
4. Answers must NEVER be passed to `fbq()` in any form.
5. `?v=` cache-bust on any edited file, per HANDOFF.md.
6. One experiment at a time, defined in `js/experiments.js`. New test = new
   experiment `id`, keep `control` first.

## Event taxonomy

Every event carries `session_id`, `variant`, `env` (`prod`/`preview`/`local`),
page, and timestamp. Sessions are sticky per browser (`localStorage.sp_sid`);
attribution is first-touch (`sp_attr`).

| Event | Fires | Key props |
| --- | --- | --- |
| `page_view` | every page load | referrer, UTMs, fbclid, Meta ids (first touch) |
| `cta_click` | landing CTAs | `cta_id` |
| `video_progress` | Vimeo milestones | `video_id`, `milestone` play/25/50/75/95 |
| `assessment_start` | first answer | |
| `question_view` | step becomes active | `question_id`, `step_index` |
| `question_answer` | answer selected | `question_id`, `answer`, `seconds_on_question` |
| `interstitial_view` | interstitial shows | `interstitial_id`, `variant_shown` |
| `assessment_submit` | submit passes validation | score, statuses, `tier`, `duration_seconds` |
| `identify` | same moment | contact fields (server stitches session → lead) |
| `email_captured` | valid email typed at contact step | `email` |
| `results_view` / `booking_view` / `thankyou_view` | page loads | `tier` |
| `booking_widget_shown` | GHL widget fallback renders | `tier` |
| `slot_selected` | native calendar only | `slot_iso`, `tier` |
| `booking_created` | server-side, from the GHL webhook | `tier`, `slot_iso` |

Question ids = form field names: `goals`, `age`, `role`, `energy`, `focus`,
`sleep`, `drive`, `bodycomp`, `familyHistory`, `labs`, `longevity`,
`triggerEvent`, `alreadyTried`, `context`, `businessRevenue`, `annualIncome`,
`investReady`, `timeline`.

`goals`, `familyHistory`, `alreadyTried` and `longevity` are multi-selects, so
their `answer` arrives as an array. Everything else is a string.

Changed 2026-07-30: `outcome` (single choice) became `goals` (multi-select) and
`longevity` was added after `labs`. Both are mirrored in
`funnel-analytics/dash/questions.js`; changing options in one without the other
silently breaks the leads filter.

## URL parameter template (give to the ads agency)

Website URL parameters on every ad, one line, Meta fills the placeholders:

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}
```

The ids are the join keys to spend; the names are for display. `fbclid` is
appended by Meta automatically.

## The booking tag contract (calendars are shared)

The core and lower-tier calendars are shared with other funnels, so
"appointment booked on this calendar" does NOT mean "booked from this funnel."
Counting every booking on them would inflate this funnel's numbers with
ScoreApp bookings and manual bookings.

The discriminator is a one-shot tag:

- `api/book.js` applies **`assessment-funnel-booking`** on the contact upsert,
  which happens before the appointment is created.
- The GHL booking workflow triggers on Customer Booked Appointment, **filters
  to contacts carrying that tag**, fires the `ghl-hook` webhook, and then
  **removes the tag** as its final action.

Removing it is the part that matters. A tag that sticks around would re-fire
months later when the same person books through a different funnel, which is
the exact misattribution this exists to prevent. Treat it as a token that gets
spent, never as a segment label. For segmentation use `consult-booked`, which
is permanent.

Known gap: if `/api` is down and the booking page falls back to the embedded
GHL widget, the widget creates the contact itself and no tag is applied, so
that booking goes uncounted. A missing booking is the right failure here, since
the alternative is counting other funnels' bookings as ours.

## GHL wiring

- Assessment submit posts to the same inbound webhook as before, now with
  extra fields: `session_id`, `variant`, UTMs, `fbclid`, `campaign_id`,
  `adset_id`, `ad_id`. Existing workflow mappings are unaffected.
- Bookings are counted by a GHL workflow (manual setup, once):
  Automation → Create Workflow → trigger **Customer Booked Appointment**
  (both calendars) → action **Webhook**, method POST, URL
  `https://abqvlsxosdvdqrkixoqm.supabase.co/functions/v1/ghl-hook?key=<HOOK_KEY>`
  (key lives in the AIOS workspace `.env` as `SUPABASE_HOOK_KEY`), Custom Data:
  `email` = `{{contact.email}}`, `calendar_id` = `{{appointment.calendar_id}}`,
  `start_time` = `{{appointment.start_time}}`.
- Seven `SP Attribution - *` custom fields on the contact are written by the
  analytics backend at submit and booking. Don't repurpose them.

## Spend data

Ad-level spend is pulled from the Meta Ads connector in a Claude session
(account `2687207058280828`, "Dr. Martin - EHP 1") for the last 7 days and
upserted via `funnel-analytics/scripts/spend_upsert.py`. Ask Claude to
"refresh spend" any time; the 7-day window self-heals missed days. CSV import
fallback lives in the dashboard admin screen.
