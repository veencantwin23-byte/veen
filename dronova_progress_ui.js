(function(){
  "use strict";

  var container = document.getElementById('progressContent');
  if (!container || !window.DronovaProgress) return;

  function render() {
    var snapshot = window.DronovaProgress.getSnapshot();
    container.innerHTML = '<div class="progOverview"><h3>Progress</h3><p>' + snapshot.overallPct + '% overall</p></div>';
  }

  window.DronovaProgress.refreshUI = render;
  render();
})();
