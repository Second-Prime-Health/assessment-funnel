/* Badmetryx quiz-event adapter. Loaded after badmouth.js. */
(function () {
  'use strict';

  var ACCOUNT_ID = 'second-prime';
  var QUIZ_ID = 'assessment-v1';
  var startedAt = Date.now();
  var pending = [];

  function tracker() { return window.badmetryx || window.bm; }

  function flush() {
    var client = tracker();
    if (!client) return;
    while (pending.length) {
      var event = pending.shift();
      client.track(event.type, event.props);
    }
  }

  function emit(eventType, props) {
    var payload = Object.assign({
      account: ACCOUNT_ID,
      quiz_id: QUIZ_ID
    }, props || {});
    var client = tracker();
    if (!client) {
      pending.push({ type: eventType, props: payload });
      window.setTimeout(flush, 0);
      return;
    }
    client.track(eventType, payload);
  }

  function normalizeContact(value, kind) {
    var normalized = String(value || '').trim();
    return kind === 'email'
      ? normalized.toLowerCase()
      : normalized.replace(/[^\d+]/g, '');
  }

  function sha256(value, kind) {
    var normalized = normalizeContact(value, kind);
    if (!normalized) return Promise.resolve(null);
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('SubtleCrypto unavailable'));
    }
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
      .then(function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      });
  }

  window.quizTrack = {
    started: function () {
      startedAt = Date.now();
      emit('quiz.started', {});
    },
    stepViewed: function (step, questionKey) {
      emit('quiz.step_viewed', { step: step, question_key: questionKey });
    },
    stepAnswered: function (step, questionKey, answerValue, timeMs) {
      emit('quiz.step_answered', {
        step: step,
        question_key: questionKey,
        answer_value: answerValue,
        time_on_step_ms: timeMs
      });
    },
    signup: function (emailHash, phoneHash) {
      emit('quiz.signup', { email_hash: emailHash, phone_hash: phoneHash });
    },
    completed: function (durationMs) {
      emit('quiz.completed', { duration_ms: durationMs });
    },
    hashEmail: function (email) { return sha256(email, 'email'); },
    hashPhone: function (phone) { return sha256(phone, 'phone'); },
    elapsedMs: function () { return Date.now() - startedAt; }
  };
  window.addEventListener('load', flush);
})();
