// POST /api/book  { name, email, phone, slot, tier, timezone? }
// Upserts the contact, then books the appointment on the GHL calendar.
// `tier` picks the calendar: core = 15-minute call, lower = 30-minute lower-tier
// call. Same server-side mapping as /api/slots.
const CALENDARS = {
  core: process.env.GHL_CALENDAR_ID || 'q2ivh7vI9bOR6uWq5rxb',
  lower: process.env.GHL_CALENDAR_ID_LOWER || '85vCxdmO6uvmsJmx97Rp',
};

// The booker's IANA timezone: what the page detected, else Vercel's edge geo
// header. Validated so junk never reaches the CRM. Without this the contact is
// stored with timezone null and GHL falls back to the account default (Eastern),
// which sends every reminder at the wrong local time. Same fix as 5257bc5 on
// secondprime.io; this funnel is a separate codebase and reintroduced it.
function resolveTimezone(req, body) {
  const candidate = String(body?.timezone || req.headers['x-vercel-ip-timezone'] || '').trim();
  if (!candidate) return '';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch (_) {
    return '';
  }
}

// Contacts keep a hand-set timezone: we only ever fill an empty one.
async function existingTimezone({ email, apiKey, locationId }) {
  try {
    const params = new URLSearchParams({ locationId, email });
    const r = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', Accept: 'application/json' } }
    );
    if (!r.ok) return 'unknown';
    const d = await r.json();
    return d?.contact?.timezone || '';
  } catch (_) {
    return 'unknown';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, phone, slot, tier } = req.body || {};
  if (!name || !email || !phone || !slot) {
    return res.status(400).json({ error: 'name, email, phone, and slot are required' });
  }

  const isLower = tier === 'lower';
  const apiKey = process.env.GHL_API_KEY;
  const calendarId = CALENDARS[isLower ? 'lower' : 'core'];
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !calendarId || !locationId) {
    return res.status(500).json({ error: 'Booking not configured' });
  }

  const parts = String(name).trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  try {
    // Only send a timezone when the contact has none. 'unknown' means the lookup
    // failed, so we leave the field alone rather than risk clobbering a manual fix.
    const detectedTz = resolveTimezone(req, req.body);
    const priorTz = detectedTz ? await existingTimezone({ email, apiKey, locationId }) : 'unknown';
    const tzField = detectedTz && priorTz === '' ? { timezone: detectedTz } : {};

    // Upsert contact (dedupes on email/phone within the location).
    const cRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        locationId,
        firstName,
        lastName,
        email,
        phone,
        ...tzField,
        /* `assessment-funnel-booking` is a one-shot flag, not a label. The GHL
           booking workflow triggers on it, fires the analytics webhook, then
           removes it as its last action. The calendars are shared with other
           funnels, so this tag is the only thing that says "this booking came
           from here." Applied on the upsert, which completes before the
           appointment is created, so the tag exists when the trigger fires. */
        tags: isLower
          ? ['consult-booked', 'lower-tier', 'assessment-funnel-booking']
          : ['consult-booked', 'assessment-funnel-booking'],
        source: 'Website Calendar Booking',
      }),
    });
    const cData = await cRes.json();
    const contactId = cData?.contact?.id;

    // Create the appointment.
    const aRes = await fetch('https://services.leadconnectorhq.com/calendars/events/appointments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-04-15',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        calendarId,
        locationId,
        contactId,
        startTime: slot,
        title: `${isLower ? 'Strategy Call' : 'Consult'} - ${name}`,
        appointmentStatus: 'confirmed',
        toNotify: true,
      }),
    });
    const aData = await aRes.json();

    if (!aRes.ok) {
      console.error('booking failed', aRes.status, aData);
      return res.status(aRes.status).json({ error: 'Booking failed', details: aData });
    }

    /* Analytics: record the booking server-side (source 'native'). Dormant
       until SUPABASE_URL + SUPABASE_SERVICE_KEY are set in the host env; the
       GHL appointment-created webhook (ghl-hook) counts bookings either way
       and dedupes on email + slot, so this is belt-and-suspenders. */
    try {
      const sbUrl = process.env.SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_KEY;
      if (sbUrl && sbKey) {
        await fetch(`${sbUrl}/rest/v1/bookings`, {
          method: 'POST',
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: isLower ? 'lower' : 'core',
            slot_time: slot,
            source: 'native',
            contact_email: String(email).toLowerCase(),
          }),
        });
      }
    } catch (_) { /* analytics must never break a booking */ }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('book error', err);
    return res.status(502).json({ error: 'Booking failed' });
  }
}
