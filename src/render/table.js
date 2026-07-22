// table.js — 대국 테이블 렌더: 상대 영역, 산 잔량, 양측 버림패, 수읽기 패널.
// 렌더는 상태를 읽기만 한다 (변경 금지).

import { unseenCounts } from '../logic/wall.js';

// 단계 글리프는 cards.json의 stage name에서 파생한다 (하드코딩 금지 — 단일 진실원천).
export let STAGE_GLYPH = {};
function buildStageGlyph() {
  STAGE_GLYPH = {};
  for (const st of data.cardsData.stages) STAGE_GLYPH[st.n] = st.name;
}

let refs = null;
let data = null;
let deps = null;

export function initTable(dataBundle, logicDeps) {
  data = dataBundle; // { cardsData, cardMap, cfg }
  deps = logicDeps;  // { bondSet, allCardIds, evalHand, rules } — 상대 텐파이 판정용
  buildStageGlyph();
  refs = {
    aiHand: document.getElementById('ai-hand'),
    aiDiscards: document.getElementById('ai-discards'),
    myDiscards: document.getElementById('my-discards'),
    wallCount: document.getElementById('wall-count'),
    turnBadge: document.getElementById('turn-badge'),
    countPanel: document.getElementById('count-panel'),
    aiWarn: document.getElementById('ai-warn'),
  };
}

// 카드 타일 DOM (공용) — genre 색 + 단계 글리프
export function cardEl(cardId, opts = {}) {
  const c = data.cardMap[cardId];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card g-' + c.genre + (opts.small ? ' small' : '') + (opts.cls ? ' ' + opts.cls : '');
  el.dataset.cardId = cardId;
  el.innerHTML =
    '<span class="c-stage">' + STAGE_GLYPH[c.stage] + '</span>' +
    '<span class="c-genre">' + genreName(c.genre) + '</span>';
  el.title = c.name;
  return el;
}

export function genreName(key) {
  return data.cardsData.genres.find((g) => g.key === key).name;
}

export function stageName(n) {
  return data.cardsData.stages.find((s) => s.n === n).name;
}

export function renderTable(s) {
  const round = s.round;
  if (!round) return;

  // 상대 손패: 장수만큼 뒷면
  refs.aiHand.innerHTML = '';
  for (let i = 0; i < round.hands.ai.length; i++) {
    const b = document.createElement('div');
    b.className = 'card back small';
    refs.aiHand.appendChild(b);
  }

  renderAiWarning(s);

  // 버림패 (공개 — 수읽기의 재료)
  renderDiscards(refs.aiDiscards, round.discards.ai, s);
  renderDiscards(refs.myDiscards, round.discards.player, s);

  // 산 잔량
  refs.wallCount.textContent = round.wall.length;

  // 턴 표시
  const mine = round.turn === 'player' && round.phase !== 'ended';
  refs.turnBadge.textContent = round.phase === 'ended' ? '국 종료'
    : mine ? '내 차례' : '상대 차례';
  refs.turnBadge.className = 'turn-badge' + (mine ? ' mine' : '');

  renderCountPanel(s);
}

// ① 상대 텐파이 경고 (D40): AI 손패가 실제로 텐파이면 상단에 신호.
// config.showOpponentTenpai=false면 끈다 (고수/난이도 옵션 대비).
// 상대 손패는 비공개지만, 초보 접근성을 위해 게임이 대신 읽어준다.
function renderAiWarning(s) {
  const box = refs.aiWarn;
  if (!box) return;
  const round = s.round;
  const on = data.cfg.showOpponentTenpai !== false;
  if (!on || round.phase === 'ended' || !deps) { box.className = 'ai-warn'; box.textContent = ''; return; }

  // AI 손패 기준 텐파이 판정: 7장이면 그대로, 8장(자기 결정 직전)이면 버림 후보 중
  // 하나라도 텐파이가 되는지 본다. 대기 종수도 함께 계산.
  const hand = round.hands.ai;
  let waitKinds = 0;
  if (hand.length === 7) {
    waitKinds = deps.waitsFor(hand, data.cardMap, deps.bondSet, deps.allCardIds, deps.declEval, deps.rules).length;
  } else if (hand.length === 8) {
    const tried = new Set();
    for (let i = 0; i < hand.length; i++) {
      if (tried.has(hand[i])) continue;
      tried.add(hand[i]);
      const h7 = hand.slice(0, i).concat(hand.slice(i + 1));
      const w = deps.waitsFor(h7, data.cardMap, deps.bondSet, deps.allCardIds, deps.declEval, deps.rules);
      if (w.length > waitKinds) waitKinds = w.length;
    }
  }

  if (waitKinds > 0) {
    box.className = 'ai-warn on';
    box.textContent = '완성 임박 · 대기 ' + waitKinds + '종';
    const zone = document.querySelector('.ai-zone');
    if (zone) zone.classList.add('danger');
  } else {
    box.className = 'ai-warn';
    box.textContent = '';
    const zone = document.querySelector('.ai-zone');
    if (zone) zone.classList.remove('danger');
  }
}

function renderDiscards(container, ids, s) {
  container.innerHTML = '';
  ids.forEach((id, i) => {
    const el = cardEl(id, { small: true, cls: 'discard' });
    el.disabled = true;
    // 마지막 버림(운명 뺏기 대상)을 강조
    const last = s.round.lastDiscard;
    if (last && i === ids.length - 1 && ids === s.round.discards[last.by]) {
      el.classList.add('just-discarded');
    }
    container.appendChild(el);
  });
}

// 수읽기 패널 — "안 보인 장수" 5×4 격자 (D16의 셀 수 있는 확률)
function renderCountPanel(s) {
  const panel = refs.countPanel;
  if (!s.ui.showCounts) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const round = s.round;
  const visible = [
    ...round.hands.player,
    ...round.discards.player,
    ...round.discards.ai,
  ];
  const counts = unseenCounts(
    data.cardsData.cards.map((c) => c.id), data.cfg.copiesPerCard, visible
  );

  let html = '<div class="cp-row cp-head"><span></span>';
  for (const st of data.cardsData.stages) html += '<span>' + st.name + '</span>';
  html += '</div>';
  for (const g of data.cardsData.genres) {
    html += '<div class="cp-row"><span class="cp-genre g-' + g.key + '">' + g.name + '</span>';
    for (const st of data.cardsData.stages) {
      const n = counts[g.key + '-' + st.n];
      html += '<span class="cp-n' + (n === 0 ? ' zero' : '') + '">' + n + '</span>';
    }
    html += '</div>';
  }
  html += '<p class="cp-note">내 손패·버림패로 확인된 것을 뺀 "안 보인 장수" (산 또는 상대 손)</p>';
  panel.innerHTML = html;
}
