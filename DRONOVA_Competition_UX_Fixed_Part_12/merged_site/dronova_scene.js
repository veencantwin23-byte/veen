console.log('dronova scene initialized');

/* ============================================================
   3D VIEWER BRIDGE
   The old procedural drone / Sketchfab embed has been replaced
   by the interactive exploded-view drone in ./drone-viewer/.
   That viewer runs inside its own iframe (droneViewerFrame) with
   its own Three.js instance, so we only talk to it via
   postMessage — no THREE.js needed on this page anymore.
============================================================ */
const droneViewerFrame = document.getElementById('droneViewerFrame');

/* ============================================================
   3D LAB ERROR STATE (Phase 6)
   Iframes rarely fire a real 'error' event for content-load
   failures, so this also uses a load-timeout as a practical
   safety net — if the viewer hasn't reported ready within a
   generous window, something's wrong and the user shouldn't be
   left staring at a blank panel.
============================================================ */
(function setupViewerErrorHandling(){
  const errorEl = document.getElementById('viewerErrorState');
  const retryBtn = document.getElementById('viewerRetryBtn');
  if(!droneViewerFrame || !errorEl) return;
  let loaded = false;
  let timeoutId = setTimeout(function(){
    if(!loaded) window.dronovaShowViewerError();
  }, 15000);
  droneViewerFrame.addEventListener('load', function(){
    loaded = true;
    clearTimeout(timeoutId);
    errorEl.style.display = 'none';
  });
  window.dronovaShowViewerError = function(){
    errorEl.style.display = 'flex';
  };
  retryBtn && retryBtn.addEventListener('click', function(){
    loaded = false;
    errorEl.style.display = 'none';
    clearTimeout(timeoutId);
    timeoutId = setTimeout(function(){ if(!loaded) window.dronovaShowViewerError(); }, 15000);
    droneViewerFrame.src = droneViewerFrame.src; // reload
  });
})();
const toggleExploded = document.getElementById('toggleExploded');
const resetViewButton = document.getElementById('resetView');

function sendViewerCommand(cmd, extra) {
  if (droneViewerFrame && droneViewerFrame.contentWindow) {
    const payload = Object.assign({ type: 'DRONOVA_CMD', cmd }, extra || {});
    droneViewerFrame.contentWindow.postMessage(payload, '*');
  }
}
window.dronovaSendViewerCommand = sendViewerCommand; // exposed for dronova_learn.js

let explodedState = false;

toggleExploded?.addEventListener('click', () => {
  explodedState = !explodedState;
  toggleExploded.classList.toggle('active', explodedState);
  sendViewerCommand('toggleExplode');
});

resetViewButton?.addEventListener('click', () => {
  explodedState = false;
  toggleExploded?.classList.remove('active');
  sendViewerCommand('reset');
});


/* ============================================================
   FULL-SCREEN 3D EXPLORER
   The dedicated 3D Lab page can launch the existing viewer iframe
   directly into browser full screen. Fullscreen is requested on the
   iframe itself so the exact same viewer, model and controls are used
   rather than creating a second copy of the Three.js scene.
============================================================ */
function openViewerFullscreen() {
  if (!droneViewerFrame) return;

  const request = droneViewerFrame.requestFullscreen ||
                  droneViewerFrame.webkitRequestFullscreen ||
                  droneViewerFrame.msRequestFullscreen;

  if (request) {
    const result = request.call(droneViewerFrame);
    if (result && typeof result.catch === 'function') {
      result.catch((err) => console.warn('Unable to enter 3D viewer fullscreen:', err));
    }

    // Let the iframe receive its new viewport dimensions, then ask the
    // internal camera to re-fit the complete drone without changing the
    // current explode state.
    window.setTimeout(() => sendViewerCommand('fitView'), 250);
  }
}

document.querySelectorAll('[data-viewer-fullscreen]').forEach((button) => {
  button.addEventListener('click', openViewerFullscreen);
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === droneViewerFrame) {
    window.setTimeout(() => sendViewerCommand('fitView'), 180);
  }
});
document.addEventListener('webkitfullscreenchange', () => {
  if (document.webkitFullscreenElement === droneViewerFrame) {
    window.setTimeout(() => sendViewerCommand('fitView'), 180);
  }
});

