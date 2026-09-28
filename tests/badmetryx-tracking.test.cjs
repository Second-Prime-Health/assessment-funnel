const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'assessment.html'), 'utf8');
const tierBody = html.match(/function assessmentTier\(\) \{([\s\S]*?)\n      \}/)[1];
const secondPrime = html.includes('data-flow-id="assessment-v1"');
function tier(values) {
  return vm.runInNewContext('(function(){' + tierBody + '})()', {
    picked: (name) => values[name] || '',
    isOwner: () => values.role === 'I own or co-own a business',
    belowThreshold: () => values.role === 'I own or co-own a business'
      ? values.businessRevenue === '$0 - $500K' : (!secondPrime && values.annualIncome === '$0 - $149K'),
    incomeDQ: () => secondPrime && !!values.role && values.role !== 'I own or co-own a business'
      && values.annualIncome === '$0 - $149K',
  });
}
test('qualification preserves both branches and never qualifies an incomplete gate', () => {
  assert.equal(tier({}), '');
  assert.equal(tier({ role: 'Employee' }), '');
  assert.equal(tier({ role: 'Employee', annualIncome: '$150K - $249K' }), 'core');
  if (secondPrime) {
    assert.equal(tier({ role: 'Employee', annualIncome: '$0 - $149K' }), 'dq');
    assert.equal(tier({ role: 'Employee', annualIncome: '$0 - $149K', investReady: 'Yes' }), 'dq');
    assert.equal(tier({ role: 'I own or co-own a business', businessRevenue: '$0 - $500K', investReady: 'No' }), 'dq');
  } else {
    assert.equal(tier({ role: 'Employee', annualIncome: '$0 - $149K' }), '');
    assert.equal(tier({ role: 'Employee', annualIncome: '$0 - $149K', investReady: 'No, not right now' }), 'dq');
    assert.equal(tier({ role: 'Employee', annualIncome: '$0 - $149K', investReady: 'Yes - $10K+' }), 'core');
  }
  assert.equal(tier({ role: 'I own or co-own a business', businessRevenue: '$501K - $1M' }), 'core');
  assert.equal(tier({ role: 'I own or co-own a business', businessRevenue: '$0 - $500K', investReady: secondPrime ? 'Yes' : 'Yes - $10K+' }), 'core');
  if (!secondPrime) assert.equal(tier({ role: 'Employee', annualIncome: '$0 - $149K', investReady: '$2,500 - $10K' }), 'lower');
});
test('every funnel page loads the bridge before the event producer', () => {
  for (const page of ['index','assessment','booking','results','thank-you']) {
    const text = readFileSync(join(root, page + '.html'), 'utf8');
    assert.ok(text.indexOf('t.badmetryx.com/assessment-v1.js') > 0);
    assert.ok(text.indexOf('t.badmetryx.com/assessment-v1.js') < text.indexOf('js/track.js?v=5'));
    for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (match[1].trim() && !match[0].includes('application/ld+json')) new vm.Script(match[1]);
    }
  }
});
test('booking detail is emitted only after the API confirms success', () => {
  const text = readFileSync(join(root, 'booking.html'), 'utf8');
  assert.match(text, /if \(res.ok && data.success\) \{\s*if \(window.bmAssessment\) window.bmAssessment\('booking_created'/);
});
test('the original collector stays disabled for Provaeon', () => {
  const text = readFileSync(join(root, 'js/track.js'), 'utf8');
  assert.match(text, /window.bmAssessment\(event, props\)/);
  if (!secondPrime) assert.match(text, /var ENDPOINT = ''/);
});
