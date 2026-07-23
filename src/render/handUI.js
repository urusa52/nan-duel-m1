// handUI.js — 내 손패 + 자동 판정 보조(D33).
// 원칙: 찾는 것은 시스템(텐파이·대기·성립 역 자동 표시), 판단은 플레이어.

import { waitsFor } from '../logic/handEval.js';
import { unseenCounts } from '../logic/wall.js';
import { formedSets, reachableYaku } from '../logic/analysis.js';
import { cardEl, genreName, stageName } from './table.js';

let refs = null;
let data = null;
let deps = null;
let ctx = null; // '맞출 수 있는 패' 분석 컨텍스트

// 선언 가능(최소 역 충족) 해석만 인정하는 평가 래퍼
function declEval(hand) {
  const b = deps.evalHand(hand);
  return b && b.declarable ? b : null;
}

export function initHandUI(dataBundle, logicDeps) {
  data = dataBundle;
  deps = logicDeps;
  ctx = {
    cardMap: deps.cardMap, bondSet: deps.bondSet,
    genres: data.cardsData.genres, yakuData: data.yakuData, rules: deps.rules,
  };
  refs = {
    myHand: document.getElementById('my-hand'),
    assist: document.getElementById('assist'),
    actions: document.getElementById('actions'),
    cardInfo: document.getElementById('card-info'),
    yakuTip: document.getElementById('yaku-tip'),
  };
  // '노려볼 역' 항목 hover(데스크톱)·탭(모바일)로 예시 패 툴팁. #assist는 매번 갱신되지만
  // 요소 자체는 유지되므로 위임으로 붙인다.
  refs.assist.addEventListener('mouseover', (e) => { const el = e.target.closest('.yk'); if (el) showYakuTip(el); });
  refs.assist.addEventListener('mouseout', (e) => { const el = e.target.closest('.yk'); if (el) hideYakuTip(); });
  refs.assist.addEventListener('click', (e) => { const el = e.target.closest('.yk'); if (el) toggleYakuTip(el); });
}

let tipFor = null;
function showYakuTip(el) {
  const y = (data.yakuData.yaku || []).find((x) => x.id === el.dataset.yaku);
  if (!y) return;
  const tip = refs.yakuTip;
  tip.innerHTML = '<div class="yt-title">' + y.name + ' <span class="cp-pt">' + y.score + '점</span></div>' +
    '<div class="yt-sub">' + y.sub + '</div>';
  const row = document.createElement('div');
  row.className = 'yt-cards';
  for (const cid of (y.example || [])) { const c = cardEl(cid, { small: true }); c.disabled = true; row.appendChild(c); }
  tip.appendChild(row);
  tip.classList.remove('hidden');
  const rect = el.getBoundingClientRect();
  tip.style.left = (rect.right + 10) + 'px';
  tip.style.top = Math.max(8, rect.top - 6) + 'px';
  tipFor = el;
}
function hideYakuTip() { refs.yakuTip.classList.add('hidden'); refs.yakuTip.innerHTML = ''; tipFor = null; }
function toggleYakuTip(el) {
  if (tipFor === el && !refs.yakuTip.classList.contains('hidden')) hideYakuTip();
  else showYakuTip(el);
}

// 손패 표시 정렬 우선순위: 장르(cards.json 정의 순서: 무협·SF·판타지·로맨스·호러) → 단계(기·승·전·결).
// 표시 순서만 위한 것 — 게임 로직(배열 순서)은 건드리지 않는다.
function genreRank(genreKey) {
  const i = data.cardsData.genres.findIndex((g) => g.key === genreKey);
  return i < 0 ? 99 : i;
}
function sortValue(id) {
  const c = data.cardMap[id];
  return genreRank(c.genre) * 10 + c.stage;
}

export function renderHand(s) {
  const round = s.round;
  if (!round) return;
  const hand = round.hands.player;
  const myDecide = round.turn === 'player' && round.phase === 'decide';

  refs.myHand.innerHTML = '';
  // 표시용 정렬 뷰 — 장르→단계로 보기 좋게 정렬하되 "원래 인덱스"를 보존한다.
  // 탭·버리기·각색은 전부 dataset.index(=원래 배열 인덱스) 기준이라 게임 로직엔 영향 0.
  const view = hand.map((id, i) => ({ id, i })).sort((a, b) => sortValue(a.id) - sortValue(b.id));
  view.forEach(({ id, i }) => {
    const el = cardEl(id);
    el.dataset.index = i; // 원래 손패 배열의 인덱스 (정렬된 표시 위치가 아님)
    if (myDecide) {
      el.classList.add('tappable');
      if (i === hand.length - 1 && round.lastDrawn === id) el.classList.add('drawn');
      if (s.ui.selectedIndex === i) el.classList.add('selected');
    } else {
      el.disabled = true;
    }
    refs.myHand.appendChild(el);
  });

  renderCardInfo(s);
  renderAssist(s);
  renderActions(s);
}

