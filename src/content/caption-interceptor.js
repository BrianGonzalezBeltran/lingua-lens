/**
 * caption-interceptor.js — ISOLATED world
 * Receives full caption arrays from page-script, syncs by timestamp.
 */
(function () {
  'use strict';
  const PREFIX = 'LINGUA_LENS';

  window.__linguaLens = window.__linguaLens || {
    tracks: [],
    config: { targetLang: null, nativeLang: null },
    ready: false,
    listeners: [],
    currentCaption: { target: '', native: '', time: 0 },
    _hoverPaused: false,
    _frozen: false,
    targetCaptions: [],
    nativeCaptions: [],
  };
  const state = window.__linguaLens;

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('src/content/page-script.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  function findAt(caps, ms) {
    let lo = 0, hi = caps.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1, c = caps[mid];
      if (ms < c.startMs) hi = mid - 1;
      else if (ms > c.endMs) lo = mid + 1;
      else return c;
    }
    return null;
  }

  let syncRaf = null;
  let lastTargetText = '', lastNativeText = '';

  function startSync() {
    stopSync();
    const video = document.querySelector('video.html5-main-video');
    if (!video) return;

    function sync() {
      // Don't update captions while frozen (hover-pause)
      if (!state._frozen) {
        const ms = video.currentTime * 1000;
        const tc = findAt(state.targetCaptions, ms);
        const nc = findAt(state.nativeCaptions, ms);
        const targetText = tc?.text || '';
        const nativeText = nc?.text || '';

        if (targetText !== lastTargetText || nativeText !== lastNativeText) {
          lastTargetText = targetText;
          lastNativeText = nativeText;
          state.currentCaption = { target: targetText, native: nativeText, time: video.currentTime, targetCaption: tc };

          state.listeners.forEach(fn => fn({
            type: 'CAPTION_TEXT',
            target: targetText,
            native: nativeText,
            targetCaption: tc,
            time: video.currentTime,
          }));

          if (targetText) {
            chrome.runtime.sendMessage({
              type: 'CAPTION_FOR_PANEL',
              target: targetText,
              native: nativeText,
              time: video.currentTime,
            });
          }
        }
      }
      syncRaf = requestAnimationFrame(sync);
    }
    syncRaf = requestAnimationFrame(sync);
  }

  function stopSync() {
    if (syncRaf) { cancelAnimationFrame(syncRaf); syncRaf = null; }
    lastTargetText = lastNativeText = '';
  }

  let pageScriptReady = false;
  let pendingActivation = null;

  function activateDual(targetLang, nativeLang) {
    state.config = { targetLang, nativeLang };
    console.log(`[LL] Activating: target=${targetLang}, native=${nativeLang}`);

    if (pageScriptReady) {
      window.postMessage({ type: `${PREFIX}_ACTIVATE`, targetLang, nativeLang }, '*');
    } else {
      pendingActivation = { targetLang, nativeLang };
      console.log('[LL] Queued activation — waiting for page-script');
    }
    return Promise.resolve();
  }

  state.activateDual = activateDual;
  state.onUpdate = fn => state.listeners.push(fn);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;

    if (ev.data?.type === `${PREFIX}_TRACKS_AVAILABLE`) {
      state.tracks = ev.data.tracks;
      pageScriptReady = true;
      console.log('[LL] Tracks:', state.tracks.map(t => `${t.languageName} (${t.languageCode})`));
      chrome.runtime.sendMessage({ type: 'TRACKS_AVAILABLE', tracks: state.tracks });

      if (pendingActivation) {
        console.log('[LL] Firing queued activation');
        window.postMessage({ type: `${PREFIX}_ACTIVATE`, ...pendingActivation }, '*');
        pendingActivation = null;
      } else {
        chrome.storage.sync.get(['targetLang', 'nativeLang'], c => {
          if (c.targetLang && c.nativeLang) activateDual(c.targetLang, c.nativeLang);
        });
      }
    }

    if (ev.data?.type === `${PREFIX}_ALL_CAPTIONS`) {
      state.targetCaptions = ev.data.target;
      state.nativeCaptions = ev.data.native;
      state.ready = true;
      console.log(`[LL] Ready: ${ev.data.target.length} target + ${ev.data.native.length} native`);

      state.listeners.forEach(fn => fn({ type: 'CAPTIONS_ACTIVATED' }));
      startSync();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === 'ACTIVATE_DUAL') {
      activateDual(msg.targetLang, msg.nativeLang).then(() => respond({ success: true })).catch(e => respond({ success: false, error: e.message }));
      return true;
    }
    if (msg.type === 'GET_TRACKS') respond({ tracks: state.tracks });
    if (msg.type === 'GET_STATE') respond({ tracks: state.tracks, config: state.config, ready: state.ready });
    if (msg.type === 'SEEK_TO') {
      const v = document.querySelector('video.html5-main-video');
      if (v) v.currentTime = msg.timeMs / 1000;
    }
    if (msg.type === 'PLAY_SEGMENT') {
      const v = document.querySelector('video.html5-main-video');
      if (v && msg.startMs != null && msg.endMs != null) {
        state._frozen = true;
        v.currentTime = msg.startMs / 1000;
        v.play();
        const checkEnd = () => {
          if (v.currentTime * 1000 >= msg.endMs) {
            v.pause();
            state._frozen = false;
            v.removeEventListener('timeupdate', checkEnd);
          }
        };
        v.addEventListener('timeupdate', checkEnd);
        respond({ success: true });
      } else {
        respond({ success: false, error: 'No timestamps' });
      }
      return true;
    }
  });
})();
