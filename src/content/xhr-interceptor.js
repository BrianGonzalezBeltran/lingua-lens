/**
 * xhr-interceptor.js — MAIN world, document_start
 * Patches XMLHttpRequest.prototype.open to capture pot tokens
 * from YouTube's timedtext requests. Exactly like Language Reactor.
 */
(function () {
  'use strict';

  window.__llPotStore = {};

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === 'string' && url.includes('/timedtext?')) {
      try {
        const params = new URLSearchParams(url.split('?')[1]);
        const pot = params.get('pot');
        const v = params.get('v');
        if (pot && v) {
          window.__llPotStore[v] = pot;
          console.log(`[LL:XHR] Captured pot for ${v}: ${pot.substring(0, 30)}...`);
        }
      } catch (e) {}
    }
    return origOpen.call(this, method, url, ...rest);
  };

  console.log('[LL:XHR] Pot interceptor installed at document_start');
})();
