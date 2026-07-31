# Assessment summary email (for the GHL workflow)

Qualified people go straight to booking after the assessment, so this email
delivers the written summary and catches the ones who bailed before picking a
time. Wire it into the GHL workflow the webhook triggers
(`application_source = Assessment Funnel V1`). Send 10 to 15 minutes after
submission so booking stays the first ask.

Positioning rule for every send: the assessment armed us, the call is where they
get answers. Never frame the call as "reviewing your results." No numeric
score anywhere; the score exists only for internal triage.

The webhook delivers what's needed: risk and performance statuses in `notes`,
performance answers in `symptoms`, risk answers in `already_tried`, trigger
in `trigger_event`, what they're working toward in `goals`, and their "at 85"
answers in `longevity`. Both new fields are comma-separated lists and both are
also appended to `notes`. Map to custom fields so the merge tags resolve.

Use `goals` and `longevity` for personalization, never as a claim. "You told
us you want to be keeping up with your grandkids at 85" is fair. Promising
that outcome is not.

## Booking links must point at the funnel, not the GHL widget

Two versions of the same link. Both hit the funnel's booking page, which is
what applies the `assessment-funnel-booking` tag and makes the booking
countable.

**Email** (long is fine, it hides behind the anchor text):

```
https://assess.secondprime.io/book?first_name={{contact.first_name}}&last_name={{contact.last_name}}&email={{contact.email}}&phone={{contact.phone}}
```

**SMS** (short, no query string, survives carrier filtering):

```
https://assess.secondprime.io/book
```

Lower-tier contacts get a different link. **Never send them anything
containing `tier=lower`.** The 30-minute path is `/book30` for a bare link, or
`&c=30` appended to the prefilled version. Both read as a call length, which is
all they should ever read as. Nothing we send should tell someone which tier
they landed in.

The prefill parameters are a convenience, not a requirement. With them the
booking is two taps. Without them they type name, email and phone, and the
booking is still tagged and still counted, because attribution happens when the
funnel's code creates the appointment, not from anything in the URL. No UTM
parameters belong on these links; UTMs are for ad clicks.

Why it has to be the funnel URL: a raw GHL widget link creates the appointment
inside GoHighLevel, so `api/book.js` never runs, the tag is never applied, and
the booking workflow's filter drops it. The booking happens and the dashboard
never counts it, which quietly understates the funnel every time follow-up does
its job.

Same rule for every link that sends this funnel's people to a calendar: the
24-hour nudge, any nurture sequence, and Mike texting a link by hand.

Two variants. GHL branches on the `qualified` field.

---

## Variant A — qualified (booked or not; same email works)

**Subject options (test these):**
1. `{{contact.first_name}}, your assessment summary`
2. What your assessment flagged
3. Your assessment is in. Here's what stood out.

**Body:**

{{contact.first_name}},

Your assessment is in, and we've been through it. The short version:

- **Risk: {{risk_status}}.** From what you told us about your body
  composition, family history, and how long it's been since anyone tested you
  past a standard physical.
- **Performance: {{performance_status}}.** From your energy, focus, sleep,
  and drive answers.

You told us what you're working toward: {{goals}}. And what you want to still
be doing at 85: {{longevity}}. Hold onto both, because everything below is in
service of them.

Here's the thing about an assessment like this. Your answers tell us where to
look. They can't tell us what's there. Symptoms show up years after the
numbers start moving, and a standard physical checks a few dozen markers
where we measure 1,000+.

That's what the call is for. We come armed with everything you told us, we
tell you what we'd test first and why, and you get a straight answer on
whether we can help. 15 minutes, free, no pitch at the end.

**[Pick your time]({{booking_link}})**

Andrew Martin
Founder and Biologist, Second Prime

*Your assessment summary is educational and based on your answers. It is not a
diagnosis and is not a substitute for medical care.*

---

## Variant B — disqualified

**Subject:** Your assessment summary, and a straight answer

**Body:**

{{contact.first_name}},

Your assessment is in. Risk came back {{risk_status}}, performance
{{performance_status}}.

We'll be straight with you: based on where you are right now, our programs
would be the wrong fit, and we'd rather say that than take your time or
money.

Your summary still stands, so use it. Get real bloodwork done this year, and
ask for more than the standard panel: fasting insulin, ApoB, a full hormone
panel, hs-CRP. Anything flagged in your assessment is worth that conversation.

If your situation changes, the door is open. We'd genuinely welcome you back.

Andrew Martin
Founder and Biologist, Second Prime

*Same disclaimer as above.*

---

## Follow-up sequence note

If a qualified contact hasn't booked within 24 hours, send one nudge: subject
`Your call time is still open, {{contact.first_name}}`, body 2 lines: "You
said you want to still be {{longevity_first}} at 85. Your assessment flagged
your {{worst_area}}. 15 minutes gets you our read: {{booking_link}}." Then drop into normal nurture. The `trigger_event` field
is the best personalization hook for later sends.
