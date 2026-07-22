// ai.js — 상대 AI v1. 순수함수만.
// v1 방침: ①완성 가능하면 즉시 선언 ②버리기는 "남는 7장의 가치"가 최대인 선택
//   - 텐파이가 되는 버리기가 있으면 그중 대기 수가 가장 많은 것
//   - 아니면 휴리스틱 잠재력 점수가 가장 높은 7장을 남기는 버리기
// 수읽기·방어(위험패 회피)는 M2에서. (마스터 문서 로드맵)

import { waitsFor } from './handEval.js';

// 7장의 잠재력: 카드쌍 관계의 합. 숫자는 감각적 가중치 (config化는 M2 검토).
function potential(hand7, cardMap, bondSet) {
  let score = 0;
  for (let i = 0; i < hand7.length; i++) {
    for (let j = i + 1; j < hand7.length; j++) {
      const a = cardMap[hand7[i]];
      const b = cardMap[hand7[j]];
      if (a.id === b.id) score += 3; // 짝 재료
      else if (bondSet.has([a.id, b.id].sort().join('|'))) score += 3; // 인연 재료
      else if (a.genre === b.genre && Math.abs(a.stage - b.stage) === 1)
        score += 2.5; // 정통 연재 재료
      else if (a.genre === b.genre) score += 1.5; // 장르 세트 재료
      else if (Math.abs(a.stage - b.stage) === 1) score += 1; // 크로스오버 재료
    }
  }
  return score;
}

// hand8 → { action: 'declare' } | { action: 'discard', card }
export function aiChooseAction(hand8, deps) {
  const best = deps.evalHand(hand8);
  if (best && best.declarable) return { action: 'declare' };

  let bestChoice = null;
  const tried = new Set(); // 같은 종류는 한 번만 평가
  for (let i = 0; i < hand8.length; i++) {
    const id = hand8[i];
    if (tried.has(id)) continue;
    tried.add(id);
    const hand7 = hand8.slice(0, i).concat(hand8.slice(i + 1));
    const waits = waitsFor(
      hand7, deps.cardMap, deps.bondSet, deps.allCardIds,
      (h) => { const b = deps.evalHand(h); return b && b.declarable ? b : null; },
      deps.rules
    );
    const cand = {
      card: id,
      tenpai: waits.length > 0,
      waitCount: waits.length,
      pot: potential(hand7, deps.cardMap, deps.bondSet),
    };
    if (!bestChoice) { bestChoice = cand; continue; }
    // 우선순위: 텐파이 > 대기 수 > 잠재력
    if (cand.tenpai !== bestChoice.tenpai) {
      if (cand.tenpai) bestChoice = cand;
    } else if (cand.tenpai) {
      if (cand.waitCount > bestChoice.waitCount) bestChoice = cand;
    } else if (cand.pot > bestChoice.pot) {
      bestChoice = cand;
    }
  }
  return { action: 'discard', card: bestChoice.card };
}

// 운명 뺏기 판단: v1은 가능하면 무조건 뺏는다
export function aiWantsSteal() {
  return true;
}
