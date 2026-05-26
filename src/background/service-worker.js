const CONFIG = {
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  GROQ_URL: 'https://api.groq.com/openai/v1/chat/completions',
};

async function getKey() {
  return new Promise(r => chrome.storage.sync.get(['groqApiKey'], x => r(x.groqApiKey || '')));
}

async function callGroq(systemPrompt, userPrompt, maxTokens = 150) {
  const key = await getKey();
  if (!key) return null;
  try {
    const res = await fetch(CONFIG.GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: CONFIG.GROQ_MODEL, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: maxTokens, temperature: 0.3 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) { console.error('[LL] Groq API error:', err); return null; }
}

async function translate(word, context, tLang, nLang) {
  const result = await callGroq(`Concise dictionary. Translate from ${tLang} to ${nLang}. ONLY the translation. Pick the meaning that fits the context.`, `Word: "${word}"\nContext: "${context}"`, 100);
  return { translation: result || '⚠ Configura tu API key en el popup' };
}

async function explain(word, context, tLang, nLang) {
  const result = await callGroq(`You are a language tutor helping a ${nLang} speaker learn ${tLang}. Respond in JSON only, no markdown, no backticks. Fields: "translation" (in ${nLang}), "grammar" (in ${nLang}, or ""), "examples" (array of 2-3 with "sentence" in ${tLang} and "translation" in ${nLang}), "tip" (in ${nLang}, or "")`, `Word: "${word}"\nContext: "${context}"`, 500);
  try { if (result) return { explanation: JSON.parse(result) }; } catch (e) { return { explanation: { translation: result, grammar: '', examples: [], tip: '' } }; }
  return { explanation: null };
}

async function generateClozeHint(word, sentence, targetLang) {
  const result = await callGroq(`You are creating a vocabulary exercise in ${targetLang}. Give a short, clear definition of the hidden word IN ${targetLang}. Do not include the word itself. One sentence only. Output ONLY the hint.`, `Hidden word: "${word}"\nFull sentence: "${sentence}"`, 100);
  return { hint: result || null };
}

// --- SRS ---
const SRS_INTERVALS = [[0.17,1,4,24],[1,8,24,72],[24,48,72,168],[72,168,336,720],[168,336,720,1440]];
function getSrsInterval(level, quality) { return SRS_INTERVALS[Math.min(level, SRS_INTERVALS.length - 1)][quality] * 3600000; }
function initSrsData(item) {
  if (!item.srs) item.srs = { level: 0, nextReview: item.timestamp || Date.now(), lastReview: null, reviews: 0, streak: 0 };
  if (!item.mastery) item.mastery = { clozeStreak: 0, reorderStreak: 0, clozeMastered: false, reorderMastered: false };
  return item;
}

async function saveWord(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      if (v.some(x => x.word === data.word && x.targetLang === data.targetLang)) return resolve({ success: true, duplicate: true });
      v.push(initSrsData(data));
      chrome.storage.local.set({ vocabulary: v }, () => { chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' }).catch(() => {}); resolve({ success: true, totalWords: v.length }); });
    });
  });
}

async function deleteWord(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      const filtered = v.filter(x => !(x.word === data.word && x.targetLang === data.targetLang && x.timestamp === data.timestamp));
      chrome.storage.local.set({ vocabulary: filtered }, () => { chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' }).catch(() => {}); resolve({ success: true }); });
    });
  });
}

async function reviewWord(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      const item = v.find(x => x.word === data.word && x.targetLang === data.targetLang && x.timestamp === data.timestamp);
      if (!item) return resolve({ success: false });
      initSrsData(item);
      if (data.quality === 0) { item.srs.level = 0; item.srs.streak = 0; }
      else { if (data.quality >= 2) item.srs.level = Math.min(item.srs.level + 1, SRS_INTERVALS.length - 1); item.srs.streak++; }
      item.srs.nextReview = Date.now() + getSrsInterval(item.srs.level, data.quality);
      item.srs.lastReview = Date.now(); item.srs.reviews++;
      chrome.storage.local.set({ vocabulary: v }, () => resolve({ success: true }));
    });
  });
}

