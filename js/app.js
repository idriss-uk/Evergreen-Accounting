(() => {
  'use strict';

  const APP_NAME = 'Evergreen Accounting';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
        console.info(APP_NAME + ': service worker registered');
      } catch (error) {
        console.warn(APP_NAME + ': service worker registration failed', error);
      }
    });
  }

  let deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.documentElement.dataset.pwaInstallReady = 'true';
    window.dispatchEvent(new CustomEvent('evergreen:install-ready'));
  });

  window.installEvergreenApp = async function installEvergreenApp() {
    if (!deferredInstallPrompt) {
      return { available: false, outcome: 'unavailable' };
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    delete document.documentElement.dataset.pwaInstallReady;

    return {
      available: true,
      outcome: choice.outcome
    };
  };

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    delete document.documentElement.dataset.pwaInstallReady;
    console.info(APP_NAME + ': installed');
  });
})();
