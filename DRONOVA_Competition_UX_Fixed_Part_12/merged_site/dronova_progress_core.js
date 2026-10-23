/* ============================================================
   DRONOVA — CENTRALIZED PROGRESS ENGINE
   Loaded on BOTH index.html and simulator/simulator.html so
   there is exactly one place progress/XP/achievements are
   calculated, no matter which page the user is on.

   Reads three existing, independently-owned data stores:
   - dronova_progress_v1        (Learning System   — dronova_learn.js writes this)
   - dronova_quiz_results_v1    (Quiz System        — dronova_quiz.js writes this)
   - dronova_sim_progress_v1    (Simulator          — simulator.js writes this)
   and owns one additional store of its own:
   - dronova_achievements_v1    (unlocked achievements + earned dates)

   This file does NOT rewrite or duplicate how those systems
   track completion — it only reads their existing data and
   derives percentages/XP/achievements from it in one place.
============================================================ */
(function(){
"use strict";

var LEARN_KEY = 'dronova_progress_v1';
var QUIZ_KEY = 'dronova_quiz_results_v1';
var SIM_KEY = 'dronova_sim_progress_v1';
var ACH_KEY = 'dronova_achievements_v1';

/* These small id lists mirror the existing systems' own definitions
   (dronova_learn.js FLOW, quiz_categories.json, simulator.js CHALLENGES).
   They're duplicated here only because this file must also run
   standalone on simulator.html, a separate page where those other
   files aren't loaded — the lists themselves are the only thing
   duplicated, never the calculation logic. */
var LEARN_MODULES = [
  { id:'intro', title:'Introduction', icon:'🚀' },
  { id:'types', title:'Types of Drones', icon:'🧭' },
  { id:'anatomy', title:'Drone Components', icon:'🛠️', isComponents:true },
  { id:'architecture', title:'System Architecture', icon:'🧩' },
  { id:'mechanics', title:'How a Drone Flies', icon:'✈️' },
  { id:'applications', title:'Applications', icon:'🌍' }
];
var TOTAL_COMPONENTS = (window.DRONOVA_COMPONENTS && window.DRONOVA_COMPONENTS.length) || 27;
var QUIZ_CATEGORIES = [
  { id:'fundamentals', title:'Drone Fundamentals' }, { id:'types', title:'Drone Types' },
  { id:'components', title:'Drone Components' }, { id:'systems', title:'Drone Systems' },
  { id:'flight', title:'Flight Principles' }, { id:'simulator', title:'Simulator Knowledge' }
];
var SIM_CHALLENGES = [
  { id:'takeoff', title:'Take Off' }, { id:'hover', title:'Hover' }, { id:'move', title:'Move Forward' },
  { id:'rotate', title:'Rotation' }, { id:'land', title:'Landing' }, { id:'combo', title:'Complete Flight' }
];

/* ---------- XP values — kept in one place, easy to tune ---------- */
var XP = {
  learningModule: 50,
  componentExplored: 4,     // per unique component, up to TOTAL_COMPONENTS
  quizCategoryCompleted: 30, // first completion of a category (not every retry)
  quizHighScoreBonus: 20,    // bonus if best score in a category is 90%+
  simChallenge: 40,
  simLearningMode: 60
};
/* ---------- Level thresholds — easy to tune ---------- */
var LEVELS = [
  { level:1, title:'Beginner', minXp:0 },
  { level:2, title:'Explorer', minXp:100 },
  { level:3, title:'Learner', minXp:250 },
  { level:4, title:'Trainee', minXp:450 },
  { level:5, title:'Drone Specialist', minXp:700 }
];

/* ---------- Achievement definitions ---------- */
var ACHIEVEMENTS = [
  { id:'first_step', title:'First Step', icon:'🥇', desc:'Complete your first learning module.',
    check: function(s){ return s.learning.completedCount >= 1; } },
  { id:'drone_explorer', title:'Drone Explorer', icon:'🔍', desc:'Explore at least 5 components in the 3D Drone Lab.',
    check: function(s){ return s.learning.exploredComponents >= 5; } },
  { id:'knowledge_check', title:'Knowledge Check', icon:'📝', desc:'Complete your first quiz.',
    check: function(s){ return s.quiz.attemptsCount >= 1; } },
  { id:'quiz_master', title:'Quiz Master', icon:'🏆', desc:'Achieve 90% or higher in a quiz.',
    check: function(s){ return s.quiz.bestOverall >= 90; } },
  { id:'flight_student', title:'Flight Student', icon:'🕹️', desc:'Complete your first simulator flight challenge.',
    check: function(s){ return s.simulator.challengesCompleted >= 1; } },
  { id:'flight_trainee', title:'Flight Trainee', icon:'✈️', desc:'Complete all 6 basic simulator flight missions.',
    check: function(s){ return s.simulator.challengesCompleted >= SIM_CHALLENGES.length; } },
  { id:'dronova_learner', title:'Dronova Learner', icon:'🎓', desc:'Complete all 6 core learning modules.',
    check: function(s){ return s.learning.completedCount >= LEARN_MODULES.length; } },
  { id:'dronova_expert', title:'Dronova Expert', icon:'👑', desc:'Complete every learning module, all simulator training, and at least one quiz in every category.',
    check: function(s){
      return s.learning.completedCount >= LEARN_MODULES.length &&
             s.simulator.challengesCompleted >= SIM_CHALLENGES.length &&
             s.simulator.learningModeComplete &&
             s.quiz.categoriesAttempted >= QUIZ_CATEGORIES.length;
    } }
];

/* ---------- Raw store readers (defensive — never throw) ---------- */
function readJSON(key, fallback){
  // Guards against valid-JSON-but-wrong-shape values (e.g. the literal
  // string "null" — truthy, but parses to the actual null value).
  try{ var raw = localStorage.getItem(key); if(raw){ var p = JSON.parse(raw); if(p && typeof p==='object') return p; } }catch(e){}
  return fallback;
}
function readLearn(){ return readJSON(LEARN_KEY, { completed:{}, exploredComponents:[] }); }
function readQuiz(){ return readJSON(QUIZ_KEY, { attempts:[], bestByCategory:{} }); }
function readSim(){ return readJSON(SIM_KEY, { challengesCompleted:[], learningModeComplete:false }); }
function readAchievements(){ return readJSON(ACH_KEY, {}); }
function saveAchievements(a){ try{ localStorage.setItem(ACH_KEY, JSON.stringify(a)); }catch(e){} }

/* ---------- Core calculation (the ONE place these numbers are derived) ---------- */
function computeSnapshot(){
  var learnRaw = readLearn(), quizRaw = readQuiz(), simRaw = readSim();

  var learnModules = LEARN_MODULES.map(function(m){
    var pct, complete;
    if(m.isComponents){
      var explored = learnRaw.exploredComponents.length;
      pct = Math.min(100, Math.round((explored/TOTAL_COMPONENTS)*100));
      complete = !!learnRaw.completed[m.id] || explored >= TOTAL_COMPONENTS;
      if(complete) pct = 100;
    } else {
      complete = !!learnRaw.completed[m.id];
      pct = complete ? 100 : 0;
    }
    return { id:m.id, title:m.title, icon:m.icon, pct:pct, complete:complete };
  });
  var learningCompletedCount = learnModules.filter(function(m){ return m.complete; }).length;

  var categoriesAttempted = Object.keys(quizRaw.bestByCategory).length;
  var bestScores = Object.keys(quizRaw.bestByCategory).map(function(k){ return quizRaw.bestByCategory[k]; });
  var bestOverall = bestScores.length ? Math.max.apply(null, bestScores) : 0;
  var totalQuestionsAnswered = 0, totalCorrect = 0, scoreSum = 0;
  quizRaw.attempts.forEach(function(a){ totalQuestionsAnswered += a.total; totalCorrect += a.score; scoreSum += a.pct; });
  var avgScore = quizRaw.attempts.length ? Math.round(scoreSum/quizRaw.attempts.length) : 0;
  var latestScore = quizRaw.attempts.length ? quizRaw.attempts[quizRaw.attempts.length-1].pct : null;
  var highScoreCategories = Object.keys(quizRaw.bestByCategory).filter(function(k){ return quizRaw.bestByCategory[k] >= 90; }).length;

  var simChallenges = SIM_CHALLENGES.map(function(c){
    return { id:c.id, title:c.title, complete: simRaw.challengesCompleted.indexOf(c.id) > -1 };
  });
  var simChallengesCompleted = simChallenges.filter(function(c){ return c.complete; }).length;

  var overallPct = Math.round(
    ( (learningCompletedCount/LEARN_MODULES.length) +
      (Math.min(categoriesAttempted, QUIZ_CATEGORIES.length)/QUIZ_CATEGORIES.length) +
      (simChallengesCompleted/SIM_CHALLENGES.length) ) / 3 * 100
  );

  var xp = (learningCompletedCount * XP.learningModule) +
           (Math.min(learnRaw.exploredComponents.length, TOTAL_COMPONENTS) * XP.componentExplored) +
           (categoriesAttempted * XP.quizCategoryCompleted) +
           (highScoreCategories * XP.quizHighScoreBonus) +
           (simChallengesCompleted * XP.simChallenge) +
           (simRaw.learningModeComplete ? XP.simLearningMode : 0) +
           (simRaw.rescueXP || 0); // Phase 9.4F: rescue XP is already computed (base + performance bonus, deduplicated) by the simulator itself before being stored, so it's added directly here rather than recomputed

  var levelInfo = LEVELS[0];
  for(var i=0;i<LEVELS.length;i++){ if(xp >= LEVELS[i].minXp) levelInfo = LEVELS[i]; }
  var nextLevel = LEVELS[LEVELS.indexOf(levelInfo)+1] || null;

  return {
    overallPct: overallPct,
    xp: xp, level: levelInfo, nextLevel: nextLevel,
    learning: {
      modules: learnModules, completedCount: learningCompletedCount, totalModules: LEARN_MODULES.length,
      exploredComponents: learnRaw.exploredComponents.length, totalComponents: TOTAL_COMPONENTS
    },
    quiz: {
      attemptsCount: quizRaw.attempts.length, categoriesAttempted: categoriesAttempted, totalCategories: QUIZ_CATEGORIES.length,
      bestOverall: bestOverall, avgScore: avgScore, latestScore: latestScore,
      totalQuestionsAnswered: totalQuestionsAnswered, totalCorrect: totalCorrect,
      bestByCategory: quizRaw.bestByCategory, categories: QUIZ_CATEGORIES
    },
    simulator: {
      challenges: simChallenges, challengesCompleted: simChallengesCompleted, totalChallenges: SIM_CHALLENGES.length,
      learningModeComplete: !!simRaw.learningModeComplete,
      // Phase 9.4F: read-only exposure of the rescue-mission fields the
      // simulator now persists to this SAME storage object — no new key,
      // no second progress system.
      rescueMissionsCompleted: (simRaw.rescueMissionsCompleted || []).length,
      rescueBestScore: simRaw.rescueBestScore || 0,
      rescueBestGrade: simRaw.rescueBestGrade || '',
      rescueLatestScore: simRaw.rescueLatestScore || 0,
      rescueXP: simRaw.rescueXP || 0
    }
  };
}

/* ---------- Achievement unlock detection ---------- */
function checkAchievements(){
  var snapshot = computeSnapshot();
  var earned = readAchievements();
  var newlyUnlocked = [];
  ACHIEVEMENTS.forEach(function(a){
    if(!earned[a.id] && a.check(snapshot)){
      earned[a.id] = { earnedDate: new Date().toISOString() };
      newlyUnlocked.push(a);
    }
  });
  if(newlyUnlocked.length) saveAchievements(earned);
  return newlyUnlocked;
}
function getAchievements(){
  var earned = readAchievements();
  return ACHIEVEMENTS.map(function(a){
    var e = earned[a.id];
    return { id:a.id, title:a.title, icon:a.icon, desc:a.desc, unlocked: !!e, earnedDate: e ? e.earnedDate : null };
  });
}

/* ---------- Reset ---------- */
function resetAll(){
  try{
    localStorage.removeItem(LEARN_KEY);
    localStorage.removeItem(QUIZ_KEY);
    localStorage.removeItem(SIM_KEY);
    localStorage.removeItem(ACH_KEY);
  }catch(e){}
}

/* ---------- Learning Recommendations (Feature 5) ----------
   Simple, transparent, rule-based logic — no AI, no external calls.
   Reuses the same computed snapshot everything else uses, so
   recommendations always match what's shown elsewhere in the app. */
function getRecommendations(){
  var s = computeSnapshot();
  var recs = [];

  // Weak quiz category (attempted, but below 60%)
  var weakestCategory = null, weakestScore = 101;
  Object.keys(s.quiz.bestByCategory).forEach(function(catId){
    var score = s.quiz.bestByCategory[catId];
    if(score < 60 && score < weakestScore){ weakestScore = score; weakestCategory = catId; }
  });
  if(weakestCategory){
    var catInfo = s.quiz.categories.filter(function(c){ return c.id===weakestCategory; })[0];
    recs.push({
      icon: '📘', text: 'Recommended: Review ' + (catInfo ? catInfo.title : weakestCategory) + '.',
      reason: 'Your best score there is ' + weakestScore + '% — revisiting the lesson before retrying should help.',
      action: { type:'learn', target: findModuleForCategory(weakestCategory) }
    });
  }

  // No simulator training yet
  if(!s.simulator.learningModeComplete && s.simulator.challengesCompleted === 0){
    recs.push({
      icon: '🕹️', text: 'Recommended: Try the Basic Flight Simulator.',
      reason: 'You haven\'t started simulator training yet — Learning Mode walks you through the controls step by step.',
      action: { type:'simulator' }
    });
  }

  // Nearly done with learning modules but hasn't tried a quiz in every category
  if(s.learning.completedCount >= s.learning.totalModules - 1 && s.quiz.categoriesAttempted < s.quiz.totalCategories){
    recs.push({
      icon: '🧪', text: 'Recommended: Test your knowledge with the Final Assessment.',
      reason: 'You\'ve completed most learning modules — a great time to try the quiz categories you haven\'t attempted yet.',
      action: { type:'quiz' }
    });
  }

  // Explored very few components
  if(s.learning.exploredComponents < 5){
    recs.push({
      icon: '🧊', text: 'Recommended: Explore more components in the 3D Drone Lab.',
      reason: 'You\'ve only inspected ' + s.learning.exploredComponents + ' of ' + s.learning.totalComponents + ' real parts so far.',
      action: { type:'learn', target:'anatomy' }
    });
  }

  // Hasn't tried any missions
  if(s.simulator.challengesCompleted === 0 && s.simulator.learningModeComplete){
    recs.push({
      icon: '🏁', text: 'Recommended: Try the Flight Missions.',
      reason: 'You\'ve finished simulator basics — the Missions mode puts those controls to the test.',
      action: { type:'simulator' }
    });
  }

  // Nothing started at all yet
  if(s.overallPct === 0){
    recs.push({
      icon: '🚀', text: 'Recommended: Start with the Introduction module.',
      reason: 'Welcome to Dronova! The Introduction module is the best place to begin.',
      action: { type:'learn', target:'intro' }
    });
  }

  // Everything genuinely complete
  if(recs.length === 0 && s.overallPct >= 100){
    recs.push({ icon:'🎉', text: 'You\'ve completed every core module, quiz category, and mission.', reason:'Great work — check the Achievements section for your full record.', action:{type:'progress'} });
  }

  return recs.slice(0, 3); // keep it focused, not overwhelming
}
function findModuleForCategory(catId){
  var map = { fundamentals:'intro', types:'types', components:'anatomy', systems:'architecture', flight:'mechanics', simulator:'mechanics' };
  return map[catId] || 'home';
}

/* ---------- Lightweight, reusable achievement toast (works on any page) ---------- */
var toastStyleInjected = false;
function ensureToastStyle(){
  if(toastStyleInjected) return;
  toastStyleInjected = true;
  var css = '#dronovaAchToast{position:fixed;top:20px;left:50%;transform:translate(-50%,-140%);z-index:9999;'+
    'background:rgba(7,19,31,0.96);border:1px solid rgba(0,229,255,0.4);border-radius:14px;padding:14px 20px;'+
    'display:flex;align-items:center;gap:12px;box-shadow:0 20px 50px rgba(0,0,0,0.4);'+
    'font-family:Inter,system-ui,sans-serif;color:#fff;transition:transform .4s cubic-bezier(.2,.9,.3,1.3);max-width:min(360px,92vw);}'+
    '#dronovaAchToast.show{transform:translate(-50%,0);}'+
    '#dronovaAchToast .datIcon{font-size:1.8rem;}'+
    '#dronovaAchToast .datTitle{font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:0.78rem;letter-spacing:0.08em;text-transform:uppercase;color:#00E5FF;}'+
    '#dronovaAchToast .datName{font-size:0.98rem;font-weight:600;margin-top:2px;}'+
    '#dronovaAchToast .datDesc{font-size:0.78rem;color:#B8C7D9;margin-top:2px;}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
function showAchievementToast(achievement){
  if(typeof document === 'undefined') return;
  ensureToastStyle();
  var el = document.getElementById('dronovaAchToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'dronovaAchToast';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="datIcon">'+achievement.icon+'</div><div>'+
    '<div class="datTitle">🏆 Achievement Unlocked</div>'+
    '<div class="datName">'+achievement.title+'</div>'+
    '<div class="datDesc">'+achievement.desc+'</div></div>';
  requestAnimationFrame(function(){ el.classList.add('show'); });
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function(){ el.classList.remove('show'); }, 4200);
}
/* runs checkAchievements() and shows a toast for each newly unlocked one */
function checkAndNotify(){
  var newly = checkAchievements();
  newly.forEach(function(a, i){ setTimeout(function(){ showAchievementToast(a); }, i*4600); });
  return newly;
}

/* ---------- Public API ---------- */
window.DronovaProgress = {
  getSnapshot: computeSnapshot,
  getAchievements: getAchievements,
  getRecommendations: getRecommendations,
  checkAchievements: checkAchievements,
  checkAndNotify: checkAndNotify,
  showAchievementToast: showAchievementToast,
  resetAll: resetAll,
  XP: XP, LEVELS: LEVELS,
  refreshUI: null /* dronova_progress_ui.js fills this in on pages that render the dashboard */
};

})();
