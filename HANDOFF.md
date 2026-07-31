# Second Prime Assessment Funnel — Handoff

Built July 2026 for cold Meta traffic, repositioned July 27, renamed July 30.

POSITIONING (do not drift from this): the funnel is step 1 of the Executive
Longevity Assessment, and the call is step 2 where they get answers and a
direction. Step 1 arms the team; nobody "reviews results" with the prospect,
and no numeric score is ever shown to them (it exists only for internal triage
in the webhook). Self-contained files (fonts, logo, images, CSS copied from
funnel-v2).

NAMING (July 30): the product is **The Executive Longevity Assessment**, and
the 15 questions are step 1 of it. The word "intake" is retired everywhere a
prospect can read it. It's post-commitment language, so on a cold landing page
it asks people to enrol before they've decided. CTA is "Start My Assessment"
with a "Step 1: 15 questions, about 2 minutes" note under it, and that note is
load-bearing: without it, "assessment" reads as the 1,000-biomarker panel
rather than the questionnaire. One exception, deliberate: the Meta custom event
is still `intake_started`, so campaign history stays intact if one already
exists. Rename it only before launch, never after.

## Two repos, and who owns what

This funnel and its analytics are built in parallel, often in separate
sessions. The split is deliberate:

| Repo | Holds |
| --- | --- |
| `assessment-funnel` (this one) | The five pages, CSS, assets, the calendar functions in `api/`, and the client-side tracking in `js/` |
| `funnel-analytics` | The Supabase schema, edge functions, the dashboard UI, and the Meta spend scripts |

The seam is `js/track.js` and `js/experiments.js`. They live here because
events have to fire from these pages, but they are written against the schema
in `funnel-analytics`. Changing an event name, a `question_id` or a
`data-cta` value breaks the dashboard silently. `TRACKING.md` lists the rules
that protect that contract; read it before editing any page.

Working copy is `~/SecondPrimeSite/assessment-funnel`, a clone of this repo.
Pull before you edit and commit before you walk away. Do not sync files into
this folder from anywhere else: an earlier overwrite nearly took out the
tracking work, and git is the only thing that catches it.

