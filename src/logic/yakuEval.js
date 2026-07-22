// yakuEval.js — 가산역 판정·합산 (D30·D35). 순수함수만.
// 원칙: 조건 로직은 코드, 이름·점수는 yaku.json (수치는 데이터로 — 프로젝트 규칙 5).
// 가산역은 중복 합산. 역만(불후의 명작)은 단독 점수로 대체.

import { decompose, DEFAULT_RULES } from './handEval.js';

// 분해 하나에 대해 성립 역 id 목록을 계산
function yakuForDecomp(decomp, hand, cardMap) {
  const [s1, s2] = decomp.sets;
  const ids = [];
  const cards = hand.map((id) => cardMap[id]);
  const genreSetAll = new Set(cards.map((c) => c.genre));

  // 크로스오버: 장르 무관(혼합 장르) 서사 세트 포함
  if ((s1.isRun && !s1.sameGenre) || (s2.isRun && !s2.sameGenre)) ids.push('crossover');
  // 정통 연재: 같은 장르 연속 서사 세트 포함 (D29 고점)
  if (s1.pureRun || s2.pureRun) ids.push('pureSerial');
  // 단편집: 두 세트 모두 같은-장르 세트이고 장르가 서로 다름
  if (s1.sameGenre && s2.sameGenre && s1.genre !== s2.genre) ids.push('anthology2');
  // 전속 작가: 두 세트가 같은 장르로 통일
  if (s1.sameGenre && s2.sameGenre && s1.genre === s2.genre) ids.push('exclusive');
  // 완결: 결(4단계)로 끝나는 서사 세트 포함 (2-3-4)
  const endsAtVictory = (s) => s.isRun && s.runStages[2] === 4;
  if (endsAtVictory(s1) || endsAtVictory(s2)) ids.push('finale');
  // 인연: 짝이 인연 짝
  if (decomp.pair.bond) ids.push('bond');
  // 전집: 8장 전부 같은 장르
  if (genreSetAll.size === 1) ids.push('complete');
  // 오대 장르: 5개 장르 전부 등장
  if (genreSetAll.size === 5) ids.push('fiveGenre');
  // 대서사시: 서사 세트 둘이 1-2-3과 2-3-4로 기→결 완주
  const runKey = (s) => (s.isRun ? s.runStages.join('') : '');
  const keys = [runKey(s1), runKey(s2)];
  if (keys.includes('123') && keys.includes('234')) ids.push('fourAct');
  // 불후의 명작: 전집 + 대서사시 동시
  if (ids.includes('complete') && ids.includes('fourAct')) ids.push('masterpiece');

  return ids;
}

// 팩토리: yaku.json을 받아 평가 함수를 만든다
export function makeYakuEvaluator(yakuData, cardMap, bondSet, rules = DEFAULT_RULES) {
  const table = {};
  for (const y of yakuData.yaku) table[y.id] = y;

  // hand(8장) → 최고 점수 해석 { score, yaku:[{id,name,score}], decomp } | null(미완성)
  return function evalHand(hand) {
    const decomps = decompose(hand, cardMap, bondSet, rules);
    if (decomps.length === 0) return null;
    let best = null;
    for (const d of decomps) {
      const ids = yakuForDecomp(d, hand, cardMap);
      let score;
      let list;
      if (ids.includes('masterpiece')) {
        // 역만은 단독 점수 (합산하지 않음)
        score = table.masterpiece.score;
        list = [table.masterpiece];
      } else {
        list = ids.map((id) => table[id]);
        score = list.reduce((s, y) => s + y.score, 0);
      }
      if (!best || score > best.score) {
        best = { score, yaku: list, decomp: d };
      }
    }
    // 선언 자격 (D35 + 난이도 레버): 역 개수가 minYakuToDeclare 이상
    if (best) best.declarable = best.yaku.length >= rules.minYakuToDeclare && best.score > 0;
    return best;
  };
}