/* ============================================================
   CLEAN HOMEPAGE ENTRY
   DRONOVA previously honoured URL hashes such as #mechanics, which
   could make a fresh visit appear to open directly on Flight content.
   A normal site entry now always starts at the top-level Home view.
============================================================ */
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
} catch (err) {
  console.warn('Could not normalize DRONOVA start URL:', err);
}
window.addEventListener('load', () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
});

/* ============================================================
   PAGE TAB NAVIGATION
============================================================ */
const pageTabs = Array.from(document.querySelectorAll('.page-tab'));
const pagePanels = Array.from(document.querySelectorAll('[data-page-panel]'));

function goToPage(targetPage) {
  if (!targetPage) return;

  let targetPanel = null;

  pageTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.page === targetPage);
  });

  pagePanels.forEach((panel) => {
    const isTarget = panel.dataset.pagePanel === targetPage;
    panel.classList.toggle('active', isTarget);
    if (isTarget) targetPanel = panel;
  });

  /* ============================================================
     COMPETITION UX FIX
     The panels live below the hero area. Previously, navigation
     changed which panel was active but left the viewport where it
     was, so users often had to scroll manually to find the newly
     opened content. Every DRONOVA content-navigation route funnels
     through goToPage(), so scrolling the activated panel into view
     here fixes header tabs, hero actions, dashboard cards, learning
     path links, search results, quiz/progress links and footer links
     without touching simulator controls or other action buttons.
  ============================================================ */
  if (targetPanel) {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Wait one frame so the newly activated panel has completed its
    // display:none -> display:block layout change before scrolling.
    window.requestAnimationFrame(() => {
      targetPanel.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    });
  }
}
window.dronovaGoToPage = goToPage; // exposed for dronova_learn.js

pageTabs.forEach((tab) => {
  tab.addEventListener('click', () => goToPage(tab.dataset.page));
});

/* Use delegated handling so navigation buttons added later by the
   learning/dashboard renderers work too. Action buttons without a
   data-page-target attribute (quiz answers, simulator controls, etc.)
   are deliberately ignored. */
document.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('.page-action-btn[data-page-target]');
  if (!button) return;
  goToPage(button.dataset.pageTarget);
});

/* ============================================================
   AUTH MODAL (Login / Sign Up)
============================================================ */
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const authModal = document.getElementById('authModal');
const closeAuthModal = document.getElementById('closeAuthModal');
const authModalTitle = document.getElementById('authModalTitle');
const authModalSubtitle = document.getElementById('authModalSubtitle');
const submitAuth = document.getElementById('submitAuth');
const googleAuth = document.getElementById('googleAuth');
const microsoftAuth = document.getElementById('microsoftAuth');

function openAuthModal(mode) {
  if (!authModal) return;
  const isSignup = mode === 'signup';
  if (authModalTitle) authModalTitle.textContent = isSignup ? 'Create your DRONOVA account' : 'Login to DRONOVA';
  if (authModalSubtitle) {
    authModalSubtitle.textContent = isSignup
      ? 'Enter your email and choose a password to start your learning journey.'
      : 'Enter your username and password to sign in and continue your learning journey.';
  }
  if (submitAuth) submitAuth.textContent = isSignup ? 'Sign Up' : 'Login';
  authModal.classList.add('active');
}

function closeAuthModalFn() {
  authModal?.classList.remove('active');
}

loginBtn?.addEventListener('click', () => openAuthModal('login'));
signupBtn?.addEventListener('click', () => openAuthModal('signup'));
closeAuthModal?.addEventListener('click', closeAuthModalFn);

authModal?.addEventListener('click', (event) => {
  if (event.target === authModal) closeAuthModalFn();
});

submitAuth?.addEventListener('click', (event) => {
  event.preventDefault();
  closeAuthModalFn();
  alert('Login/sign-up functionality is not connected yet.');
});

googleAuth?.addEventListener('click', (event) => {
  event.preventDefault();
  closeAuthModalFn();
  alert('Google login integration placeholder.');
});

microsoftAuth?.addEventListener('click', (event) => {
  event.preventDefault();
  closeAuthModalFn();
  alert('Microsoft login integration placeholder.');
});
