'use strict';

// GitHub ActionsでVocabularySets内のCSVから自動生成される一覧を読み込みます。
const CATALOG_URL = './VocabularySets/index.json';
const APP_VERSION = 'v11:2026/11/25';
const DB_NAME = 'kotobadeck-local-sets'; // 旧版と同じDB名にし、追加済みCSVを引き継ぐ
const DECK_STORE = 'vocabulary-sets'; // 古いアプリのDB構造は変更しない（旧データは表示しない）
const REVIEW_STORE = 'review-flags';
const DB_VERSION = 2; // 変更しない：旧アプリのIndexedDBをそのまま使う

const app = document.getElementById('app');
app.dataset.version = APP_VERSION;
const state = {
  view: 'menu', sets: [], selectedCategory: null, selectedLanguage: null, selectedSetId: null, selectedEntryKey: null,
  shuffled: false, reviewOnly: false, order: [],
  testEntries: [], testIndex: 0, testRevealed: false, testFinished: false,
  starred: new Set(), startupError: ''
};
const svg = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 14 4 4-4 4M18 2l4 4-4 4M2 18h2.5c3.5 0 5.5-2.5 7-5.5S15 6 18 6h4M2 6h2.5c2.1 0 3.7.9 5 2.5M15 15.5c1 1.5 2.1 2.5 3.5 2.5H22"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.3 2 4 13h7l-.3 9L20 11h-7l.3-9Z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="15" height="16" rx="2"/><path d="M8 9h7M8 13h7M8 17h4M8 2h11a3 3 0 0 1 3 3v13"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 13V6.5a1.5 1.5 0 0 1 3 0V11m0-2a1.5 1.5 0 0 1 3 0v2m0-1a1.5 1.5 0 0 1 3 0v2m0-1a1.5 1.5 0 0 1 3 0v4c0 3-2.5 5-5.5 5H13c-1.5 0-2.7-.5-3.7-1.8L5.1 13a1.6 1.6 0 0 1 2.4-2.1L9 13Z"/></svg>',
  star: '<svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="m12 2.8 2.94 6 6.62.96-4.78 4.66 1.13 6.59L12 17.9l-5.91 3.11 1.13-6.59-4.78-4.66 6.62-.96L12 2.8Z"/></svg>'
};

function esc(text) { return String(text ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character])); }
function basename(fileName) { return String(fileName).replace(/\.csv$/i, ''); }
// 単語・文節を途中で折り返さないHTML。ハイライトが文節途中にある場合も
// スペース区切りのトークン全体をnowrapにして分断を防ぐ。
// 日本語のように空白を含まない長文は通常の日本語組版で自然改行する。
function formatProtected(text, highlight = '', language = 'auto') {
  const source = String(text ?? '');
  const fragment = String(highlight ?? '');
  const begin = fragment ? source.indexOf(fragment) : -1;
  const finish = begin < 0 ? -1 : begin + fragment.length;
  const treatAsJapanese = language === 'ja' ||
    (language === 'auto' && /[ぁ-んァ-ヶ]/.test(source) && !/[가-힣]/.test(source));
  const writePart = (str, offset) => {
    if (begin < 0 || offset >= finish || offset + str.length <= begin) return esc(str);
    const before = Math.max(0, begin - offset);
    const after = Math.min(str.length, finish - offset);
    return esc(str.slice(0, before)) +
      `<strong class="example-highlight">${esc(str.slice(before, after))}</strong>` +
      esc(str.slice(after));
  };
  if (treatAsJapanese) return writePart(source, 0);
  const tokens = source.match(/\s+|[^\s]+/g) || [];
  let offset = 0;
  return tokens.map(token => {
    const html = writePart(token, offset);
    offset += token.length;
    return /^\s+$/.test(token) ? html : `<span class="no-break-token">${html}</span>`;
  }).join('');
}
function formatExample(example, highlight) { return formatProtected(example, highlight, 'auto'); }

