// sim_balance.mjs — 난이도 변형별 자가대국 시뮬레이션.
// 실행: node test/sim_balance.mjs
// 측정: 국당 총 뽑기 수(=국 길이), 종료 유형 분포, 평균 승점.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeRng, buildWall, shuffle } from '../src/logic/wall.js';
import { makeCardMap, makeBondSet } from '../src/logic/handEval.js';
import { makeYakuEvaluator } from '../src/logic/yakuEval.js';
import {
  P, A, newRound, drawStep, declareTsumo, discardStep,
  stealCheck, declareSteal, passSteal,
} from '../src/logic/duel.js';
import { aiChooseAction, aiWantsSteal } from '../src/logic/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = loadJson('cards.json');
const bondsData = loadJson('bonds.json');
const yakuData = loadJson('yaku.json');

const cardMap = makeCardMap(cardsData);
const bondSet = makeBondSet(bondsData);
const allCardIds = cardsData.cards.map((c) => c.id);

const N = 400;

function runVariant(label, { copies, rules }) {
  const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
  const deps = { cardMap, bondSet, allCardIds, evalHand, rules };
  const stats = { tsumo: 0, steal: 0, exhaust: 0, draws: [], scores: [], yakuFreq: {} };

  for (let seed = 1; seed <= N; seed++) {
    const wall = shuffle(buildWall(allCardIds, copies), makeRng(seed * 7919));
    let s = newRound(wall, seed % 2 ? P : A);
    let draws = 0;
    let guard = 0;
    while (s.phase !== 'ended') {
      if (++guard > 800) throw new Error('stuck at ' + label);
      if (s.phase === 'draw') {
        const before = s.wall.length;
        s = drawStep(s, deps);
        if (s.wall.length < before) draws++;
      } else if (s.phase === 'decide') {
        const act = aiChooseAction(s.hands[s.turn], deps);
        s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
      } else if (s.phase === 'awaitSteal') {
        const st = stealCheck(s, deps);
        s = st && aiWantsSteal() ? declareSteal(s, deps) : passSteal(s);
      }
    }
    const r = s.result;
    stats[r.type]++;
    stats.draws.push(draws);
    if (r.score) {
      stats.scores.push(r.score);
      for (const y of r.yaku) stats.yakuFreq[y.name] = (stats.yakuFreq[y.name] || 0) + 1;
    }
  }

  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log('■ ' + label);
  console.log('  국 길이(총 뽑기): 평균 ' + avg(stats.draws) + ' / 중앙값 ' + med(stats.draws) +
    '  (참고: 산 ' + (allCardIds.length * copies - 14) + '장 소진 시 유국)');
  console.log('  종료: 쯔모 ' + stats.tsumo + ' / 뺏기 ' + stats.steal + ' / 유국 ' + stats.exhaust +
    '  (' + N + '국)');
  if (stats.scores.length) {
    console.log('  승점: 평균 ' + avg(stats.scores) + ' / 중앙값 ' + med(stats.scores));
    const top = Object.entries(stats.yakuFreq).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => k + ' ' + (v * 100 / stats.scores.length).toFixed(0) + '%').join(', ');
    console.log('  자주 나온 역: ' + top);
  }
  console.log('');
}

const loose = { allowCrossGenreRun: true, minYakuToDeclare: 1 };

runVariant('현행 (혼합 런 허용, 1역, 종당 3장)', { copies: 3, rules: loose });
runVariant('변형 A: 혼합 장르 런 불인정', { copies: 3, rules: { allowCrossGenreRun: false, minYakuToDeclare: 1 } });
runVariant('변형 B: 최소 2역', { copies: 3, rules: { allowCrossGenreRun: true, minYakuToDeclare: 2 } });
runVariant('변형 C: 종당 2장 (산 40장)', { copies: 2, rules: loose });
runVariant('변형 A+B', { copies: 3, rules: { allowCrossGenreRun: false, minYakuToDeclare: 2 } });
runVariant('변형 A+C', { copies: 2, rules: { allowCrossGenreRun: false, minYakuToDeclare: 1 } });
