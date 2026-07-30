#!/usr/bin/env python3
"""Build a contact sheet of every possible intake card, dynamic variants included.

Reads the real assessment.html so the markup and styles always match what ships,
then fills each interstitial's placeholders with every variant the JS can produce.
"""
import re, html, pathlib

SRC = pathlib.Path.home() / 'SecondPrimeSite/assessment-funnel'
OUT = pathlib.Path('/private/tmp/claude-501/-Users-andrewmartin45-Documents-Claude-Projects-Second-Prime-Ai-OS/6bc5dac9-055f-42da-bbfe-feb9aaa75bbd/scratchpad/slides-preview.html')

src = (SRC / 'assessment.html').read_text()
inline_style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
steps = dict()
for q, kind, body in re.findall(
        r'<section class="qstep[^"]*" data-q="([^"]+)" data-kind="([^"]+)">(.*?)</section>', src, re.S):
    steps[q] = (kind, body)

def fill(body, repl):
    """Replace the inner text of elements by id, and set img src where given."""
    out = body
    for el_id, value in repl.items():
        if el_id.endswith('@src'):
            real = el_id[:-4]
            out = re.sub(r'(id="%s"[^>]*?)src="[^"]*"' % real, r'\1src="%s"' % value, out)
            out = out.replace('style="display:none"', '')
            continue
        # element with this id: swap inner HTML
        pat = re.compile(r'(<[^>]*id="%s"[^>]*>)(.*?)(</[a-zA-Z0-9]+>)' % re.escape(el_id), re.S)
        out = pat.sub(lambda m: m.group(1) + value + m.group(3), out, count=1)
    return out

def stat(num, label):
    return {'int2Stat': '<b>%s</b><span>%s</span>' % (num, label)}

# ---- interstitial variants, mirroring the JS in assessment.html ----
AVG = 'The average client loses <b>26 lbs</b> and reports <b>64% more energy</b> within 3 months.'

INT1 = [
    ('INT-1A', 'Shown when they pick: I own or co-own a business', {
        'int1Tag': 'Built for owners',
        'int1H': 'You carry the company. Your biology carries you.',
        'int1P': 'We&rsquo;ve helped 500+ founders like you get their energy, drive, and body back by optimizing their biology.',
        'int1Stat': AVG}),
    ('INT-1B', 'Shown when they pick: Executive or senior leader', {
        'int1Tag': 'Built for operators',
        'int1H': 'High output has a biological price. We measure it.',
        'int1P': 'We&rsquo;ve helped 500+ executives like you get their energy, drive, and body back by optimizing their biology.',
        'int1Stat': AVG}),
    ('INT-1C', 'Shown when they pick: Other', {
        'int1Tag': 'Built for high performers',
        'int1H': 'Output has a biological price. We measure it.',
        'int1P': 'We&rsquo;ve helped 500+ high performers get their energy, drive, and body back by optimizing their biology.',
        'int1Stat': AVG}),
]

INT2 = [
    ('INT-2A', 'Shown when DRIVE is their worst performance answer', {
        'int2Tag': 'The math on what you just said',
        'int2H': 'Testosterone falls about 1% a year from your mid-30s.',
        'int2P': 'Slow enough to adapt to. Fast enough that a quarter of your drive is gone by 50.',
        'int2Stat': '<b>+40%</b><span>average free testosterone increase across client retests</span>',
        'int2Q': '&ldquo;My testosterone doubled. I&rsquo;m performing at a level I haven&rsquo;t seen since my 30s.&rdquo;',
        'int2QW': 'J.M.', 'int2QS': 'Founder &amp; CEO, Real Estate &middot; Age 47'}),
    ('INT-2B', 'Shown when ENERGY or FOCUS is worst', {
        'int2Tag': 'A pattern we test for',
        'int2H': 'The 3pm crash has a chemistry.',
        'int2P': 'Coffee at 11, 1, and 3. That pattern is usually blood sugar or cortisol. Both measurable.',
        'int2Stat': '<b>+64%</b><span>more energy reported by clients within 3 months</span>',
        'int2Q': '&ldquo;The brain fog I thought was just &lsquo;getting older&rsquo; is completely gone. I&rsquo;m present with my kids in a way I wasn&rsquo;t before.&rdquo;',
        'int2QW': 'Rob', 'int2QS': 'Aerospace Engineering Manager &middot; Age 46',
        'int2QImg@src': 'assets/cases/rob-head.jpg'}),
    ('INT-2C', 'Shown when SLEEP is worst (same variant, different headline)', {
        'int2Tag': 'A pattern we test for',
        'int2H': 'Tired after a full night in bed means the sleep itself is broken.',
        'int2P': 'Coffee at 11, 1, and 3. That pattern is usually blood sugar or cortisol. Both measurable.',
        'int2Stat': '<b>+64%</b><span>more energy reported by clients within 3 months</span>',
        'int2Q': '&ldquo;The brain fog I thought was just &lsquo;getting older&rsquo; is completely gone. I&rsquo;m present with my kids in a way I wasn&rsquo;t before.&rdquo;',
        'int2QW': 'Rob', 'int2QS': 'Aerospace Engineering Manager &middot; Age 46',
        'int2QImg@src': 'assets/cases/rob-head.jpg'}),
    ('INT-2D', 'Shown when ALL performance answers are strong', {
        'int2Tag': 'Strong so far',
        'int2H': 'You&rsquo;re holding the line better than most owners we test.',
        'int2P': 'Most founders we test feel fine and still carry findings worth acting on.',
        'int2Stat': '<b>-12 yrs</b><span>average biological age reduction across client retests</span>',
        'int2Q': '&ldquo;I came in skeptical. I&rsquo;d done bloodwork a dozen times. Andrew found things in week one nobody had flagged.&rdquo;',
        'int2QW': 'R.S.', 'int2QS': 'Founder, Tech &middot; Age 44'}),
]

