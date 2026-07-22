// sim_score.mjs — 점수 밸런스 시뮬레이션. 여러 점수표 후보의 완성 점수 분포 비교.
// 실행: node test/sim_score.mjs
// 목적: "완성의 절반이 최저점" 문제를 완화하는 점수표를 찾는다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRng, buildWall, shuffle } from '../src/logic/wall.js';
import { makeCardMap, makeBondSet } from '../src/logic/handEval.js';
import { makeYakuEvaluator } from '../src/logic/yakuEval.js';
import { P, A, newRound, drawStep, declareTsumo, discardStep, stealCheck, declareSteal, passSteal } from '../src/logic/duel.js';
import { aiChooseAction, aiWantsSteal } from '../src/logic/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = J('cards.json'), bondsData = J('bonds.json'), yakuData = J('yaku.json'), cfg = J('config.json');
const cardMap = makeCardMap(cardsData), bondSet = makeBondSet(bondsData);
const allCardIds = cardsData.cards.map((c) => c.id);
const rules = { allowCrossGenreRun: false, minYakuToDeclare: 2, ...(cfg.rules || {}) };

// 점수표 후보: id → score 를 덮어쓴 yakuData를 만든다
function withScores(overrides) {
  const y = JSON.parse(JSON.stringify(yakuData));
  for (const item of y.yaku) if (overrides[item.id] != null) item.score = overrides[item.id];
  return y;
}

function runTable(label, yData) {
  const evalHand = makeYakuEvaluator(yData, cardMap, bondSet, rules);
  const deps = { cardMap, bondSet, allCardIds, evalHand, rules };
  const scores = [];
  const byYaku = {};
  for (let seed = 1; seed <= 600; seed++) {
    const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(seed * 311));
    let s = newRound(wall, seed % 2 ? P : A), g = 0;
    while (s.phase !== 'ended') {
      if (++g > 800) break;
      if (s.phase === 'draw') s = drawStep(s, deps);
      else if (s.phase === 'decide') {
        const act = aiChooseAction(s.hands[s.turn], deps);
        s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
      } else if (s.phase === 'awaitSteal') {
        const st = stealCheck(s, deps);
        s = st && aiWantsSteal() ? declareSteal(s, deps) : passSteal(s);
      }
    }
    const r = s.result;
    if (r.score) {
      scores.push(r.score);
      for (const y of r.yaku) byYaku[y.name] = (byYaku[y.name] || 0) + 1;
    }
  }
  scores.sort((a, b) => a - b);
  const n = scores.length;
  const avg = (scores.reduce((a, b) => a + b, 0) / n).toFixed(1);
  const med = scores[Math.floor(n / 2)];
  const min = scores[0], max = scores[n - 1];
  // 최저점 완성 비율 (= 시시한 완성)
  const lowShare = (scores.filter((x) => x <= min + 1).length * 100 / n).toFixed(0);
  const bigShare = (scores.filter((x) => x >= 6).length * 100 / n).toFixed(0);
  console.log('■ ' + label);
  console.log('  평균 ' + avg + ' / 중앙값 ' + med + ' / 범위 ' + min + '–' + max);
  console.log('  최저권(≤' + (min + 1) + '점) 완성 비율: ' + lowShare + '%   |  큰 완성(≥6점): ' + bigShare + '%');
  const top = Object.entries(byYaku).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => k + ' ' + (v * 100 / n).toFixed(0) + '%').join(', ');
  console.log('  자주: ' + top + '\n');
}

// 현행
runTable('현행', yakuData);

// 후보 A: 쉬운 역 더 싸게 (일부 1→0.. 대신 1 유지, 대신 큰 역 키움)
runTable('A: 큰 역 강화', withScores({
  exclusive: 4, complete: 8, fourAct: 10, fiveGenre: 7, masterpiece: 20,
}));

// 후보 B: 최저 완성 자체를 비싸게 만들지 않되, 중상위를 곱으로 키움
runTable('B: 계단 급하게', withScores({
  crossover: 1, anthology2: 1, bond: 2, pureSerial: 3, finale: 3,
  exclusive: 5, complete: 10, fourAct: 12, fiveGenre: 8, masterpiece: 25,
}));

// 후보 C: 최소 역 요건 유지 + 최저 역 점수는 낮추고 격차 극대화
runTable('C: 격차 극대화', withScores({
  crossover: 1, anthology2: 1, bond: 1, pureSerial: 2, finale: 2,
  exclusive: 6, complete: 12, fourAct: 15, fiveGenre: 10, masterpiece: 30,
}));
