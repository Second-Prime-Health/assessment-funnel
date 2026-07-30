// POST /api/book  { name, email, phone, slot, tier }
// Upserts the contact, then books the appointment on the GHL calendar.
// `tier` picks the calendar: core = 15-minute call, lower = 30-minute lower-tier
// call. Same server-side mapping as /api/slots.
const CALENDARS = {
  core: process.env.GHL_CALENDAR_ID || 'q2ivh7vI9bOR6uWq5rxb',
  lower: process.env.GHL_CALENDAR_ID_LOWER || '85vCxdmO6uvmsJmx97Rp',
};

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
        tags: isLower ? ['consult-booked', 'lower-tier'] : ['consult-booked'],
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
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('book error', err);
    return res.status(502).json({ error: 'Booking failed' });
  }
}