AHA = '<b>50%</b><span>of heart attack patients had &ldquo;normal&rdquo; cholesterol &middot; American Heart Journal, 2009</span>'
INT3 = [
    ('INT-3A', 'Shown when they select ANY family disease', {
        'int3Tag': 'About your family history',
        'int3H': 'Family history is the strongest reason to look early.', 'int3Stat': AHA}),
    ('INT-3B', 'Shown when family is clean but testing is shallow', {
        'int3Tag': 'About your last physical',
        'int3H': 'A standard physical checks a few dozen markers. We measure 1,000+.', 'int3Stat': AHA}),
    ('INT-3C', 'Shown when they already test deep and have clean family history', {
        'int3Tag': 'You test deeper than most',
        'int3H': 'The data is only half. The read is the other half.', 'int3Stat': AHA}),
]

HOLES = {
    'doctor': ('Your doctor', 'About 40 markers, graded against &ldquo;normal,&rdquo; 8 minutes per visit. Optimizing you was never the assignment.'),
    'trt': ('The TRT clinic', 'Ran just enough labs to prescribe, and never chased why your testosterone fell in the first place.'),
    'func': ('The functional doc', 'Ran real labs, handed you a bag of supplements, and hoped. The follow-through was your job.'),
    'coach': ('The coaches', 'Programmed effort without ever seeing your blood. You can&rsquo;t out-train a hormone or insulin problem.'),
    'self': ('Doing it yourself', 'The wearable put you in the driver&rsquo;s seat. Synthesizing it into a protocol became a second job you don&rsquo;t have time for.'),
}
def holes_html(keys):
    return ''.join('<div class="as-hole"><b>%s</b><p>%s</p></div>' % HOLES[k] for k in keys)

INT5 = [
    ('INT-5A', 'Example: they selected TRT clinic + functional med + self-directed', {
        'int5tTag': 'About what you&rsquo;ve tried',
        'int5tH': 'Here&rsquo;s why none of it stuck.',
        'int5tList': holes_html(['trt', 'func', 'self']),
        'int5tP': 'Each was one piece. Nobody owned the whole. That&rsquo;s our job.'}),
    ('INT-5B', 'Example: they selected doctor + coaches only', {
        'int5tTag': 'About what you&rsquo;ve tried',
        'int5tH': 'Here&rsquo;s why none of it stuck.',
        'int5tList': holes_html(['doctor', 'coach']),
        'int5tP': 'Each was one piece. Nobody owned the whole. That&rsquo;s our job.'}),
    ('INT-5C', 'Shown when they pick: Nothing serious yet', {
        'int5tTag': 'A head start',
        'int5tH': 'You get to skip the expensive detours.',
        'int5tList': '',
        'int5tP': 'Most arrive after years of clinics that never connected. The full picture is cheaper up front.'}),
]

# ---- assemble the gallery ----
cards = []
def add(label, note, body):
    cards.append((label, note, body))

