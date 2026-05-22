/**
 * dual-subtitles.js
 */
(function () {
  'use strict';
  const state = window.__linguaLens;
  let container, targetLine, nativeLine;
  let visible = true, lastTarget = '', lastNative = '';
  let nativeRevealed = false;

  function getVideo() { return document.querySelector('video.html5-main-video'); }

  function isPopupOpen() {
    return !document.getElementById('ll-word-popup')?.classList.contains('ll-popup-hidden');
  }

  function create() {
    document.getElementById('ll-dual-subs')?.remove();
    container = document.createElement('div');
    container.id = 'll-dual-subs';
    container.innerHTML = `
      <div class="ll-sub-line ll-sub-target" id="ll-sub-target">
        <span class="ll-sub-text" id="ll-sub-target-text"></span>
        <span class="ll-sub-actions">
          <button class="ll-sub-action-btn" id="ll-sub-save-phrase" title="Guardar frase">⭐</button>
        </span>
      </div>
      <div class="ll-sub-line ll-sub-native ll-native-blur" id="ll-sub-native">&nbsp;</div>`;
    targetLine = container.querySelector('#ll-sub-target');
    nativeLine = container.querySelector('#ll-sub-native');
    document.querySelector('#movie_player')?.appendChild(container);

    container.querySelector('#ll-sub-save-phrase').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target;
      const text = container.querySelector('#ll-sub-target-text').textContent;
      if (!text) return;
      chrome.runtime.sendMessage({
        type: 'SAVE_WORD',
        word: text,
        translation: state.currentCaption?.native || '',
        context: '',
        targetLang: state.config.targetLang,
        timestamp: Date.now(),
      }, res => {
        if (res?.success) {
          btn.textContent = res.duplicate ? '⚠' : '✅';
          btn.classList.add('ll-saved');
          setTimeout(() => { btn.textContent = '⭐'; btn.classList.remove('ll-saved'); }, 1500);
        }
      });
    });

    targetLine.addEventListener('mouseenter', () => {
      if (isPopupOpen()) return;
      const v = getVideo();
      if (v && !v.paused) {
        state._hoverPaused = true;
        v.pause();
      } else {
        state._hoverPaused = false;
      }
    });
    targetLine.addEventListener('mouseleave', () => {
      if (isPopupOpen()) return;
      if (state._hoverPaused) {
        const v = getVideo();
        if (v) v.play();
        state._hoverPaused = false;
      }
    });

    nativeLine.addEventListener('mouseenter', () => {
      nativeRevealed = true;
      nativeLine.classList.remove('ll-native-blur');
    });
  }

  function renderTarget(text) {
    if (text === lastTarget) return;
    lastTarget = text;
    const textEl = container.querySelector('#ll-sub-target-text');
    if (!text) { textEl.innerHTML = ''; nativeLine.innerHTML = '&nbsp;'; nativeLine.classList.add('ll-native-blur'); lastNative = ''; nativeRevealed = false; return; }
    textEl.innerHTML = text.split(/(\s+)/).map(w =>
      w.trim() ? `<span class="ll-word" data-word="${w.trim()}">${w}</span>` : w
    ).join('');
    const btn = container.querySelector('#ll-sub-save-phrase');
    btn.textContent = '⭐'; btn.classList.remove('ll-saved');
    nativeRevealed = false;
    nativeLine.classList.add('ll-native-blur');
    lastNative = '';
    nativeLine.innerHTML = '&nbsp;';
  }

  function renderNative(text) {
    if (!text || text === lastNative) return;
    lastNative = text;
    if (!nativeRevealed) nativeLine.classList.add('ll-native-blur');
    nativeLine.textContent = text;
  }

  function hideYT() {
    if (!document.getElementById('ll-hide-yt-captions')) {
      const s = document.createElement('style');
      s.id = 'll-hide-yt-captions';
      s.textContent = '.ytp-caption-window-container { color: transparent !important; -webkit-text-fill-color: transparent !important; } .ytp-caption-window-container * { color: transparent !important; -webkit-text-fill-color: transparent !important; background: transparent !important; text-shadow: none !important; }';
      document.head.appendChild(s);
    }
  }

  function restoreYT() { document.getElementById('ll-hide-yt-captions')?.remove(); }

  function toggle(show) {
    visible = show !== undefined ? show : !visible;
    if (container) container.style.display = visible ? 'flex' : 'none';
    visible ? hideYT() : restoreYT();
  }

  function cleanup() {
    document.getElementById('ll-dual-subs')?.remove();
    restoreYT();
    lastTarget = lastNative = '';
  }

  function init() {
    create();
    hideYT();
    console.log('[LL] Dual subtitles active');
  }

  state.onUpdate(ev => {
    if (ev.type === 'CAPTIONS_ACTIVATED') init();
    if (ev.type === 'CAPTION_TEXT' && visible) {
      renderTarget(ev.target);
      renderNative(ev.native);
    }
  });

  state.toggleSubtitles = toggle;
  state.cleanupSubtitles = cleanup;
  chrome.runtime.onMessage.addListener(msg => { if (msg.type === 'TOGGLE_SUBS') toggle(msg.visible); });
})();
