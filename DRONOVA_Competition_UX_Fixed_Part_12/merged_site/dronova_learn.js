(function(){
"use strict";

/* ============================================================
   DATA — single source of truth, loaded from:
   ./data/components_data.js  -> window.DRONOVA_COMPONENTS (27 real 3D parts)
   ./data/learning_modules.js -> window.DRONOVA_MODULES     (lesson content)
   Nothing in this file duplicates that text — everything below
   only reads and renders it.
============================================================ */
var COMPONENTS = window.DRONOVA_COMPONENTS || [];
var MODULES = (window.DRONOVA_MODULES && window.DRONOVA_MODULES.modules) || [];
function getModule(id){ return MODULES.filter(function(m){ return m.id === id; })[0]; }

var SUBSYSTEM_LABELS = {
  structure: 'Structure & Frame', power: 'Power System', avionics: 'Avionics & Signal',
  camera: 'Camera & Gimbal', propulsion: 'Propulsion'
};
var SUBSYSTEM_ORDER = ['structure','power','avionics','camera','propulsion'];

/* The full learning flow, in order — used for the dashboard, the
   recommended-next-lesson logic, and the progress tracker.
   ("explorer"/"quiz"/"about" are not tracked as learning modules.) */
var FLOW = [
  { id:'intro', page:'intro', icon:'🚀', title:'Introduction' },
  { id:'types', page:'types', icon:'🧭', title:'Types of Drones' },
  { id:'anatomy', page:'anatomy', icon:'🛠️', title:'Drone Components', isComponents:true },
  { id:'architecture', page:'architecture', icon:'🧩', title:'System Architecture' },
  { id:'mechanics', page:'mechanics', icon:'✈️', title:'How a Drone Flies' },
  { id:'applications', page:'applications', icon:'🌍', title:'Applications' }
];

/* ============================================================
   PROGRESS STATE (localStorage — this is a static site with no
   backend yet; swapping this for a real API later only means
   replacing loadProgress/saveProgress, nothing else changes)
============================================================ */
var PROGRESS_KEY = 'dronova_progress_v1';
function loadProgress(){
  // Guards against valid-JSON-but-wrong-shape values (e.g. the literal
  // string "null" — truthy, but parses to the actual null value).
  try{
    var raw = localStorage.getItem(PROGRESS_KEY);
    if(raw){ var p = JSON.parse(raw); if(p && typeof p==='object') return p; }
  }catch(e){}
  return { completed: {}, exploredComponents: [] };
}
function saveProgress(p){
  try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); }catch(e){}
}
var progress = loadProgress();

function moduleProgressPct(flowItem){
  // Delegates to the centralized progress engine (Phase 5) when available,
  // so the Home dashboard and the Progress page always agree with each other.
  if(window.DronovaProgress){
    var m = window.DronovaProgress.getSnapshot().learning.modules.filter(function(x){ return x.id===flowItem.id; })[0];
    if(m) return m.pct;
  }
  if(flowItem.isComponents){
    var seen = progress.exploredComponents.length;
    return Math.min(100, Math.round((seen / COMPONENTS.length) * 100));
  }
  return progress.completed[flowItem.id] ? 100 : 0;
}
function notifyProgressChanged(){
  window.DronovaProgress && window.DronovaProgress.checkAndNotify && window.DronovaProgress.checkAndNotify();
  window.DronovaProgress && window.DronovaProgress.refreshUI && window.DronovaProgress.refreshUI();
}
function markComplete(moduleId){
  progress.completed[moduleId] = true;
  saveProgress(progress);
  renderDashboard();
  notifyProgressChanged();
}
function markComponentSeen(componentId){
  if(progress.exploredComponents.indexOf(componentId) === -1){
    progress.exploredComponents.push(componentId);
    saveProgress(progress);
    renderDashboard();
    notifyProgressChanged();
  }
}