function currentSet() { return state.sets.find(s => s.id === state.selectedSetId) || null; }
function reviewId(setId, entryKey) { return JSON.stringify([setId, entryKey]); }
function isStarred(entry) { return state.starred.has(reviewId(state.selectedSetId, entry.key)); }
function orderedEntries() {
  const set = currentSet();
  if (!set) return [];
  const entries = state.order.map(index => set.entries[index]).filter(Boolean);
  return state.reviewOnly ? entries.filter(isStarred) : entries;
}
function shuffleIndices(length) {
  const indices = Array.from({length}, (_, index) => index);
  for (let i=indices.length-1; i>0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  if (length>1 && indices.every((i,k)=>i===k)) [indices[0],indices[1]]=[indices[1],indices[0]];
  return indices;
}

function parseCSV(contents) {
  const text = String(contents).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && !field.length) quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[index + 1] === '\n') index++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('CSVの引用符が閉じていません。');
  if (field || row.length) { row.push(field); rows.push(row); }
  const nonempty = rows.filter(fields => fields.some(value => value.trim()));
  // 第一行はヘッダー。カラム名は一切判定せず、データの実際の列数を優先する。
  // (例: 「日本語例文,韓国語例文」でも通常の2列Flashとして読む)
  const records = nonempty.slice(1);
  if (!records.length) throw new Error('CSVにデータがありません。');
  const distribution = new Map();
  for (const cells of records) distribution.set(cells.length, (distribution.get(cells.length) || 0) + 1);
  const columns = [...distribution.entries()].sort((a,b) => b[1] - a[1] || b[0] - a[0])[0][0];
  if (![2,3,4,5].includes(columns)) throw new Error(`${columns}列は非対応です（2/3/4/5列）。`);
  const occur = new Map();
  const entries = records.map((cells, index) => {
    if (cells.length !== columns && !(columns === 5 && cells.length === 4)) {
      throw new Error(`${index + 2}行目の列数が違います（${columns}列）。`);
    }
    const values = cells.map(value => value.trim());
    if (!values[0]) throw new Error(`${index + 2}行目が空です。`);
    const [word, second, third = '', fourth = '', fifth = ''] = values;
    // 3列: 原語/拼音/日本語。2列: 表/裏。4/5列: 単語/意味/例文/訳/(強調)
    const translation = columns === 3 ? third : second;
    const pinyin = columns === 3 ? second : '';
    const example = columns >= 4 ? third : '';
    const exampleJa = columns >= 4 ? fourth : '';
    const highlight = columns === 5 ? fifth : '';
    const identity = JSON.stringify([word, translation]);
    const occurrence = occur.get(identity) || 0;
    occur.set(identity, occurrence + 1);
    return { key: JSON.stringify([word, translation, occurrence]), word, translation, pinyin, example, exampleJa, highlight };
  });
  return {mode: columns === 3 ? 'chinese' : columns === 2 ? 'composition' : 'vocabulary', columns, entries};
}

