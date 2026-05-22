/**
 * caption-interceptor.js — ISOLATED world
 * Inyecta page-script.js en MAIN world, recibe captions del DOM vía postMessage.
 * Para el idioma nativo usa Groq traducción por frase.
 */
(function () {
  'use strict';
  const PREFIX = 'LINGUA_LENS';

  window.__linguaLens = window.__linguaLens || {
    tracks: [],
    activeCaptions: { target: [], native: [] },
    config: { targetLang: null, nativeLang: null },
    ready: false,
    listeners: [],
    currentCaption: { target: '', native: '', time: 0 },
    translationCache: {},
  };
  const state = window.__linguaLens;

  // Inject page-script into MAIN world
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('src/content/page-script.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  async function translateSentence(text, targetLang, nativeLang) {
    const cacheKey = `${targetLang}:${nativeLang}:${text}`;
    if (state.translationCache[cacheKey]) return state.translationCache[cacheKey];

    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'TRANSLATE_SENTENCE',
        text, targetLang, nativeLang,
      }, res => {
        const translation = res?.translation || '';
        state.translationCache[cacheKey] = translation;
        resolve(translation);
      });
    });
  }

  function activateDual(targetLang, nativeLang) {
    state.config = { targetLang, nativeLang };
    state.ready = true;
    state.translationCache = {};
    console.log(`[LL] Activating: target=${targetLang}, native=${nativeLang}`);
    window.postMessage({ type: `${PREFIX}_SET_TRACK`, lang: targetLang }, '*');
    state.listeners.forEach(fn => fn({ type: 'CAPTIONS_ACTIVATED' }));
    return Promise.resolve();
  }

  state.activateDual = activateDual;
  state.onUpdate = fn => state.listeners.push(fn);

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;

    if (ev.data?.type === `${PREFIX}_TRACKS_AVAILABLE`) {
      state.tracks = ev.data.tracks;
      console.log('[LL] Tracks:', state.tracks.map(t => `${t.languageName} (${t.languageCode})`));
      chrome.runtime.sendMessage({ type: 'TRACKS_AVAILABLE', tracks: state.tracks });
      chrome.storage.sync.get(['targetLang', 'nativeLang'], c => {
        if (c.targetLang && c.nativeLang) activateDual(c.targetLang, c.nativeLang);
      });
    }

    if (ev.data?.type === `${PREFIX}_CAPTION_UPDATE`) {
      const targetText = ev.data.text;
      state.currentCaption.target = targetText;
      state.currentCaption.time = ev.data.time;

      // Notify dual-subtitles immediately with target text
      state.listeners.forEach(fn => fn({
        type: 'CAPTION_TEXT',
        target: targetText,
        native: '',
        time: ev.data.time,
      }));

      // Translate to native language asynchronously
      if (targetText && state.config.nativeLang) {
        const native = await translateSentence(
          targetText, state.config.targetLang, state.config.nativeLang
        );
        state.currentCaption.native = native;
        state.listeners.forEach(fn => fn({
          type: 'CAPTION_TEXT',
          target: targetText,
          native,
          time: ev.data.time,
        }));

        // Send to sidepanel via background
        chrome.runtime.sendMessage({
          type: 'CAPTION_FOR_PANEL',
          target: targetText,
          native,
          time: ev.data.time,
        });
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === 'ACTIVATE_DUAL') {
      activateDual(msg.targetLang, msg.nativeLang).then(() => respond({ success: true })).catch(e => respond({ success: false, error: e.message }));
      return true;
    }
    if (msg.type === 'GET_TRACKS') respond({ tracks: state.tracks });
    if (msg.type === 'GET_STATE') respond({
      tracks: state.tracks, config: state.config, ready: state.ready,
      targetCount: state.activeCaptions.target.length,
      nativeCount: state.activeCaptions.native.length,
    });
    if (msg.type === 'SEEK_TO') {
      const v = document.querySelector('video.html5-main-video');
      if (v) v.currentTime = msg.timeMs / 1000;
    }
  });
})();
