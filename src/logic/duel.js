// duel.js — 한 국(라운드)의 상태 머신. 순수함수만. (D24·D25·D31·D34·D35)
// 흐름: 뽑기(7→8) → [쯔모 선언 가능?] → 버리기(8→7) → [상대 운명 뺏기?] → 턴 교대
// 산 소진 시 유국: 형식 텐파이 쪽이 소점 (D34).
// 왜 이렇게: 상태는 입력으로 받고 새 상태를 반환 → 테스트·리플레이·AI 자가대국이 쉽다.

import { draw as wallDraw } from './wall.js';
import { isFormalTenpai } from './handEval.js';

export const P = 'player';
export const A = 'ai';
export const other = (who) => (who === P ? A : P);

// deps = { cardMap, bondSet, allCardIds, evalHand }
export function newRound(shuffledWall, firstTurn) {
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
    lastDrawn: null,
    lastDiscard: null, // { by, card }
    result: null, // { type: tsumo|steal|exhaust, winner, score, yaku, hand, tenpai }
  };
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
  return best && best.score > 0 ? best : null;
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
  return best && best.score > 0 ? { taker, best, hand8 } : null;
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
    [P]: isFormalTenpai(state.hands[P], deps.cardMap, deps.bondSet, deps.allCardIds),
    [A]: isFormalTenpai(state.hands[A], deps.cardMap, deps.bondSet, deps.allCardIds),
  };
  return {
    ...state,
    phase: 'ended',
    result: { type: 'exhaust', winner: null, tenpai },
  };
}
