(function(){
"use strict";

var GLOSSARY = window.DRONOVA_GLOSSARY || [];
var glossaryContainer = document.getElementById('glossaryContent');
var refContainer = document.getElementById('referencesContent');
if(!glossaryContainer) return; // resources panel not present on this page

function renderGlossary(filter){
  filter = (filter || '').trim().toLowerCase();
  var list = GLOSSARY.filter(function(g){
    if(!filter) return true;
    return g.term.toLowerCase().indexOf(filter) > -1 || g.def.toLowerCase().indexOf(filter) > -1 ||
           (g.full && g.full.toLowerCase().indexOf(filter) > -1);
  });

  if(!list.length){
    glossaryContainer.innerHTML = '<div class="progEmptyState">No glossary terms match "'+filter+'".</div>';
    return;
  }

  var html = '<div class="cardGrid">';
  list.forEach(function(g){
    html += '<div class="infoCardSm glossaryCard">'+
      '<div class="icTop"><span class="icTitle">'+g.term+'</span></div>'+
      (g.full && g.full!==g.term ? '<div class="glossaryFull">'+g.full+'</div>' : '')+
      '<p>'+g.def+'</p>'+
      '<div class="glossaryActions">';
    if(g.related){
      html += '<button class="glossaryLink" data-page-target="'+g.related+'">📘 Related lesson</button>';
    }
    if(g.component){
      html += '<button class="glossaryLink" data-explore-component="'+g.component+'">🧊 See in 3D</button>';
    }
    html += '</div></div>';
  });
  html += '</div>';
  glossaryContainer.innerHTML = html;
}

document.addEventListener('click', function(e){
  var linkBtn = e.target.closest && e.target.closest('.glossaryLink');
  if(!linkBtn) return;
  if(linkBtn.dataset.pageTarget){
    window.dronovaGoToPage && window.dronovaGoToPage(linkBtn.dataset.pageTarget);
  } else if(linkBtn.dataset.exploreComponent){
    window.dronovaGoToPage && window.dronovaGoToPage('anatomy');
    var compId = linkBtn.dataset.exploreComponent;
    setTimeout(function(){
      var view = document.getElementById('view');
      if(view) view.scrollIntoView({behavior:'smooth', block:'center'});
      window.dronovaSendViewerCommand && window.dronovaSendViewerCommand('isolate', { id: compId });
      var card = document.getElementById('comp-'+compId);
      if(card) card.classList.add('open');
    }, 200);
  }
});

var searchInput = document.getElementById('glossarySearch');
if(searchInput){
  searchInput.addEventListener('input', function(){ renderGlossary(searchInput.value); });
}
renderGlossary('');

/* ---------- References (Feature 9) ----------
   Honest, non-fabricated list: the actual technologies this
   project is built on, plus the standard, widely-taught
   aerodynamics concepts (thrust/lift/weight/drag, pitch/roll/yaw)
   that the Flight Principles content is based on. No invented
   citations or sources that weren't actually used. */
var REFERENCES = [
  { title:'Three.js', type:'3D Rendering Library', desc:'WebGL-based 3D graphics library used to render the exploded-view Drone Lab and the Flight Simulator.', url:'https://threejs.org/' },
  { title:'WebGL', type:'Web Standard', desc:'The browser graphics API that Three.js builds on, enabling real-time 3D rendering without plugins.', url:'https://www.khronos.org/webgl/' },
  { title:'Multirotor Flight Fundamentals', type:'Core Concepts', desc:'The four-forces model (thrust, lift, weight, drag) and pitch/roll/yaw control principles used throughout the Learning System and Simulator are standard, widely-taught aviation and multirotor fundamentals rather than a single external source.' },
  { title:'MDN Web Docs', type:'Web Platform Reference', desc:'Reference documentation for the HTML5/CSS3/JavaScript web platform features used throughout Dronova.', url:'https://developer.mozilla.org/' }
];
if(refContainer){
  var rhtml = '<div class="cardGrid">';
  REFERENCES.forEach(function(r){
    rhtml += '<div class="infoCardSm">'+
      '<div class="icTop"><span class="icTitle">'+r.title+'</span></div>'+
      '<div class="glossaryFull">'+r.type+'</div>'+
      '<p>'+r.desc+'</p>'+
      (r.url ? '<a href="'+r.url+'" target="_blank" rel="noopener" class="glossaryLink" style="display:inline-block; margin-top:8px; text-decoration:none;">🔗 Visit</a>' : '')+
    '</div>';
  });
  rhtml += '</div>';
  refContainer.innerHTML = rhtml;
}

})();
