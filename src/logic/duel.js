// duel.js — 한 국(라운드)의 상태 머신. 순수함수만. (D24·D25·D31·D34·D35)
// 흐름: 뽑기(7→8) → [쯔모 선언 가능?] → 버리기(8→7) → [상대 운명 뺏기?] → 턴 교대
// 산 소진 시 유국: 형식 텐파이 쪽이 소점 (D34).
// 왜 이렇게: 상태는 입력으로 받고 새 상태를 반환 → 테스트·리플레이·AI 자가대국이 쉽다.

import { draw as wallDraw } from './wall.js';
import { isFormalTenpai } from './handEval.js';
import { canUse, spend, applyForesight, applyAdapt, applyForeshadow } from './abilities.js';

export const P = 'player';
export const A = 'ai';
export const other = (who) => (who === P ? A : P);

// deps = { cardMap, bondSet, allCardIds, evalHand }
// abilityInit = { player: {...잔여}, ai: {...잔여} } — main이 config로 만들어 넘긴다.
//   생략 시 빈 상태(능력 없음)로 → 기존 호출/테스트 하위호환.
export function newRound(shuffledWall, firstTurn, abilityInit = { [P]: {}, [A]: {} }) {
  let wall = shuffledWall.slice();
  const hands = { [P]: [], [A]: [] };
  for (let i = 0; i < 7; i++) {
    for (const who of [firstTurn, other(firstTurn)]) {
      const r = wallDraw(wall);
      wall = r.wall;
      hands[who].push(r.card);
    }
  }
  return {
    wall,
    turn: firstTurn,
    phase: 'draw', // draw | decide | awaitSteal | ended
    hands,
    discards: { [P]: [], [A]: [] },
    // 능력 잔여 횟수 — 국마다 새로 생성되므로 국 경계에서 자동 리셋. (분기후보_특수능력.md)
    abilities: { [P]: { ...(abilityInit[P] || {}) }, [A]: { ...(abilityInit[A] || {}) } },
    lastDrawn: null,
    lastDiscard: null, // { by, card }
    result: null, // { type: tsumo|steal|exhaust, winner, score, yaku, hand, tenpai }
  };
}

// ---- 특수 능력 사용 (모두 순수 상태 전이) ----
// 공통: 자기 턴에만, 잔여 횟수 있을 때만. 잘못된 페이즈/소진 시 throw.

// 예언서 (beforeDraw): 다음 뽑을 n장을 미리 본다. {round, peek} 반환. 산·손패 불변.
export function useForesight(state, deps, n) {
  if (state.phase !== 'draw') throw new Error('useForesight: wrong phase ' + state.phase);
  const who = state.turn;
  if (!canUse(state.abilities?.[who], 'foresight')) throw new Error('useForesight: no use left');
  const peek = applyForesight(state.wall, n);
  const abilities = { ...state.abilities, [who]: spend(state.abilities[who], 'foresight') };
  return { round: { ...state, abilities }, peek };
}

// 각색 (beforeDiscard): decide 페이즈에서 손패 index 카드의 장르를 바꾼다.
export function useAdapt(state, deps, index, newGenre) {
  if (state.phase !== 'decide') throw new Error('useAdapt: wrong phase ' + state.phase);
  const who = state.turn;
  if (!canUse(state.abilities?.[who], 'adapt')) throw new Error('useAdapt: no use left');
  const hand = applyAdapt(state.hands[who], index, newGenre, deps.cardMap);
  const hands = { ...state.hands, [who]: hand };
  const abilities = { ...state.abilities, [who]: spend(state.abilities[who], 'adapt') };
  return { ...state, hands, abilities };
}

// 복선 (insteadOfDraw): draw 페이즈에서 내 버림패 1장을 회수(7→8) → decide로. 산 불변.
export function useForeshadow(state, deps, discardIndex) {
  if (state.phase !== 'draw') throw new Error('useForeshadow: wrong phase ' + state.phase);
  const who = state.turn;
  if (!canUse(state.abilities?.[who], 'foreshadow')) throw new Error('useForeshadow: no use left');
  const { hand, discards } = applyForeshadow(state.hands[who], state.discards[who], discardIndex);
  const hands = { ...state.hands, [who]: hand };
  const newDiscards = { ...state.discards, [who]: discards };
  const abilities = { ...state.abilities, [who]: spend(state.abilities[who], 'foreshadow') };
  return { ...state, hands, discards: newDiscards, abilities, lastDrawn: hand[hand.length - 1], phase: 'decide' };
}

