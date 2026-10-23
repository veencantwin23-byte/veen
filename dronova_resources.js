(function(){
  "use strict";

  var glossaryContainer = document.getElementById('glossaryContent');
  if (!glossaryContainer) return;

  var glossary = window.DRONOVA_GLOSSARY || [];
  glossaryContainer.innerHTML = glossary.map(function(item){
    return '<div class="infoCardSm"><div class="icTop"><span class="icTitle">' + item.term + '</span></div><p>' + item.def + '</p></div>';
  }).join('');
})();