/* ============================================================
   RENDER: DASHBOARD (Home)
============================================================ */
function renderDashboard(){
  var grid = document.getElementById('dashboardGrid');
  var slot = document.getElementById('recommendSlot');
  if(!grid) return;
  grid.innerHTML = '';

  var next = null;
  FLOW.forEach(function(f){
    var pct = moduleProgressPct(f);
    var complete = pct >= 100;
    if(!next && !complete) next = f;
    var card = document.createElement('div');
    card.className = 'dashCard' + (complete ? ' complete' : '');
    card.innerHTML =
      '<div class="dcIcon">'+f.icon+'</div>'+
      '<div class="dcTitle">'+f.title+'</div>'+
      '<div class="dcStatus">'+(complete ? 'Completed' : pct > 0 ? pct+'% explored' : 'Not started')+'</div>'+
      '<div class="dcBar"><div class="dcBarFill" style="width:'+pct+'%"></div></div>';
    card.addEventListener('click', function(){ window.dronovaGoToPage && window.dronovaGoToPage(f.page); });
    grid.appendChild(card);
  });

  if(slot){
    if(next){
      slot.innerHTML =
        '<div class="recommendBanner"><div><div class="rbLabel">Recommended Next Lesson</div>'+
        '<div class="rbTitle">'+next.icon+' '+next.title+'</div></div>'+
        '<button class="page-action-btn btn-primary" data-page-target="'+next.page+'">Continue →</button></div>';
    } else {
      slot.innerHTML = '<div class="recommendBanner"><div><div class="rbLabel">All Modules Complete</div>'+
        '<div class="rbTitle">🎉 Ready for the Simulator (coming soon)</div></div></div>';
    }
  }
}

/* ============================================================
   RENDER: PROGRESS TRACKER
   Superseded by dronova_progress_ui.js (Phase 5), which renders
   the unified Learning + Quiz + Simulator + Achievements dashboard
   into the same #progressContent container. Kept out of this file
   so progress is calculated in exactly one place (window.DronovaProgress).
============================================================ */

/* ============================================================
   RENDER: INTRO / TYPES / ARCHITECTURE / MECHANICS / APPLICATIONS
   (straightforward templating from learning_modules.js — no
   content is written here, only markup structure)
============================================================ */
function renderIntro(){
  var m = getModule('intro'); if(!m) return;
  document.getElementById('introHeaderSub').textContent = m.summary;
  var html = '';
  m.sections.forEach(function(s){
    html += '<div class="lessonBlock"><h4>'+s.heading+'</h4><p>'+s.body+'</p></div>';
  });
  html += '<div class="cardGrid">';
  m.terms.forEach(function(t){
    html += '<div class="infoCardSm"><div class="icTop"><span class="icIcon">📘</span><span class="icTitle">'+t.term+'</span></div><p>'+t.def+'</p></div>';
  });
  html += '</div>';
  html += '<div class="recommendBanner"><div><div class="rbLabel">Practice What You Learned</div>'+
    '<div class="rbTitle">🧪 Test Your Knowledge → Drone Fundamentals Quiz</div></div>'+
    '<button class="page-action-btn btn-primary" onclick="window.dronovaStartQuiz(\'fundamentals\')">Start Quiz →</button></div>';
  document.getElementById('introContent').innerHTML = html;
}

function renderTypes(){
  var m = getModule('types'); if(!m) return;
  document.getElementById('typesHeaderSub').textContent = m.summary;
  var html = '';
  m.droneTypes.forEach(function(t){
    html += '<div class="typeCard"><div class="tcHead"><span class="tcName">'+t.name+'</span><span class="tcTag">'+t.tag+'</span></div>'+
      '<p>'+t.desc+'</p><div class="tcCols">'+
      '<div class="tcCol"><b>Advantages</b><ul>'+t.pros.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>'+
      '<div class="tcCol"><b>Trade-offs</b><ul>'+t.cons.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>'+
      '<div class="tcCol"><b>Common Uses</b><ul>'+t.useCases.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>'+
      '</div></div>';
  });
  document.getElementById('typesContent').innerHTML = html +
    '<div class="recommendBanner"><div><div class="rbLabel">Practice What You Learned</div>'+
    '<div class="rbTitle">🧪 Test Your Knowledge → Drone Types Quiz</div></div>'+
    '<button class="page-action-btn btn-primary" onclick="window.dronovaStartQuiz(\'types\')">Start Quiz →</button></div>';
}

