/**
 * service-worker.js — Background (Manifest V3)
 * Groq API for word translation, AI explanations with examples.
 * Subtitles come from YouTube directly (no API needed).
 */
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

async function translate(word, context, tLang, nLang) {
  const result = await callGroq(
    `Concise dictionary. Translate from ${tLang} to ${nLang}. ONLY the translation, nothing else. Pick the meaning that fits the context.`,
    `Word: "${word}"\nContext: "${context}"`,
    100
  );
  return { translation: result || '⚠ Configura tu API key en el popup' };
}

async function explain(word, context, tLang, nLang) {
  const result = await callGroq(
    `You are a language tutor helping a ${nLang} speaker learn ${tLang}. Respond in JSON format only, no markdown, no backticks. The JSON must have these fields:
- "translation": the word's translation in this specific context (in ${nLang})
- "grammar": a brief grammar note if relevant (part of speech, conjugation, etc.) in ${nLang}, or empty string if not needed
- "examples": array of 2-3 example sentences using the word in ${tLang}, each with a "sentence" field (in ${tLang}) and a "translation" field (in ${nLang}). Choose examples that show common real-world usage at an intermediate level.
- "tip": one short practical tip for remembering or using this word (in ${nLang}), or empty string`,
    `Word: "${word}"\nSentence context: "${context}"`,
    500
  );

  try {
    if (result) {
      const parsed = JSON.parse(result);
      return { explanation: parsed };
    }
  } catch (e) {
    // If JSON parse fails, return as plain text
    return { explanation: { translation: result, grammar: '', examples: [], tip: '' } };
  }
  return { explanation: null };
}

async function saveWord(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocabulary'], r => {
      const v = r.vocabulary || [];
      if (v.some(x => x.word === data.word && x.targetLang === data.targetLang))
        return resolve({ success: true, duplicate: true });
      v.push(data);
      chrome.storage.local.set({ vocabulary: v }, () => {
        chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' }).catch(() => {});
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
        chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' }).catch(() => {});
        resolve({ success: true, remaining: filtered.length });
      });
    });
  });
}

const toCSV = v => 'word,translation,context,language,date\n' +
  v.map(x => `"${x.word}","${x.translation||''}","${x.context||''}","${x.targetLang}","${new Date(x.timestamp).toISOString()}"`).join('\n');
const toAnki = v => v.map(x => `${x.word} — ${x.context||''}\t${x.translation||''}`).join('\n');

chrome.runtime.onMessage.addListener((msg, _, reply) => {
  switch (msg.type) {
    case 'TRANSLATE_WORD': translate(msg.word, msg.context, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'AI_EXPLAIN': explain(msg.word, msg.context, msg.targetLang, msg.nativeLang).then(reply); return true;
    case 'SAVE_WORD': saveWord(msg).then(reply); return true;
    case 'DELETE_WORD': deleteWord(msg).then(reply); return true;
    case 'GET_VOCABULARY': chrome.storage.local.get(['vocabulary'], r => reply({ vocabulary: r.vocabulary || [] })); return true;
    case 'EXPORT_VOCABULARY': chrome.storage.local.get(['vocabulary'], r => { const v = r.vocabulary||[]; reply({ csv: toCSV(v), anki: toAnki(v) }); }); return true;
    case 'CAPTION_FOR_PANEL': chrome.runtime.sendMessage({ type: 'CAPTION_UPDATE', target: msg.target, native: msg.native, time: msg.time }).catch(() => {}); return false;
    case 'CHECK_API_KEY': getKey().then(k => reply({ hasKey: !!k })); return true;
    case 'SAVE_API_KEY': chrome.storage.sync.set({ groqApiKey: msg.key }, () => reply({ success: true })); return true;
  }
});

console.log('[LL] Service worker ready (YouTube translation + optional Groq AI)');
