// main-m2.js — M2 '입문 배틀' 샘플 스테이지 1개. 제작_방향_v1 §8 반영.
// 코어: 한 권 완성(챕터=세트) / 망각 게이지(매 턴↑, 완성으로 되밀기) / 보스=한 장르 딴지(검열) / 상성.
// 로직·카드 렌더는 3인 빌드 재활용. 값은 전부 CFG로 빼서 튜닝 쉽게.

import { makeRng, buildWall, shuffle } from './logic/wall.js';
import { makeCardMap, classifySet } from './logic/handEval.js';
import { cardEl, makeGenreName } from './render/cards3p.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

// ---- 튜닝 값 (샘플) ----
const CFG = {
  hand: 10, need: 3, forgetMax: 100, forgetStart: 5, forgetPerTurn: 8,
  pushback: { win: 50, normal: 35, lose: 18 },     // 상성별 망각 되밀기
  boss: { genre: 'ho', name: '공포를 삼킨 자 그림', tag: '호러 작가', avatar: '🕯', img: './assets/boss_grim.png', censorEvery: 3, lockTurns: 2 },
  beats: { mu: 'sf', sf: 'fa', fa: 'ro', ro: 'ho', ho: 'mu' }, // A▶B = A가 B를 이김 (오각형)
  rules: { allowCrossGenreRun: false, allowGenreTriplet: false },
};

let cardMap, genreName, allIds;
const S = { wall: [], hand: [], sel: new Set(), book: 0, forget: 0, turn: 0, phase: 'play', flash: '' };

async function boot() {
  const cards = await (await fetch('./src/data/cards.json')).json();
  cardMap = makeCardMap(cards);
  genreName = makeGenreName(cards);
  allIds = cards.cards.map((c) => c.id);
  reset();
  window.__m2 = { S, autoStep }; // 테스트 훅
}

function reset() {
  S.wall = shuffle(buildWall(allIds, 3), makeRng((Math.random() * 1e9) | 0));
  S.hand = []; for (let i = 0; i < CFG.hand; i++) S.hand.push(drawCard());
  sortHand();
  S.sel = new Set(); S.book = 0; S.forget = CFG.forgetStart; S.turn = 0; S.phase = 'play'; S.flash = '이야기를 완성해 한 권을 채우세요. 망각이 다 차기 전에!';
  render();
}
function drawCard() { const id = S.wall.pop(); return { id, lock: 0 }; }
const GORDER = { mu: 0, sf: 1, fa: 2, ro: 3, ho: 4 };
// 손패 자동 정렬 (장르→단계). 손패 구성이 바뀔 때(선택 비어있을 때)만 호출.
function sortHand() { S.hand.sort((a, b) => { const ca = cardMap[a.id], cb = cardMap[b.id]; return (GORDER[ca.genre] - GORDER[cb.genre]) || (ca.stage - cb.stage); }); }

// ---- 상성 ----
function matchup(myGenre) {
  const b = CFG.boss.genre;
  if (CFG.beats[myGenre] === b) return 'win';   // 내 장르가 보스를 이김
  if (CFG.beats[b] === myGenre) return 'lose';  // 보스가 내 장르를 이김
  return 'normal';
}
// 선택 3장이 유효 세트(같은 장르 연속)면 정보 반환
function selectedSet() {
  if (S.sel.size !== 3) return null;
  const idx = [...S.sel];
  const info = classifySet(idx.map((i) => S.hand[i].id), cardMap, CFG.rules);
  return info && info.pureRun ? { idx, genre: info.genre } : null;
}

// ---- 행동 ----
function doPublish(idx, genre) {
  const m = matchup(genre);
  const push = CFG.pushback[m];
  S.forget = Math.max(0, S.forget - push);
  S.book += 1;
  if (m === 'win') S.hand.forEach((c) => (c.lock = 0)); // 상성 승 → 딴지 씻김
  // 카드 소모 + 보충
  const set = new Set(idx);
  S.hand = S.hand.filter((_, i) => !set.has(i));
  for (let k = 0; k < 3 && S.wall.length; k++) S.hand.push(drawCard());
  sortHand();
  S.sel.clear();
  const tag = m === 'win' ? ' (상성 강타! 딴지 씻김)' : m === 'lose' ? ' (상성 약함…)' : '';
  S.flash = `${genreName(genre)} 이야기 완성 — 망각 −${push}${tag}`;
  if (S.book >= CFG.need) { S.phase = 'won'; render(); return; }
  endTurn();
}
function doTrade(idx) {
  const set = new Set(idx);
  const n = idx.length;
  S.hand = S.hand.filter((_, i) => !set.has(i));
  for (let k = 0; k < n && S.wall.length; k++) S.hand.push(drawCard());
  sortHand();
  S.sel.clear();
  S.flash = `${n}장 교체 — 한 턴이 흘러 망각이 스몄다`;
  endTurn();
}
function endTurn() {
  S.turn += 1;
  S.forget = Math.min(CFG.forgetMax, S.forget + CFG.forgetPerTurn);
  S.hand.forEach((c) => { if (c.lock > 0) c.lock -= 1; });
  // 보스 검열
  if (S.turn % CFG.boss.censorEvery === 0) {
    const free = S.hand.map((c, i) => i).filter((i) => S.hand[i].lock === 0);
    if (free.length) {
      const t = free[(S.turn * 13) % free.length]; // 결정적(테스트 안정)
      S.hand[t].lock = CFG.boss.lockTurns;
      S.flash = `✂ ${CFG.boss.name}이(가) 당신의 원고를 검열했다! (카드 잠김)`;
    }
  }
  if (S.forget >= CFG.forgetMax) S.phase = 'lost';
  render();
}