function renderArchitecture(){
  var m = getModule('architecture'); if(!m) return;
  document.getElementById('archHeaderSub').textContent = m.summary;
  var html = '';
  m.flows.forEach(function(f){
    html += '<div class="flowCard"><h4>'+f.title+'</h4><div class="flowDesc">'+f.desc+'</div><div class="flowRow">';
    f.steps.forEach(function(step, i){
      html += '<span class="flowStep">'+step+'</span>';
      if(i < f.steps.length-1) html += '<span class="flowArrow">→</span>';
    });
    html += '</div></div>';
  });
  html += '<div class="archNote">ℹ️ '+m.note+'</div>';
  html += '<div class="recommendBanner"><div><div class="rbLabel">Practice What You Learned</div>'+
    '<div class="rbTitle">🧪 Test Your Knowledge → Systems Quiz</div></div>'+
    '<button class="page-action-btn btn-primary" onclick="window.dronovaStartQuiz(\'systems\')">Start Quiz →</button></div>';
  document.getElementById('architectureContent').innerHTML = html;
}

function renderMechanics(){
  var m = getModule('mechanics'); if(!m) return;
  document.getElementById('mechHeaderSub').textContent = m.summary;

  /* ---------- Features 2 & 3: Interactive Flight Visualizer ----------
     A lightweight CSS-animated diagram (no duplicate 3D engine) letting
     the learner select a force or control and see its effect. Content
     is the same forces/axes/controls data already used below — this
     widget doesn't introduce new lesson text, only a new way to explore it. */
  var allConcepts = []
    .concat(m.forces.map(function(f){ return Object.assign({kind:'force'}, f); }))
    .concat(m.controls.map(function(c){ return Object.assign({kind:'control'}, c); }));

  var html = '<div class="lessonBlock"><h4>🎮 Interactive Flight Visualizer</h4>'+
    '<p style="font-size:0.86rem; color:var(--muted); margin-bottom:12px;">Select a force or control below to see how it affects the drone. This is a simplified educational visualization, not a full flight simulation — try the Simulator below for the real thing.</p></div>';
  html += '<div class="vizWidget">'+
    '<div class="vizStage"><div class="vizDrone" id="vizDrone"><div class="vizArm a1"></div><div class="vizArm a2"></div><div class="vizBody"></div><div class="vizArrow" id="vizArrow"></div></div></div>'+
    '<div class="vizPanel">'+
      '<div class="vizPills" id="vizPills">';
  allConcepts.forEach(function(c, i){
    html += '<button class="vizPill'+(i===0?' active':'')+'" data-effect="'+(c.effect||c.axis||'')+'" data-kind="'+c.kind+'" data-idx="'+i+'">'+c.icon+' '+c.name+'</button>';
  });
  html += '</div>'+
      '<div class="vizDetail" id="vizDetail"></div>'+
    '</div>'+
  '</div>';

  html += '<div class="lessonBlock" style="margin-top:24px;"><h4>The Four Forces of Flight</h4></div><div class="forceGrid">';
  m.forces.forEach(function(f){
    html += '<div class="infoCardSm"><div class="icTop"><span class="icIcon">'+f.icon+'</span><span class="icTitle">'+f.name+'</span></div><p>'+f.desc+'</p></div>';
  });
  html += '</div><div class="lessonBlock"><h4>The Three Axes of Rotation</h4></div><div class="axesGrid">';
  m.axes.forEach(function(a){
    html += '<div class="infoCardSm"><div class="icTop"><span class="icIcon">'+a.icon+'</span><span class="icTitle">'+a.name+'</span></div><p>'+a.desc+'</p></div>';
  });
  html += '</div>';
  html += '<div class="recommendBanner"><div><div class="rbLabel">Put It Into Practice</div>'+
    '<div class="rbTitle">🕹️ Try It Yourself → Open Drone Simulator</div></div>'+
    '<a class="page-action-btn btn-primary" href="./simulator/simulator.html" style="text-decoration:none;">Launch Simulator →</a></div>';
  html += '<div class="recommendBanner"><div><div class="rbLabel">Practice What You Learned</div>'+
    '<div class="rbTitle">🧪 Test Your Knowledge → Flight Principles Quiz</div></div>'+
    '<button class="page-action-btn btn-primary" onclick="window.dronovaStartQuiz(\'flight\')">Start Quiz →</button></div>';
  document.getElementById('mechanicsContent').innerHTML = html;

  function showConcept(i){
    var c = allConcepts[i];
    document.getElementById('vizDetail').innerHTML =
      '<div class="vizDetailIcon">'+c.icon+'</div><div class="vizDetailName">'+c.name+'</div><div class="vizDetailDesc">'+c.desc+'</div>';
    var drone = document.getElementById('vizDrone');
    drone.className = 'vizDrone effect-' + c.name.toLowerCase();
    document.querySelectorAll('.vizPill').forEach(function(p){ p.classList.toggle('active', p.dataset.idx == i); });
  }
  document.getElementById('vizPills').addEventListener('click', function(e){
    var pill = e.target.closest('.vizPill');
    if(pill) showConcept(parseInt(pill.dataset.idx, 10));
  });
  showConcept(0);
}

