// duelN.js — N인 대국 상태 머신 (3인+ 확장). 2인 duel.js의 좌석 일반화 버전. 순수함수만.
// 좌석 배열(seats)로 턴을 순환하고, 운명 뺏기는 '버린 사람 다음 좌석부터' 우선순위(A안).
// handEval/yakuEval(한 사람 손패 판정)은 인원 무관 → 그대로 재사용.

import { draw as wallDraw } from './wall.js';
import { isFormalTenpai } from './handEval.js';

const curSeat = (s) => s.seats[s.turnIdx];

export function newRoundN(shuffledWall, seats, firstIdx = 0, abilityInit = {}) {
  let wall = shuffledWall.slice();
  const hands = {}, discards = {}, abilities = {};
  for (const s of seats) { hands[s] = []; discards[s] = []; abilities[s] = { ...(abilityInit[s] || {}) }; }
  const N = seats.length;
  for (let i = 0; i < 7; i++) {
    for (let k = 0; k < N; k++) {
      const s = seats[(firstIdx + k) % N];
      const r = wallDraw(wall); wall = r.wall; hands[s].push(r.card);
    }
  }
  return {
    wall, seats, turnIdx: firstIdx, phase: 'draw',
    hands, discards, abilities,
    lastDrawn: null, lastDiscard: null, result: null,
  };
}

export function drawStepN(state, deps) {
  if (state.phase !== 'draw') throw new Error('drawStepN: wrong phase ' + state.phase);
  if (state.wall.length === 0) return resolveExhaustN(state, deps);
  const seat = curSeat(state);
  const r = wallDraw(state.wall);
  return {
    ...state, wall: r.wall,
    hands: { ...state.hands, [seat]: state.hands[seat].concat([r.card]) },
    lastDrawn: r.card, phase: 'decide',
  };
}

export function tsumoCheckN(state, deps) {
  if (state.phase !== 'decide') return null;
  const best = deps.evalHand(state.hands[curSeat(state)]);
  return best && best.declarable ? best : null;
}

export function declareTsumoN(state, deps) {
  const best = tsumoCheckN(state, deps);
  if (!best) throw new Error('declareTsumoN: not declarable');
  const seat = curSeat(state);
  return {
    ...state, phase: 'ended',
    result: { type: 'tsumo', winner: seat, score: best.score, yaku: best.yaku, hand: state.hands[seat].slice(), decomp: best.decomp },
  };
}

export function discardStepN(state, cardId) {
  if (state.phase !== 'decide') throw new Error('discardStepN: wrong phase');
  const seat = curSeat(state);
  const hand = state.hands[seat].slice();
  const i = hand.indexOf(cardId);
  if (i === -1) throw new Error('discardStepN: card not in hand ' + cardId);
  hand.splice(i, 1);
  return {
    ...state,
    hands: { ...state.hands, [seat]: hand },
    discards: { ...state.discards, [seat]: state.discards[seat].concat([cardId]) },
    lastDiscard: { by: seat, card: cardId }, lastDrawn: null, phase: 'awaitSteal',
  };
}

// 운명 뺏기 후보: 버린 사람 다음 좌석부터 순서대로 검사, 완성 가능한 좌석 목록(우선순위 순).
export function stealCandidatesN(state, deps) {
  if (state.phase !== 'awaitSteal' || !state.lastDiscard) return [];
  const N = state.seats.length;
  const byIdx = state.seats.indexOf(state.lastDiscard.by);
  const out = [];
  for (let k = 1; k < N; k++) {
    const seat = state.seats[(byIdx + k) % N];
    const hand8 = state.hands[seat].concat([state.lastDiscard.card]);
    const best = deps.evalHand(hand8);
    if (best && best.declarable) out.push({ taker: seat, best, hand8, priority: k });
  }
  return out; // 앞쪽일수록(가까운 좌석) 우선
}

export function declareStealN(state, deps, taker) {
  const cands = stealCandidatesN(state, deps);
  const s = (taker && cands.find((c) => c.taker === taker)) || cands[0];
  if (!s) throw new Error('declareStealN: none stealable');
  return {
    ...state, phase: 'ended',
    result: { type: 'steal', winner: s.taker, loser: state.lastDiscard.by, stolenCard: state.lastDiscard.card, score: s.best.score, yaku: s.best.yaku, hand: s.hand8, decomp: s.best.decomp },
  };
}

// 아무도 안 뺏음 → 다음 좌석이 뽑는다
export function passStealN(state) {
  if (state.phase !== 'awaitSteal') throw new Error('passStealN: wrong phase');
  const N = state.seats.length;
  return { ...state, turnIdx: (state.turnIdx + 1) % N, lastDiscard: null, phase: 'draw' };
}

export function resolveExhaustN(state, deps) {
  const tenpai = {};
  for (const s of state.seats) tenpai[s] = isFormalTenpai(state.hands[s], deps.cardMap, deps.bondSet, deps.allCardIds, deps.rules);
  return { ...state, phase: 'ended', result: { type: 'exhaust', winner: null, tenpai } };
}
