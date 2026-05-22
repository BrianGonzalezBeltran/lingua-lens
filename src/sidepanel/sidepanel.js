document.addEventListener('DOMContentLoaded', () => {
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

  // Scroll up → disable auto-scroll
  transcriptList.addEventListener('wheel', (e) => {
    if (e.deltaY < 0 && autoScroll) {
      autoScroll = false;
      updateAutoscrollBtn();
    }
    // Scroll down to bottom → re-enable
    if (e.deltaY > 0 && !autoScroll) {
      setTimeout(() => {
        const atBottom = transcriptList.scrollHeight - transcriptList.scrollTop - transcriptList.clientHeight < 60;
        if (atBottom) {
          autoScroll = true;
          updateAutoscrollBtn();
        }
      }, 50);
    }
  });

  autoscrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll;
    updateAutoscrollBtn();
    if (autoScroll) doAutoScroll();
  });

  function doAutoScroll() {
    ignoreScrollEvents = true;
    transcriptList.scrollTop = transcriptList.scrollHeight;
    setTimeout(() => { ignoreScrollEvents = false; }, 100);
  }

  function updateAutoscrollBtn() {
    if (autoScroll) {
      autoscrollBtn.className = 'll-transcript-autoscroll ll-autoscroll-on';
      autoscrollBtn.textContent = '⬇ Auto';
    } else {
      autoscrollBtn.className = 'll-transcript-autoscroll ll-autoscroll-off';
      autoscrollBtn.textContent = '⏸ Auto';
    }
  }

  function updateToolbar() {
    if (entryCount > 0) {
      transcriptToolbar.style.display = 'flex';
      transcriptCount.textContent = `${entryCount} frases`;
    } else {
      transcriptToolbar.style.display = 'none';
    }
  }

  function clearTranscript() {
    seenTexts.clear();
    entryCount = 0;
    transcriptList.innerHTML = '<p class="ll-empty-state">Transcripción limpiada. Los nuevos subtítulos aparecerán aquí.</p>';
    updateToolbar();
  }

  document.getElementById('ll-transcript-clear').addEventListener('click', clearTranscript);

  function seekTo(timeSeconds) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.tabs.sendMessage(tab.id, { type: 'SEEK_TO', timeMs: timeSeconds * 1000 });
    });
  }

  function addTranscriptEntry(target, native, time) {
    if (seenTexts.has(target)) return;
    seenTexts.add(target);
    entryCount++;

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

    entry.addEventListener('click', (e) => {
      if (e.target.closest('.ll-transcript-save')) return;
      seekTo(time);
    });

    entry.querySelector('.ll-transcript-save').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target;
      chrome.runtime.sendMessage({
        type: 'SAVE_WORD',
        word: target,
        translation: native || '',
        context: '',
        targetLang: '',
        timestamp: Date.now(),
      }, res => {
        if (res?.success) {
          btn.textContent = res.duplicate ? '⚠' : '✅';
          btn.disabled = true;
          setTimeout(() => { btn.textContent = '⭐'; btn.disabled = false; }, 2000);
        }
      });
    });

    const emptyState = transcriptList.querySelector('.ll-empty-state');
    if (emptyState) emptyState.remove();

    transcriptList.appendChild(entry);
    if (autoScroll) doAutoScroll();
    updateToolbar();
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'CAPTION_UPDATE') addTranscriptEntry(msg.target || '', msg.native || '', msg.time || 0);
    if (msg.type === 'VOCAB_UPDATED') loadVocabulary();
  });

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
        ${date ? `<div class="ll-vocab-date">${date}</div>` : ''}
      `;
      card.querySelector('.ll-vocab-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: 'DELETE_WORD', word: item.word,
          targetLang: item.targetLang, timestamp: item.timestamp,
        }, () => loadVocabulary());
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
