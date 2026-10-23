(function(){
  "use strict";

  const viewerFrame = document.getElementById('droneViewerFrame');
  const messageTarget = viewerFrame && viewerFrame.contentWindow ? viewerFrame.contentWindow : null;

  function sendCommand(cmd, payload) {
    if (!messageTarget) return;
    messageTarget.postMessage({ type: 'DRONOVA_CMD', cmd, ...payload }, '*');
  }

  window.dronovaSendViewerCommand = sendCommand;

  const toggleButton = document.getElementById('toggleExploded');
  const resetButton = document.getElementById('resetView');

  toggleButton && toggleButton.addEventListener('click', function () {
    sendCommand('toggleExplode');
  });

  resetButton && resetButton.addEventListener('click', function () {
    sendCommand('reset');
  });
})();