function renderCardInfo(s) {
  const i = s.ui.selectedIndex;
  const hand = s.round.hands.player;
  if (i == null || i >= hand.length) { refs.cardInfo.textContent = ''; return; }
  const c = data.cardMap[hand[i]];
  const bond = data.bondsData.pairs.find((p) => p.a === c.id || p.b === c.id);
  refs.cardInfo.textContent =
    c.name + ' — ' + genreName(c.genre) + ' · ' + stageName(c.stage) +
    (bond ? '  【인연: ' + bond.title + '】' : '');
}

// 왼쪽 '맞출 수 있는 패' 패널: 지금 성립 중인 세트 + 상황 힌트 + 노려볼 역.
// 텐파이가 아니어도 항상 내용이 있다 (게임 판정과 무관한 표시).
function renderAssist(s) {
  const round = s.round;
  const hand = round.hands.player;
  const box = refs.assist;
  if (round.phase === 'ended') { box.innerHTML = ''; return; }

  let html = '<div class="cp-k">지금 성립 중</div>';
  const sets = formedSets(hand, ctx);
  html += sets.length
    ? sets.map((tx) => '<div class="cp-li ok">✓ ' + tx + '</div>').join('')
    : '<div class="cp-li dim">아직 없음</div>';

  html += situationHint(s); // 완성/텐파이/버리면 텐파이 (.assist-* 클래스 유지)

  const yk = reachableYaku(hand, ctx);
  html += '<div class="cp-k">노려볼 역</div>';
  html += yk.length
    ? yk.map((y) => '<div class="cp-li yk" data-yaku="' + y.id + '">' + y.name +
        ' <span class="cp-pt">' + y.score + '점</span></div>').join('')
    : '<div class="cp-li dim">—</div>';

  box.innerHTML = html;
  hideYakuTip(); // 재렌더 시 stale 툴팁 제거
}

// 상황 힌트 — 튜토리얼 코치가 .assist-declare / .assist-tenpai 를 참조하므로 클래스 유지.
function situationHint(s) {
  const round = s.round;
  const hand = round.hands.player;
  if (hand.length === 8) {
    const best = deps.evalHand(hand);
    if (best && best.declarable) {
      return '<div class="assist-declare">완성! ' + best.yaku.map((y) => y.name).join(' + ') +
        ' — <b>' + best.score + '점</b></div>';
    }
    let bd = null;
    const tried = new Set();
    for (let i = 0; i < hand.length; i++) {
      if (tried.has(hand[i])) continue;
      tried.add(hand[i]);
      const h7 = hand.slice(0, i).concat(hand.slice(i + 1));
      const w = waitsFor(h7, deps.cardMap, deps.bondSet, deps.allCardIds, declEval, deps.rules);
      if (w.length && (!bd || w.length > bd.n)) bd = { id: hand[i], n: w.length };
    }
    if (bd) return '<div class="assist-hint">「' + data.cardMap[bd.id].name + '」 버리면 <b>텐파이</b></div>';
    return '';
  }
  const waits = waitsFor(hand, deps.cardMap, deps.bondSet, deps.allCardIds, declEval, deps.rules);
  if (!waits.length) return '';
  const visible = [...hand, ...round.discards.player, ...round.discards.ai];
  const counts = unseenCounts(data.cardsData.cards.map((c) => c.id), data.cfg.copiesPerCard, visible);
  const chips = waits.map((id) => {
    const c = data.cardMap[id];
    return '<span class="wait-chip g-' + c.genre + '">' + genreName(c.genre) + '·' + stageName(c.stage) +
      ' <b>' + counts[id] + '</b></span>';
  }).join('');
  return '<div class="assist-tenpai">텐파이 <span class="chips">' + chips + '</span></div>';
}

// 행동 버튼: 선언 / 버리기 (운명 뺏기 프롬프트는 cutin.js의 오버레이가 담당)
function renderActions(s) {
  const round = s.round;
  const box = refs.actions;
  box.innerHTML = '';
  if (round.turn !== 'player' || round.phase !== 'decide') return;

  const best = deps.evalHand(round.hands.player);
  if (best && best.declarable) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-declare';
    btn.className = 'btn declare';
    btn.textContent = '완성 선언 — ' + best.score + '점';
    box.appendChild(btn);
  }
  if (s.ui.selectedIndex != null) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-discard';
    btn.className = 'btn';
    btn.textContent = '이 카드 버리기';
    box.appendChild(btn);
  }
}