function renderApplications(){
  var m = getModule('applications'); if(!m) return;
  document.getElementById('appsHeaderSub').textContent = m.summary;
  var html = '<div class="cardGrid">';
  m.apps.forEach(function(a){
    html += '<div class="infoCardSm"><div class="icTop"><span class="icIcon">'+a.icon+'</span><span class="icTitle">'+a.name+'</span></div><p>'+a.desc+'</p></div>';
  });
  html += '</div>';
  document.getElementById('applicationsContent').innerHTML = html;
}

/* ============================================================
   RENDER: DRONE COMPONENTS (Module 3) — sourced live from
   components_data.js, the same file the 3D Lab itself uses.
============================================================ */
function renderComponents(){
  var container = document.getElementById('componentsContent');
  if(!container) return;
  var bySub = {};
  COMPONENTS.forEach(function(c){ (bySub[c.category] = bySub[c.category] || []).push(c); });

  var html = '';
  SUBSYSTEM_ORDER.forEach(function(sub){
    var list = bySub[sub]; if(!list) return;
    html += '<div class="subsystemGroup"><h4>'+(SUBSYSTEM_LABELS[sub]||sub)+'</h4>';
    list.forEach(function(c){
      html += '<div class="compCard" id="comp-'+c.id+'" data-comp-id="'+c.id+'">'+
        '<div class="ccHead"><span class="ccIcon">'+c.icon+'</span><span class="ccName">'+c.name+'</span><span class="ccChevron">▸</span></div>'+
        '<div class="ccBody">'+
          '<div class="ccQA"><b>What is it?</b><p>'+c.function+'</p></div>'+
          '<div class="ccQA"><b>What does it do?</b><p>'+c.description+'</p></div>'+
          '<div class="ccQA"><b>How does it work?</b><p>'+c.howItWorks+'</p></div>'+
          (c.learningTip ? '<div class="ccTip">💡 '+c.learningTip+'</div>' : '')+
          '<div class="ccActions"><button class="exploreBtn" data-explore-id="'+c.id+'">🧊 Explore in 3D</button></div>'+
        '</div></div>';
    });
    html += '</div>';
  });
  html += '<div class="recommendBanner"><div><div class="rbLabel">Practice What You Learned</div>'+
    '<div class="rbTitle">🧪 Test Your Knowledge → Component Quiz</div></div>'+
    '<button class="page-action-btn btn-primary" onclick="window.dronovaStartQuiz(\'components\')">Start Quiz →</button></div>';
  container.innerHTML = html;
}

