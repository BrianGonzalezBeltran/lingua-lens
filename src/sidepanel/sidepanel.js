document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ll-panel-close').addEventListener('click', () => window.close());
  const tabs = document.querySelectorAll('.ll-tab');
  const tabContents = document.querySelectorAll('.ll-tab-content');
  tabs.forEach(tab => { tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('ll-tab-active')); tabContents.forEach(c => c.classList.remove('ll-tab-visible'));
    tab.classList.add('ll-tab-active'); document.getElementById(`tab-${tab.dataset.tab}`).classList.add('ll-tab-visible');
    if (tab.dataset.tab === 'vocabulary') loadVocabulary(); if (tab.dataset.tab === 'practice') showPracticeModes();
  }); });

  // ===== TRANSCRIPT =====
  const transcriptList = document.getElementById('ll-transcript');
  const transcriptToolbar = document.getElementById('ll-transcript-toolbar');
  const transcriptCount = document.getElementById('ll-transcript-count');
  const autoscrollBtn = document.getElementById('ll-transcript-autoscroll');
  function fmt(s) { return `${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`; }
  const seenTexts = new Set(); let entryCount = 0, autoScroll = true;
  transcriptList.addEventListener('wheel', (e) => { if (e.deltaY<0&&autoScroll){autoScroll=false;updateAB();} if(e.deltaY>0&&!autoScroll){setTimeout(()=>{if(transcriptList.scrollHeight-transcriptList.scrollTop-transcriptList.clientHeight<60){autoScroll=true;updateAB();}},50);} });
  autoscrollBtn.addEventListener('click', () => { autoScroll=!autoScroll; updateAB(); if(autoScroll)doAS(); });
  function doAS() { transcriptList.scrollTop=transcriptList.scrollHeight; }
  function updateAB() { autoscrollBtn.className=autoScroll?'ll-transcript-autoscroll ll-autoscroll-on':'ll-transcript-autoscroll ll-autoscroll-off'; autoscrollBtn.textContent=autoScroll?'⬇ Auto':'⏸ Auto'; }
  function updateTB() { transcriptToolbar.style.display=entryCount>0?'flex':'none'; transcriptCount.textContent=`${entryCount} frases`; }
  document.getElementById('ll-transcript-clear').addEventListener('click', () => { seenTexts.clear();entryCount=0;transcriptList.innerHTML='<p class="ll-empty-state">Transcripción limpiada.</p>';updateTB(); });
  function seekTo(t) { chrome.tabs.query({active:true,currentWindow:true},([tab])=>{if(tab)chrome.tabs.sendMessage(tab.id,{type:'SEEK_TO',timeMs:t*1000});}); }
  function playSegment(startMs, endMs) {
    chrome.tabs.query({active:true,currentWindow:true},([tab])=>{
      if(tab) chrome.tabs.sendMessage(tab.id,{type:'PLAY_SEGMENT',startMs,endMs});
    });
  }
  function renderAi(d,a) { if(!a){d.textContent='Configura tu API key';return;} let h=''; if(a.translation)h+=`<div class="ll-vocab-ai-translation">${a.translation}</div>`; if(a.grammar)h+=`<div class="ll-vocab-ai-grammar">${a.grammar}</div>`; if(a.examples?.length){h+='<div class="ll-vocab-ai-examples">';a.examples.forEach(e=>{h+=`<div class="ll-vocab-ai-example"><div class="ll-vocab-ai-sentence">${e.sentence}</div><div class="ll-vocab-ai-trans">${e.translation}</div></div>`;});h+='</div>';} if(a.tip)h+=`<div class="ll-vocab-ai-tip">💡 ${a.tip}</div>`; d.innerHTML=h; }
  function reqExplain(w,c,d) { if(d.style.display==='block'){d.style.display='none';return;} d.style.display='block';d.innerHTML='<span class="ll-vocab-loading">Pensando...</span>'; chrome.runtime.sendMessage({type:'AI_EXPLAIN',word:w,context:c||'',targetLang:'en',nativeLang:'es'},r=>renderAi(d,r?.explanation)); }
  function addTE(target,native,time) {
    if(seenTexts.has(target))return; seenTexts.add(target);entryCount++;
    const e=document.createElement('div');e.className='ll-transcript-entry';
    e.innerHTML=`<div class="ll-transcript-entry-header"><span class="ll-transcript-time">${fmt(time)}</span><button class="ll-transcript-save">⭐</button></div><div class="ll-transcript-target">${target}</div>${native?`<div class="ll-transcript-native">${native}</div>`:''}<div class="ll-transcript-entry-footer"><button class="ll-transcript-explain">🧠</button></div><div class="ll-transcript-ai" style="display:none"></div>`;
    e.addEventListener('click',ev=>{if(!ev.target.closest('.ll-transcript-save')&&!ev.target.closest('.ll-transcript-explain'))seekTo(time);});
    e.querySelector('.ll-transcript-save').addEventListener('click',ev=>{ev.stopPropagation();const b=ev.target;chrome.runtime.sendMessage({type:'SAVE_WORD',word:target,translation:native||'',context:'',targetLang:'',timestamp:Date.now()},r=>{if(r?.success){b.textContent=r.duplicate?'⚠':'✅';b.disabled=true;setTimeout(()=>{b.textContent='⭐';b.disabled=false;},2000);}});});
    e.querySelector('.ll-transcript-explain').addEventListener('click',ev=>{ev.stopPropagation();reqExplain(target,'',e.querySelector('.ll-transcript-ai'));});
    const es=transcriptList.querySelector('.ll-empty-state');if(es)es.remove();
    transcriptList.appendChild(e);if(autoScroll)doAS();updateTB();
  }
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='CAPTION_UPDATE')addTE(msg.target||'',msg.native||'',msg.time||0);if(msg.type==='VOCAB_UPDATED')loadVocabulary();});

  // ===== VOCABULARY =====
  const vocabList=document.getElementById('ll-vocab-list');let allVocab=[];
  function renderVocab(vocab) {
    if(!vocab.length){vocabList.innerHTML='<p class="ll-empty-state">Guarda palabras con ⭐</p>';return;}
    // Split into active and mastered
    const active = vocab.filter(x => !x.mastery?.clozeMastered || !x.mastery?.reorderMastered);
    const mastered = vocab.filter(x => x.mastery?.clozeMastered && x.mastery?.reorderMastered);
    vocabList.innerHTML = '';
    
    [...active].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).forEach(item => renderVocabCard(item, false));
    
    if (mastered.length) {
      const section = document.createElement('div');
      section.className = 'll-vocab-mastered-section';
      section.innerHTML = `<div class="ll-vocab-mastered-header" id="ll-mastered-toggle"><span>🏆 Aprendidas (${mastered.length})</span><span class="ll-mastered-arrow">▸</span></div><div class="ll-vocab-mastered-list" id="ll-mastered-list" style="display:none"></div>`;
      vocabList.appendChild(section);
      
      const list = section.querySelector('#ll-mastered-list');
      const header = section.querySelector('#ll-mastered-toggle');
      const arrow = section.querySelector('.ll-mastered-arrow');
      header.addEventListener('click', () => {
        const open = list.style.display === 'none';
        list.style.display = open ? 'flex' : 'none';
        arrow.textContent = open ? '▾' : '▸';
      });
      
      [...mastered].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).forEach(item => {
        const card = renderVocabCard(item, true);
        list.appendChild(card);
      });
    }
  }
  
  function renderVocabCard(item, isMastered) {
    const card=document.createElement('div');card.className='ll-vocab-card' + (isMastered ? ' ll-vocab-card-mastered' : '');
    const date=item.timestamp?new Date(item.timestamp).toLocaleDateString('es-CO',{day:'numeric',month:'short'}):'';
    const masteryBadges = [];
    if (item.mastery?.clozeMastered) masteryBadges.push('✏️');
    if (item.mastery?.reorderMastered) masteryBadges.push('🔀');
    
    card.innerHTML=`<div class="ll-vocab-card-header"><div class="ll-vocab-word">${item.word}</div><button class="ll-vocab-delete">✕</button></div>
      <div class="ll-vocab-translation">${item.translation||''}</div>
      ${item.context?`<div class="ll-vocab-context">"${item.context}"</div>`:''}
      <div class="ll-vocab-card-footer">
        ${date?`<span class="ll-vocab-date">${date} ${masteryBadges.join('')}</span>`:''}
        <div class="ll-vocab-footer-actions">
          ${isMastered ? '<button class="ll-vocab-unpractice" title="Volver a practicar">↩</button>' : ''}
          <button class="ll-vocab-explain">🧠</button>
        </div>
      </div>
      <div class="ll-vocab-ai" style="display:none"></div>`;
    card.querySelector('.ll-vocab-explain').addEventListener('click',e=>{e.stopPropagation();reqExplain(item.word,item.context||'',card.querySelector('.ll-vocab-ai'));});
    card.querySelector('.ll-vocab-delete').addEventListener('click',e=>{e.stopPropagation();chrome.runtime.sendMessage({type:'DELETE_WORD',word:item.word,targetLang:item.targetLang,timestamp:item.timestamp},()=>loadVocabulary());});
    if (isMastered) {
      card.querySelector('.ll-vocab-unpractice')?.addEventListener('click', e => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'RESET_MASTERY', word: item.word, targetLang: item.targetLang, timestamp: item.timestamp }, () => loadVocabulary());
      });
    }
    vocabList.appendChild(card);
    return card;
  }
  
  function loadVocabulary(){chrome.runtime.sendMessage({type:'GET_VOCABULARY'},r=>{allVocab=r?.vocabulary||[];renderVocab(allVocab);});}
  document.getElementById('ll-vocab-search').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();renderVocab(q?allVocab.filter(v=>v.word.toLowerCase().includes(q)||(v.translation||'').toLowerCase().includes(q)):allVocab);});
  function download(c,f,t){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:t}));a.download=f;a.click();}
  document.getElementById('ll-export-csv').addEventListener('click',()=>{chrome.runtime.sendMessage({type:'EXPORT_VOCABULARY'},r=>{if(r?.csv)download(r.csv,'lingualens-vocab.csv','text/csv');});});
  document.getElementById('ll-export-anki').addEventListener('click',()=>{chrome.runtime.sendMessage({type:'EXPORT_VOCABULARY'},r=>{if(r?.anki)download(r.anki,'lingualens-anki.txt','text/plain');});});

  // ===== PRACTICE =====
  const P = document.getElementById('ll-practice');
  const SRS = [[.17,1,4,24],[1,8,24,72],[24,48,72,168],[72,168,336,720],[168,336,720,1440]];
  function srsP(c,q){let l=c.srs?.level||0;if(q===0)l=0;else if(q>=2)l=Math.min(l+1,SRS.length-1);return SRS[Math.min(l,SRS.length-1)][q]*3600000;}
  function fT(ms){const h=ms/3600000;if(h<1)return`${Math.round(h*60)} min`;if(h<24)return`${Math.round(h)} h`;if(h<168)return`${Math.round(h/24)} días`;return`${Math.round(h/168)} sem`;}
  function shuf(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}

  function showPracticeModes() {
    chrome.runtime.sendMessage({type:'GET_DUE_CARDS'},res=>{
      const s=res?.stats||{total:0,due:0,learned:0,newCards:0};
      if(!s.total){P.innerHTML='<div class="ll-practice-empty"><div class="ll-practice-empty-icon">📚</div><div class="ll-practice-empty-title">No hay palabras guardadas</div></div>';return;}
      chrome.runtime.sendMessage({type:'GET_VOCABULARY'},vr=>{
        const aw=vr?.vocabulary||[];
        const clozeAvail=aw.filter(w=>(w.context||w.word.split(/\s+/).length>3)&&!w.mastery?.clozeMastered).length;
        const clozeMastered=aw.filter(w=>w.mastery?.clozeMastered).length;
        const reorderAvail=aw.filter(w=>w.word.split(/\s+/).length>3&&!w.mastery?.reorderMastered).length;
        const reorderMastered=aw.filter(w=>w.mastery?.reorderMastered).length;
        P.innerHTML=`<div class="ll-practice-menu">
          <div class="ll-practice-stats-bar">
            <div class="ll-practice-stat-mini"><span class="ll-stat-num">${s.due}</span> pendientes</div>
            <div class="ll-practice-stat-mini"><span class="ll-stat-num">${s.learned}</span> aprendidas</div>
            <div class="ll-practice-stat-mini"><span class="ll-stat-num">${s.total}</span> total</div>
          </div>
          <div class="ll-practice-modes">
            <button class="ll-mode-card" id="ll-mode-flashcard"><span class="ll-mode-icon">🃏</span><div><span class="ll-mode-title">Flashcards</span><br><span class="ll-mode-desc">Traducción con repetición espaciada</span></div>${s.due>0?`<span class="ll-mode-badge">${s.due}</span>`:'<span class="ll-mode-badge ll-badge-done">✓</span>'}</button>
            <button class="ll-mode-card" id="ll-mode-cloze"><span class="ll-mode-icon">✏️</span><div><span class="ll-mode-title">Completar frase</span><br><span class="ll-mode-desc">3 aciertos seguidos = dominada</span></div><span class="ll-mode-badge">${clozeAvail}</span>${clozeMastered?`<span class="ll-mode-badge ll-badge-done">🏆${clozeMastered}</span>`:''}</button>
            <button class="ll-mode-card" id="ll-mode-reorder"><span class="ll-mode-icon">🔀</span><div><span class="ll-mode-title">Ordenar frase</span><br><span class="ll-mode-desc">3 aciertos seguidos = dominada</span></div><span class="ll-mode-badge">${reorderAvail}</span>${reorderMastered?`<span class="ll-mode-badge ll-badge-done">🏆${reorderMastered}</span>`:''}</button>
          </div>
        </div>`;
        document.getElementById('ll-mode-flashcard').addEventListener('click',startFC);
        document.getElementById('ll-mode-cloze').addEventListener('click',()=>startCloze(aw));
        document.getElementById('ll-mode-reorder').addEventListener('click',()=>startReorder(aw));
      });
    });
  }

  // ===== FLASHCARDS =====
  let dc=[],ci=0;
  function startFC(){chrome.runtime.sendMessage({type:'GET_DUE_CARDS'},r=>{dc=r?.cards||[];ci=0;if(!dc.length){P.innerHTML='<div class="ll-practice-done"><div class="ll-practice-done-icon">🎉</div><div class="ll-practice-done-title">¡Todo al día!</div><button class="ll-back-btn" id="ll-back">← Volver</button></div>';document.getElementById('ll-back').addEventListener('click',showPracticeModes);return;}rFC();});}
  function rFC(){
    if(ci>=dc.length){showPracticeModes();return;}const c=dc[ci],rem=dc.length-ci;
    P.innerHTML=`<div class="ll-practice-header"><button class="ll-back-btn" id="ll-back">←</button><span class="ll-practice-remaining">${rem} pendiente${rem!==1?'s':''}</span><span class="ll-practice-level">Nivel ${c.srs?.level||0}</span></div>
      <div class="ll-flashcard"><div class="ll-flashcard-label">${c.word.split(/\s+/).length>3?'Frase':'Palabra'}</div><div class="ll-flashcard-word">${c.word}</div>${c.context?`<div class="ll-flashcard-context">"${c.context}"</div>`:''}<div id="ll-fc-back" style="display:none"><div class="ll-flashcard-divider"></div><div class="ll-flashcard-translation">${c.translation||''}</div></div><button class="ll-flashcard-reveal" id="ll-fc-rev">Mostrar traducción</button></div>
      <div class="ll-practice-buttons" id="ll-fc-btns" style="display:none"><button class="ll-practice-btn ll-btn-again" data-q="0"><span class="ll-btn-label">Otra vez</span><span class="ll-btn-time">${fT(srsP(c,0))}</span></button><button class="ll-practice-btn ll-btn-hard" data-q="1"><span class="ll-btn-label">Difícil</span><span class="ll-btn-time">${fT(srsP(c,1))}</span></button><button class="ll-practice-btn ll-btn-good" data-q="2"><span class="ll-btn-label">Bien</span><span class="ll-btn-time">${fT(srsP(c,2))}</span></button><button class="ll-practice-btn ll-btn-easy" data-q="3"><span class="ll-btn-label">Fácil</span><span class="ll-btn-time">${fT(srsP(c,3))}</span></button></div>`;
    document.getElementById('ll-back').addEventListener('click',showPracticeModes);
    document.getElementById('ll-fc-rev').addEventListener('click',()=>{document.getElementById('ll-fc-back').style.display='block';document.getElementById('ll-fc-rev').style.display='none';document.getElementById('ll-fc-btns').style.display='flex';});
    document.querySelectorAll('.ll-practice-btn').forEach(b=>{b.addEventListener('click',()=>{chrome.runtime.sendMessage({type:'REVIEW_WORD',word:dc[ci].word,targetLang:dc[ci].targetLang,timestamp:dc[ci].timestamp,quality:parseInt(b.dataset.q)},()=>{ci++;rFC();});});});
  }

  // ===== CLOZE =====
  let cz=[],czi=0,czs={c:0,t:0};
  function startCloze(aw){
    const cands=aw.filter(w=>(w.context||w.word.split(/\s+/).length>3)&&!w.mastery?.clozeMastered);
    if(!cands.length){P.innerHTML='<div class="ll-practice-empty"><div class="ll-practice-empty-icon">✏️</div><div class="ll-practice-empty-title">¡Todas las frases dominadas!</div><button class="ll-back-btn" id="ll-back">← Volver</button></div>';document.getElementById('ll-back').addEventListener('click',showPracticeModes);return;}
    cz=shuf(cands).slice(0,10);czi=0;czs={c:0,t:0};rCZ();
  }
  function rCZ(){
    if(czi>=cz.length){const p=czs.t?Math.round(czs.c/czs.t*100):0;P.innerHTML=`<div class="ll-practice-done"><div class="ll-practice-done-icon">✏️</div><div class="ll-practice-done-title">Sesión completada</div><div class="ll-practice-done-text">${czs.c} de ${czs.t} correctas (${p}%)</div><div class="ll-practice-score-bar"><div class="ll-practice-score-fill" style="width:${p}%"></div></div><button class="ll-back-btn" id="ll-back">← Volver</button></div>`;document.getElementById('ll-back').addEventListener('click',showPracticeModes);return;}
    const item=cz[czi],sent=item.context||item.word,words=sent.split(/\s+/);
    let hi=-1;
    if(item.context&&item.word){const sc=item.word.toLowerCase().replace(/[^a-z']/g,'');hi=words.findIndex(w=>w.toLowerCase().replace(/[^a-z']/g,'')===sc);}
    if(hi===-1){const ci2=words.map((w,i)=>({w,i})).filter(x=>x.w.replace(/[^a-z']/gi,'').length>3);hi=ci2.length?ci2[Math.floor(Math.random()*ci2.length)].i:Math.floor(Math.random()*words.length);}
    const hw=words[hi],chw=hw.replace(/[^a-zA-Z']/g,'');
    const disp=words.map((w,i)=>i===hi?'<span class="ll-cloze-blank">____</span>':w).join(' ');
    const rem=cz.length-czi;
    const streak=item.mastery?.clozeStreak||0;

    P.innerHTML=`<div class="ll-practice-header"><button class="ll-back-btn" id="ll-back">←</button><span class="ll-practice-remaining">${rem} restante${rem!==1?'s':''}</span><span class="ll-practice-score-mini">${czs.c}/${czs.t} · racha: ${streak}/3</span></div>
      <div class="ll-cloze-card"><div class="ll-cloze-label">Complete the sentence</div><div class="ll-cloze-sentence">${disp}</div>
      <div class="ll-cloze-ai-hint" id="ll-cz-hint"><span class="ll-popup-loading">Generating hint...</span></div>
      <div class="ll-cloze-input-row"><input type="text" class="ll-cloze-input" id="ll-cz-in" placeholder="Type the missing word..." autocomplete="off" spellcheck="false"><button class="ll-cloze-check" id="ll-cz-chk">→</button></div>
      <div class="ll-cloze-actions"><button class="ll-cloze-hint-btn" id="ll-cz-lh" style="display:none">💡 First letter</button><button class="ll-cloze-skip" id="ll-cz-sk">Skip →</button>${item.startMs!=null?'<button class="ll-cloze-listen" id="ll-cz-listen">🔊 Listen</button>':''}</div>
      <div class="ll-cloze-result" id="ll-cz-res" style="display:none"></div></div>`;

    document.getElementById('ll-back').addEventListener('click',showPracticeModes);
    const inp=document.getElementById('ll-cz-in');inp.focus();

    chrome.runtime.sendMessage({type:'CLOZE_HINT',word:chw,sentence:sent,targetLang:'en'},r=>{
      const h=document.getElementById('ll-cz-hint');
      if(r?.hint){h.innerHTML=`<span class="ll-cloze-hint-icon">💡</span> ${r.hint}`;document.getElementById('ll-cz-lh').style.display='inline-block';}
      else h.innerHTML=`<span class="ll-cloze-hint-icon">💡</span> First letter: <strong>${chw[0].toUpperCase()}</strong>`;
    });
    document.getElementById('ll-cz-lh').addEventListener('click',()=>{document.getElementById('ll-cz-hint').innerHTML+=` — First letter: <strong>${chw[0].toUpperCase()}</strong>`;document.getElementById('ll-cz-lh').style.display='none';});

    function chk(){
      const ans=inp.value.trim().toLowerCase();if(!ans)return;
      const correct=ans===chw.toLowerCase()||ans===chw.toLowerCase().replace(/[^a-z']/g,'');
      czs.t++;if(correct)czs.c++;
      // Update mastery
      chrome.runtime.sendMessage({type:'UPDATE_MASTERY',word:item.word,targetLang:item.targetLang,timestamp:item.timestamp,mode:'cloze',correct},r=>{
        const res=document.getElementById('ll-cz-res');res.style.display='block';
        res.className=`ll-cloze-result ${correct?'ll-cloze-correct':'ll-cloze-wrong'}`;
        if(r?.justMastered) res.innerHTML='🏆 ¡Dominada! 3 aciertos seguidos';
        else if(correct) res.innerHTML=`✓ Correct! (${(r?.mastery?.clozeStreak||0)}/3)`;
        else res.innerHTML=`✗ The answer was: <strong>${chw}</strong> (racha reiniciada)`;
        inp.disabled=true;document.getElementById('ll-cz-chk').disabled=true;
        setTimeout(()=>{czi++;rCZ();},correct?1200:2500);
      });
    }
    document.getElementById('ll-cz-chk').addEventListener('click',chk);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')chk();});
    if(document.getElementById('ll-cz-listen')){document.getElementById('ll-cz-listen').addEventListener('click',()=>playSegment(item.startMs,item.endMs));}
    document.getElementById('ll-cz-sk').addEventListener('click',()=>{
      czs.t++;
      chrome.runtime.sendMessage({type:'UPDATE_MASTERY',word:item.word,targetLang:item.targetLang,timestamp:item.timestamp,mode:'cloze',correct:false},()=>{
        const res=document.getElementById('ll-cz-res');res.style.display='block';res.className='ll-cloze-result ll-cloze-wrong';
        res.innerHTML=`The answer was: <strong>${chw}</strong>`;inp.disabled=true;
        setTimeout(()=>{czi++;rCZ();},2000);
      });
    });
  }

  // ===== REORDER =====
  let ro=[],roi=0,ros={c:0,t:0};
  function startReorder(aw){
    const cands=aw.filter(w=>w.word.split(/\s+/).length>3&&!w.mastery?.reorderMastered);
    if(!cands.length){P.innerHTML='<div class="ll-practice-empty"><div class="ll-practice-empty-icon">🔀</div><div class="ll-practice-empty-title">¡Todas las frases dominadas!</div><button class="ll-back-btn" id="ll-back">← Volver</button></div>';document.getElementById('ll-back').addEventListener('click',showPracticeModes);return;}
    ro=shuf(cands).slice(0,10);roi=0;ros={c:0,t:0};rRO();
  }
  function rRO(){
    if(roi>=ro.length){const p=ros.t?Math.round(ros.c/ros.t*100):0;P.innerHTML=`<div class="ll-practice-done"><div class="ll-practice-done-icon">🔀</div><div class="ll-practice-done-title">Sesión completada</div><div class="ll-practice-done-text">${ros.c} de ${ros.t} correctas (${p}%)</div><div class="ll-practice-score-bar"><div class="ll-practice-score-fill" style="width:${p}%"></div></div><button class="ll-back-btn" id="ll-back">← Volver</button></div>`;document.getElementById('ll-back').addEventListener('click',showPracticeModes);return;}
    const item=ro[roi],ow=item.word.split(/\s+/),sc=shuf(ow);
    if(sc.join(' ')===ow.join(' ')&&ow.length>2)sc.reverse();
    const rem=ro.length-roi;let sel=[];
    const streak=item.mastery?.reorderStreak||0;

    P.innerHTML=`<div class="ll-practice-header"><button class="ll-back-btn" id="ll-back">←</button><span class="ll-practice-remaining">${rem} restante${rem!==1?'s':''}</span><span class="ll-practice-score-mini">${ros.c}/${ros.t} · racha: ${streak}/3</span></div>
      <div class="ll-reorder-card"><div class="ll-reorder-label">Put the words in order</div>${item.translation?`<div class="ll-reorder-hint">${item.translation}</div>`:''}${item.startMs!=null?'<button class="ll-reorder-listen" id="ll-ro-listen">🔊 Listen to phrase</button>':''}<div class="ll-reorder-answer" id="ll-ro-ans"></div><div class="ll-reorder-words" id="ll-ro-wds"></div><div class="ll-reorder-actions"><button class="ll-reorder-clear" id="ll-ro-clr">Clear</button><button class="ll-reorder-check" id="ll-ro-chk" disabled>Check</button></div><div class="ll-reorder-result" id="ll-ro-res" style="display:none"></div></div>`;

    const wc=document.getElementById('ll-ro-wds'),ac=document.getElementById('ll-ro-ans'),cb=document.getElementById('ll-ro-chk');
    function rw(){wc.innerHTML='';sc.forEach((w,i)=>{if(sel.includes(i))return;const c=document.createElement('button');c.className='ll-word-chip';c.textContent=w;c.addEventListener('click',()=>{sel.push(i);rw();ra();cb.disabled=sel.length!==ow.length;});wc.appendChild(c);});}
    function ra(){ac.innerHTML='';if(!sel.length){ac.innerHTML='<span class="ll-reorder-placeholder">Tap words in order...</span>';return;}sel.forEach((idx,pos)=>{const c=document.createElement('button');c.className='ll-word-chip ll-word-chip-selected';c.textContent=sc[idx];c.addEventListener('click',()=>{sel=sel.filter((_,p)=>p!==pos);rw();ra();cb.disabled=true;});ac.appendChild(c);});}
    rw();ra();
    document.getElementById('ll-back').addEventListener('click',showPracticeModes);
    if(document.getElementById('ll-ro-listen')){document.getElementById('ll-ro-listen').addEventListener('click',()=>playSegment(item.startMs,item.endMs));}
    document.getElementById('ll-ro-clr').addEventListener('click',()=>{sel=[];rw();ra();cb.disabled=true;document.getElementById('ll-ro-res').style.display='none';});
    cb.addEventListener('click',()=>{
      const attempt=sel.map(i=>sc[i]).join(' '),correct=attempt===ow.join(' ');
      ros.t++;if(correct)ros.c++;
      chrome.runtime.sendMessage({type:'UPDATE_MASTERY',word:item.word,targetLang:item.targetLang,timestamp:item.timestamp,mode:'reorder',correct},r=>{
        const res=document.getElementById('ll-ro-res');res.style.display='block';
        res.className=`ll-reorder-result ${correct?'ll-cloze-correct':'ll-cloze-wrong'}`;
        if(r?.justMastered) res.innerHTML='🏆 ¡Dominada! 3 aciertos seguidos';
        else if(correct) res.innerHTML=`✓ Correct! (${(r?.mastery?.reorderStreak||0)}/3)`;
        else res.innerHTML=`✗ Correct order:<br><strong>${ow.join(' ')}</strong> (racha reiniciada)`;
        setTimeout(()=>{roi++;rRO();},correct?1200:3000);
      });
    });
  }

  loadVocabulary();
});
