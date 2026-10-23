(function(){
  "use strict";

  var COMPONENTS = window.DRONOVA_COMPONENTS || [];
  var MODULES = (window.DRONOVA_MODULES && window.DRONOVA_MODULES.modules) || [];

  function getModule(id) {
    return MODULES.filter(function(m){ return m.id === id; })[0];
  }

  function renderDashboard() {
    var grid = document.getElementById('dashboardGrid');
    if (!grid) return;

    grid.innerHTML = '';
    MODULES.forEach(function(module) {
      var card = document.createElement('div');
      card.className = 'dashCard';
      card.innerHTML = '<div class="dcTitle">' + (module.title || 'Module') + '</div>';
      card.addEventListener('click', function(){
        if (window.dronovaGoToPage) window.dronovaGoToPage(module.page || 'home');
      });
      grid.appendChild(card);
    });
  }

  function renderIntro() {
    var container = document.getElementById('introContent');
    var module = getModule('intro');
    if (!container || !module) return;
    container.innerHTML = '<div class="lessonBlock"><h4>' + module.title + '</h4><p>' + (module.summary || '') + '</p></div>';
  }

  function renderTypes() {
    var container = document.getElementById('typesContent');
    var module = getModule('types');
    if (!container || !module) return;
    container.innerHTML = '<div class="lessonBlock"><h4>' + module.title + '</h4><p>' + (module.summary || '') + '</p></div>';
  }

  function renderArchitecture() {
    var container = document.getElementById('architectureContent');
    var module = getModule('architecture');
    if (!container || !module) return;
    container.innerHTML = '<div class="lessonBlock"><h4>' + module.title + '</h4><p>' + (module.summary || '') + '</p></div>';
  }

  function renderMechanics() {
    var container = document.getElementById('mechanicsContent');
    var module = getModule('mechanics');
    if (!container || !module) return;
    container.innerHTML = '<div class="lessonBlock"><h4>' + module.title + '</h4><p>' + (module.summary || '') + '</p></div>';
  }

  function renderApplications() {
    var container = document.getElementById('applicationsContent');
    var module = getModule('applications');
    if (!container || !module) return;
    container.innerHTML = '<div class="lessonBlock"><h4>' + module.title + '</h4><p>' + (module.summary || '') + '</p></div>';
  }

  function renderComponents() {
    var container = document.getElementById('componentsContent');
    if (!container) return;
    container.innerHTML = COMPONENTS.map(function(c){
      return '<div class="compCard"><div class="ccHead"><span class="ccIcon">' + c.icon + '</span><span class="ccName">' + c.name + '</span></div>' +
        '<div class="ccBody"><p>' + (c.function || '') + '</p></div></div>';
    }).join('');
  }

  window.dronovaGoToPage = function(targetPage) {
    if (!targetPage) return;
    var panels = document.querySelectorAll('[data-page-panel]');
    panels.forEach(function(panel){
      panel.classList.toggle('active', panel.dataset.pagePanel === targetPage);
    });
    var tabs = document.querySelectorAll('.page-tab');
    tabs.forEach(function(tab){
      tab.classList.toggle('active', tab.dataset.page === targetPage);
    });
  };

  renderDashboard();
  renderIntro();
  renderTypes();
  renderArchitecture();
  renderMechanics();
  renderApplications();
  renderComponents();
})();
