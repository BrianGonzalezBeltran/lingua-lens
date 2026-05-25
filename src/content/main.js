/**
 * main.js — Orchestrator
 * YouTube SPA navigation + keyboard shortcuts.
 */
(function () {
  'use strict';
  const state = window.__linguaLens;
  let curVid = null;
  console.log('[LL] Extension loaded');

  const vid = () => new URLSearchParams(location.search).get('v');

  function findCurrentCaption() {
    const v = document.querySelector('video.html5-main-video');
    if (!v || !state.targetCaptions?.length) return null;
    const ms = v.currentTime * 1000;
    let lo = 0, hi = state.targetCaptions.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1, c = state.targetCaptions[mid];
      if (ms < c.startMs) hi = mid - 1;
      else if (ms > c.endMs) lo = mid + 1;
      else return c;
    }
    return null;
  }

  function onNav() {
    const id = vid();
    if (id && id !== curVid) {
      curVid = id;
      console.log(`[LL] Video: ${curVid}`);
      state.targetCaptions = [];
      state.nativeCaptions = [];
      state.ready = false;
      state.cleanupSubtitles?.();
    }
  }

  let last = location.href;
  new MutationObserver(() => { if (location.href !== last) { last = location.href; onNav(); } })
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', onNav);

  document.addEventListener('keydown', e => {
    if (!state.ready) return;
    // Don't trigger shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    if (e.altKey && e.code === 'KeyS') {
      e.preventDefault();
      state.toggleSubtitles?.();
    }

    if (e.altKey && e.code === 'KeyR') {
      e.preventDefault();
      const cap = findCurrentCaption();
      const v = document.querySelector('video.html5-main-video');
      if (cap && v) {
        v.currentTime = cap.startMs / 1000;
        if (v.paused) v.play();
      }
    }
  });

  if (location.pathname === '/watch') curVid = vid();
})();
