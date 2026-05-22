/**
 * main.js — Orquestador
 * Navegación SPA de YouTube + keyboard shortcuts.
 */
(function () {
  'use strict';
  const state = window.__linguaLens;
  let curVid = null;
  console.log('[LL] Extension loaded');

  const vid = () => new URLSearchParams(location.search).get('v');

  function onNav() {
    const id = vid();
    if (id && id !== curVid) {
      curVid = id;
      console.log(`[LL] Video: ${curVid}`);
      state.activeCaptions = { target: [], native: [] };
      state.ready = false;
      state.cleanupSubtitles?.();
    }
  }

  let last = location.href;
  new MutationObserver(() => { if (location.href !== last) { last = location.href; onNav(); } })
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', onNav);

  document.addEventListener('keydown', e => {
    if (!curVid) return;
    if (e.altKey && e.key === 's') { e.preventDefault(); state.toggleSubtitles?.(); }
    if (e.altKey && e.key === 'r') {
      e.preventDefault();
      const v = document.querySelector('video.html5-main-video');
      if (!v || !state.activeCaptions.target.length) return;
      const ms = v.currentTime * 1000;
      const c = state.activeCaptions.target.find(c => ms >= c.startMs && ms <= c.endMs);
      if (c) v.currentTime = c.startMs / 1000;
    }
  });

  if (location.pathname === '/watch') curVid = vid();
})();