**Flow:** `index.html` (landing + video) → `assessment.html` (15 questions +
4 dynamic trust interstitials: role, performance, risk, what-you've-tried) → qualified: `booking.html` → `thank-you.html`
/ disqualified: `results.html` soft path. `FLOW.html` is a visual map of every
step and branch; open it in a browser.

## How it works

**Landing (`index.html`)** — video slot at top of the hero, every CTA goes to
the assessment. Copy promises the score plus a Risk and Performance read.

**Assessment (`assessment.html`)**
- 15 questions: goals (multi-select), age, role, then 4 performance (energy,
  focus, sleep, drive), 3 risk (body comp, family history, testing depth),
  longevity (multi-select, the "at 85" question), trigger event,
  money question (revenue for owners, income otherwise), conditional $10K
  invest question, timeline, then contact.
- 4 interstitials, 3 of them DYNAMIC: each reads the answers just given and
  shows matching proof. Role → "built for owners/operators" positioning.
  Worst performance answer → testosterone math + J.M., or the 3pm-fog
  chemistry + D.R., or the strong-baseline + R.S. variant. Risk answers →
  family-history stat, or 1,000-vs-40-markers, or "the read is the other
  half," all ending on the Dustin case card. Copy pulls from
  `outputs/Market_Copy_Messaging_File.md` (the market's own words).
- Scoring: 2 buckets. Performance = energy + focus + sleep + drive (max 18
  deduction points). Risk = body comp + family + testing gap (max 14). Bucket
  status: solid under 28%, drifting to 60%, flagged above. Overall score =
  100 minus scaled deductions, floor ~22.
- Qualification gate, THREE outcomes. Owners at $500K+ revenue and non-owners
  at $150K+ income qualify automatically (tier `core`). Below that they get the
  invest question:
  - "$10K+" → tier `core` → 15-minute call (custom teal calendar)
  - "$2,500-$10K" → tier `lower` → `booking.html?tier=lower`, same custom
    calendar pointed at the 30-minute GHL calendar (`85vCxdmO6uvmsJmx97Rp`)
    for a one-call close on the lower-tier offer
  - "No" → tier `dq` → `results.html` soft path
  The tier is saved in `sp_assessment.tier` and sent to GHL in `qualified`
  (`Yes`, `Yes - lower tier`, or `No`).

**Assessment summary (`results.html`)** — for disqualified users, the thank-you
link, and the email link. No gauge, no number: status chips (Risk /
Performance) up top, book CTA + video at the very top (both hidden for DQ),
then the two sections, worse one first, each with "mirror" cards: the
person's own answer quoted back, with what it usually means in labs. Direct
visits with no stored result bounce to the assessment. `?demo=1` / `?demo=dq`
preview modes.

**Booking (`booking.html`)** — step 2 of 2. Headline: "Your assessment is in.
Pick your time." Above the calendar: up to 3 plain-language flags computed
from their answers ("The afternoon energy crash", "Family health history"),
never a score. Video slot below the calendar ("what happens on the call").
Calendar is a two-week grid, Monday start: this week on top, next week below,
no month navigation. Days already gone are ghosted, days with no availability
dimmed, first open day preselected with its times right below (one screen
instead of three). "More dates" extends to 4 weeks. GHL widget fallback if `/api` isn't there. Both tiers use the
same UI; `?tier=lower` just sends `tier=lower` to `/api/slots` and `/api/book`,
which map it to the 30-minute calendar server-side. `?demo=1` previews the
flags strip and fills the calendar with sample availability.

**Thank-you (`thank-you.html`)** — one page for both tiers. `?tier=lower` (or
the stored tier) swaps "15-minute" for "30-minute"; everything else is
identical. Two prep items only: accept the invite, be somewhere you can take a
Zoom. Nothing about labs, the call needs no prep. Plus the "see your assessment
summary" button to the results page.

## Wiring

- **GHL webhook:** same inbound webhook as funnel v2, fires for qualified AND
  disqualified. `application_source` = `Assessment Funnel V1`. Score and both
  reads in `notes` (`Second Prime Score 61. Risk: 43 (flag) | Performance: 61
  (drift)`), performance answers in `symptoms`, risk answers in
  `already_tried`, trigger event in `trigger_event`.
- **Results email:** the funnel promises results by email. Build the GHL
  workflow from `RESULTS-EMAIL.md` (2 variants + a 24-hour no-book nudge).
  This is required wiring, the same tier as SMS reminders.
- **Facebook pixel:** wired on all 5 pages (Amartinco LLC's Pixel,
  `500535282073021`, from the Dr. Martin - EHP 1 ad account). PageView
  everywhere, `CompleteRegistration` on assessment submit, `Schedule` on the
  thank-you page. Neutral names only per Meta health-advertiser rules. The
  pixel does not fire on localhost, github.io, or tests.secondprime.io.
- **Videos:** two slots (landing hero, top of results). Scripts in
  `VIDEO-SCRIPTS.md`. Until real videos land, the landing placeholder click
  starts the assessment and the results placeholder scrolls to the CTA.
- **GHL calendar:** cap availability at 14 days out (the grid shows 2 weeks by
  default), align the widget copy to "15-minute call," instant SMS
  confirmation + reminder (highest-impact show-rate lever in the research).
- **Hosting:** static anywhere (booking falls back to the GHL widget) or
  Vercel with `GHL_API_KEY` for the native calendar (`api/` included). Calendar
  ids default to the live ones in code; `GHL_CALENDAR_ID` (15-min) and
  `GHL_CALENDAR_ID_LOWER` (30-min) override them. Preview lives at
  tests.secondprime.io/assessment-funnel/.

## Tracking (July 30)

First-party analytics is wired on every page: `js/experiments.js` +
`js/track.js`, events to our own Supabase database, dashboard in the
`funnel-analytics` repo. **Read `TRACKING.md` before editing any page**; it
lists the hooks that must survive edits and the rule that answers never touch
the pixel. The pixel wiring described above is unchanged.

## Brand rules baked in (do not deviate)

- Zodiak headlines, Satoshi everything else, loaded locally.
- Landing CTA is amber (`--amber` #FF9500), the only warm color on the funnel.
  The page is teal end to end, including Vimeo's own play button and scrubber,
  so the CTA needs a color nothing else uses. Nav CTA is a ghost outline for
  the same reason. Everything else stays teal.
- New styles live in `css/assess.css` only; bump `?v=` on edits.
- The call is a **15-minute call** everywhere. No pricing on any page.
- Stats and testimonials reused verbatim from funnel-v2 / the live site plus
  the Market Copy Messaging File. If you add claims, source them first.
- Client-average figures used in the assessment, all supplied by Andrew and shown
  with an "average across client retests" qualifier plus a footer disclaimer:
  26 lbs average weight loss and 64% more energy reported at 3 months
  (interstitial 1, everyone), +40% free testosterone, -52% inflammatory
  markers, -35% insulin resistance, -12 yrs biological age (interstitials 2
  and 3, matched to answers). Keep the substantiation for these on file.
- Score disclaimer (educational, not a diagnosis) stays in both footers and
  the results email.
