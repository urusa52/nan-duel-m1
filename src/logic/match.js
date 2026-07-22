// match.js — 매치(라운드제) 진행. 순수함수만. (D21·D36)
// 기본 race: 선취 목표점 도달 승리. fixed: 고정 N국 후 총점 (여지, config로 전환).

import { P, A } from './duel.js';

export function newMatch(cfg) {
  return {
    mode: cfg.matchMode, // 'race' | 'fixed'
    scores: { [P]: 0, [A]: 0 },
    round: 1,
    firstTurn: P, // 국마다 교대
    over: false,
    winner: null,
  };
}

// 국 결과를 매치에 반영하고 다음 국을 준비한다
export function applyRoundResult(match, result, cfg) {
  const m = {
    ...match,
    scores: { ...match.scores },
  };
  if (result.type === 'tsumo' || result.type === 'steal') {
    m.scores[result.winner] += result.score;
  } else if (result.type === 'exhaust') {
    // 텐파이 쪽이 소점 (양쪽 텐파이면 양쪽 다)
    if (result.tenpai[P]) m.scores[P] += cfg.tenpaiScore;
    if (result.tenpai[A]) m.scores[A] += cfg.tenpaiScore;
  }

  // 종료 판정
  if (m.mode === 'race') {
    if (m.scores[P] >= cfg.targetScore || m.scores[A] >= cfg.targetScore) {
      m.over = true;
      m.winner =
        m.scores[P] === m.scores[A] ? null : m.scores[P] > m.scores[A] ? P : A;
      // 동시 도달 동점이면 승자 미정 → 한 국 더 (서든데스)
      if (m.winner) return m;
      m.over = false;
    }
  } else {
    if (m.round >= cfg.fixedRounds) {
      if (m.scores[P] !== m.scores[A]) {
        m.over = true;
        m.winner = m.scores[P] > m.scores[A] ? P : A;
        return m;
      }
      // 동점이면 서든데스로 계속
    }
  }

  m.round += 1;
  m.firstTurn = match.firstTurn === P ? A : P; // 선 교대
  return m;
}
