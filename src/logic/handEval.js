// handEval.js — 완성형 판정 (D28·D29). 순수함수만.
// 완성 = 8장 전체가 [세트 3장 × 2 + 짝 2장]으로 분해됨.
// 세트 인정: (a) 같은 장르 3장  (b) 서사 순서 3장 (단계 1-2-3 또는 2-3-4, 장르 무관)
// 짝 인정: 같은 카드 2장 또는 인연 짝.
// 왜 전수 탐색인가: 8장 분해는 짝 후보 ≤28 × 세트 분할 10가지 수준이라
// 브루트포스가 가장 단순·확실하다 (성능 문제 없음).

// ---- 카드 조회 도우미 ----
export function makeCardMap(cardsData) {
  const map = {};
  for (const c of cardsData.cards) map[c.id] = c;
  return map;
}

export function makeBondSet(bondsData) {
  // "a|b" 정렬 키로 저장해 순서 무관 조회
  const set = new Set();
  for (const p of bondsData.pairs) {
    set.add([p.a, p.b].sort().join('|'));
  }
  return set;
}

// ---- 짝 판정 ----
export function isPair(idA, idB, bondSet) {
  if (idA === idB) return { ok: true, bond: false };
  if (bondSet.has([idA, idB].sort().join('|'))) return { ok: true, bond: true };
  return { ok: false };
}

// 난이도 레버 기본값 (config.rules로 덮어씀)
export const DEFAULT_RULES = { allowCrossGenreRun: true, minYakuToDeclare: 1 };

// ---- 세트 판정: 3장의 속성으로 세트 성질을 반환 (아니면 null) ----
// rules.allowCrossGenreRun=false면 장르 무관 서사 세트를 불인정 (D29 재조정 레버)
export function classifySet(ids, cardMap, rules = DEFAULT_RULES) {
  const cs = ids.map((id) => cardMap[id]);
  const genres = cs.map((c) => c.genre);
  const stages = cs.map((c) => c.stage).sort((x, y) => x - y);
  const sameGenre = genres[0] === genres[1] && genres[1] === genres[2];
  const isRun =
    stages[0] + 1 === stages[1] && stages[1] + 1 === stages[2]; // 1-2-3 또는 2-3-4
  if (!sameGenre && !isRun) return null;
  if (!sameGenre && isRun && !rules.allowCrossGenreRun) return null; // 혼합 장르 런 불인정
  return {
    ids: ids.slice(),
    sameGenre,                 // 같은 장르 3장인가
    isRun,                     // 서사 순서인가
    pureRun: sameGenre && isRun, // 같은 장르 + 연속 = 정통 (D29 고점)
    genre: sameGenre ? genres[0] : null,
    runStages: isRun ? stages : null,
  };
}

// ---- 8장 → 모든 유효 분해 나열 ----
// 반환: [{ pair: {ids, bond}, sets: [setInfo, setInfo] }, ...]
export function decompose(hand, cardMap, bondSet, rules = DEFAULT_RULES) {
  if (hand.length !== 8) return [];
  const out = [];
  const idx = [0, 1, 2, 3, 4, 5, 6, 7];
  // 짝 후보 선택
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      const pr = isPair(hand[i], hand[j], bondSet);
      if (!pr.ok) continue;
      const rest = idx.filter((k) => k !== i && k !== j).map((k) => hand[k]);
      // 남은 6장을 3+3으로 분할 (첫 장 고정으로 중복 분할 제거 → 10가지)
      const first = rest[0];
      const others = rest.slice(1);
      for (let a = 0; a < 5; a++) {
        for (let b = a + 1; b < 5; b++) {
          const setA = [first, others[a], others[b]];
          const setB = others.filter((_, k) => k !== a && k !== b);
          const infoA = classifySet(setA, cardMap, rules);
          if (!infoA) continue;
          const infoB = classifySet(setB, cardMap, rules);
          if (!infoB) continue;
          out.push({
            pair: { ids: [hand[i], hand[j]], bond: pr.bond },
            sets: [infoA, infoB],
          });
        }
      }
    }
  }
  return out;
}

export function isCompleteForm(hand, cardMap, bondSet, rules = DEFAULT_RULES) {
  return decompose(hand, cardMap, bondSet, rules).length > 0;
}

// ---- 텐파이/대기 판정 ----
// 손패 7장에 어떤 카드가 오면 완성형이 되는지 전 종류를 대입해 조사.
// declarableOnly=true면 최소 1역(D35)까지 요구 — evalFn을 주입받아 판정.
export function waitsFor(hand7, cardMap, bondSet, allCardIds, evalFn, rules = DEFAULT_RULES) {
  const waits = [];
  for (const id of allCardIds) {
    const hand8 = hand7.concat([id]);
    const decomps = decompose(hand8, cardMap, bondSet, rules);
    if (decomps.length === 0) continue;
    if (evalFn) {
      const best = evalFn(hand8);
      if (!best || best.score <= 0) continue; // 역 없음 → 선언 불가 대기 제외
    }
    waits.push(id);
  }
  return waits;
}

// 형식 텐파이(역 무관) — 유국 소점 판정(D34)에 사용
export function isFormalTenpai(hand7, cardMap, bondSet, allCardIds, rules = DEFAULT_RULES) {
  return waitsFor(hand7, cardMap, bondSet, allCardIds, null, rules).length > 0;
}