// 旧PWA版のローカルCSVにも対応：index IDしかないデータを、単語ベースのキーに変換する。
function normalizeEntries(entries) {
  const occurrence = new Map();
  return entries.map(item => {
    const word = String(item.word ?? item.term ?? '');
    const translation = String(item.translation ?? '');
    const identity = JSON.stringify([word,translation]);
    const n = occurrence.get(identity) || 0;
    occurrence.set(identity,n+1);
    return {key: JSON.stringify([word,translation,n]),word,translation,pinyin:String(item.pinyin ?? ''),example: String(item.example ?? ''),exampleJa: String(item.exampleJa ?? item.exampleTranslation ?? ''),highlight: String(item.highlight ?? item.emphasis ?? '')};
  });
}
function openDB() {
  return new Promise((resolve,reject) => {
    if (!('indexedDB' in window)) return reject(new Error('保存機能に対応していません。'));
    const r = indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(DECK_STORE)) db.createObjectStore(DECK_STORE,{keyPath:'id'});
      if (!db.objectStoreNames.contains(REVIEW_STORE)) db.createObjectStore(REVIEW_STORE,{keyPath:'id'});
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('データベースを開けません。'));
  });
}
async function dbAll(storeName) {
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(storeName,'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}
async function dbChange(storeName,operation,recordOrId) {
  const db=await openDB();
  return new Promise((resolve,reject) => {
    const tx=db.transaction(storeName,'readwrite');
    tx.objectStore(storeName)[operation](recordOrId);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error || new Error('保存できませんでした。'));};
    tx.onabort=()=>{db.close();reject(tx.error || new Error('保存が中断しました。'));};
  });
}
async function saveStar(entry,newValue) {
  const id=reviewId(state.selectedSetId,entry.key);
  if (newValue) await dbChange(REVIEW_STORE,'put',{id, setId:state.selectedSetId,entryKey:entry.key});
  else await dbChange(REVIEW_STORE,'delete',id);
  if (newValue) state.starred.add(id); else state.starred.delete(id);
}
function bar(left,middle,right) {
  return `<header class="bar"><div class="bar-left">${left||''}</div><div class="bar-middle">${middle||''}</div><div class="bar-right">${right||''}</div></header>`;
}
function back(action,caption='戻る') { return `<button type="button" class="button-back" data-action="${action}" aria-label="${esc(caption)}">${svg.back}<span>${esc(caption)}</span></button>`; }
function card(set) {
  return `<button type="button" class="deck" data-action="open-set" data-id="${esc(set.id)}">
  <span class="deck-icon">${svg.book}</span>
  <span class="deck-content"><span class="deck-title">${esc(set.title)}</span><span class="deck-count" style="display:block">${set.entries.length}${set.mode==='composition'?'文':'語'}</span></span>
  <span class="deck-next">${svg.next}</span></button>`;
}
// ホームではCSV一覧ではなく、学習モードを最初に選択する。
const CATEGORIES = {
  Vocabulary: {title:'単語学習', icon:svg.book, unit:'語'},
  Flash: {title:'瞬間作文', icon:svg.bolt, unit:'文'}
};
function renderMenu() {
  app.innerHTML = `<main class="menu scrollable"><div class="menu-content">
    <div class="brand-row"><div class="brand">たんたんご！</div>
      <img class="brand-photo" src="./icons/apple-touch-icon.png" alt="モルモットのアプリアイコン" width="68" height="68"></div>
    <div class="slogan">淡々と単語をGO！</div>
    <h2 class="section-title">学習モード</h2>
    <div class="deck-list category-list">
      ${Object.entries(CATEGORIES).map(([key,category]) => {
        const decks=state.sets.filter(set => set.folder === key);
        const total=decks.reduce((sum,set)=>sum+set.entries.length,0);
        return `<button type="button" class="deck category-deck" data-action="open-category" data-category="${key}">
          <span class="deck-icon">${category.icon}</span>
          <span class="deck-content"><span class="deck-title">${category.title}</span>
            <span class="deck-count" style="display:block">${decks.length}セット</span></span>
          <span class="deck-next">${svg.next}</span></button>`;
      }).join('')}
    </div>
    ${state.startupError ? `<p class="load-error">${esc(state.startupError)}</p>` : ''}
  </div></main>`;
}
const LANGUAGES = {
  en: {title:'英語', icon:'EN'},
  ko: {title:'韓国語', icon:'한'},
  zh: {title:'中国語', icon:'中'}
};
function languageCard(key, language) {
  const sets = state.sets.filter(set => set.folder === state.selectedCategory && set.language === key);
  return `<button type="button" class="deck language-deck" data-action="open-language" data-language="${key}">
    <span class="language-icon">${language.icon}</span>
    <span class="deck-content"><span class="deck-title">${language.title}</span><span class="deck-count" style="display:block">${sets.length}セット</span></span>
    <span class="deck-next">${svg.next}</span></button>`;
}
function renderCategory() {
  const category=CATEGORIES[state.selectedCategory];
  if (!category) { state.view='menu'; renderMenu(); return; }
  app.innerHTML = bar(back('go-home','ホーム'),`<span class="bar-title">${category.title}</span>`,'') +
    `<main class="menu category-page scrollable"><div class="menu-content">
       <h1 class="category-heading">言語を選択</h1>
       <div class="deck-list">${Object.entries(LANGUAGES).map(([key,language]) => languageCard(key,language)).join('')}</div>
    </div></main>`;
}
function renderLanguageSets() {
  const category=CATEGORIES[state.selectedCategory];
  const language=LANGUAGES[state.selectedLanguage];
  if (!category || !language) { state.view='category'; renderCategory(); return; }
  const decks=state.sets.filter(set => set.folder === state.selectedCategory && set.language === state.selectedLanguage);
  app.innerHTML = bar(back('go-category','言語'),`<span class="bar-title">${language.title}</span>`,'') +
    `<main class="menu category-page scrollable"><div class="menu-content">
       <h1 class="category-heading">${category.title} ・ ${language.title}</h1>
       <div class="deck-list">${decks.map(card).join('') || '<div class="empty">セットがありません</div>'}</div>
    </div></main>`;
}
function starButton(entry,extraClass='') {
  const selected=isStarred(entry);
  return `<button type="button" class="star-button ${extraClass}${selected?' is-starred':''}" data-action="toggle-star" data-entrykey="${esc(entry.key)}" aria-label="${selected?'復習から外す':'要復習に登録'}：${esc(entry.word)}" aria-pressed="${selected}">${svg.star}</button>`;
}
function renderList(scrollTop = 0) {
  const set = currentSet();
  if (!set) { state.view = 'category'; renderCategory(); return; }
  const composition = set.mode === 'composition';
  const chinese = set.mode === 'chinese';
  const entries = orderedEntries();
  const reviewButton = `<button type="button" class="button-icon${state.reviewOnly?' active-review':''}" data-action="toggle-review" aria-pressed="${state.reviewOnly}" aria-label="${state.reviewOnly?'全項目を表示':'要復習のみ表示'}" title="要復習">${svg.star}</button>`;
  const shuffleButton = `<button type="button" class="button-icon${state.shuffled?' active-shuffle':''}" data-action="toggle-shuffle" aria-pressed="${state.shuffled}" aria-label="${state.shuffled?'CSV順に戻す':'ランダム順にする'}" title="並び替え">${svg.shuffle}</button>`;
  app.innerHTML = bar(back('go-menu','セット'), `<button type="button" class="button-test" data-action="start-test" ${entries.length ? '' : 'disabled'}>${svg.bolt}テスト</button>`, reviewButton+shuffleButton)+
    `<section class="study-head"><h1 class="study-name">${esc(set.title)}</h1><div class="study-sub"><b>${entries.length}${composition ? '文' : '語'}</b>${state.reviewOnly ? ' ・ ⭐復習' : ' ・ '+(state.shuffled ? 'ランダム順' : 'CSV順')}</div></section>
    <div class="column-head${composition?' composition-columns':''}"><span></span><span>${composition?'日本語例文':chinese?'原語':'単語'}</span><span>${composition?'訳文':'日本語訳'}</span></div>
    <main class="words-scroll scrollable" id="wordsViewport"><div class="word-list${composition?' composition-list':''}">
    ${entries.length ? entries.map(entry => `<div class="word-row${composition?' composition-row':''}${state.selectedEntryKey===entry.key?' selected':''}">
      ${starButton(entry)}
      <button type="button" class="word-select" data-action="show-example" data-entrykey="${esc(entry.key)}" aria-pressed="${state.selectedEntryKey===entry.key}">
        <span class="word-text">${chinese?`<span class="hanzi">${esc(entry.word)}</span><span class="pinyin">${esc(entry.pinyin)}</span>`:composition?formatProtected(entry.word,'','ja'):esc(entry.word)}</span><span class="word-translation">${composition?formatProtected(entry.translation,'','auto'):esc(entry.translation)}</span></button></div>`).join(''):
      '<div class="empty">⭐を付けた項目がありません</div>'}
    </div></main>`;
  renderPanel();
  const viewport = document.getElementById('wordsViewport');
  if (viewport) viewport.scrollTop = scrollTop;
}
function renderPanel() {
  document.getElementById('examplePanel')?.remove();
  const viewport = document.getElementById('wordsViewport');
  if (!viewport) return;
  const set = currentSet();
  const entry = set?.entries.find(e => e.key === state.selectedEntryKey);
  if (!entry || (state.reviewOnly && !isStarred(entry))) { viewport.classList.remove('panel-open'); return; }
  viewport.classList.add('panel-open');
  const composition = set.mode === 'composition';
  const chinese = set.mode === 'chinese';
  app.insertAdjacentHTML('beforeend', `<aside class="example-panel${composition?' composition-panel':''}" id="examplePanel" aria-label="${composition?'瞬間作文の訳文':'単語と例文'}">
    <div class="panel-upper"><div class="panel-head"><div class="panel-term">${composition?formatProtected(entry.word,'','ja'):esc(entry.word)}${chinese?`<div class="panel-pinyin">${esc(entry.pinyin)}</div>`:''}</div><button type="button" class="close-panel" data-action="close-panel" aria-label="閉じる">×</button></div>
      ${composition?'':`<div class="panel-meaning">${esc(entry.translation)}</div>`}</div>
    ${chinese?'':`<div class="panel-lower">${composition ? `<p class="composition-answer">${formatProtected(entry.translation)}</p>` : `<p class="example-source">${formatExample(entry.example,entry.highlight)}</p><p class="example-translation">${formatProtected(entry.exampleJa,'','ja')}</p>`}</div>`}
  </aside>`);
}
function showEntry(entryKey) {
  state.selectedEntryKey=entryKey;
  let selectedRow=null;
  document.querySelectorAll('.word-row').forEach(row=>{
    const active=row.querySelector('.word-select')?.dataset.entrykey===entryKey;
    row.classList.toggle('selected',active);
    row.querySelector('.word-select')?.setAttribute('aria-pressed',String(active));
    if (active) selectedRow=row;
  });
  renderPanel();
  if (!selectedRow) {
    const list=document.querySelector('#wordsViewport .word-list');
    if (list) list.style.paddingBottom='';
    return;
  }
  // 下半分のパネルを開いた後で、選択行を一覧の最上部に寄せる。
  requestAnimationFrame(() => {
    const viewport=document.getElementById('wordsViewport');
    const list=viewport?.querySelector('.word-list');
    if (!viewport || !list || !selectedRow.isConnected) return;
    // 最終行も上端へ寄せられるよう、リスト末尾の余白を動的に確保。
    const lastRow=list.querySelector('.word-row:last-of-type');
    list.style.paddingBottom = `${Math.max(0, viewport.clientHeight - (lastRow?.offsetHeight || 0) - 10)}px`;
    const paddingTop=parseFloat(getComputedStyle(viewport).paddingTop) || 0;
    const scrollTo=viewport.scrollTop + selectedRow.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top - paddingTop;
    viewport.scrollTo({top:Math.max(0,scrollTo), behavior:'smooth'});
  });
}
function testEntry() {return state.testEntries[state.testIndex];}
function renderTest() {
  const entries = state.testEntries;
  if (!entries.length) { state.view='list'; renderList(); return; }
  const composition = currentSet()?.mode === 'composition';
  const chinese = currentSet()?.mode === 'chinese';
  const completed = state.testFinished;
  const count = Math.min(state.testIndex+1,entries.length);
  const progressFraction = entries.length <= 1 ? 0 : state.testIndex / (entries.length - 1);
  app.innerHTML=bar(back('return-list'),'<span class="bar-title">テスト</span>',`<span class="test-counter">${count}/${entries.length}</span>`)+
    `<div class="test-scrubber" role="slider" tabindex="0"
      aria-label="問題番号を選択" aria-valuemin="1" aria-valuemax="${entries.length}"
      aria-valuenow="${count}" aria-valuetext="${count}問目 / ${entries.length}問"
      aria-disabled="${entries.length <= 1}">
      <div class="test-scrub-track" id="testScrubTrack">
        <div class="test-scrub-fill" style="width:${progressFraction*100}%"></div>
        <div class="test-scrub-thumb" style="left:${progressFraction*100}%" aria-hidden="true">
          <img src="./icons/apple-touch-icon.png" alt="" draggable="false" width="28" height="28">
        </div>
      </div>
    </div>`;
  if (completed) {
    app.insertAdjacentHTML('beforeend',`<main class="done"><div class="done-mark">✓</div><div class="done-title">テスト完了！</div><div class="done-count">${entries.length}${composition?'文':'語'}</div>
     <div class="done-actions"><button type="button" class="main-button" data-action="restart-test">もう一度</button><button type="button" class="light-button" data-action="return-list">一覧に戻る</button></div></main>`);
    return;
  }
  const entry = testEntry();
  const revealed = state.testRevealed;
  app.insertAdjacentHTML('beforeend',`<main class="test-stage${composition?' composition-test':chinese?' chinese-test':' vocabulary-test'}">
    <button type="button" class="test-tap${revealed?' is-answer':''}" data-action="advance-test" aria-label="${revealed?'次の問題へ':'解答を見る'}">
      <div class="test-top"><div class="test-word">${composition?formatProtected(entry.word,'','ja'):esc(entry.word)}</div>
        ${revealed&&chinese?`<div class="test-pinyin">${esc(entry.pinyin)}</div>`:''}
        ${revealed&&!composition?`<div class="test-meaning">${esc(entry.translation)}</div>`:''}
      </div>
      <div class="test-bottom">${revealed ? (composition ? `<div class="test-bottom-inner"><p class="composition-test-answer">${formatProtected(entry.translation)}</p></div>`:chinese?'':
        `<div class="test-bottom-inner"><p class="test-example">${formatExample(entry.example,entry.highlight)}</p><p class="test-ja">${formatProtected(entry.exampleJa,'','ja')}</p></div>`) : ''}</div>
    </button>
    <div class="tap-indicator" aria-hidden="true">${svg.hand}</div>
    <button type="button" class="test-prev" data-action="prev-test" aria-label="前の単語に戻る" ${state.testIndex===0?'disabled':''}>${svg.back}<span>前へ</span></button>
    ${revealed?starButton(entry,'test-star'):''}
  </main>`);
}
// 進捗バーのモルモットをドラッグして問題を移動する。
// ドラッグ中はバーと番号だけプレビューし、指を離したらその問題を表示する。
// 新しい問題では解答を隠す（スキップしても不意に答えが出ない）。
const scrubState = { pointerId: null, previewIndex: null, dragged: false };
function previewScrub(index) {
  if (!state.testEntries.length || state.view !== 'test') return;
  const max = state.testEntries.length - 1;
  const clamped = Math.max(0, Math.min(max, index));
  scrubState.previewIndex = clamped;
  const ratio = max ? clamped / max : 0;
  const fill = app.querySelector('.test-scrub-fill');
  const thumb = app.querySelector('.test-scrub-thumb');
  const label = app.querySelector('.test-counter');
  const slider = app.querySelector('.test-scrubber');
  if (fill) fill.style.width = `${ratio * 100}%`;
  if (thumb) thumb.style.left = `${ratio * 100}%`;
  if (label) label.textContent = `${clamped + 1}/${state.testEntries.length}`;
  if (slider) {
    slider.setAttribute('aria-valuenow', String(clamped + 1));
    slider.setAttribute('aria-valuetext', `${clamped + 1}問目 / ${state.testEntries.length}問`);
  }
}
function scrubIndexFromPointer(event) {
  const track = app.querySelector('#testScrubTrack');
  if (!track) return state.testIndex;
  const rect = track.getBoundingClientRect();
  // 横向き端末で縦画面をCSS回転している場合は、水平の目盛りが画面上で縦方向になる。
  const isRotated = rect.height > rect.width * 1.5;
  const ratio = isRotated ? (event.clientY - rect.top) / Math.max(1, rect.height) :
    (event.clientX - rect.left) / Math.max(1, rect.width);
  return Math.max(0, Math.min(state.testEntries.length - 1,
    Math.round(ratio * (state.testEntries.length - 1))));
}
function seekTest(index) {
  if (state.view !== 'test' || !state.testEntries.length) return;
  state.testIndex = Math.max(0, Math.min(state.testEntries.length - 1, index));
  state.testFinished = false;
  state.testRevealed = false;
  scrubState.pointerId = null;
  scrubState.previewIndex = null;
  scrubState.dragged = false;
  renderTest();
}
app.addEventListener('pointerdown', event => {
  const slider = event.target.closest('.test-scrubber');
  if (!slider || state.view !== 'test' || state.testEntries.length < 2) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  scrubState.pointerId = event.pointerId;
  scrubState.dragged = false;
  slider.setPointerCapture(event.pointerId);
  previewScrub(scrubIndexFromPointer(event));
});
app.addEventListener('pointermove', event => {
  if (scrubState.pointerId !== event.pointerId) return;
  event.preventDefault(); event.stopPropagation();
  scrubState.dragged = true;
  previewScrub(scrubIndexFromPointer(event));
});
app.addEventListener('pointerup', event => {
  if (scrubState.pointerId !== event.pointerId) return;
  event.preventDefault(); event.stopPropagation();
  const index = scrubIndexFromPointer(event);
  // pointer captureを開放してから再描画する（Safariでのcapture異常を防ぐ）。
  const slider = event.target.closest('.test-scrubber') || app.querySelector('.test-scrubber');
  if (slider?.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
  seekTest(index);
});
app.addEventListener('pointercancel', event => {
  if (scrubState.pointerId !== event.pointerId) return;
  scrubState.pointerId = null;
  scrubState.previewIndex = null;
  if (state.view === 'test') renderTest();
});
app.addEventListener('keydown', event => {
  if (!event.target.closest('.test-scrubber') || state.view !== 'test') return;
  const max = state.testEntries.length - 1;
  let index = state.testIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') index++;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') index--;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = max;
  else return;
  event.preventDefault(); event.stopPropagation();
  seekTest(index);
  // 再描画でスライダー要素が入れ替わるためフォーカスを復帰する。
  app.querySelector('.test-scrubber')?.focus();
});

