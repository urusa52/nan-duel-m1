// handUI.js — 내 손패 + 자동 판정 보조(D33).
// 원칙: 찾는 것은 시스템(텐파이·대기·성립 역 자동 표시), 판단은 플레이어.

import { waitsFor } from '../logic/handEval.js';
import { unseenCounts } from '../logic/wall.js';
import { cardEl, genreName, stageName } from './table.js';

let refs = null;
let data = null;
let deps = null;

// 선언 가능(최소 역 충족) 해석만 인정하는 평가 래퍼
function declEval(hand) {
  const b = deps.evalHand(hand);
  return b && b.declarable ? b : null;
}

export function initHandUI(dataBundle, logicDeps) {
  data = dataBundle;
  deps = logicDeps;
  refs = {
    myHand: document.getElementById('my-hand'),
    assist: document.getElementById('assist'),
    actions: document.getElementById('actions'),
    cardInfo: document.getElementById('card-info'),
  };
}

export function renderHand(s) {
  const round = s.round;
  if (!round) return;
  const hand = round.hands.player;
  const myDecide = round.turn === 'player' && round.phase === 'decide';

  refs.myHand.innerHTML = '';
  hand.forEach((id, i) => {
    const el = cardEl(id);
    el.dataset.index = i;
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

// 자동 판정 패널: 8장이면 선언 가능 여부, 7장이면 텐파이·대기 표시
function renderAssist(s) {
  const round = s.round;
  const hand = round.hands.player;
  const box = refs.assist;

  if (round.phase === 'ended') { box.innerHTML = ''; return; }

  if (hand.length === 8) {
    const best = deps.evalHand(hand);
    if (best && best.declarable) {
      box.innerHTML =
        '<div class="assist-declare">완성! ' +
        best.yaku.map((y) => y.name).join(' + ') +
        ' — <b>' + best.score + '점</b></div>';
      return;
    }
    // 미완성 8장: 어떤 카드를 버리면 텐파이인지 힌트
    const tenpaiDiscards = [];
    const tried = new Set();
    for (let i = 0; i < hand.length; i++) {
      if (tried.has(hand[i])) continue;
      tried.add(hand[i]);
      const h7 = hand.slice(0, i).concat(hand.slice(i + 1));
      const w = waitsFor(h7, deps.cardMap, deps.bondSet, deps.allCardIds, declEval, deps.rules);
      if (w.length > 0) tenpaiDiscards.push({ discard: hand[i], waits: w });
    }
    if (tenpaiDiscards.length > 0) {
      const b = tenpaiDiscards.sort((x, y) => y.waits.length - x.waits.length)[0];
      const c = data.cardMap[b.discard];
      box.innerHTML =
        '<div class="assist-hint">「' + c.name + '」을(를) 버리면 <b>텐파이</b> — 대기 ' +
        b.waits.length + '종</div>';
    } else {
      box.innerHTML = '<div class="assist-dim">버릴 카드를 고르세요</div>';
    }
    return;
  }

  // 손패 7장 (상대 차례 등): 텐파이면 대기 카드와 남은 장수 표시
  const waits = waitsFor(hand, deps.cardMap, deps.bondSet, deps.allCardIds, declEval, deps.rules);
  if (waits.length === 0) { box.innerHTML = ''; return; }
  const visible = [...hand, ...round.discards.player, ...round.discards.ai];
  const counts = unseenCounts(
    data.cardsData.cards.map((c) => c.id), data.cfg.copiesPerCard, visible
  );
  const chips = waits.map((id) => {
    const c = data.cardMap[id];
    return '<span class="wait-chip g-' + c.genre + '">' +
      genreName(c.genre) + '·' + stageName(c.stage) +
      ' <b>' + counts[id] + '</b></span>';
  }).join('');
  box.innerHTML =
    '<div class="assist-tenpai">텐파이 — 대기 <span class="chips">' + chips + '</span></div>';
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
