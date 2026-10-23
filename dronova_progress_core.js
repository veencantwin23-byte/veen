(function(){
  "use strict";

  var LEARN_KEY = 'dronova_progress_v1';

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {}
    return fallback;
  }

  function computeSnapshot() {
    var learn = readJSON(LEARN_KEY, { completed: {}, exploredComponents: [] });
    var modules = (window.DRONOVA_MODULES && window.DRONOVA_MODULES.modules) || [];
    return {
      overallPct: 0,
      learning: {
        modules: modules.map(function(module){
          return { id: module.id, title: module.title, icon: '📘', pct: 0, complete: !!learn.completed[module.id] };
        }),
        completedCount: 0,
        totalModules: modules.length,
        exploredComponents: (learn.exploredComponents || []).length,
        totalComponents: (window.DRONOVA_COMPONENTS || []).length
      },
      quiz: { attemptsCount: 0, categoriesAttempted: 0, totalCategories: 0, bestOverall: 0, avgScore: 0 },
      simulator: { challengesCompleted: 0, totalChallenges: 0, learningModeComplete: false }
    };
  }

  window.DronovaProgress = {
    getSnapshot: computeSnapshot,
    getAchievements: function(){ return []; },
    getRecommendations: function(){ return []; },
    refreshUI: function(){},
    checkAndNotify: function(){},
    resetAll: function(){}
  };
})();
