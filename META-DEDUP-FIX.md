# Meta is counting bookings twice: what to fix

Meta reported 11 bookings on a day with 6 real ones, and 8 registrations. Since
nobody can book without finishing the assessment first, bookings can never
exceed registrations, so the number is provably wrong. Real cost per booking is
about $37, not the $20 showing.

The ad set optimizes on SCHEDULE at $300/day, so the delivery algorithm has been
learning on inflated signal. That's the expensive part, more than the reporting.

Three separate causes, listed by how much each one is costing. Two are in
GoHighLevel and Events Manager. One is in this repo.

---

## 1. Two differently-named booking events, both firing

**Owner: GoHighLevel / Events Manager. Biggest impact.**

The pixel carries both a `Schedule` event and a custom event called
**"Call 1 Booked"**. Over 7 days: 10 Schedule, 8 Call 1 Booked, 18 total, for
what should be one event per booking.

Deduplication cannot help here. Meta only collapses two events when the event
**names** match. Two events with different names will always both count.

**Fix:** pick one and remove the other. Keep `Schedule`, because that's what the
ad set optimizes against. Either delete "Call 1 Booked" or rebuild it as a
custom conversion sitting on top of `Schedule` rather than as its own pixel
event.

Do this one first. It's the only fix that helps on its own.

---

## 2. Browser and server events can't dedupe, because there's no shared ID

**Owner: split. Needs a code change here AND a GoHighLevel change. Neither half
works alone.**

Meta merges a browser event and a Conversions API event only when **both the
`event_name` and the `event_id` match**, within a 48-hour window.

Right now `thank-you.html` fires:

```js
fbq('track', 'Schedule');
```

No event ID. So the browser event has nothing for the server event to match
against, and Meta counts both. This is why the doubling is intermittent rather
than a clean 2x: when the browser pixel gets blocked by an ad blocker or private
relay, only the server event lands and the count looks right. When both land,
it doubles.

### The code change (this repo)

**`booking.html`**, when a booking succeeds through the custom calendar: mint
one ID, use it three ways.

```js
var eid = 'sch-' + (crypto.randomUUID ? crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(16).slice(2));
```

- POST it to `/api/book` alongside the booking
- Pass it to the thank-you page: `thank-you.html?...&eid=<eid>`

**`api/book.js`**: accept `eventId` in the request body and write it to a
contact custom field, `sp_meta_event_id`, on the same upsert that already
applies the tags. That's how GoHighLevel gets hold of it.

**`thank-you.html`**: replace line 23 with a guarded, ID-carrying version.

```js
var eid = new URLSearchParams(location.search).get('eid');
if (eid && !localStorage.getItem('sp_sched_' + eid)) {
  fbq('track', 'Schedule', {}, { eventID: eid });
  localStorage.setItem('sp_sched_' + eid, '1');
}
```

Two things to note. It only fires when there's an ID to dedupe on. And when
there's no ID, it deliberately fires nothing and lets the server event own the
conversion, which is the more reliable of the two. That covers bookings made
through the GoHighLevel widget fallback, where we have no way to share an ID.

### The GoHighLevel change

In the Conversions API action, set the Event ID to `{{contact.sp_meta_event_id}}`
and the Event Name to `Schedule`, exactly. Create the `sp_meta_event_id` custom
field first or the merge tag resolves empty and nothing dedupes.

---

## 3. The Schedule event fires again on every page refresh

**Owner: this repo. Smallest of the three, but free to fix.**

That `fbq('track', 'Schedule')` sits in a page-load block with no guard. A
refresh fires it again. Back then forward fires it again. Reopening the tab
fires it again.

This is the best explanation for the 07:00 hour in the data, which showed 2
bookings against 0 registrations. Someone who registered at 06:00, booked at
07:00 and refreshed once produces exactly that.

The `localStorage` check in the snippet above fixes this at the same time.

---

## Also worth checking while you're in there

**Is `thank-you.html` set as the redirect URL on the GoHighLevel calendar?** If
it is, widget bookings land on it and fire the browser Schedule too, stacking on
top of the CAPI event and "Call 1 Booked."

**Is Schedule configured twice inside GoHighLevel?** A native Meta integration
firing it plus a workflow action firing it produces a clean 2x. Today's data
isn't a clean 2x, so this is unlikely, but it's cheap to rule out.

**`CompleteRegistration` has the same missing-ID problem.** `assessment.html`
fires it with no event ID. If GoHighLevel also reports a registration event,
that number is inflated too, quietly. Same fix pattern if so.

---

## Order of work

1. Remove or rebuild "Call 1 Booked". Helps immediately, on its own.
2. Create the `sp_meta_event_id` custom field in GoHighLevel.
3. Make the code change in this repo.
4. Point the CAPI action at `{{contact.sp_meta_event_id}}`.

Steps 3 and 4 have to ship together. Either one alone changes nothing.

## How to verify

Events Manager → Data Sources → pixel `500535282073021` → the `Schedule` event
→ the deduplication panel. It shows the browser/server overlap percentage and
warns about redundant events. That's the confirmation, and it can't be pulled
from the Ads API.

Then book one test appointment through `assess.secondprime.io` and watch that a
single Schedule lands, not two.

## Expect the numbers to get worse

Cost per booking roughly doubles on paper once this is right, from about $20 to
about $37. That has been the real number all along.
