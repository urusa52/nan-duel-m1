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
// situation(선택): { myScore, oppScore, targetScore, wallLeft, strategy } 매치 상황.
//   주면 "이길 수 있으면 선언, 뒤지면 참고 큰 손" 전략이 켜진다. 없으면 기존 동작(즉시 선언).
export function aiChooseAction(hand8, deps, situation = null) {
  const best = deps.evalHand(hand8);
  if (best && best.declarable) {
    if (shouldDeclare(best, situation, deps)) return { action: 'declare' };
    // 참기로 함 → 선언 안 하고 버리기로 진행 (더 큰 손을 노린다)
  }

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

// 선언 여부 전략 판단. situation이 없으면 항상 선언(기존 동작 보존).
// 기준(유저 결정): "이번 완성으로 상대를 이길 수 있으면 선언, 아니면 뒤질 때 참고 큰 손".
// 안전장치: 산이 거의 마르면 있는 완성이라도 선언(유국 방지).
function shouldDeclare(best, situation, deps) {
  if (!situation) return true;
  const s = situation.strategy || {};
  const patienceOff = s.patience === false; // 성향: 항상 즉시 선언(속공형)
  if (patienceOff) return true;

  const myAfter = situation.myScore + best.score;
  // 1) 이번 완성으로 매치를 끝낼 수 있으면(=목표 도달) 무조건 선언
  if (myAfter >= situation.targetScore) return true;
  // 2) 산이 얼마 안 남으면 참지 않는다 (유국 방지 안전장치)
  if (situation.wallLeft <= (s.giveUpWall != null ? s.giveUpWall : 6)) return true;
  // 3) 내가 앞서거나 비슷하면 굳히기 — 지금 선언
  const behind = situation.oppScore - situation.myScore;
  const patienceGap = s.patienceGap != null ? s.patienceGap : 3; // 이만큼 뒤지면 참는다
  if (behind < patienceGap) return true;
  // 4) 여기까지 오면: 뒤지고 있고 산도 남았다 → 작은 완성은 참고 큰 손을 노린다.
  //    단 이미 충분히 큰 손이면 선언(무한정 참기 방지).
  const bigEnough = s.bigEnough != null ? s.bigEnough : 6;
  if (best.score >= bigEnough) return true;
  return false; // 참는다
}

// 운명 뺏기 판단: v1은 가능하면 무조건 뺏는다
export function aiWantsSteal() {
  return true;
}
