(function(){
"use strict";

var container = document.getElementById('progressContent');
if(!container || !window.DronovaProgress) return;

function circleRing(pct){
  var r = 30, c = 2*Math.PI*r;
  var offset = c - (pct/100)*c;
  return '<svg width="76" height="76" viewBox="0 0 76 76" class="progRing">'+
    '<circle cx="38" cy="38" r="'+r+'" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="7"/>'+
    '<circle cx="38" cy="38" r="'+r+'" fill="none" stroke="#00E5FF" stroke-width="7" stroke-linecap="round" '+
      'stroke-dasharray="'+c+'" stroke-dashoffset="'+offset+'" transform="rotate(-90 38 38)"/>'+
    '<text x="38" y="43" text-anchor="middle" font-family="Chakra Petch, sans-serif" font-size="18" font-weight="700" fill="#fff">'+pct+'%</text>'+
    '</svg>';
}

function render(){
  var s = window.DronovaProgress.getSnapshot();
  var achievements = window.DronovaProgress.getAchievements();
  var unlockedCount = achievements.filter(function(a){ return a.unlocked; }).length;

  var html = '';

  /* ---------- Overview ---------- */
  html += '<div class="progOverview">'+
    '<div class="progOverviewRing">'+circleRing(s.overallPct)+'<div class="progOverviewLabel">Overall Progress</div></div>'+
    '<div class="progOverviewStats">'+
      '<div class="progStat"><b>'+s.learning.completedCount+' / '+s.learning.totalModules+'</b><span>Learning Modules</span></div>'+
      '<div class="progStat"><b>'+s.quiz.attemptsCount+'</b><span>Quizzes Completed</span></div>'+
      '<div class="progStat"><b>'+s.simulator.challengesCompleted+' / '+s.simulator.totalChallenges+'</b><span>Simulator Challenges</span></div>'+
      '<div class="progStat"><b>'+unlockedCount+' / '+achievements.length+'</b><span>Achievements</span></div>'+
    '</div>'+
    '<div class="progLevelBox">'+
      '<div class="progLevelTitle">Level '+s.level.level+' — '+s.level.title+'</div>'+
      '<div class="progXpTrack"><div class="progXpFill" style="width:'+xpBarPct(s)+'%"></div></div>'+
      '<div class="progXpLabel">'+s.xp+' XP'+(s.nextLevel ? ' — '+(s.nextLevel.minXp - s.xp)+' XP to '+s.nextLevel.title : ' — Max Level')+'</div>'+
    '</div>'+
  '</div>';

  /* ---------- Learning progress ---------- */
  html += '<div class="progSection"><h4>📘 Learning Progress</h4><div class="progModuleList">';
  s.learning.modules.forEach(function(m){
    var mark = m.complete ? '✓' : (m.pct > 0 ? m.pct+'%' : '○');
    html += '<div class="progModuleRow'+(m.complete?' complete':'')+'">'+
      '<span class="pmIcon">'+m.icon+'</span><span class="pmName">'+m.title+'</span>'+
      '<span class="pmMark">'+mark+'</span></div>';
  });
  html += '</div></div>';

  /* ---------- Quiz performance ---------- */
  html += '<div class="progSection"><h4>🧪 Quiz Performance</h4>';
  if(s.quiz.attemptsCount === 0){
    html += '<div class="progEmptyState">📝 Complete your first quiz to see your performance here.</div>';
  } else {
    html += '<div class="cardGrid">'+
      '<div class="infoCardSm"><div class="icTop"><span class="icIcon">🏆</span><span class="icTitle">Best Score</span></div><p style="font-size:1.4rem; color:var(--cyan); font-family:\'Chakra Petch\',sans-serif;">'+s.quiz.bestOverall+'%</p></div>'+
      '<div class="infoCardSm"><div class="icTop"><span class="icIcon">📊</span><span class="icTitle">Average Score</span></div><p style="font-size:1.4rem; color:var(--cyan); font-family:\'Chakra Petch\',sans-serif;">'+s.quiz.avgScore+'%</p></div>'+
      '<div class="infoCardSm"><div class="icTop"><span class="icIcon">✅</span><span class="icTitle">Categories Attempted</span></div><p style="font-size:1.4rem; color:var(--cyan); font-family:\'Chakra Petch\',sans-serif;">'+s.quiz.categoriesAttempted+' / '+s.quiz.totalCategories+'</p></div>'+
      '<div class="infoCardSm"><div class="icTop"><span class="icIcon">🔢</span><span class="icTitle">Questions Answered</span></div><p style="font-size:1.4rem; color:var(--cyan); font-family:\'Chakra Petch\',sans-serif;">'+s.quiz.totalCorrect+' / '+s.quiz.totalQuestionsAnswered+'</p></div>'+
    '</div>';
  }
  html += '</div>';

  /* ---------- Simulator training ---------- */
  html += '<div class="progSection"><h4>🕹️ Flight Training</h4><div class="progModuleList">';
  s.simulator.challenges.forEach(function(c){
    html += '<div class="progModuleRow'+(c.complete?' complete':'')+'"><span class="pmIcon">🏁</span><span class="pmName">'+c.title+'</span><span class="pmMark">'+(c.complete?'✓':'○')+'</span></div>';
  });
  html += '<div class="progModuleRow'+(s.simulator.learningModeComplete?' complete':'')+'"><span class="pmIcon">🚀</span><span class="pmName">Learning Mode</span><span class="pmMark">'+(s.simulator.learningModeComplete?'✓':'○')+'</span></div>';
  html += '</div></div>';

  /* ---------- Learning Recommendations (Feature 5) ---------- */
  var recs = window.DronovaProgress.getRecommendations();
  html += '<div class="progSection"><h4>🧭 Recommended Next Steps</h4><div class="recGrid">';
  recs.forEach(function(r){
    html += '<div class="recCard" data-action-type="'+r.action.type+'" data-action-target="'+(r.action.target||'')+'">'+
      '<div class="recIcon">'+r.icon+'</div>'+
      '<div class="recText">'+r.text+'</div>'+
      '<div class="recReason">'+r.reason+'</div>'+
    '</div>';
  });
  html += '</div></div>';

  /* ---------- Achievements ---------- */
  html += '<div class="progSection"><h4>🏅 Achievements</h4>';
  if(unlockedCount === 0){
    html += '<div class="progEmptyState">🏅 Complete lessons, quizzes and simulator challenges to earn your first achievement.</div>';
  }
  html += '<div class="achGrid">';
  achievements.forEach(function(a){
    html += '<div class="achCard'+(a.unlocked?' unlocked':' locked')+'">'+
      '<div class="achIcon">'+(a.unlocked ? a.icon : '🔒')+'</div>'+
      '<div class="achTitle">'+a.title+'</div>'+
      '<div class="achDesc">'+a.desc+'</div>'+
      (a.unlocked ? '<div class="achDate">Earned '+formatDate(a.earnedDate)+'</div>' : '<div class="achDate">Locked</div>')+
    '</div>';
  });
  html += '</div></div>';

  /* ---------- Reset ---------- */
  html += '<div class="progResetRow"><button class="resetProgressBtn" id="resetProgressBtn">⟲ Reset Progress</button></div>';

  container.innerHTML = html;

  document.getElementById('resetProgressBtn').addEventListener('click', function(){
    showResetConfirm();
  });

  container.querySelectorAll('.recCard').forEach(function(card){
    card.addEventListener('click', function(){
      var type = card.dataset.actionType, target = card.dataset.actionTarget;
      if(type === 'learn'){ window.dronovaGoToPage && window.dronovaGoToPage(target || 'home'); }
      else if(type === 'quiz'){ window.dronovaGoToPage && window.dronovaGoToPage('quiz'); }
      else if(type === 'simulator'){ window.location.href = './simulator/simulator.html'; }
      else if(type === 'progress'){ window.dronovaGoToPage && window.dronovaGoToPage('progress'); }
    });
  });
}

function xpBarPct(s){
  if(!s.nextLevel) return 100;
  var span = s.nextLevel.minXp - s.level.minXp;
  var into = s.xp - s.level.minXp;
  return Math.max(2, Math.min(100, Math.round((into/span)*100)));
}
function formatDate(iso){
  try{ var d = new Date(iso); return d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}); }
  catch(e){ return ''; }
}

/* ---------- Reset confirmation (no native confirm() — kept in the Dronova visual language) ---------- */
function showResetConfirm(){
  var overlay = document.createElement('div');
  overlay.className = 'resetOverlay';
  overlay.innerHTML =
    '<div class="resetDialog">'+
      '<h4>Reset Dronova Progress?</h4>'+
      '<p>Are you sure you want to reset your Dronova learning progress? This clears all learning module completion, quiz results, simulator challenge progress, and achievements. This cannot be undone.</p>'+
      '<div class="resetDialogBtns"><button class="page-action-btn" id="resetCancelBtn">Cancel</button>'+
      '<button class="resetConfirmBtn" id="resetConfirmBtn">Reset</button></div>'+
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('resetCancelBtn').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.getElementById('resetConfirmBtn').addEventListener('click', function(){
    window.DronovaProgress.resetAll();
    window.location.reload();
  });
}

/* ---------- Wire into the shared progress API ---------- */
window.DronovaProgress.refreshUI = render;
render();

})();