function render(scrollTop=0) {
  if (state.view==='menu') renderMenu();
  if (state.view==='category') renderCategory();
  if (state.view==='language') renderLanguageSets();
  if (state.view==='list') renderList(scrollTop);
  if (state.view==='test') renderTest();
}
let toastTimeout;
function toast(message) {
  document.querySelector('.toast')?.remove();
  const div=document.createElement('div'); div.className='toast'; div.role='status'; div.textContent=message;
  document.body.appendChild(div);
  clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>div.remove(),3300);
}
async function toggleStar(entryKey,button) {
  const entry=currentSet()?.entries.find(e=>e.key===entryKey);
  if (!entry || button.disabled) return;
  button.disabled=true;
  try {
    await saveStar(entry,!isStarred(entry));
    if (state.view==='test') {
      // テスト途中の出題順は固定。復習フラグだけ変更する。
      renderTest();
    } else if (state.reviewOnly) {
      // ⭐フィルタ中に星を外した単語は、リストから即時除外する。
      const scroll=document.getElementById('wordsViewport')?.scrollTop || 0;
      if (state.selectedEntryKey===entry.key && !isStarred(entry)) state.selectedEntryKey=null;
      renderList(scroll);
    } else {
      const starred=isStarred(entry);
      button.classList.toggle('is-starred',starred);
      button.setAttribute('aria-pressed',String(starred));
      button.setAttribute('aria-label',`${starred?'復習から外す':'要復習に登録'}：${entry.word}`);
    }
  } catch (error) {toast('保存に失敗しました：'+error.message);}
  finally {button.disabled=false;}
}
app.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const action=button.dataset.action;
  try {
    switch(action) {
    case 'open-category': {
      if (!CATEGORIES[button.dataset.category]) return;
      state.selectedCategory=button.dataset.category;
      state.selectedLanguage=null;
      state.view='category';renderCategory();return;
    }
    case 'go-home': state.view='menu';state.selectedCategory=null;state.selectedLanguage=null;renderMenu();return;
    case 'go-category': state.view='category';state.selectedEntryKey=null;state.selectedLanguage=null;renderCategory();return;
    case 'open-language': {
      if (!LANGUAGES[button.dataset.language]) return;
      state.selectedLanguage=button.dataset.language;
      state.view='language';renderLanguageSets();return;
    }
    case 'open-set': {
      const set=state.sets.find(x=>x.id===button.dataset.id);
      if (!set) return;
      state.selectedCategory=set.folder;
      state.selectedLanguage=set.language;
      state.selectedSetId=set.id;
      state.order=set.entries.map((_,i)=>i);
      state.selectedEntryKey=null;
      state.shuffled=false; state.reviewOnly=false;
      state.view='list'; render(); return;
    }
    case 'go-menu': state.view='language';state.selectedEntryKey=null;render();return;
    case 'show-example': showEntry(button.dataset.entrykey);return;
    case 'close-panel': showEntry(null);return;
    case 'toggle-shuffle': {
      const scroll=document.getElementById('wordsViewport')?.scrollTop||0;
      state.shuffled=!state.shuffled;
      const entries=currentSet()?.entries||[];
      state.order=state.shuffled?shuffleIndices(entries.length):entries.map((_,i)=>i);
      renderList(scroll);return;
    }
    case 'toggle-review': {
      state.reviewOnly=!state.reviewOnly;
      state.selectedEntryKey=null;
      renderList(); return;
    }
    case 'toggle-star': await toggleStar(button.dataset.entrykey,button);return;
    case 'start-test': {
      state.testEntries=orderedEntries().slice(); // テスト中は現在の対象語を固定
      if (!state.testEntries.length) {toast('テストする単語がありません');return;}
      state.testIndex=0; state.testFinished=false;state.testRevealed=false;
      state.view='test';renderTest();return;
    }
    case 'advance-test': {
      if (!state.testRevealed) state.testRevealed=true;
      else if (state.testIndex+1<state.testEntries.length) {state.testIndex++;state.testRevealed=false;}
      else state.testFinished=true;
      renderTest();return;
    }
    case 'prev-test': {
      if (state.testIndex > 0) {state.testIndex--;state.testRevealed=false;renderTest();}
      return;
    }
    case 'restart-test': state.testIndex=0;state.testRevealed=false;state.testFinished=false;renderTest();return;
    case 'return-list': state.view='list';renderList();return;
    }
  } catch(error) {toast(error.message||'操作できませんでした');}
});
async function boot() {
  const bundled=[];
  try {
    const catalogResponse=await fetch(CATALOG_URL,{cache:'no-store'});
    if (!catalogResponse.ok) throw new Error(`一覧ファイル HTTP ${catalogResponse.status}`);
    const catalog=await catalogResponse.json();
    if (!Array.isArray(catalog.files)) throw new Error('CSV一覧ファイルの形式が違います。');
    for (const item of catalog.files) {
      if (!item || typeof item !== 'object') continue;
      const path=item.path;
      // GitHub Actionsで生成された Flash/Vocabulary の直下だけを許可する。
      if (typeof path !== 'string' || !/^(Flash|Vocabulary)\/[^/\\]+\.csv$/i.test(path)) continue;
      const [folder,fileName]=path.split('/');
      if (!CATEGORIES[folder]) continue;
      try {
        const encodedPath=path.split('/').map(encodeURIComponent).join('/');
        const response=await fetch(`./VocabularySets/${encodedPath}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed=parseCSV(await response.text());
        // カラム名のゆれや4列の旧単語CSVにも対応し、CSVの実データ列数で判定。
        const language = ['en','ko','zh'].includes(item.language) ? item.language : (parsed.mode==='chinese' ? 'zh' : 'en');
        bundled.push({id:`bundled:${path}`,legacyId:`bundled:${fileName}`,folder,
          kind:'bundled',fileName,path,title:basename(fileName),language,mode:parsed.mode,columns:parsed.columns,entries:parsed.entries});
      } catch(error) {state.startupError+=`${fileName}：${error.message} `;}
    }
  } catch(error) {state.startupError=`CSVの一覧を読み込めません：${error.message}。GitHub Actionsの公開設定を確認してください。`;}
  try {
    const stars=await dbAll(REVIEW_STORE);
    state.starred=new Set(stars.map(s=>s.id));
    // v8以前のキーは bundled:ファイル名。フォルダ移行後も⭐を継承・永続化する。
    const migrations=[];
    for (const set of bundled) {
      const priorIds = [set.legacyId];
      // 同一内容のTOPIK100語CSVの旧ファイル名（v9まで）からも⭐を移行する。
      if (set.path === 'Vocabulary/第47回TOPIKⅡ_上級韓国語100単語.csv') {
        priorIds.push('bundled:Vocabulary/第47回TOPIKⅡ_上級韓国語100単語(1).csv');
        priorIds.push('bundled:第47回TOPIKⅡ_上級韓国語100単語(1).csv');
      }
      for (const entry of set.entries) {
        const newId=reviewId(set.id,entry.key);
        if (state.starred.has(newId)) continue;
        const oldId=priorIds.map(id=>reviewId(id,entry.key)).find(id=>state.starred.has(id));
        if (oldId) {
          state.starred.add(newId);
          migrations.push({id:newId,oldId,setId:set.id,entryKey:entry.key});
        }
      }
    }
    if (migrations.length) await saveMigratedStars(migrations);
  } catch(error) {state.startupError+='⭐の保存を利用できません。';}
  state.sets=bundled;
  renderMenu();
  if ('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost'||location.hostname==='127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Offline cache:',error));
  }
}
// 既存の保存形式・DBバージョンは変えず、1回の書き込みで移行する。
async function saveMigratedStars(records) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(REVIEW_STORE,'readwrite');
    const store=tx.objectStore(REVIEW_STORE);
    // 移行元の旧キーは消す。残すと⭐解除後に再び復活してしまう。
    records.forEach(({oldId,...record})=>store.put(record));
    new Set(records.map(record=>record.oldId)).forEach(oldId=>store.delete(oldId));
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error);};
  });
}

boot();
// 対応ブラウザではPWAの画面を縦に固定。iOS Safari等の非対応環境はCSSで補完。
async function requestPortrait() {
  if (!(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone)) return;
  if (screen.orientation && typeof screen.orientation.lock === 'function') {
    try { await screen.orientation.lock('portrait-primary'); }
    catch (_) { /* iOSなどで非対応の場合も学習機能を妨げない */ }
  }
}
window.addEventListener('pageshow', requestPortrait);

