/**
 * service-worker.js — Background (Manifest V3)
 * Traducción y explicación AI vía Groq API (Llama 3.3 70B), vocabulario, exportación CSV/Anki.
 */
const CONFIG = {
  GROQ_API_KEY: '', // ← Tu API key de Groq aquí (gratis en console.groq.com)
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  GROQ_URL: 'https://api.groq.com/openai/v1/chat/completions',
};

async function getKey() {
  if (CONFIG.GROQ_API_KEY) return CONFIG.GROQ_API_KEY;
  return new Promise(r => chrome.storage.sync.get(['groqApiKey'], x => r(x.groqApiKey || '')));
}

async function callGroq(systemPrompt, userPrompt, maxTokens = 150) {
  const key = await getKey();
  if (!key) return null;
  try {
    const res = await fetch(CONFIG.GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: CONFIG.GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[LL] Groq API error:', err);
    return null;
  }
}

async function translateSentence(text, tLang, nLang) {
  const result = await callGroq(
    `You are a subtitle translator. Translate the following subtitle line from ${tLang} to ${nLang}. Output ONLY the translation, nothing else. Keep it natural and concise.`,
    text,
    200
  );
  return { translation: result || '' };
}

async function translate(word, context, tLang, nLang) {
  const result = await callGroq(
    `Concise dictionary. Translate from ${tLang} to ${nLang}. ONLY the translation, nothing else. Pick the meaning that fits the context.`,
    `Word: "${word}"\nContext: "${context}"`,
    100
  );
  return { translation: result || '⚠ Configura tu Groq API key' };
}

async function explain(word, context, tLang, nLang) {
  const result = await callGroq(
    `Language tutor for ${tLang} learners who speak ${nLang}. Explain in ${nLang}:
1. Translation in this context
2. Grammar note if relevant
3. One usage example
Max 3-4 sentences. Warm but concise.`,
    `Word: "${word}"\nSentence: "${context}"`,
    300
  );
  return { explanation: result || 'Configura tu Groq API key en service-worker.js (gratis en console.groq.com)' };
}

async function saveWord(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      if (v.some(x => x.word === data.word && x.targetLang === data.targetLang))
        return resolve({ success: true, duplicate: true });
      v.push(data);
      chrome.storage.local.set({ vocabulary: v }, () => {
        // Notify sidepanel to refresh
        notifySidePanel({ type: 'VOCAB_UPDATED' });
        resolve({ success: true, totalWords: v.length });
      });
    });
  });
}

async function deleteWord(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      const filtered = v.filter(x =>
        !(x.word === data.word && x.targetLang === data.targetLang && x.timestamp === data.timestamp)
      );
      chrome.storage.local.set({ vocabulary: filtered }, () => {
        notifySidePanel({ type: 'VOCAB_UPDATED' });
        resolve({ success: true, remaining: filtered.length });
      });
    });
  });
}

function notifySidePanel(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

const toCSV = v => 'word,translation,context,language,date\n' +
  v.map(x => `"${x.word}","${x.translation||''}","${x.context||''}","${x.targetLang}","${new Date(x.timestamp).toISOString()}"`).join('\n');
const toAnki = v => v.map(x => `${x.word} — ${x.context||''}\t${x.translation||''}`).join('\n');

chrome.runtime.onMessage.addListener((msg, _, reply) => {
  switch (msg.type) {
    case 'TRANSLATE_SENTENCE': translateSentence(msg.text, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'TRANSLATE_WORD': translate(msg.word, msg.context, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'AI_EXPLAIN': explain(msg.word, msg.context, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'SAVE_WORD': saveWord(msg).then(reply); return true;
    case 'DELETE_WORD': deleteWord(msg).then(reply); return true;
    case 'GET_VOCABULARY': chrome.storage.local.get(['vocabulary'], r => reply({ vocabulary: r.vocabulary || [] })); return true;
    case 'EXPORT_VOCABULARY': chrome.storage.local.get(['vocabulary'], r => { const v = r.vocabulary||[]; reply({ csv: toCSV(v), anki: toAnki(v) }); }); return true;
    case 'CAPTION_FOR_PANEL': notifySidePanel({ type: 'CAPTION_UPDATE', target: msg.target, native: msg.native, time: msg.time }); return false;
  }
});

console.log('[LL] Service worker ready (Groq + Llama 3.3 70B)');
