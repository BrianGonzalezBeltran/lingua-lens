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
    });
  });

  const transcriptList = document.getElementById('ll-transcript');
  const transcriptToolbar = document.getElementById('ll-transcript-toolbar');
  const transcriptCount = document.getElementById('ll-transcript-count');
  const autoscrollBtn = document.getElementById('ll-transcript-autoscroll');
  function fmt(s) { return `${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`; }

  const seenTexts = new Set();
  let entryCount = 0;
  let autoScroll = true;
  let ignoreScrollEvents = false;

  transcriptList.addEventListener('wheel', (e) => {
    if (e.deltaY < 0 && autoScroll) { autoScroll = false; updateAutoscrollBtn(); }
    if (e.deltaY > 0 && !autoScroll) {
      setTimeout(() => {
        if (transcriptList.scrollHeight - transcriptList.scrollTop - transcriptList.clientHeight < 60) {
          autoScroll = true; updateAutoscrollBtn();
        }
      }, 50);
    }
  });

  autoscrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll; updateAutoscrollBtn();
    if (autoScroll) doAutoScroll();
  });

  function doAutoScroll() {
    ignoreScrollEvents = true;
    transcriptList.scrollTop = transcriptList.scrollHeight;
    setTimeout(() => { ignoreScrollEvents = false; }, 100);
  }

  function updateAutoscrollBtn() {
    autoscrollBtn.className = autoScroll ? 'll-transcript-autoscroll ll-autoscroll-on' : 'll-transcript-autoscroll ll-autoscroll-off';
    autoscrollBtn.textContent = autoScroll ? '⬇ Auto' : '⏸ Auto';
  }

  function updateToolbar() {
    transcriptToolbar.style.display = entryCount > 0 ? 'flex' : 'none';
    transcriptCount.textContent = `${entryCount} frases`;
  }

  function clearTranscript() {
    seenTexts.clear(); entryCount = 0;
    transcriptList.innerHTML = '<p class="ll-empty-state">Transcripción limpiada.</p>';
    updateToolbar();
  }
  document.getElementById('ll-transcript-clear').addEventListener('click', clearTranscript);

  function seekTo(t) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: t * 1000 });
    });
  }

  function addTranscriptEntry(target, native, time) {
    if (seenTexts.has(target)) return;
    seenTexts.add(target); entryCount++;
    const entry = document.createElement('div');
    entry.className = 'll-transcript-entry';
    entry.innerHTML = `
      <div class="ll-transcript-entry-header">
        <span class="ll-transcript-time">${fmt(time)}</span>
        <button class="ll-transcript-save" title="Guardar frase">⭐</button>
      </div>
      <div class="ll-transcript-target">${target}</div>
      ${native ? `<div class="ll-transcript-native">${native}</div>` : ''}
    `;
    entry.addEventListener('click', (e) => { if (!e.target.closest('.ll-transcript-save')) seekTo(time); });
    entry.querySelector('.ll-transcript-save').addEventListener('click', (e) => {
      e.stopPropagation(); const btn = e.target;
      chrome.runtime.sendMessage({ type: 'SAVE_WORD', word: target, translation: native || '', context: '', targetLang: '', timestamp: Date.now() }, res => {
        if (res?.success) { btn.textContent = res.duplicate ? '⚠' : '✅'; btn.disabled = true; setTimeout(() => { btn.textContent = '⭐'; btn.disabled = false; }, 2000); }
      });
    });
    const es = transcriptList.querySelector('.ll-empty-state'); if (es) es.remove();
    transcriptList.appendChild(entry);
    if (autoScroll) doAutoScroll();
    updateToolbar();
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'CAPTION_UPDATE') addTranscriptEntry(msg.target || '', msg.native || '', msg.time || 0);
    if (msg.type === 'VOCAB_UPDATED') loadVocabulary();
  });

  // Vocabulary
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
        <div class="ll-vocab-card-header">
          <div class="ll-vocab-word">${item.word}</div>
          <button class="ll-vocab-delete" title="Eliminar">✕</button>
        </div>
        <div class="ll-vocab-translation">${item.translation || ''}</div>
        ${item.context ? `<div class="ll-vocab-context">"${item.context}"</div>` : ''}
        <div class="ll-vocab-card-footer">
          <button class="ll-vocab-explain" title="Explicar">🧠</button>
          ${date ? `<span class="ll-vocab-date">${date}</span>` : ''}
        </div>
        <div class="ll-vocab-ai" style="display:none"></div>
      `;

      card.querySelector('.ll-vocab-explain').addEventListener('click', (e) => {
        e.stopPropagation();
        const aiDiv = card.querySelector('.ll-vocab-ai');
        const btn = e.currentTarget;
        if (aiDiv.style.display === 'block') {
          aiDiv.style.display = 'none';
          btn.textContent = '🧠';
          return;
        }
        aiDiv.style.display = 'block';
        aiDiv.innerHTML = '<span class="ll-vocab-loading">Pensando...</span>';
        btn.textContent = '🧠';
        chrome.runtime.sendMessage({
          type: 'AI_EXPLAIN', word: item.word, context: item.context || '',
          targetLang: item.targetLang || 'en', nativeLang: 'es',
        }, res => {
          const data = res?.explanation;
          if (!data) { aiDiv.textContent = 'Configura tu API key en el popup'; return; }
          let html = '';
          if (data.translation) html += `<div class="ll-vocab-ai-translation">${data.translation}</div>`;
          if (data.grammar) html += `<div class="ll-vocab-ai-grammar">${data.grammar}</div>`;
          if (data.examples?.length) {
            html += '<div class="ll-vocab-ai-examples">';
            data.examples.forEach(ex => {
              html += `<div class="ll-vocab-ai-example">
                <div class="ll-vocab-ai-sentence">${ex.sentence}</div>
                <div class="ll-vocab-ai-trans">${ex.translation}</div>
              </div>`;
            });
            html += '</div>';
          }
          if (data.tip) html += `<div class="ll-vocab-ai-tip">💡 ${data.tip}</div>`;
          aiDiv.innerHTML = html;
        });
      });

      card.querySelector('.ll-vocab-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'DELETE_WORD', word: item.word, targetLang: item.targetLang, timestamp: item.timestamp }, () => loadVocabulary());
      });
      vocabList.appendChild(card);
    });
  }

  function loadVocabulary() {
    chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' }, res => {
      allVocab = res?.vocabulary || [];
      renderVocab(allVocab);
    });
  }

  document.getElementById('ll-vocab-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    renderVocab(q ? allVocab.filter(v => v.word.toLowerCase().includes(q) || (v.translation||'').toLowerCase().includes(q)) : allVocab);
  });

  function download(content, filename, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename; a.click();
  }
  document.getElementById('ll-export-csv').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_VOCABULARY' }, r => { if (r?.csv) download(r.csv, 'lingualens-vocab.csv', 'text/csv'); });
  });
  document.getElementById('ll-export-anki').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_VOCABULARY' }, r => { if (r?.anki) download(r.anki, 'lingualens-anki.txt', 'text/plain'); });
  });

  loadVocabulary();
});
