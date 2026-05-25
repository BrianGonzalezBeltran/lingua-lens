/**
 * word-popup.js
 * Click on word → translation, AI explanation with examples, save to vocab.
 */
(function () {
  'use strict';
  const state = window.__linguaLens;
  let popup, curWord = '', curCtx = '';
  let popupPausedVideo = false;

  function getVideo() { return document.querySelector('video.html5-main-video'); }

  function create() {
    document.getElementById('ll-word-popup')?.remove();
    popup = document.createElement('div');
    popup.id = 'll-word-popup';
    popup.classList.add('ll-popup-hidden');
    popup.innerHTML = `
      <div class="ll-popup-header">
        <span class="ll-popup-word" id="ll-popup-word"></span>
        <button class="ll-popup-close" id="ll-popup-close">✕</button>
      </div>
      <div class="ll-popup-translation" id="ll-popup-translation"><span class="ll-popup-loading">Traduciendo...</span></div>
      <div class="ll-popup-context" id="ll-popup-context"></div>
      <div class="ll-popup-ai" id="ll-popup-ai" style="display:none">
        <div class="ll-popup-ai-content" id="ll-popup-ai-content"></div>
      </div>
      <div class="ll-popup-actions">
        <button class="ll-popup-btn ll-btn-ai" id="ll-btn-ai">🧠 Explicar</button>
        <button class="ll-popup-btn ll-btn-save" id="ll-btn-save">⭐ Palabra</button>
        <button class="ll-popup-btn ll-btn-save-phrase" id="ll-btn-save-phrase">📝 Frase</button>
      </div>`;
    document.body.appendChild(popup);
    popup.querySelector('#ll-popup-close').onclick = hide;
    popup.querySelector('#ll-btn-ai').onclick = aiExplain;
    popup.querySelector('#ll-btn-save').onclick = () => save(false);
    popup.querySelector('#ll-btn-save-phrase').onclick = () => save(true);
  }

  function show(word, ctx, el) {
    curWord = word; curCtx = ctx;
    const v = getVideo();
    if (v) {
      if (!v.paused) { v.pause(); popupPausedVideo = true; }
      else { popupPausedVideo = !!state._hoverPaused; }
    }

    popup.querySelector('#ll-popup-word').textContent = word;
    popup.querySelector('#ll-popup-translation').innerHTML = '<span class="ll-popup-loading">Traduciendo...</span>';
    popup.querySelector('#ll-popup-context').textContent = ctx;
    popup.querySelector('#ll-popup-ai').style.display = 'none';
    const btnWord = popup.querySelector('#ll-btn-save');
    btnWord.textContent = '⭐ Palabra'; btnWord.disabled = false;
    const btnPhrase = popup.querySelector('#ll-btn-save-phrase');
    btnPhrase.textContent = '📝 Frase'; btnPhrase.disabled = false;
    const r = el.getBoundingClientRect();
    let left = r.left + r.width/2 - 160, top = r.top - 280;
    if (top < 10) top = r.bottom + 10;
    left = Math.max(10, Math.min(left, innerWidth - 330));
    popup.style.left = left + 'px'; popup.style.top = top + 'px';
    popup.classList.remove('ll-popup-hidden');

    chrome.runtime.sendMessage({
      type: 'TRANSLATE_WORD', word, context: ctx,
      targetLang: state.config.targetLang, nativeLang: state.config.nativeLang,
    }, res => {
      popup.querySelector('#ll-popup-translation').textContent = res?.translation || '(no disponible)';
    });
  }

  function hide() {
    popup?.classList.add('ll-popup-hidden');
    if (popupPausedVideo) {
      const v = getVideo();
      if (v) v.play();
      popupPausedVideo = false;
      state._hoverPaused = false;
      state._frozen = false;
    }
  }

  function renderExplanation(data) {
    const sec = popup.querySelector('#ll-popup-ai');
    const con = popup.querySelector('#ll-popup-ai-content');
    sec.style.display = 'block';

    if (!data) {
      con.textContent = 'Configura tu API key en el popup (gratis en console.groq.com)';
      return;
    }

    let html = '';

    if (data.translation) {
      html += `<div class="ll-ai-translation"><strong>${data.translation}</strong></div>`;
    }
    if (data.grammar) {
      html += `<div class="ll-ai-grammar">${data.grammar}</div>`;
    }
    if (data.examples?.length) {
      html += '<div class="ll-ai-examples-label">Ejemplos:</div>';
      html += '<div class="ll-ai-examples">';
      data.examples.forEach(ex => {
        html += `<div class="ll-ai-example">
          <div class="ll-ai-example-sentence">${ex.sentence}</div>
          <div class="ll-ai-example-translation">${ex.translation}</div>
        </div>`;
      });
      html += '</div>';
    }
    if (data.tip) {
      html += `<div class="ll-ai-tip">💡 ${data.tip}</div>`;
    }

    con.innerHTML = html;
  }

  function aiExplain() {
    const sec = popup.querySelector('#ll-popup-ai');
    const con = popup.querySelector('#ll-popup-ai-content');
    sec.style.display = 'block';
    con.innerHTML = '<span class="ll-popup-loading">Pensando...</span>';
    chrome.runtime.sendMessage({
      type: 'AI_EXPLAIN', word: curWord, context: curCtx,
      targetLang: state.config.targetLang, nativeLang: state.config.nativeLang,
    }, res => {
      renderExplanation(res?.explanation);
    });
  }

  function save(isPhrase) {
    const wordToSave = isPhrase ? curCtx : curWord;
    const translation = isPhrase
      ? (state.currentCaption?.native || popup.querySelector('#ll-popup-translation').textContent)
      : popup.querySelector('#ll-popup-translation').textContent;

    chrome.runtime.sendMessage({
      type: 'SAVE_WORD',
      word: wordToSave,
      translation: translation,
      context: isPhrase ? '' : curCtx,
      targetLang: state.config.targetLang,
      timestamp: Date.now(),
    }, res => {
      if (res?.success) {
        const btn = popup.querySelector(isPhrase ? '#ll-btn-save-phrase' : '#ll-btn-save');
        btn.textContent = res.duplicate ? '⚠ Ya existe' : '✅ Guardada';
        btn.disabled = true;
        setTimeout(hide, 300);
      }
    });
  }

  document.addEventListener('click', e => {
    const w = e.target.closest('.ll-word');
    if (w) { e.preventDefault(); e.stopPropagation(); show(w.dataset.word, w.closest('.ll-sub-target')?.querySelector('.ll-sub-text')?.textContent || '', w); return; }
    if (popup && !e.target.closest('#ll-word-popup')) hide();
  });

  create();
})();
