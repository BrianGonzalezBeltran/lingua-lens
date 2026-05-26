/**
 * dual-subtitles.js
 */
(function () {
  'use strict';
  const state = window.__linguaLens;
  let container, targetLine, nativeLine;
  let visible = true, lastTarget = '', lastNative = '';
  let nativeRevealed = false;
  let currentTargetCaption = null;

  function getVideo() { return document.querySelector('video.html5-main-video'); }
  function isPopupOpen() { return !document.getElementById('ll-word-popup')?.classList.contains('ll-popup-hidden'); }

  function create() {
    document.getElementById('ll-dual-subs')?.remove();
    container = document.createElement('div');
    container.id = 'll-dual-subs';
    container.innerHTML = `
      <div class="ll-sub-line ll-sub-target" id="ll-sub-target">
        <button class="ll-sub-action-btn ll-sub-repeat" id="ll-sub-repeat" title="Repetir frase">▶</button>
        <span class="ll-sub-text" id="ll-sub-target-text"></span>
        <span class="ll-sub-actions">
          <button class="ll-sub-action-btn" id="ll-sub-save-phrase" title="Guardar frase">⭐</button>
        </span>
      </div>
      <div class="ll-sub-line ll-sub-native ll-native-blur" id="ll-sub-native">&nbsp;</div>`;
    targetLine = container.querySelector('#ll-sub-target');
    nativeLine = container.querySelector('#ll-sub-native');
    document.querySelector('#movie_player')?.appendChild(container);

    let hoverActive = false;
    let pauseTimer = null;

    function schedulePauseAtEnd() {
      if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
      const cap = currentTargetCaption;
      const v = getVideo();
      if (!cap || !v || v.paused) return;
      const now = v.currentTime * 1000;
      const remaining = cap.endMs - now;
      if (remaining <= 50) {
        v.pause();
        state._hoverPaused = true;
      } else {
        pauseTimer = setTimeout(() => {
          if (hoverActive) {
            const v2 = getVideo();
            if (v2 && !v2.paused) { v2.pause(); state._hoverPaused = true; }
          }
        }, remaining);
      }
    }

    container.querySelector('#ll-sub-repeat').addEventListener('click', (e) => {
      e.stopPropagation();
      const cap = currentTargetCaption;
      const v = getVideo();
      if (cap && v) {
        state._frozen = false;
        state._hoverPaused = false;
        v.currentTime = cap.startMs / 1000;
        v.play();
        if (hoverActive) {
          // Re-freeze immediately, schedule pause at end
          state._frozen = true;
          setTimeout(() => schedulePauseAtEnd(), 50);
        }
      }
    });

    container.querySelector('#ll-sub-save-phrase').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target;
      const text = container.querySelector('#ll-sub-target-text').textContent;
      if (!text) return;
      chrome.runtime.sendMessage({
        type: 'SAVE_WORD', word: text,
        translation: state.currentCaption?.native || '',
        context: '', targetLang: state.config.targetLang, timestamp: Date.now(),
        startMs: state.currentCaption?.targetCaption?.startMs || null,
        endMs: state.currentCaption?.targetCaption?.endMs || null,
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
      hoverActive = true;
      // Freeze rendering IMMEDIATELY so subs stay as they are
      state._frozen = true;

      const v = getVideo();
      if (!v || v.paused) return;
      schedulePauseAtEnd();
    });

    targetLine.addEventListener('mouseleave', () => {
      hoverActive = false;
      if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
      if (isPopupOpen()) return;
      const shouldResume = state._hoverPaused;
      state._hoverPaused = false;
      state._frozen = false;
      if (shouldResume) {
        const v = getVideo();
        if (v) v.play();
      }
    });

    nativeLine.addEventListener('mouseenter', () => { nativeRevealed = true; nativeLine.classList.remove('ll-native-blur'); });
  }

  function renderTarget(text, caption) {
    if (state._frozen) return;
    if (text === lastTarget) return;
    lastTarget = text;
    currentTargetCaption = caption;
    const textEl = container.querySelector('#ll-sub-target-text');
    if (!text) { textEl.innerHTML = ''; nativeLine.innerHTML = '&nbsp;'; nativeLine.classList.add('ll-native-blur'); lastNative = ''; nativeRevealed = false; return; }
    textEl.innerHTML = text.split(/(\s+)/).map(w =>
      w.trim() ? `<span class="ll-word" data-word="${w.trim()}">${w}</span>` : w
    ).join('');
    const btn = container.querySelector('#ll-sub-save-phrase');
    btn.textContent = '⭐'; btn.classList.remove('ll-saved');
  }

  function renderNative(text) {
    if (state._frozen) return;
    if (text === lastNative) return;
    lastNative = text;
    nativeRevealed = false;
    nativeLine.classList.add('ll-native-blur');
    nativeLine.textContent = text || '';
    if (!text) nativeLine.innerHTML = '&nbsp;';
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

  function cleanup() { document.getElementById('ll-dual-subs')?.remove(); restoreYT(); lastTarget = lastNative = ''; }

  state.onUpdate(ev => {
    if (ev.type === 'CAPTIONS_ACTIVATED') { create(); hideYT(); console.log('[LL] Dual subtitles active'); }
    if (ev.type === 'CAPTION_TEXT' && visible) {
      renderTarget(ev.target, ev.targetCaption || null);
      renderNative(ev.native);
    }
  });

  state.toggleSubtitles = toggle;
  state.cleanupSubtitles = cleanup;
  chrome.runtime.onMessage.addListener(msg => { if (msg.type === 'TOGGLE_SUBS') toggle(msg.visible); });
})();