// ---- 렌더 ----
function render() {
  // 보스
  const untilCensor = CFG.boss.censorEvery - (S.turn % CFG.boss.censorEvery);
  const av = CFG.boss.img
    ? `<div class="b-portrait" style="background-image:url('${CFG.boss.img}')"></div>`
    : `<div class="b-av">${CFG.boss.avatar}</div>`;
  $('#boss').innerHTML =
    av
    + `<div><div class="b-name">${CFG.boss.name}</div><div class="b-tag">${CFG.boss.tag}</div>`
    + `<div class="b-intent">✂ ${untilCensor}턴 후 검열</div></div>`
    + `<div class="b-genre ${CFG.boss.genre}">${genreName(CFG.boss.genre)}</div>`;

  // 망각 게이지
  const pct = Math.round(S.forget / CFG.forgetMax * 100);
  $('#forget-fill').style.width = pct + '%';
  $('#forget-label').textContent = `망각 ${S.forget}/${CFG.forgetMax}`;

  // 책 진행
  const bk = $('#book'); bk.innerHTML = '';
  for (let i = 0; i < CFG.need; i++) bk.appendChild(el('div', 'chap' + (i < S.book ? ' done' : '')));
  $('#book-label').textContent = `『 』 ${S.book}/${CFG.need}장`;

  // 손패
  const h = $('#hand'); h.innerHTML = '';
  S.hand.forEach((c, i) => {
    const locked = c.lock > 0;
    const e = cardEl(c.id, cardMap, { genreName, selected: S.sel.has(i), onClick: locked ? null : (() => toggle(i)) });
    if (locked) { e.classList.add('locked'); e.setAttribute('data-lock', '🔒'); }
    h.appendChild(e);
  });

  // 액션바
  const set = selectedSet();
  const info = $('#hint'); const acts = $('#acts'); acts.innerHTML = '';
  if (S.phase === 'play') {
    if (set) {
      const m = matchup(set.genre);
      const t = m === 'win' ? `${genreName(set.genre)} → 그림(호러)에 강함! 크게 되밀기`
        : m === 'lose' ? `${genreName(set.genre)} → 그림에 약함…`
        : `${genreName(set.genre)} 이야기 완성 준비`;
      info.textContent = t;
    } else if (S.sel.size) info.textContent = `${S.sel.size}장 선택 — 세트(같은 장르 기승전/승전결) 3장이면 발표, 아니면 교체`;
    else info.textContent = S.flash;
    const pub = el('button', 'btn', '발표(완성)'); pub.disabled = !set; pub.onclick = () => set && doPublish(set.idx, set.genre);
    const tr = el('button', 'btn ghost', '교체'); tr.disabled = S.sel.size === 0; tr.onclick = () => doTrade([...S.sel]);
    acts.appendChild(pub); acts.appendChild(tr);
  } else info.textContent = '';

  // 결과
  const ov = $('#overlay');
  if (S.phase === 'won' || S.phase === 'lost') {
    ov.classList.remove('hidden');
    ov.innerHTML = `<div class="result"><h2>${S.phase === 'won' ? '한 권 완성!' : '이야기가 잊혀졌다…'}</h2>`
      + `<div class="who">${S.phase === 'won' ? '『 』가 서고에 꽂혔습니다.' : '망각이 원고를 삼켰습니다.'}</div>`
      + `<button class="btn" id="again">다시</button></div>`;
    $('#again').onclick = reset;
  } else ov.classList.add('hidden');
}
function toggle(i) { if (S.sel.has(i)) S.sel.delete(i); else S.sel.add(i); render(); }

// ---- 테스트용 자동 한 스텝 ----
function autoStep() {
  if (S.phase !== 'play') return S.phase;
  // 유효 세트 있으면 발표
  const free = S.hand.map((c, i) => (c.lock === 0 ? i : -1)).filter((i) => i >= 0);
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) for (let c = b + 1; c < free.length; c++) {
    const info = classifySet([S.hand[free[a]].id, S.hand[free[b]].id, S.hand[free[c]].id], cardMap, CFG.rules);
    if (info && info.pureRun) { doPublish([free[a], free[b], free[c]], info.genre); return S.phase; }
  }
  // 없으면 '싱글턴 장르'(같은 장르가 1장뿐인) 카드를 골라 교체 — 런 재료를 남기는 쪽으로
  const gc = {};
  free.forEach((i) => { const g = cardMap[S.hand[i].id].genre; gc[g] = (gc[g] || 0) + 1; });
  const junk = free.filter((i) => gc[cardMap[S.hand[i].id].genre] === 1).slice(0, 3);
  const toTrade = junk.length ? junk : free.slice(0, 2);
  if (toTrade.length) doTrade(toTrade);
  else endTurn();
  return S.phase;
}

boot();