/* ============================================================
   EVENT DELEGATION for all dynamically-rendered content
============================================================ */
document.addEventListener('click', function(e){
  var head = e.target.closest && e.target.closest('.ccHead');
  if(head){
    head.parentElement.classList.toggle('open');
    return;
  }
  var explore = e.target.closest && e.target.closest('[data-explore-id]');
  if(explore){
    exploreInThreeD(explore.dataset.exploreId);
    return;
  }
  var complete = e.target.closest && e.target.closest('.markCompleteBtn');
  if(complete){
    markComplete(complete.dataset.module);
    complete.classList.add('done');
    complete.textContent = '✓ Module Complete';
    return;
  }
});

/* "Explore in 3D" — scrolls to the always-visible viewer at the
   top of Home and asks it to isolate + highlight the component. */
function exploreInThreeD(componentId){
  markComponentSeen(componentId);
  var view = document.getElementById('view');
  if(view) view.scrollIntoView({ behavior:'smooth', block:'center' });
  setTimeout(function(){
    window.dronovaSendViewerCommand && window.dronovaSendViewerCommand('isolate', { id: componentId });
  }, 450);
}

/* "Learn About This Component" — sent FROM the 3D Lab iframe.
   Jumps to the Components module and opens/highlights that card. */
window.addEventListener('message', function(e){
  var data = e.data;
  if(!data || data.type !== 'DRONOVA_LEARN_NAV' || !data.componentId) return;
  window.dronovaGoToPage && window.dronovaGoToPage('anatomy');
  markComponentSeen(data.componentId);
  setTimeout(function(){
    var card = document.getElementById('comp-'+data.componentId);
    if(!card) return;
    document.querySelectorAll('.compCard.open').forEach(function(c){ c.classList.remove('open'); });
    card.classList.add('open','highlighted');
    card.scrollIntoView({ behavior:'smooth', block:'center' });
    setTimeout(function(){ card.classList.remove('highlighted'); }, 2600);
  }, 150);
});

/* Feature 1: "Test Yourself" — sent FROM the 3D Lab iframe.
   Jumps straight into the Components quiz. */
window.addEventListener('message', function(e){
  var data = e.data;
  if(!data || data.type !== 'DRONOVA_QUIZ_NAV' || !data.category) return;
  window.dronovaStartQuiz && window.dronovaStartQuiz(data.category);
});

/* ============================================================
   GLOBAL SEARCH
   Indexes: components (name/function/description), module
   sections, drone types, applications, and glossary terms.
============================================================ */
var searchIndex = [];
function buildSearchIndex(){
  COMPONENTS.forEach(function(c){
    searchIndex.push({ group:'Component', title:c.name, snippet:c.function, page:'anatomy', componentId:c.id });
  });
  MODULES.forEach(function(m){
    searchIndex.push({ group:'Learning Module', title:m.title, snippet:m.summary, page:m.page });
    (m.sections||[]).forEach(function(s){
      searchIndex.push({ group:'Learning Module', title:m.title+' — '+s.heading, snippet:s.body, page:m.page });
    });
    (m.terms||[]).forEach(function(t){
      searchIndex.push({ group:'Terminology', title:t.term, snippet:t.def, page:m.page });
    });
    (m.droneTypes||[]).forEach(function(t){
      searchIndex.push({ group:'Drone Type', title:t.name, snippet:t.desc, page:m.page });
    });
    (m.apps||[]).forEach(function(a){
      searchIndex.push({ group:'Application', title:a.name, snippet:a.desc, page:m.page });
    });
  });
  // Feature 6/7: Glossary — reuses this same search system rather than building a new one
  (window.DRONOVA_GLOSSARY || []).forEach(function(g){
    searchIndex.push({ group:'Glossary', title:g.term+(g.full && g.full!==g.term ? ' ('+g.full+')' : ''), snippet:g.def, page:'resources' });
  });
  // Feature 7: Quiz categories
  (window.DRONOVA_QUIZ_CATEGORIES || []).forEach(function(c){
    searchIndex.push({ group:'Quiz Category', title:c.title, snippet:c.desc, page:'quiz', quizCatId:c.id });
  });
  // Feature 7: Simulator concepts (reuses existing terminology, doesn't duplicate simulator logic)
  ['Throttle','Pitch','Roll','Yaw','Take-off','Hover','Landing','Flight Assistance','Missions'].forEach(function(term){
    searchIndex.push({ group:'Simulator', title:term, snippet:'A core Drone Simulator concept — open the simulator to try it.', page:'simulator' });
  });
}

