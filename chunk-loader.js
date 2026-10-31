/* REPU page bootstrap.
 *
 * Two jobs:
 *   1. Hold the Unity player back until the chunk-streaming service worker
 *      controls this page, otherwise the very first request for the split
 *      payload would hit the network and 404.
 *   2. Keep the canvas matched to the browser tab when the window is resized.
 *      Unity only measures the canvas once at startup, so a resized window
 *      would otherwise leave the render target at the old size.
 */
(function () {
  'use strict';

  var booted = false;
  var instance = null;

  function banner(message) {
    console.error('[repu] ' + message);
    var host = document.querySelector('#unity-warning');
    if (!host) {
      return;
    }
    var line = document.createElement('div');
    line.textContent = message;
    line.style.cssText =
      'background:#7f1d1d;color:#fff;padding:10px 14px;font:14px/1.4 system-ui,sans-serif;';
    host.appendChild(line);
    host.style.display = 'block';
  }

  function resizeCanvas() {
    if (!instance) {
      return;
    }
    var canvas = document.querySelector('#unity-canvas');
    if (!canvas) {
      return;
    }
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) {
      return;
    }
    try {
      // Third argument keeps the element's CSS size alone; the stylesheet
      // owns that, we only resize the drawing buffer.
      instance.Module.setCanvasSize(w, h, true);
    } catch (err) {
      console.warn('[repu] resize failed:', err);
    }
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }

  window.repuOnInstanceReady = function (unityInstance) {
    instance = unityInstance;
    window.__repuInstance = unityInstance;
    var pending = null;
    window.addEventListener('resize', function () {
      clearTimeout(pending);
      pending = setTimeout(resizeCanvas, 120);
    });
    window.addEventListener('orientationchange', function () {
      clearTimeout(pending);
      pending = setTimeout(resizeCanvas, 300);
    });
    resizeCanvas();
  };

  window.repuStartPlayer = function (boot) {
    if (booted) {
      return;
    }
    booted = true;

    if (!('serviceWorker' in navigator)) {
      banner('This browser has no service worker support, so the split game data cannot be loaded.');
      boot();
      return;
    }
    if (!window.isSecureContext) {
      banner('Split game data needs http://localhost or https. Start "Play REPU.bat" and use the localhost address.');
      boot();
      return;
    }

    navigator.serviceWorker
      .register('sw.js', { scope: './' })
      .then(function () {
        return navigator.serviceWorker.ready;
      })
      .then(function () {
        if (navigator.serviceWorker.controller) {
          boot();
          return undefined;
        }
        // A brand new worker claims this page via clients.claim(); give it a
        // moment and start anyway rather than hanging on a page load forever.
        return new Promise(function (resolve) {
          var settled = false;
          function finish() {
            if (settled) {
              return;
            }
            settled = true;
            boot();
            resolve();
          }
          navigator.serviceWorker.addEventListener('controllerchange', finish);
          setTimeout(finish, 3000);
        });
      })
      .catch(function (err) {
        banner('Could not start the chunk loader (' + err.message + '). Serve this folder over http://localhost or https.');
        boot();
      });
  };
})();
