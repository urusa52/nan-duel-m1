// yakuEval.js — 런 기반 완성 채점 (설계_런기반_완성구조_가산역). 순수함수만.
// 세트는 handEval에서 '같은 장르 연속(기승전/승전결)'만 인정된다(런). 여기선 두 런의
// 아크 조합·장르·짝으로 '축 + 등급'을 매긴다. 점수는 yaku.json, 조건 로직은 여기(규칙 5).
//
// 축:
//  · 서사 완성도(택1): 미완×2=선언불가 / 양대완결(승전결×2) / 대서사시(기→결, 다른 장르) /
//                      일대기(기→결, 같은 장르=같은 작품)
//  · 장르 순도(가산): 전집(8장 한 장르)
//  · 짝의 격(가산): 인연
//  · 역만(단독 대체): 불후의 명작 = 일대기 + 전집
// 선언 게이트: 두 세트 중 최소 하나가 '승전결'(결말). = hasFinale.

import { decompose, DEFAULT_RULES } from './handEval.js';

const isFinale = (s) => !!s.runStages && s.runStages[2] === 4; // 2-3-4
const isOpening = (s) => !!s.runStages && s.runStages[0] === 1; // 1-2-3

// 분해 하나 → { ids:[역 id...], hasFinale }
function yakuForDecomp(decomp, cardMap) {
  const [s1, s2] = decomp.sets;
  const ids = [];
  const finaleCount = (isFinale(s1) ? 1 : 0) + (isFinale(s2) ? 1 : 0);
  const chain = (isOpening(s1) && isFinale(s2)) || (isFinale(s1) && isOpening(s2)); // 기→결 완주
  const sameGenre2 = s1.genre === s2.genre;
  const pairGenre = cardMap[decomp.pair.ids[0]].genre;
  const flush = sameGenre2 && pairGenre === s1.genre; // 8장 전부 같은 장르

  // 서사 완성도 (택1)
  if (chain) ids.push(sameGenre2 ? 'sagaSame' : 'sagaMix'); // 일대기 / 대서사시
  else if (finaleCount === 2) ids.push('doubleFinale');     // 양대 완결
  // finaleCount===0 (기승전×2): 아무것도 없음 → 선언 불가

  // 장르 순도
  if (flush) ids.push('complete');
  // 짝의 격
  if (decomp.pair.bond) ids.push('bond');
  // 역만: 전집 + 기→결 완주
  if (flush && chain) ids.push('masterpiece');

  return { ids, hasFinale: finaleCount >= 1 };
}

// 팩토리: yaku.json을 받아 평가 함수를 만든다
export function makeYakuEvaluator(yakuData, cardMap, bondSet, rules = DEFAULT_RULES) {
  const table = {};
  for (const y of yakuData.yaku) table[y.id] = y;

  // hand(8장) → 최고 해석 { score, yaku:[{id,name,score}], decomp, declarable } | null(미완성)
  return function evalHand(hand) {
    const decomps = decompose(hand, cardMap, bondSet, rules);
    if (decomps.length === 0) return null;

    let best = null;
    for (const d of decomps) {
      const { ids, hasFinale } = yakuForDecomp(d, cardMap);
      let list;
      let score;
      if (ids.includes('masterpiece')) {
        // 역만은 단독 점수 (합산하지 않음)
        list = [table.masterpiece];
        score = table.masterpiece.score;
      } else {
        list = ids.map((id) => table[id]).filter(Boolean);
        score = list.reduce((s, y) => s + y.score, 0);
      }
      const cand = { score, yaku: list, decomp: d, hasFinale };
      // 선언 가능한(결말 있는) 분해를 우선, 그다음 높은 점수.
      if (!best) best = cand;
      else if (cand.hasFinale !== best.hasFinale ? cand.hasFinale : cand.score > best.score) best = cand;
    }

    // 선언 게이트: 결말(승전결) 세트가 있고 득점이 있어야 선언 가능.
    best.declarable = best.hasFinale && best.score > 0;
    return best;
  };
}