function runSearch(query){
  query = query.trim().toLowerCase();
  var resultsEl = document.getElementById('searchResults');
  if(!query){ resultsEl.classList.remove('show'); resultsEl.innerHTML=''; return; }
  var hits = searchIndex.filter(function(item){
    return item.title.toLowerCase().indexOf(query) > -1 || item.snippet.toLowerCase().indexOf(query) > -1;
  }).slice(0, 12);

  if(!hits.length){
    resultsEl.innerHTML = '<div class="srEmpty">No results for "'+query+'"</div>';
    resultsEl.classList.add('show');
    return;
  }
  var groups = {};
  hits.forEach(function(h){ (groups[h.group] = groups[h.group]||[]).push(h); });
  var html = '';
  Object.keys(groups).forEach(function(g){
    html += '<div class="srGroup">'+g+'</div>';
    groups[g].forEach(function(h){
      html += '<div class="srItem" data-page="'+h.page+'" data-comp="'+(h.componentId||'')+'" data-quiz-cat="'+(h.quizCatId||'')+'">'+
        '<div class="srTitle">'+h.title+'</div><div class="srSnippet">'+h.snippet.slice(0,110)+'</div></div>';
    });
  });
  resultsEl.innerHTML = html;
  resultsEl.classList.add('show');
}

function initSearch(){
  buildSearchIndex();
  var input = document.getElementById('globalSearch');
  var resultsEl = document.getElementById('searchResults');
  if(!input) return;
  input.addEventListener('input', function(){ runSearch(input.value); });
  input.addEventListener('focus', function(){ if(input.value.trim()) runSearch(input.value); });
  document.addEventListener('click', function(e){
    var item = e.target.closest && e.target.closest('.srItem');
    if(item){
      if(item.dataset.quizCat){
        window.dronovaStartQuiz && window.dronovaStartQuiz(item.dataset.quizCat);
      } else {
        window.dronovaGoToPage && window.dronovaGoToPage(item.dataset.page);
      }
      if(item.dataset.comp){
        setTimeout(function(){
          var card = document.getElementById('comp-'+item.dataset.comp);
          if(card){ card.classList.add('open'); card.scrollIntoView({behavior:'smooth', block:'center'}); }
        }, 150);
      }
      resultsEl.classList.remove('show');
      input.value = '';
      return;
    }
    if(!e.target.closest || !e.target.closest('.searchWrap')){
      resultsEl.classList.remove('show');
    }
  });
}

/* ============================================================
   INIT
============================================================ */
renderDashboard();
/* Progress dashboard rendering now happens via dronova_progress_ui.js,
   which calls window.DronovaProgress.refreshUI() on its own load. */
renderIntro();
renderTypes();
renderComponents();
renderArchitecture();
renderMechanics();
renderApplications();
initSearch();

/* Competition presentation refinement: a fresh DRONOVA entry should
   always open on the main Home experience rather than auto-routing to a
   learning section from a leftover URL hash. Navigation after load still
   works normally through the page buttons. */
if(window.location.hash){
  try { history.replaceState(null, '', window.location.pathname + window.location.search); }
  catch(e) { /* non-critical on restricted local-file contexts */ }
}

})();
