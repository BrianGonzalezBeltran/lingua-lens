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
      if (tab.dataset.tab === 'practice') showPracticeModes();
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
    if (e.deltaY > 0 && !autoScroll) { setTimeout(() => { if (transcriptList.scrollHeight - transcriptList.scrollTop - transcriptList.clientHeight < 60) { autoScroll = true; updateAutoscrollBtn(); } }, 50); }
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
    if (data.examples?.length) { html += '<div class="ll-vocab-ai-examples">'; data.examples.forEach(ex => { html += `<div class="ll-vocab-ai-example"><div class="ll-vocab-ai-sentence">${ex.sentence}</div><div class="ll-vocab-ai-trans">${ex.translation}</div></div>`; }); html += '</div>'; }
    if (data.tip) html += `<div class="ll-vocab-ai-tip">💡 ${data.tip}</div>`;
    aiDiv.innerHTML = html;
  }
  function requestExplain(word, context, aiDiv) {
    if (aiDiv.style.display === 'block') { aiDiv.style.display = 'none'; return; }
    aiDiv.style.display = 'block'; aiDiv.innerHTML = '<span class="ll-vocab-loading">Pensando...</span>';
    chrome.runtime.sendMessage({ type: 'AI_EXPLAIN', word, context: context || '', targetLang: 'en', nativeLang: 'es' }, res => renderAiExplanation(aiDiv, res?.explanation));
  }

  function addTranscriptEntry(target, native, time) {
    if (seenTexts.has(target)) return; seenTexts.add(target); entryCount++;
    const entry = document.createElement('div'); entry.className = 'll-transcript-entry';
    entry.innerHTML = `<div class="ll-transcript-entry-header"><span class="ll-transcript-time">${fmt(time)}</span><button class="ll-transcript-save" title="Guardar frase">⭐</button></div><div class="ll-transcript-target">${target}</div>${native ? `<div class="ll-transcript-native">${native}</div>` : ''}<div class="ll-transcript-entry-footer"><button class="ll-transcript-explain" title="Explicar">🧠</button></div><div class="ll-transcript-ai" style="display:none"></div>`;
    entry.addEventListener('click', (e) => { if (!e.target.closest('.ll-transcript-save') && !e.target.closest('.ll-transcript-explain')) seekTo(time); });
    entry.querySelector('.ll-transcript-save').addEventListener('click', (e) => { e.stopPropagation(); const btn = e.target; chrome.runtime.sendMessage({ type: 'SAVE_WORD', word: target, translation: native || '', context: '', targetLang: '', timestamp: Date.now() }, res => { if (res?.success) { btn.textContent = res.duplicate ? '⚠' : '✅'; btn.disabled = true; setTimeout(() => { btn.textContent = '⭐'; btn.disabled = false; }, 2000); } }); });
    entry.querySelector('.ll-transcript-explain').addEventListener('click', (e) => { e.stopPropagation(); requestExplain(target, '', entry.querySelector('.ll-transcript-ai')); });
    const es = transcriptList.querySelector('.ll-empty-state'); if (es) es.remove();
    transcriptList.appendChild(entry); if (autoScroll) doAutoScroll(); updateToolbar();
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
      const card = document.createElement('div'); card.className = 'll-vocab-card';
      const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('es-CO', { day:'numeric', month:'short' }) : '';
      card.innerHTML = `<div class="ll-vocab-card-header"><div class="ll-vocab-word">${item.word}</div><button class="ll-vocab-delete" title="Eliminar">✕</button></div><div class="ll-vocab-translation">${item.translation || ''}</div>${item.context ? `<div class="ll-vocab-context">"${item.context}"</div>` : ''}<div class="ll-vocab-card-footer">${date ? `<span class="ll-vocab-date">${date}</span>` : ''}<button class="ll-vocab-explain" title="Explicar">🧠</button></div><div class="ll-vocab-ai" style="display:none"></div>`;
      card.querySelector('.ll-vocab-explain').addEventListener('click', (e) => { e.stopPropagation(); requestExplain(item.word, item.context || '', card.querySelector('.ll-vocab-ai')); });
      card.querySelector('.ll-vocab-delete').addEventListener('click', (e) => { e.stopPropagation(); chrome.runtime.sendMessage({ type: 'DELETE_WORD', word: item.word, targetLang: item.targetLang, timestamp: item.timestamp }, () => loadVocabulary()); });
      vocabList.appendChild(card);
    });
  }
  function loadVocabulary() { chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' }, res => { allVocab = res?.vocabulary || []; renderVocab(allVocab); }); }
  document.getElementById('ll-vocab-search').addEventListener('input', (e) => { const q = e.target.value.toLowerCase().trim(); renderVocab(q ? allVocab.filter(v => v.word.toLowerCase().includes(q) || (v.translation||'').toLowerCase().includes(q)) : allVocab); });
  function download(c, f, t) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = f; a.click(); }
  document.getElementById('ll-export-csv').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'EXPORT_VOCABULARY' }, r => { if (r?.csv) download(r.csv, 'lingualens-vocab.csv', 'text/csv'); }); });
  document.getElementById('ll-export-anki').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'EXPORT_VOCABULARY' }, r => { if (r?.anki) download(r.anki, 'lingualens-anki.txt', 'text/plain'); }); });

  // ===== PRACTICE =====
  const practiceContainer = document.getElementById('ll-practice');
  const SRS_INTERVALS = [[0.17,1,4,24],[1,8,24,72],[24,48,72,168],[72,168,336,720],[168,336,720,1440]];
  function getSrsPreview(card, q) { let lv = card.srs?.level||0; if(q===0)lv=0;else if(q>=2)lv=Math.min(lv+1,SRS_INTERVALS.length-1); return SRS_INTERVALS[Math.min(lv,SRS_INTERVALS.length-1)][q]*3600000; }
  function fmtTime(ms) { const h=ms/3600000; if(h<1)return`${Math.round(h*60)} min`;if(h<24)return`${Math.round(h)} h`;if(h<168)return`${Math.round(h/24)} días`;return`${Math.round(h/168)} sem`; }
  function shuffle(arr) { const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }

  function showPracticeModes() {
    chrome.runtime.sendMessage({ type: 'GET_DUE_CARDS' }, res => {
      const stats = res?.stats || { total:0, due:0, learned:0, newCards:0 };
      if (stats.total === 0) { practiceContainer.innerHTML = `<div class="ll-practice-empty"><div class="ll-practice-empty-icon">📚</div><div class="ll-practice-empty-title">No hay palabras guardadas</div><div class="ll-practice-empty-text">Guarda palabras y frases mientras ves videos.</div></div>`; return; }
      chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' }, vRes => {
        const allWords = vRes?.vocabulary || [];
        const clozeCount = allWords.filter(w => w.context || w.word.split(/\s+/).length > 3).length;
        const reorderCount = allWords.filter(w => w.word.split(/\s+/).length > 3).length;
        practiceContainer.innerHTML = `
          <div class="ll-practice-menu">
            <div class="ll-practice-stats-bar">
              <div class="ll-practice-stat-mini"><span class="ll-stat-num">${stats.due}</span> pendientes</div>
              <div class="ll-practice-stat-mini"><span class="ll-stat-num">${stats.learned}</span> aprendidas</div>
              <div class="ll-practice-stat-mini"><span class="ll-stat-num">${stats.total}</span> total</div>
            </div>
            <div class="ll-practice-modes">
              <button class="ll-mode-card" id="ll-mode-flashcard"><span class="ll-mode-icon">🃏</span><div><span class="ll-mode-title">Flashcards</span><br><span class="ll-mode-desc">Traducción con repetición espaciada</span></div>${stats.due > 0 ? `<span class="ll-mode-badge">${stats.due}</span>` : '<span class="ll-mode-badge ll-badge-done">✓</span>'}</button>
              <button class="ll-mode-card" id="ll-mode-cloze"><span class="ll-mode-icon">✏️</span><div><span class="ll-mode-title">Completar frase</span><br><span class="ll-mode-desc">Adivina la palabra con pistas en inglés</span></div><span class="ll-mode-badge">${clozeCount}</span></button>
              <button class="ll-mode-card" id="ll-mode-reorder"><span class="ll-mode-icon">🔀</span><div><span class="ll-mode-title">Ordenar frase</span><br><span class="ll-mode-desc">Reconstruye la oración correcta</span></div><span class="ll-mode-badge">${reorderCount}</span></button>
            </div>
          </div>`;
        document.getElementById('ll-mode-flashcard').addEventListener('click', startFlashcards);
        document.getElementById('ll-mode-cloze').addEventListener('click', () => startCloze(allWords));
        document.getElementById('ll-mode-reorder').addEventListener('click', () => startReorder(allWords));
      });
    });
  }

  // ===== FLASHCARDS =====
  let dueCards = [], currentCardIndex = 0;
  function startFlashcards() {
    chrome.runtime.sendMessage({ type: 'GET_DUE_CARDS' }, res => {
      dueCards = res?.cards || []; currentCardIndex = 0;
      if (!dueCards.length) { practiceContainer.innerHTML = `<div class="ll-practice-done"><div class="ll-practice-done-icon">🎉</div><div class="ll-practice-done-title">¡Todo al día!</div><button class="ll-back-btn" id="ll-back-modes">← Volver</button></div>`; document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes); return; }
      renderFlashcard();
    });
  }
  function renderFlashcard() {
    if (currentCardIndex >= dueCards.length) { showPracticeModes(); return; }
    const card = dueCards[currentCardIndex]; const remaining = dueCards.length - currentCardIndex;
    practiceContainer.innerHTML = `
      <div class="ll-practice-header"><button class="ll-back-btn" id="ll-back-modes">←</button><span class="ll-practice-remaining">${remaining} pendiente${remaining!==1?'s':''}</span><span class="ll-practice-level">Nivel ${card.srs?.level||0}</span></div>
      <div class="ll-flashcard"><div class="ll-flashcard-label">${card.word.split(/\s+/).length>3?'Frase':'Palabra'}</div><div class="ll-flashcard-word">${card.word}</div>${card.context?`<div class="ll-flashcard-context">"${card.context}"</div>`:''}<div id="ll-flashcard-back" style="display:none"><div class="ll-flashcard-divider"></div><div class="ll-flashcard-translation">${card.translation||'(sin traducción)'}</div></div><button class="ll-flashcard-reveal" id="ll-flashcard-reveal">Mostrar traducción</button></div>
      <div class="ll-practice-buttons" id="ll-practice-buttons" style="display:none">
        <button class="ll-practice-btn ll-btn-again" data-quality="0"><span class="ll-btn-label">Otra vez</span><span class="ll-btn-time">${fmtTime(getSrsPreview(card,0))}</span></button>
        <button class="ll-practice-btn ll-btn-hard" data-quality="1"><span class="ll-btn-label">Difícil</span><span class="ll-btn-time">${fmtTime(getSrsPreview(card,1))}</span></button>
        <button class="ll-practice-btn ll-btn-good" data-quality="2"><span class="ll-btn-label">Bien</span><span class="ll-btn-time">${fmtTime(getSrsPreview(card,2))}</span></button>
        <button class="ll-practice-btn ll-btn-easy" data-quality="3"><span class="ll-btn-label">Fácil</span><span class="ll-btn-time">${fmtTime(getSrsPreview(card,3))}</span></button>
      </div>`;
    document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes);
    document.getElementById('ll-flashcard-reveal').addEventListener('click', () => { document.getElementById('ll-flashcard-back').style.display='block'; document.getElementById('ll-flashcard-reveal').style.display='none'; document.getElementById('ll-practice-buttons').style.display='flex'; });
    document.querySelectorAll('.ll-practice-btn').forEach(btn => { btn.addEventListener('click', () => { chrome.runtime.sendMessage({ type:'REVIEW_WORD', word:dueCards[currentCardIndex].word, targetLang:dueCards[currentCardIndex].targetLang, timestamp:dueCards[currentCardIndex].timestamp, quality:parseInt(btn.dataset.quality) }, () => { currentCardIndex++; renderFlashcard(); }); }); });
  }

  // ===== CLOZE =====
  let clozeCards = [], clozeIndex = 0, clozeScore = { correct:0, total:0 };

  function startCloze(allWords) {
    const candidates = allWords.filter(w => { const text = w.context || w.word; return text.split(/\s+/).length > 3; });
    if (!candidates.length) { practiceContainer.innerHTML = `<div class="ll-practice-empty"><div class="ll-practice-empty-icon">✏️</div><div class="ll-practice-empty-title">No hay frases disponibles</div><button class="ll-back-btn" id="ll-back-modes">← Volver</button></div>`; document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes); return; }
    clozeCards = shuffle(candidates).slice(0, 10);
    clozeIndex = 0; clozeScore = { correct:0, total:0 };
    renderCloze();
  }

  function renderCloze() {
    if (clozeIndex >= clozeCards.length) {
      const pct = clozeScore.total ? Math.round(clozeScore.correct/clozeScore.total*100) : 0;
      practiceContainer.innerHTML = `<div class="ll-practice-done"><div class="ll-practice-done-icon">✏️</div><div class="ll-practice-done-title">Sesión completada</div><div class="ll-practice-done-text">${clozeScore.correct} de ${clozeScore.total} correctas (${pct}%)</div><div class="ll-practice-score-bar"><div class="ll-practice-score-fill" style="width:${pct}%"></div></div><button class="ll-back-btn" id="ll-back-modes">← Volver</button></div>`;
      document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes); return;
    }

    const item = clozeCards[clozeIndex];
    const sentence = item.context || item.word;
    const words = sentence.split(/\s+/);

    // Pick word to hide
    let hideIndex = -1;
    if (item.context && item.word) {
      const savedClean = item.word.toLowerCase().replace(/[^a-z']/g, '');
      hideIndex = words.findIndex(w => w.toLowerCase().replace(/[^a-z']/g, '') === savedClean);
    }
    if (hideIndex === -1) {
      const contentIndices = words.map((w,i) => ({w,i})).filter(x => x.w.replace(/[^a-z']/gi,'').length > 3);
      hideIndex = contentIndices.length ? contentIndices[Math.floor(Math.random()*contentIndices.length)].i : Math.floor(Math.random()*words.length);
    }
    const hideWord = words[hideIndex];
    const cleanHideWord = hideWord.replace(/[^a-zA-Z']/g, '');
    const display = words.map((w,i) => i === hideIndex ? `<span class="ll-cloze-blank">____</span>` : w).join(' ');
    const remaining = clozeCards.length - clozeIndex;

    practiceContainer.innerHTML = `
      <div class="ll-practice-header"><button class="ll-back-btn" id="ll-back-modes">←</button><span class="ll-practice-remaining">${remaining} restante${remaining!==1?'s':''}</span><span class="ll-practice-score-mini">${clozeScore.correct}/${clozeScore.total}</span></div>
      <div class="ll-cloze-card">
        <div class="ll-cloze-label">Complete the sentence</div>
        <div class="ll-cloze-sentence">${display}</div>
        <div class="ll-cloze-ai-hint" id="ll-cloze-ai-hint"><span class="ll-popup-loading">Generating hint...</span></div>
        <div class="ll-cloze-input-row">
          <input type="text" class="ll-cloze-input" id="ll-cloze-input" placeholder="Type the missing word..." autocomplete="off" spellcheck="false">
          <button class="ll-cloze-check" id="ll-cloze-check">→</button>
        </div>
        <div class="ll-cloze-actions">
          <button class="ll-cloze-hint-btn" id="ll-cloze-letter-hint" style="display:none">💡 First letter</button>
          <button class="ll-cloze-skip" id="ll-cloze-skip">Skip →</button>
        </div>
        <div class="ll-cloze-result" id="ll-cloze-result" style="display:none"></div>
      </div>`;

    document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes);
    const input = document.getElementById('ll-cloze-input');
    input.focus();

    // Request AI hint from Groq
    chrome.runtime.sendMessage({ type: 'CLOZE_HINT', word: cleanHideWord, sentence, targetLang: 'en' }, res => {
      const hintDiv = document.getElementById('ll-cloze-ai-hint');
      if (res?.hint) {
        hintDiv.innerHTML = `<span class="ll-cloze-hint-icon">💡</span> ${res.hint}`;
        document.getElementById('ll-cloze-letter-hint').style.display = 'inline-block';
      } else {
        // Fallback: show first letter hint directly
        hintDiv.innerHTML = `<span class="ll-cloze-hint-icon">💡</span> First letter: <strong>${cleanHideWord[0].toUpperCase()}</strong>`;
      }
    });

    document.getElementById('ll-cloze-letter-hint').addEventListener('click', () => {
      const hintDiv = document.getElementById('ll-cloze-ai-hint');
      hintDiv.innerHTML += ` — First letter: <strong>${cleanHideWord[0].toUpperCase()}</strong>`;
      document.getElementById('ll-cloze-letter-hint').style.display = 'none';
    });

    function checkAnswer() {
      const answer = input.value.trim().toLowerCase();
      if (!answer) return;
      const target = cleanHideWord.toLowerCase();
      // Accept exact match or close match (missing trailing punctuation, etc.)
      const correct = answer === target || answer === target.replace(/[^a-z']/g, '');
      clozeScore.total++; if (correct) clozeScore.correct++;
      const result = document.getElementById('ll-cloze-result');
      result.style.display = 'block';
      result.className = `ll-cloze-result ${correct ? 'll-cloze-correct' : 'll-cloze-wrong'}`;
      result.innerHTML = correct ? `✓ Correct!` : `✗ The answer was: <strong>${cleanHideWord}</strong>`;
      input.disabled = true; document.getElementById('ll-cloze-check').disabled = true;
      setTimeout(() => { clozeIndex++; renderCloze(); }, correct ? 1000 : 2500);
    }

    document.getElementById('ll-cloze-check').addEventListener('click', checkAnswer);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });
    document.getElementById('ll-cloze-skip').addEventListener('click', () => {
      clozeScore.total++;
      const result = document.getElementById('ll-cloze-result');
      result.style.display = 'block'; result.className = 'll-cloze-result ll-cloze-wrong';
      result.innerHTML = `The answer was: <strong>${cleanHideWord}</strong>`;
      input.disabled = true;
      setTimeout(() => { clozeIndex++; renderCloze(); }, 2000);
    });
  }

  // ===== REORDER =====
  let reorderCards = [], reorderIndex = 0, reorderScore = { correct:0, total:0 };

  function startReorder(allWords) {
    const candidates = allWords.filter(w => w.word.split(/\s+/).length > 3);
    if (!candidates.length) { practiceContainer.innerHTML = `<div class="ll-practice-empty"><div class="ll-practice-empty-icon">🔀</div><div class="ll-practice-empty-title">No hay frases disponibles</div><button class="ll-back-btn" id="ll-back-modes">← Volver</button></div>`; document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes); return; }
    reorderCards = shuffle(candidates).slice(0, 10);
    reorderIndex = 0; reorderScore = { correct:0, total:0 };
    renderReorder();
  }

  function renderReorder() {
    if (reorderIndex >= reorderCards.length) {
      const pct = reorderScore.total ? Math.round(reorderScore.correct/reorderScore.total*100) : 0;
      practiceContainer.innerHTML = `<div class="ll-practice-done"><div class="ll-practice-done-icon">🔀</div><div class="ll-practice-done-title">Sesión completada</div><div class="ll-practice-done-text">${reorderScore.correct} de ${reorderScore.total} correctas (${pct}%)</div><div class="ll-practice-score-bar"><div class="ll-practice-score-fill" style="width:${pct}%"></div></div><button class="ll-back-btn" id="ll-back-modes">← Volver</button></div>`;
      document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes); return;
    }
    const item = reorderCards[reorderIndex];
    const originalWords = item.word.split(/\s+/);
    const scrambled = shuffle(originalWords);
    if (scrambled.join(' ') === originalWords.join(' ') && originalWords.length > 2) scrambled.reverse();
    const remaining = reorderCards.length - reorderIndex;
    let selected = [];

    practiceContainer.innerHTML = `
      <div class="ll-practice-header"><button class="ll-back-btn" id="ll-back-modes">←</button><span class="ll-practice-remaining">${remaining} restante${remaining!==1?'s':''}</span><span class="ll-practice-score-mini">${reorderScore.correct}/${reorderScore.total}</span></div>
      <div class="ll-reorder-card">
        <div class="ll-reorder-label">Put the words in order</div>
        ${item.translation ? `<div class="ll-reorder-hint">${item.translation}</div>` : ''}
        <div class="ll-reorder-answer" id="ll-reorder-answer"></div>
        <div class="ll-reorder-words" id="ll-reorder-words"></div>
        <div class="ll-reorder-actions"><button class="ll-reorder-clear" id="ll-reorder-clear">Clear</button><button class="ll-reorder-check" id="ll-reorder-check" disabled>Check</button></div>
        <div class="ll-reorder-result" id="ll-reorder-result" style="display:none"></div>
      </div>`;

    const wordsC = document.getElementById('ll-reorder-words');
    const answerC = document.getElementById('ll-reorder-answer');
    const checkBtn = document.getElementById('ll-reorder-check');

    function rw() { wordsC.innerHTML=''; scrambled.forEach((w,i) => { if(selected.includes(i))return; const c=document.createElement('button'); c.className='ll-word-chip'; c.textContent=w; c.addEventListener('click',()=>{selected.push(i);rw();ra();checkBtn.disabled=selected.length!==originalWords.length;}); wordsC.appendChild(c); }); }
    function ra() { answerC.innerHTML=''; if(!selected.length){answerC.innerHTML='<span class="ll-reorder-placeholder">Tap words in order...</span>';return;} selected.forEach((idx,pos)=>{const c=document.createElement('button');c.className='ll-word-chip ll-word-chip-selected';c.textContent=scrambled[idx];c.addEventListener('click',()=>{selected=selected.filter((_,p)=>p!==pos);rw();ra();checkBtn.disabled=true;});answerC.appendChild(c);}); }
    rw(); ra();

    document.getElementById('ll-back-modes').addEventListener('click', showPracticeModes);
    document.getElementById('ll-reorder-clear').addEventListener('click', () => { selected=[]; rw(); ra(); checkBtn.disabled=true; document.getElementById('ll-reorder-result').style.display='none'; });
    checkBtn.addEventListener('click', () => {
      const attempt = selected.map(i => scrambled[i]).join(' ');
      const correct = attempt === originalWords.join(' ');
      reorderScore.total++; if(correct) reorderScore.correct++;
      const result = document.getElementById('ll-reorder-result');
      result.style.display = 'block';
      result.className = `ll-reorder-result ${correct ? 'll-cloze-correct' : 'll-cloze-wrong'}`;
      result.innerHTML = correct ? '✓ Correct!' : `✗ Correct order:<br><strong>${originalWords.join(' ')}</strong>`;
      setTimeout(() => { reorderIndex++; renderReorder(); }, correct ? 1000 : 3000);
    });
  }

  loadVocabulary();
});
