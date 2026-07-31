/* Second Prime funnel experiments. ONE active experiment at a time.
   Assignment is random, weighted, and sticky per browser (localStorage).
   The assigned variant name rides on every tracking event (see track.js) and
   is applied as a body class `sp-variant-<name>` for copy/style swaps.

   To launch a test: set active:true, define variants + weights, deploy, and
   bump the id (a new id reassigns everyone). Keep 'control' as the first
   variant. See TRACKING.md before touching this file. */
(function () {
  var EXPERIMENT = {
    id: 'baseline',          // change this to start a fresh assignment
    active: false,           // false = everyone is 'control'
    variants: [
      { name: 'control', weight: 1 }
    ]
  };

  var KEY = 'sp_variant';
  var assigned = null;
  try {
    var stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && stored.exp === EXPERIMENT.id) assigned = stored.name;
  } catch (_) {}

  if (!assigned) {
    if (!EXPERIMENT.active) {
      assigned = 'control';
    } else {
      var total = 0, i;
      for (i = 0; i < EXPERIMENT.variants.length; i++) total += EXPERIMENT.variants[i].weight;
      var roll = Math.random() * total;
      for (i = 0; i < EXPERIMENT.variants.length; i++) {
        roll -= EXPERIMENT.variants[i].weight;
        if (roll <= 0) { assigned = EXPERIMENT.variants[i].name; break; }
      }
      assigned = assigned || 'control';
    }
    try { localStorage.setItem(KEY, JSON.stringify({ exp: EXPERIMENT.id, name: assigned })); } catch (_) {}
  }

  window.spVariant = assigned;
  document.addEventListener('DOMContentLoaded', function () {
    document.body.className += ' sp-variant-' + assigned;
  });
})();
