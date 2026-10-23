(function(){
"use strict";

/* ============================================================
   DATA — reuses the same real question bank + category metadata
   loaded from ./data/quiz_data.js. No question text lives in
   this file; this file only renders and scores.
============================================================ */
var BANK = (window.DRONOVA_QUIZ_BANK && window.DRONOVA_QUIZ_BANK.questions) || [];
var CATEGORIES = window.DRONOVA_QUIZ_CATEGORIES || [];
function getCategory(id){ return CATEGORIES.filter(function(c){ return c.id===id; })[0]; }
function questionsFor(catId){ return BANK.filter(function(q){ return q.category===catId; }); }

/* Performance-level thresholds — kept in one place so they're easy to tune later. */
var PERFORMANCE_LEVELS = [
  { min:90, label:'Excellent' },
  { min:80, label:'Very Good' },
  { min:70, label:'Good' },
  { min:60, label:'Satisfactory' },
  { min:0,  label:'Needs Improvement' }
];
function performanceLevel(pct){
  for(var i=0;i<PERFORMANCE_LEVELS.length;i++){ if(pct >= PERFORMANCE_LEVELS[i].min) return PERFORMANCE_LEVELS[i].label; }
  return 'Needs Improvement';
}

/* ============================================================
   RESULTS STORAGE (localStorage — separate namespace from the
   Learning System's progress key; shaped so a future Progress
   Dashboard can read attempts/bestByCategory directly)
============================================================ */
var RESULTS_KEY = 'dronova_quiz_results_v1';
function loadResults(){
  // Guards against valid-JSON-but-wrong-shape values (e.g. the literal
  // string "null" — truthy, but parses to the actual null value).
  try{ var raw = localStorage.getItem(RESULTS_KEY); if(raw){ var p = JSON.parse(raw); if(p && typeof p==='object') return p; } }catch(e){}
  return { attempts: [], bestByCategory: {} };
}
function saveResults(r){ try{ localStorage.setItem(RESULTS_KEY, JSON.stringify(r)); }catch(e){} }
var results = loadResults();

function recordAttempt(catId, score, total){
  var pct = total > 0 ? Math.round((score/total)*100) : 0;
  var attempt = { category:catId, score:score, total:total, pct:pct, date:new Date().toISOString() };
  results.attempts.push(attempt);
  if(!results.bestByCategory[catId] || pct > results.bestByCategory[catId]) results.bestByCategory[catId] = pct;
  saveResults(results);
  window.DronovaProgress && window.DronovaProgress.checkAndNotify && window.DronovaProgress.checkAndNotify();
  window.DronovaProgress && window.DronovaProgress.refreshUI && window.DronovaProgress.refreshUI();
  return attempt;
}

/* ============================================================
   SHUFFLE / RANDOM SELECTION
============================================================ */
function shuffle(arr){
  var a = arr.slice();
  for(var i=a.length-1;i>0;i--){
    var j = Math.floor(Math.random()*(i+1));
    var t=a[i]; a[i]=a[j]; a[j]=t;
  }
  return a;
}
function pickQuestions(catId, count){
  var pool = questionsFor(catId);
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

/* ============================================================
   STATE
============================================================ */
var root = document.getElementById('quizRoot');
var view = 'dashboard'; // dashboard | setup | quiz | results | review
var session = null; // { catId, questions, index, answers:[], locked:false, selected:null }

/* ============================================================
   RENDER: DASHBOARD
============================================================ */
function renderDashboard(){
  view = 'dashboard';
  var html = '<div class="cardGrid">';
  CATEGORIES.forEach(function(c){
    var bank = questionsFor(c.id);
    var best = results.bestByCategory[c.id];
    html += '<div class="quizCatCard" data-cat="'+c.id+'">'+
      '<div class="qcIcon">'+c.icon+'</div>'+
      '<div class="qcTitle">'+c.title+'</div>'+
      '<div class="qcDesc">'+c.desc+'</div>'+
      '<div class="qcMeta"><span>'+bank.length+' questions available</span>'+
      '<span class="qcBest">'+(best!==undefined ? 'Best: '+best+'%' : 'Not attempted')+'</span></div>'+
      '</div>';
  });
  html += '</div>';
  root.innerHTML = html;
}

/* ============================================================
   RENDER: SETUP (choose question count)
============================================================ */
function renderSetup(catId){
  view = 'setup';
  var c = getCategory(catId);
  var bank = questionsFor(catId);
  var max = Math.min(bank.length, 15);
  var def = Math.min(c.defaultCount, max);
  root.innerHTML =
    '<div class="quizSetupCard">'+
      '<div class="qcIcon" style="font-size:2rem;">'+c.icon+'</div>'+
      '<h4>'+c.title+'</h4><p style="color:var(--muted); font-size:0.88rem;">'+c.desc+'</p>'+
      '<div class="quizCountRow"><span style="font-size:0.82rem; color:var(--muted);">Questions:</span>'+
        '<input type="range" id="quizCountSlider" min="3" max="'+max+'" value="'+def+'">'+
        '<b id="quizCountLabel">'+def+'</b></div>'+
      '<div style="display:flex; gap:10px;">'+
        '<button class="page-action-btn" id="quizBackBtn" class="btn-tertiary">← Back</button>'+
        '<button class="page-action-btn btn-primary" id="quizStartBtn">Start Quiz →</button>'+
      '</div>'+
    '</div>';
  document.getElementById('quizCountSlider').addEventListener('input', function(e){
    document.getElementById('quizCountLabel').textContent = e.target.value;
  });
  document.getElementById('quizBackBtn').addEventListener('click', renderDashboard);
  document.getElementById('quizStartBtn').addEventListener('click', function(){
    var count = parseInt(document.getElementById('quizCountSlider').value, 10);
    startQuiz(catId, count);
  });
}

/* ============================================================
   QUIZ RUNTIME
============================================================ */
function startQuiz(catId, count){
  session = { catId:catId, questions: pickQuestions(catId, count), index:0, answers:[], locked:false, selected:null };
  view = 'quiz';
  renderQuestion();
}

function renderQuestion(){
  var q = session.questions[session.index];
  var total = session.questions.length;
  var pct = Math.round((session.index/total)*100);
  session.locked = false; session.selected = null;

  var html = '<div class="quizProgressWrap"><span>Question '+(session.index+1)+' / '+total+'</span><span>'+pct+'% Complete</span></div>'+
    '<div class="quizProgressTrack"><div class="quizProgressFill" style="width:'+pct+'%"></div></div>'+
    '<div class="quizQuestionCard">'+
      '<div class="quizQTag">'+getCategory(q.category).title+' · '+q.difficulty+'</div>'+
      '<div class="quizQText">'+q.question+'</div>';

  if(q.type === 'component_id'){
    html += '<div class="quiz3dHint"><span>🧊 This part is highlighted in the 3D Lab at the top of the page.</span>'+
      '<button id="quizView3D">View in 3D Lab ↑</button></div>';
  }

  html += '<div class="quizOptions">';
  q.options.forEach(function(opt, i){
    html += '<div class="quizOption" data-idx="'+i+'"><div class="qoMark"></div><div>'+opt+'</div></div>';
  });
  html += '</div>';
  html += '<div class="quizFeedback" id="quizFeedback"><div class="qfTitle" id="qfTitle"></div><p id="qfBody"></p></div>';
  html += '<div class="quizActionRow"><button class="page-action-btn btn-primary" id="quizSubmitBtn" style="opacity:0.5; pointer-events:none;">Submit Answer</button></div>';
  html += '</div>';
  root.innerHTML = html;

  if(q.type === 'component_id'){
    document.getElementById('quizView3D').addEventListener('click', function(){ goto3D(q.relatedComponent); });
    goto3D(q.relatedComponent, true); // silently isolate on the (possibly offscreen) viewer without forcing scroll
  }

  root.querySelectorAll('.quizOption').forEach(function(el){
    el.addEventListener('click', function(){
      if(session.locked) return;
      root.querySelectorAll('.quizOption').forEach(function(o){ o.classList.remove('selected'); });
      el.classList.add('selected');
      session.selected = parseInt(el.dataset.idx, 10);
      var btn = document.getElementById('quizSubmitBtn');
      btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
    });
  });
  document.getElementById('quizSubmitBtn').addEventListener('click', submitAnswer);
}

function goto3D(componentId, silent){
  if(!componentId) return;
  if(!silent){
    var v = document.getElementById('view');
    if(v) v.scrollIntoView({behavior:'smooth', block:'center'});
  }
  setTimeout(function(){
    window.dronovaSendViewerCommand && window.dronovaSendViewerCommand('isolate', { id: componentId });
  }, silent ? 0 : 450);
}

function submitAnswer(){
  if(session.locked || session.selected===null) return;
  session.locked = true;
  var q = session.questions[session.index];
  var correct = session.selected === q.correctAnswer;
  session.answers.push({ questionId:q.id, selected:session.selected, correct:correct });

  root.querySelectorAll('.quizOption').forEach(function(el){
    el.classList.add('disabled');
    var idx = parseInt(el.dataset.idx, 10);
    if(idx === q.correctAnswer) el.classList.add('correct');
    else if(idx === session.selected) el.classList.add('incorrect');
  });

  var fb = document.getElementById('quizFeedback');
  fb.classList.add('show', correct ? 'correct' : 'incorrect');
  document.getElementById('qfTitle').textContent = correct ? '✓ Correct!' : '✕ Incorrect';
  document.getElementById('qfBody').textContent = q.explanation;

  var btn = document.getElementById('quizSubmitBtn');
  var isLast = session.index === session.questions.length-1;
  btn.textContent = isLast ? 'View Results →' : 'Next Question →';
  btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
  btn.removeEventListener('click', submitAnswer);
  btn.addEventListener('click', function(){
    if(isLast) finishQuiz(); else { session.index++; renderQuestion(); }
  });
}

/* ============================================================
   RESULTS
============================================================ */
function finishQuiz(){
  var score = session.answers.filter(function(a){ return a.correct; }).length;
  var total = session.questions.length;
  var pct = Math.round((score/total)*100);
  var level = performanceLevel(pct);
  recordAttempt(session.catId, score, total);
  view = 'results';

  root.innerHTML =
    '<div class="quizResultHero">'+
      '<div style="font-family:\'Chakra Petch\',sans-serif; color:var(--muted); letter-spacing:0.1em; text-transform:uppercase; font-size:0.8rem;">Quiz Complete</div>'+
      '<div class="qrScore">'+score+' / '+total+'</div>'+
      '<div class="qrPct">'+pct+'%</div>'+
      '<div class="qrLevel">'+level+'</div>'+
      '<div class="quizResultActions">'+
        '<button class="page-action-btn" id="quizRetryBtn">↻ Retry Quiz</button>'+
        '<button class="page-action-btn" id="quizReviewBtn">📋 Review Answers</button>'+
        '<button class="page-action-btn" id="quizContinueBtn" class="btn-primary">→ Continue Learning</button>'+
      '</div>'+
    '</div>';

  document.getElementById('quizRetryBtn').addEventListener('click', function(){ startQuiz(session.catId, session.questions.length); });
  document.getElementById('quizReviewBtn').addEventListener('click', renderReview);
  document.getElementById('quizContinueBtn').addEventListener('click', function(){
    var c = getCategory(session.catId);
    window.dronovaGoToPage && window.dronovaGoToPage(c.module || 'home');
  });
}

/* ============================================================
   REVIEW ANSWERS
============================================================ */
function renderReview(){
  view = 'review';
  var html = '<div style="margin-bottom:14px;"><button class="page-action-btn" id="quizBackToResultsBtn" class="btn-tertiary">← Back to Results</button></div>';
  session.questions.forEach(function(q, i){
    var ans = session.answers[i];
    var userText = ans.selected!==null && ans.selected!==undefined ? q.options[ans.selected] : '(no answer)';
    html += '<div class="reviewItem '+(ans.correct?'correct':'incorrect')+'">'+
      '<div class="riQ">'+(i+1)+'. '+q.question+'</div>'+
      '<div class="riRow '+(ans.correct?'userRight':'userWrong')+'">Your answer: '+userText+'</div>'+
      (!ans.correct ? '<div class="riRow userRight">Correct answer: '+q.options[q.correctAnswer]+'</div>' : '')+
      '<div class="riExpl">'+q.explanation+'</div>'+
    '</div>';
  });
  root.innerHTML = html;
  document.getElementById('quizBackToResultsBtn').addEventListener('click', function(){
    view = 'results';
    var score = session.answers.filter(function(a){ return a.correct; }).length;
    finishQuizView(score, session.questions.length);
  });
}
// re-render results without recording a duplicate attempt (used when returning from review)
function finishQuizView(score, total){
  var pct = Math.round((score/total)*100);
  var level = performanceLevel(pct);
  root.innerHTML =
    '<div class="quizResultHero">'+
      '<div style="font-family:\'Chakra Petch\',sans-serif; color:var(--muted); letter-spacing:0.1em; text-transform:uppercase; font-size:0.8rem;">Quiz Complete</div>'+
      '<div class="qrScore">'+score+' / '+total+'</div><div class="qrPct">'+pct+'%</div><div class="qrLevel">'+level+'</div>'+
      '<div class="quizResultActions">'+
        '<button class="page-action-btn" id="quizRetryBtn">↻ Retry Quiz</button>'+
        '<button class="page-action-btn" id="quizReviewBtn">📋 Review Answers</button>'+
        '<button class="page-action-btn" id="quizContinueBtn" class="btn-primary">→ Continue Learning</button>'+
      '</div></div>';
  document.getElementById('quizRetryBtn').addEventListener('click', function(){ startQuiz(session.catId, session.questions.length); });
  document.getElementById('quizReviewBtn').addEventListener('click', renderReview);
  document.getElementById('quizContinueBtn').addEventListener('click', function(){
    var c = getCategory(session.catId);
    window.dronovaGoToPage && window.dronovaGoToPage(c.module || 'home');
  });
}

/* ============================================================
   EVENT DELEGATION (dashboard cards)
============================================================ */
root.addEventListener('click', function(e){
  var card = e.target.closest && e.target.closest('.quizCatCard');
  if(card && view === 'dashboard') renderSetup(card.dataset.cat);
});

/* ============================================================
   PUBLIC HOOK — "Test Your Knowledge → X Quiz" banners
   (used by dronova_learn.js at the end of each learning module)
============================================================ */
window.dronovaStartQuiz = function(catId){
  window.dronovaGoToPage && window.dronovaGoToPage('quiz');
  setTimeout(function(){ renderSetup(catId); }, 60);
};

/* ============================================================
   INIT
============================================================ */
renderDashboard();

})();
