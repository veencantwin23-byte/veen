(function(){
  "use strict";

  var QUIZ_KEY = 'dronova_quiz_results_v1';

  function loadResults() {
    try {
      var raw = localStorage.getItem(QUIZ_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {}
    return { attempts: [], bestByCategory: {} };
  }

  function saveResults(data) {
    try { localStorage.setItem(QUIZ_KEY, JSON.stringify(data)); } catch (e) {}
  }

  var results = loadResults();

  function recordAttempt(catId, score, total) {
    var pct = total > 0 ? Math.round((score / total) * 100) : 0;
    results.attempts.push({ category: catId, score: score, total: total, pct: pct });
    if (!results.bestByCategory[catId] || pct > results.bestByCategory[catId]) {
      results.bestByCategory[catId] = pct;
    }
    saveResults(results);
  }

  window.dronovaStartQuiz = function(catId) {
    console.log('Start quiz for', catId);
    recordAttempt(catId, 4, 5);
  };
})();