async function updateMastery(data) {
  // data: { word, targetLang, timestamp, mode: 'cloze'|'reorder', correct: bool }
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      const item = v.find(x => x.word === data.word && x.targetLang === data.targetLang && x.timestamp === data.timestamp);
      if (!item) return resolve({ success: false });
      initSrsData(item);
      const m = item.mastery;
      if (data.mode === 'cloze') {
        m.clozeStreak = data.correct ? m.clozeStreak + 1 : 0;
        if (m.clozeStreak >= 3) m.clozeMastered = true;
      } else if (data.mode === 'reorder') {
        m.reorderStreak = data.correct ? m.reorderStreak + 1 : 0;
        if (m.reorderStreak >= 3) m.reorderMastered = true;
      }
      chrome.storage.local.set({ vocabulary: v }, () => resolve({
        success: true, mastery: m,
        justMastered: (data.mode === 'cloze' && m.clozeMastered && m.clozeStreak === 3) ||
                      (data.mode === 'reorder' && m.reorderMastered && m.reorderStreak === 3),
      }));
    });
  });
}

async function resetMastery(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      const item = v.find(x => x.word === data.word && x.targetLang === data.targetLang && x.timestamp === data.timestamp);
      if (!item) return resolve({ success: false });
      initSrsData(item);
      if (data.mode === 'cloze') { item.mastery.clozeMastered = false; item.mastery.clozeStreak = 0; }
      else if (data.mode === 'reorder') { item.mastery.reorderMastered = false; item.mastery.reorderStreak = 0; }
      else { item.mastery = { clozeStreak: 0, reorderStreak: 0, clozeMastered: false, reorderMastered: false }; }
      chrome.storage.local.set({ vocabulary: v }, () => { chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' }).catch(() => {}); resolve({ success: true }); });
    });
  });
}

async function getDueCards() {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      const now = Date.now();
      const due = v.filter(x => { initSrsData(x); return x.srs.nextReview <= now; }).sort((a, b) => a.srs.nextReview - b.srs.nextReview);
      resolve({ cards: due, stats: { total: v.length, due: due.length, learned: v.filter(x => x.srs?.level >= 3).length, newCards: v.filter(x => !x.srs || x.srs.reviews === 0).length } });
    });
  });
}

const toCSV = v => 'word,translation,context,language,date\n' + v.map(x => `"${x.word}","${x.translation||''}","${x.context||''}","${x.targetLang}","${new Date(x.timestamp).toISOString()}"`).join('\n');
const toAnki = v => v.map(x => `${x.word} — ${x.context||''}\t${x.translation||''}`).join('\n');

chrome.runtime.onMessage.addListener((msg, _, reply) => {
  switch (msg.type) {
    case 'TRANSLATE_WORD': translate(msg.word, msg.context, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'AI_EXPLAIN': explain(msg.word, msg.context, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'CLOZE_HINT': generateClozeHint(msg.word, msg.sentence, msg.targetLang).then(reply); return true;
    case 'SAVE_WORD': saveWord(msg).then(reply); return true;
    case 'DELETE_WORD': deleteWord(msg).then(reply); return true;
    case 'REVIEW_WORD': reviewWord(msg).then(reply); return true;
    case 'UPDATE_MASTERY': updateMastery(msg).then(reply); return true;
    case 'RESET_MASTERY': resetMastery(msg).then(reply); return true;
    case 'GET_DUE_CARDS': getDueCards().then(reply); return true;
    case 'GET_VOCABULARY': chrome.storage.local.get(['vocabulary'], r => reply({ vocabulary: r.vocabulary || [] })); return true;
    case 'EXPORT_VOCABULARY': chrome.storage.local.get(['vocabulary'], r => { const v = r.vocabulary||[]; reply({ csv: toCSV(v), anki: toAnki(v) }); }); return true;
    case 'CAPTION_FOR_PANEL': chrome.runtime.sendMessage({ type: 'CAPTION_UPDATE', target: msg.target, native: msg.native, time: msg.time, startMs: msg.startMs, endMs: msg.endMs }).catch(() => {}); return false;
    case 'CHECK_API_KEY': getKey().then(k => reply({ hasKey: !!k })); return true;
    case 'SAVE_API_KEY': chrome.storage.sync.set({ groqApiKey: msg.key }, () => reply({ success: true })); return true;
  }
});
console.log('[LL] Service worker ready');
