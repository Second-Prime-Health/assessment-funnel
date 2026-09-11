// Slack notifications for Jeff and Andrew's shared channel: one post per finished
// assessment, one per booked call. Underscore prefix keeps Vercel from routing it.
//
// Dormant until SLACK_WEBHOOK_URL (a Slack Incoming Webhook) is set in the host env.
// Never throws and gives up after 4s: a Slack outage must never break a submit or a booking.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();

const stamp = () =>
  new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'medium' }) + ' ET';

function contactLines({ name, email, phone }) {
  return [`*Name:* ${esc(name) || '-'}`, `*Email:* ${esc(email) || '-'}`, `*Phone:* ${esc(phone) || '-'}`];
}

const TIER_LABEL = { core: 'Qualified', lower: 'Qualified, lower tier', dq: 'Not a fit' };

// answers: [[label, value], ...] built by assessment.html. Anything else is ignored.
export function assessmentMessage({ name, email, phone, tier, score, answers }) {
  const rows = (Array.isArray(answers) ? answers : [])
    .filter((a) => Array.isArray(a) && a[1] != null && String(a[1]).trim() !== '')
    .slice(0, 40)
    .map(([label, value]) => `• ${esc(label)}: ${esc(value)}`);
  const next = tier === 'dq'
    ? 'Not a fit. This person is being shown their results page.'
    : 'This person is being directed to booking.';
  return [
    ':clipboard: *New Executive Assessment Completed*',
    ...contactLines({ name, email, phone }),
    '',
    `*Result:* ${TIER_LABEL[tier] || 'Unknown'}${score != null && score !== '' ? ` | Second Prime Score ${esc(score)}` : ''}`,
    ...(rows.length ? ['', '*Assessment Answers:*', ...rows] : []),
    '',
    `*Submitted:* ${stamp()}`,
    `_${next}_`,
  ].join('\n');
}

export function bookingMessage({ name, email, phone, slot, tier, timezone }) {
  const t = new Date(slot);
  const fmt = (tz) => t.toLocaleString('en-US', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
  let when = esc(slot);
  if (!isNaN(t)) {
    when = fmt('America/New_York');
    if (timezone && timezone !== 'America/New_York') {
      try { when += ` (their time: ${fmt(timezone)})`; } catch (_) { /* bad tz: ET only */ }
    }
  }
  return [
    ':calendar: *New Consultation Booked*',
    ...contactLines({ name, email, phone }),
    `*Slot:* ${when}`,
    `*Call:* ${tier === 'lower' ? 'Lower-tier strategy call' : 'Consult'}`,
    '',
    `*Booked at:* ${stamp()}`,
  ].join('\n');
}

export async function postToSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || !text) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) console.error('slack non-2xx', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (err) {
    console.error('slack post failed', err?.message || err);
    return false;
  }
}
