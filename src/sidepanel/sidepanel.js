document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ll-panel-close').addEventListener('click', () => window.close());

  const tabs = document.querySelectorAll('.ll-tab');
  const tabContents = document.querySelectorAll('.ll-tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('ll-tab-active'));
      tabContents.forEach(c => c.classList.remove('ll-tab-visible'));
      tab.classList.add('ll-tab-active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('ll-tab-visible');
      if (tab.dataset.tab === 'vocabulary') loadVocabulary();
      if (tab.dataset.tab === 'practice') loadPractice();
    });
  });

  // ===== TRANSCRIPT =====
  const transcriptList = document.getElementById('ll-transcript');
  const transcriptToolbar = document.getElementById('ll-transcript-toolbar');
  const transcriptCount = document.getElementById('ll-transcript-count');
  const autoscrollBtn = document.getElementById('ll-transcript-autoscroll');
  function fmt(s) { return `${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`; }
  const seenTexts = new Set();
  let entryCount = 0, autoScroll = true, ignoreScrollEvents = false;

  transcriptList.addEventListener('wheel', (e) => {
    if (e.deltaY < 0 && autoScroll) { autoScroll = false; updateAutoscrollBtn(); }
    if (e.deltaY > 0 && !autoScroll) {
      setTimeout(() => {
        if (transcriptList.scrollHeight - transcriptList.scrollTop - transcriptList.clientHeight < 60) { autoScroll = true; updateAutoscrollBtn(); }
      }, 50);
    }
  });
  autoscrollBtn.addEventListener('click', () => { autoScroll = !autoScroll; updateAutoscrollBtn(); if (autoScroll) doAutoScroll(); });
  function doAutoScroll() { ignoreScrollEvents = true; transcriptList.scrollTop = transcriptList.scrollHeight; setTimeout(() => { ignoreScrollEvents = false; }, 100); }
  function updateAutoscrollBtn() { autoscrollBtn.className = autoScroll ? 'll-transcript-autoscroll ll-autoscroll-on' : 'll-transcript-autoscroll ll-autoscroll-off'; autoscrollBtn.textContent = autoScroll ? '⬇ Auto' : '⏸ Auto'; }
  function updateToolbar() { transcriptToolbar.style.display = entryCount > 0 ? 'flex' : 'none'; transcriptCount.textContent = `${entryCount} frases`; }
  function clearTranscript() { seenTexts.clear(); entryCount = 0; transcriptList.innerHTML = '<p class="ll-empty-state">Transcripción limpiada.</p>'; updateToolbar(); }
  document.getElementById('ll-transcript-clear').addEventListener('click', clearTranscript);

  function seekTo(t) { chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => { if (tab) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: t * 1000 }); }); }

  function renderAiExplanation(aiDiv, data) {
    if (!data) { aiDiv.textContent = 'Configura tu API key en el popup'; return; }
    let html = '';
    if (data.translation) html += `<div class="ll-vocab-ai-translation">${data.translation}</div>`;
    if (data.grammar) html += `<div class="ll-vocab-ai-grammar">${data.grammar}</div>`;
    if (data.examples?.length) {
      html += '<div class="ll-vocab-ai-examples">';
      data.examples.forEach(ex => { html += `<div class="ll-vocab-ai-example"><div class="ll-vocab-ai-sentence">${ex.sentence}</div><div class="ll-vocab-ai-trans">${ex.translation}</div></div>`; });
      html += '</div>';
    }
    if (data.tip) html += `<div class="ll-vocab-ai-tip">💡 ${data.tip}</div>`;
    aiDiv.innerHTML = html;
  }

  function requestExplain(word, context, aiDiv) {
    if (aiDiv.style.display === 'block') { aiDiv.style.display = 'none'; return; }
    aiDiv.style.display = 'block';
    aiDiv.innerHTML = '<span class="ll-vocab-loading">Pensando...</span>';
    chrome.runtime.sendMessage({ type: 'AI_EXPLAIN', word, context: context || '', targetLang: 'en', nativeLang: 'es' }, res => renderAiExplanation(aiDiv, res?.explanation));
  }

  function addTranscriptEntry(target, native, time) {
    if (seenTexts.has(target)) return;
    seenTexts.add(target); entryCount++;
    const entry = document.createElement('div');
    entry.className = 'll-transcript-entry';
    entry.innerHTML = `
      <div class="ll-transcript-entry-header"><span class="ll-transcript-time">${fmt(time)}</span><button class="ll-transcript-save" title="Guardar frase">⭐</button></div>
      <div class="ll-transcript-target">${target}</div>
      ${native ? `<div class="ll-transcript-native">${native}</div>` : ''}
      <div class="ll-transcript-entry-footer"><button class="ll-transcript-explain" title="Explicar">🧠</button></div>
      <div class="ll-transcript-ai" style="display:none"></div>
    `;
    entry.addEventListener('click', (e) => { if (!e.target.closest('.ll-transcript-save') && !e.target.closest('.ll-transcript-explain')) seekTo(time); });
    entry.querySelector('.ll-transcript-save').addEventListener('click', (e) => {
      e.stopPropagation(); const btn = e.target;
      chrome.runtime.sendMessage({ type: 'SAVE_WORD', word: target, translation: native || '', context: '', targetLang: '', timestamp: Date.now() }, res => {
        if (res?.success) { btn.textContent = res.duplicate ? '⚠' : '✅'; btn.disabled = true; setTimeout(() => { btn.textContent = '⭐'; btn.disabled = false; }, 2000); }
      });
    });
    entry.querySelector('.ll-transcript-explain').addEventListener('click', (e) => { e.stopPropagation(); requestExplain(target, '', entry.querySelector('.ll-transcript-ai')); });
    const es = transcriptList.querySelector('.ll-empty-state'); if (es) es.remove();
    transcriptList.appendChild(entry);
    if (autoScroll) doAutoScroll();
    updateToolbar();
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'CAPTION_UPDATE') addTranscriptEntry(msg.target || '', msg.native || '', msg.time || 0);
    if (msg.type === 'VOCAB_UPDATED') loadVocabulary();
  });

  // ===== VOCABULARY =====
  const vocabList = document.getElementById('ll-vocab-list');
  let allVocab = [];

  function renderVocab(vocab) {
    if (!vocab.length) { vocabList.innerHTML = '<p class="ll-empty-state">Guarda palabras con ⭐</p>'; return; }
    vocabList.innerHTML = '';
    [...vocab].sort((a,b) => (b.timestamp||0) - (a.timestamp||0)).forEach(item => {
      const card = document.createElement('div');
      card.className = 'll-vocab-card';
      const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('es-CO', { day:'numeric', month:'short' }) : '';
      card.innerHTML = `
        <div class="ll-vocab-card-header"><div class="ll-vocab-word">${item.word}</div><button class="ll-vocab-delete" title="Eliminar">✕</button></div>
        <div class="ll-vocab-translation">${item.translation || ''}</div>
        ${item.context ? `<div class="ll-vocab-context">"${item.context}"</div>` : ''}
        <div class="ll-vocab-card-footer">${date ? `<span class="ll-vocab-date">${date}</span>` : ''}<button class="ll-vocab-explain" title="Explicar">🧠</button></div>
        <div class="ll-vocab-ai" style="display:none"></div>
      `;
      card.querySelector('.ll-vocab-explain').addEventListener('click', (e) => { e.stopPropagation(); requestExplain(item.word, item.context || '', card.querySelector('.ll-vocab-ai')); });
      card.querySelector('.ll-vocab-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'DELETE_WORD', word: item.word, targetLang: item.targetLang, timestamp: item.timestamp }, () => loadVocabulary());
      });
      vocabList.appendChild(card);
    });
  }

  function loadVocabulary() {
    chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' }, res => { allVocab = res?.vocabulary || []; renderVocab(allVocab); });
  }

  document.getElementById('ll-vocab-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    renderVocab(q ? allVocab.filter(v => v.word.toLowerCase().includes(q) || (v.translation||'').toLowerCase().includes(q)) : allVocab);
  });

  function download(c, f, t) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = f; a.click(); }
  document.getElementById('ll-export-csv').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'EXPORT_VOCABULARY' }, r => { if (r?.csv) download(r.csv, 'lingualens-vocab.csv', 'text/csv'); }); });
  document.getElementById('ll-export-anki').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'EXPORT_VOCABULARY' }, r => { if (r?.anki) download(r.anki, 'lingualens-anki.txt', 'text/plain'); }); });

  // ===== PRACTICE (SRS Flashcards) =====
  const practiceContainer = document.getElementById('ll-practice');
  let dueCards = [], currentCardIndex = 0, cardRevealed = false;

  function loadPractice() {
    chrome.runtime.sendMessage({ type: 'GET_DUE_CARDS' }, res => {
      dueCards = res?.cards || [];
      currentCardIndex = 0;
      cardRevealed = false;
      renderPractice(res?.stats);
    });
  }

  function fmtTime(ms) {
    const h = ms / 3600000;
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 24) return `${Math.round(h)} h`;
    if (h < 168) return `${Math.round(h / 24)} días`;
    return `${Math.round(h / 168)} sem`;
  }

  function renderPractice(stats) {
    if (!stats || stats.total === 0) {
      practiceContainer.innerHTML = `
        <div class="ll-practice-empty">
          <div class="ll-practice-empty-icon">📚</div>
          <div class="ll-practice-empty-title">No hay palabras guardadas</div>
          <div class="ll-practice-empty-text">Guarda palabras y frases mientras ves videos para practicarlas aquí.</div>
        </div>`;
      return;
    }

    if (dueCards.length === 0) {
      practiceContainer.innerHTML = `
        <div class="ll-practice-done">
          <div class="ll-practice-done-icon">🎉</div>
          <div class="ll-practice-done-title">¡Todo al día!</div>
          <div class="ll-practice-done-text">No hay tarjetas pendientes por revisar.</div>
          <div class="ll-practice-stats">
            <div class="ll-practice-stat"><span class="ll-stat-number">${stats.total}</span><span class="ll-stat-label">Total</span></div>
            <div class="ll-practice-stat"><span class="ll-stat-number">${stats.learned}</span><span class="ll-stat-label">Aprendidas</span></div>
            <div class="ll-practice-stat"><span class="ll-stat-number">${stats.newCards}</span><span class="ll-stat-label">Nuevas</span></div>
          </div>
        </div>`;
      return;
    }

    renderCard();
  }

  function renderCard() {
    if (currentCardIndex >= dueCards.length) {
      loadPractice();
      return;
    }

    const card = dueCards[currentCardIndex];
    const remaining = dueCards.length - currentCardIndex;
    const isPhrase = card.word.split(/\s+/).length > 3;

    practiceContainer.innerHTML = `
      <div class="ll-practice-header">
        <span class="ll-practice-remaining">${remaining} pendiente${remaining !== 1 ? 's' : ''}</span>
        <span class="ll-practice-level">Nivel ${card.srs?.level || 0}</span>
      </div>
      <div class="ll-flashcard" id="ll-flashcard">
        <div class="ll-flashcard-front">
          <div class="ll-flashcard-label">${isPhrase ? 'Frase' : 'Palabra'}</div>
          <div class="ll-flashcard-word">${card.word}</div>
          ${card.context ? `<div class="ll-flashcard-context">"${card.context}"</div>` : ''}
        </div>
        <div class="ll-flashcard-back" id="ll-flashcard-back" style="display:none">
          <div class="ll-flashcard-divider"></div>
          <div class="ll-flashcard-translation">${card.translation || '(sin traducción)'}</div>
        </div>
        <button class="ll-flashcard-reveal" id="ll-flashcard-reveal">Mostrar traducción</button>
      </div>
      <div class="ll-practice-buttons" id="ll-practice-buttons" style="display:none">
        <button class="ll-practice-btn ll-btn-again" data-quality="0">
          <span class="ll-btn-label">Otra vez</span>
          <span class="ll-btn-time">${fmtTime(getSrsPreview(card, 0))}</span>
        </button>
        <button class="ll-practice-btn ll-btn-hard" data-quality="1">
          <span class="ll-btn-label">Difícil</span>
          <span class="ll-btn-time">${fmtTime(getSrsPreview(card, 1))}</span>
        </button>
        <button class="ll-practice-btn ll-btn-good" data-quality="2">
          <span class="ll-btn-label">Bien</span>
          <span class="ll-btn-time">${fmtTime(getSrsPreview(card, 2))}</span>
        </button>
        <button class="ll-practice-btn ll-btn-easy" data-quality="3">
          <span class="ll-btn-label">Fácil</span>
          <span class="ll-btn-time">${fmtTime(getSrsPreview(card, 3))}</span>
        </button>
      </div>
    `;

    document.getElementById('ll-flashcard-reveal').addEventListener('click', () => {
      document.getElementById('ll-flashcard-back').style.display = 'block';
      document.getElementById('ll-flashcard-reveal').style.display = 'none';
      document.getElementById('ll-practice-buttons').style.display = 'flex';
      cardRevealed = true;
    });

    document.querySelectorAll('.ll-practice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const quality = parseInt(btn.dataset.quality);
        const card = dueCards[currentCardIndex];
        chrome.runtime.sendMessage({
          type: 'REVIEW_WORD',
          word: card.word,
          targetLang: card.targetLang,
          timestamp: card.timestamp,
          quality,
        }, () => {
          currentCardIndex++;
          cardRevealed = false;
          renderCard();
        });
      });
    });
  }

  // Preview SRS intervals (client-side mirror of service worker logic)
  const SRS_INTERVALS = [
    [0.17, 1, 4, 24],
    [1, 8, 24, 72],
    [24, 48, 72, 168],
    [72, 168, 336, 720],
    [168, 336, 720, 1440],
  ];
  function getSrsPreview(card, quality) {
    let level = card.srs?.level || 0;
    if (quality === 0) level = 0;
    else if (quality >= 2) level = Math.min(level + 1, SRS_INTERVALS.length - 1);
    const row = SRS_INTERVALS[Math.min(level, SRS_INTERVALS.length - 1)];
    return row[quality] * 3600000;
  }

  loadVocabulary();
});