QLABEL = {
    'outcome': ('Q1', 'Always shown, first question'),
    'age': ('Q2', 'Always shown'),
    'role': ('Q3', 'Always shown; decides the money question later'),
    'energy': ('Q4', 'Always shown'),
    'focus': ('Q5', 'Always shown'),
    'sleep': ('Q6', 'Always shown'),
    'drive': ('Q7', 'Always shown'),
    'bodycomp': ('Q8', 'Always shown'),
    'family': ('Q9', 'Always shown'),
    'labs': ('Q10', 'Always shown'),
    'trigger': ('Q11', 'Always shown'),
    'tried': ('Q12', 'Always shown'),
    'revenue': ('Q13-A', 'Shown only to business owners'),
    'income': ('Q13-B', 'Shown to executives and everyone else'),
    'invest': ('Q13-C', 'CONDITIONAL: only if owner under $500K revenue or non-owner under $149K income. $10K+ = 15-min call · $2,500-$10K = 30-min lower-tier call · No = soft pass'),
    'timeline': ('Q14', 'Always shown'),
    'contact': ('CONTACT', 'Always shown, last screen before routing'),
}

ORDER = ['outcome', 'age', 'role', 'INT1', 'energy', 'focus', 'sleep', 'drive', 'INT2',
         'bodycomp', 'family', 'labs', 'INT3', 'trigger', 'tried', 'INT5',
         'revenue', 'income', 'invest', 'timeline', 'contact']

for key in ORDER:
    if key == 'INT1':
        for lbl, note, repl in INT1: add(lbl, note, fill(steps['int1'][1], repl))
    elif key == 'INT2':
        for lbl, note, repl in INT2: add(lbl, note, fill(steps['int2'][1], repl))
    elif key == 'INT3':
        for lbl, note, repl in INT3: add(lbl, note, fill(steps['int3'][1], repl))
    elif key == 'INT5':
        for lbl, note, repl in INT5: add(lbl, note, fill(steps['int5t'][1], repl))
    else:
        lbl, note = QLABEL[key]
        add(lbl, note, steps[key][1])

# calculating screen
calc = ('CALC', 'Shown for ~3 seconds after they submit, then routes',
        '<div class="as-calc" style="display:block"><div class="as-calc-ring"></div>'
        '<h2>Logging your intake&hellip;</h2><p>Reading your background</p></div>')
cards.append(calc)

body_html = []
for lbl, note, body in cards:
    body_html.append(
        '<figure class="slide">'
        '<figcaption><b>%s</b><span>%s</span></figcaption>'
        '<div class="ap-card"><div class="ap-shell"><div class="qstep on">%s</div></div></div>'
        '</figure>' % (lbl, note, body))

page = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Second Prime Intake · Every Card</title>
<link rel="stylesheet" href="css/styles.css" />
<link rel="stylesheet" href="css/funnel.css" />
<link rel="stylesheet" href="css/assess.css" />
<style>%s
  @page { size: 13in 19in; margin: 0.4in; }
  body { background: #F7F4F0; padding: 26px 30px 40px; }
  .sheet-head { text-align: center; margin-bottom: 26px; }
  .sheet-head h1 { font-family: var(--font-serif); font-weight: 400; font-size: 34px; }
  .sheet-head p { font-size: 14px; color: var(--gray); margin-top: 6px; }
  .grid { display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-start; justify-content: center; }
  .slide { width: 370px; break-inside: avoid; page-break-inside: avoid; }
  .slide figcaption { margin-bottom: 8px; }
  .slide figcaption b { display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: #fff; background: #14323A; border-radius: 6px; padding: 4px 10px; }
  .slide figcaption span { display: block; font-size: 12px; color: var(--gray); margin-top: 5px; line-height: 1.4; }
  .slide .ap-card { max-width: none; padding: 0; }
  .slide .ap-shell { padding: 24px 24px 26px; }
  .slide .qnav, .slide .qkeys { pointer-events: none; }
  .slide .qstep { display: block !important; animation: none !important; }
  .slide .opt { animation: none !important; opacity: 1 !important; }
  .as-mobcta { display: none !important; }
</style></head><body>
<div class="sheet-head">
  <h1>The Second Prime intake &middot; every card that can appear</h1>
  <p>%d cards total, dynamic variants included. Reference a card by its label when sending feedback.</p>
</div>
<div class="grid">%s</div>
</body></html>""" % (inline_style, len(cards), ''.join(body_html))

OUT.write_text(page)
# copy next to the real CSS so relative paths resolve
(SRC / '_slides-preview.html').write_text(page)
print('cards:', len(cards))
print('written:', SRC / '_slides-preview.html')