// 뽑기: 산이 비었으면 유국 처리. 아니면 손패 7→8.
export function drawStep(state, deps) {
  if (state.phase !== 'draw') throw new Error('drawStep: wrong phase ' + state.phase);
  if (state.wall.length === 0) return resolveExhaust(state, deps);
  const r = wallDraw(state.wall);
  const hands = { ...state.hands, [state.turn]: state.hands[state.turn].concat([r.card]) };
  return { ...state, wall: r.wall, hands, lastDrawn: r.card, phase: 'decide' };
}

// 현재 턴이 쯔모 선언 가능한가 (완성형 + 최소 1역, D35)
export function tsumoCheck(state, deps) {
  if (state.phase !== 'decide') return null;
  const best = deps.evalHand(state.hands[state.turn]);
  return best && best.declarable ? best : null;
}

export function declareTsumo(state, deps) {
  const best = tsumoCheck(state, deps);
  if (!best) throw new Error('declareTsumo: not declarable');
  return {
    ...state,
    phase: 'ended',
    result: {
      type: 'tsumo',
      winner: state.turn,
      score: best.score,
      yaku: best.yaku,
      hand: state.hands[state.turn].slice(),
      decomp: best.decomp,
    },
  };
}

// 버리기: 손패에서 지정 카드 제거(첫 일치) → 버림패 공개
export function discardStep(state, cardId) {
  if (state.phase !== 'decide') throw new Error('discardStep: wrong phase');
  const hand = state.hands[state.turn].slice();
  const i = hand.indexOf(cardId);
  if (i === -1) throw new Error('discardStep: card not in hand ' + cardId);
  hand.splice(i, 1);
  const hands = { ...state.hands, [state.turn]: hand };
  const discards = {
    ...state.discards,
    [state.turn]: state.discards[state.turn].concat([cardId]),
  };
  return {
    ...state,
    hands,
    discards,
    lastDiscard: { by: state.turn, card: cardId },
    lastDrawn: null,
    phase: 'awaitSteal',
  };
}

// 상대가 방금 버린 카드로 완성 가능한가 (운명 뺏기, D31)
export function stealCheck(state, deps) {
  if (state.phase !== 'awaitSteal' || !state.lastDiscard) return null;
  const taker = other(state.lastDiscard.by);
  const hand8 = state.hands[taker].concat([state.lastDiscard.card]);
  const best = deps.evalHand(hand8);
  return best && best.declarable ? { taker, best, hand8 } : null;
}

export function declareSteal(state, deps) {
  const s = stealCheck(state, deps);
  if (!s) throw new Error('declareSteal: not stealable');
  return {
    ...state,
    phase: 'ended',
    result: {
      type: 'steal',
      winner: s.taker,
      loser: state.lastDiscard.by,
      stolenCard: state.lastDiscard.card,
      score: s.best.score,
      yaku: s.best.yaku,
      hand: s.hand8,
      decomp: s.best.decomp,
    },
  };
}

// 뺏기 포기 → 턴 교대
export function passSteal(state) {
  if (state.phase !== 'awaitSteal') throw new Error('passSteal: wrong phase');
  return { ...state, turn: other(state.turn), lastDiscard: null, phase: 'draw' };
}

// 유국 (D34): 형식 텐파이인 쪽이 소점
export function resolveExhaust(state, deps) {
  const tenpai = {
    [P]: isFormalTenpai(state.hands[P], deps.cardMap, deps.bondSet, deps.allCardIds, deps.rules),
    [A]: isFormalTenpai(state.hands[A], deps.cardMap, deps.bondSet, deps.allCardIds, deps.rules),
  };
  return {
    ...state,
    phase: 'ended',
    result: { type: 'exhaust', winner: null, tenpai },
  };
}
