// POST /api/lead  { name, email, phone, tier, businessOwner, businessRevenue, annualIncome, timezone? }
//
// Runs at assessment submit, alongside the GHL inbound webhook (which creates the
// contact and sends the qualified / not-a-fit email). This endpoint owns the two
// things that webhook cannot do:
//
//   1. Band tags. The ScoreApp cellular assessment tagged leads `biz-*` / `* income`
//      and the CHA workflows branch on those. This funnel replaces ScoreApp but must
//      NOT write those tags, or assessment leads get pulled into ScoreApp automation.
//      So it writes its own `assess-*` namespace. Spec:
//      clients/second-prime/context/assessment-tagging-spec.md
//   2. Timezone. The inbound webhook carries none, so contacts created by the workflow
//      store timezone null and GHL falls back to the account default (Eastern), which
//      drives every reminder send window. `api/book.js` fixes this at booking, but most
//      leads do not book on the first visit and every disqualified lead never books at
//      all, which is exactly who the follow-up sequence targets.
//
// Deliberately fire-and-forget from the page: a failure here must never block or slow
// the redirect to booking. Worst case the contact lacks tags, which is recoverable.

// Option values carry en dashes ("$0 – $500K"). assessment.html normalises the same way
// in normDash() before its qualification gate, so keep these two in step.
const normDash = (s) => String(s || '').replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim();

const REVENUE_TAGS = {
  '$0 - $500K': 'assess-biz-very low',
  '$500K - $1M': 'assess-biz-low',
  '$1M - $3M': 'assess-biz-medium',
  '$3M - $10M': 'assess-biz-high',
  '$10M - $25M': 'assess-biz-whale',
  '$25M+': 'assess-biz-ultrawhale',
};

const INCOME_TAGS = {
  '$0 - $149K': 'assess-low income',
  '$150K - $299K': 'assess-medium income',
  '$300K+': 'assess-high income',
};

const TIER_TAGS = { core: 'assess-qualified', lower: 'assess-lower-tier', dq: 'assess-dq' };

// Exported so the band mapping can be unit-tested without a live GHL call.
export function tagsFor({ businessOwner, businessRevenue, annualIncome, tier }) {
  const tags = [];
  const isOwner = businessOwner === true || String(businessOwner).toLowerCase() === 'yes';
  const band = isOwner ? REVENUE_TAGS[normDash(businessRevenue)] : INCOME_TAGS[normDash(annualIncome)];
  if (band) tags.push(band);
  const tierTag = TIER_TAGS[tier];
  if (tierTag) tags.push(tierTag);
  return tags;
}

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
// Returns { found, id, timezone }. timezone '' means empty, 'unknown' means the lookup
// itself failed, in which case we leave the field alone rather than risk clobbering.
async function lookupContact({ email, apiKey, locationId }) {
  try {
    const params = new URLSearchParams({ locationId, email });
    const r = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', Accept: 'application/json' } }
    );
    if (!r.ok) return { found: false, id: null, timezone: 'unknown' };
    const d = await r.json();
    const c = d?.contact;
    return { found: !!c, id: c?.id || null, timezone: c?.timezone || '' };
  } catch (_) {
    return { found: false, id: null, timezone: 'unknown' };
  }
}

/* Tags go through the dedicated endpoint, which APPENDS. Passing `tags` to
   /contacts/upsert REPLACES the whole array instead: verified live 2026-07-31, a second
   submit wiped the first submit's tags. On a returning contact that would also destroy
   whatever else is on the record (consult-booked, ScoreApp tags, sales tags). */
async function addTags({ contactId, tags, apiKey }) {
  const r = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ tags }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, phone } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return res.status(500).json({ error: 'Not configured' });

  const tags = tagsFor(req.body);
  const detectedTz = resolveTimezone(req, req.body);
  const prior = await lookupContact({ email, apiKey, locationId });
  const tzField = detectedTz && prior.timezone === '' ? { timezone: detectedTz } : {};

  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const nameFields = parts.length
    ? { firstName: parts[0], lastName: parts.slice(1).join(' ') || '' }
    : {};

  try {
    /* Upsert WITHOUT tags: it dedupes on email so it is safe to run after the inbound
       webhook has already created the contact, but its `tags` argument replaces rather
       than appends, so tags are applied separately below. */
    const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        locationId,
        email,
        ...(phone ? { phone } : {}),
        ...nameFields,
        ...tzField,
      }),
    });
    if (!r.ok) {
      const details = await r.json().catch(() => ({}));
      console.error('lead upsert failed', r.status, details);
      return res.status(r.status).json({ error: 'Lead sync failed', details });
    }
    const upserted = await r.json().catch(() => ({}));
    const contactId = upserted?.contact?.id || prior.id;

    let tagged = false;
    if (tags.length && contactId) tagged = await addTags({ contactId, tags, apiKey });

    return res.status(200).json({
      success: true,
      tags: tagged ? tags : [],
      tagged,
      timezone: tzField.timezone || null,
    });
  } catch (err) {
    console.error('lead error', err);
    return res.status(502).json({ error: 'Lead sync failed' });
  }
}
