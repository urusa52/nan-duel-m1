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

// AI 능력 사용 v1 (규칙 기반, 순수함수).
// 방침: "이번 턴에 즉시 완성되는 경우에만" 각색/복선을 쓴다 — 안전하고 판단이 명료.
//   · 각색: 손패 한 장의 장르를 바꿔 선언 가능해지면
//   · 복선: 뽑은 카드를 무르고 버림패를 회수해 선언 가능해지면
// 예언서(정보형)는 결정적 AI엔 이득이 작아 v1에서는 쓰지 않는다.
// allow: AI가 쓸 수 있는 능력 id 집합(Set). 넘기지 않으면 전부 허용(하위호환).
//   · 각색(adapt)은 사실상 "즉시 완성 버튼"이라 국을 너무 빨리 끝낸다 → 밸런스 레버로 여기서 뺄 수 있다.
// 반환: { id:'adapt', index, genre } | { id:'foreshadow', discardIndex } | null
export function aiChooseAbility(round, deps, allow) {
  const who = round.turn;
  const ab = (round.abilities && round.abilities[who]) || {};
  const hand = round.hands[who];
  if (!hand || hand.length !== 8) return null;
  // 이미 완성 가능하면 능력 낭비 안 함 — 그냥 선언한다.
  const already = deps.evalHand(hand);
  if (already && already.declarable) return null;

  if ((ab.adapt || 0) > 0 && (!allow || allow.has('adapt'))) {
    const genres = [...new Set(deps.allCardIds.map((id) => id.split('-')[0]))];
    for (let i = 0; i < hand.length; i++) {
      const cur = deps.cardMap[hand[i]];
      for (const g of genres) {
        if (g === cur.genre) continue;
        const newId = g + '-' + cur.stage;
        if (!deps.cardMap[newId]) continue;
        const test = hand.slice();
        test[i] = newId;
        const best = deps.evalHand(test);
        if (best && best.declarable) return { id: 'adapt', index: i, genre: g };
      }
    }
  }

  if ((ab.foreshadow || 0) > 0 && (!allow || allow.has('foreshadow')) &&
      round.discards[who].length > 0 && round.lastDrawn != null) {
    const base = hand.slice();
    base.pop(); // 방금 뽑은 카드(끝) 무름
    for (let d = 0; d < round.discards[who].length; d++) {
      const test = base.concat([round.discards[who][d]]);
      const best = deps.evalHand(test);
      if (best && best.declarable) return { id: 'foreshadow', discardIndex: d };
    }
  }
  return null;
}
