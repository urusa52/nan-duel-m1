// sim_length.mjs — "국이 너무 빨리 끝난다" 진단: 어떤 값이 실제로 국 길이를 늘리나.
// 배포 엔진 그대로 사용. 능력은 끔(순수 기본 대국). 뺏기(론)·최소 역·스틸 문턱만 토글.
// 실행: node test/sim_length.mjs
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
import { aiChooseAction } from '../src/logic/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = loadJson('cards.json');
const bondsData = loadJson('bonds.json');
const yakuData = loadJson('yaku.json');
const cardMap = makeCardMap(cardsData);
const bondSet = makeBondSet(bondsData);
const allCardIds = cardsData.cards.map((c) => c.id);

const N = 150;

// stealMode: 'on'=항상 론 / 'off'=론 없음(쯔모만) / 'big'=일정 점수 이상만 론
function runVariant(label, { copies = 3, rules, stealMode = 'on', stealMin = 0 }) {
  const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
  const deps = { cardMap, bondSet, allCardIds, evalHand, rules };
  const stats = { tsumo: 0, steal: 0, exhaust: 0, draws: [] };
  for (let seed = 1; seed <= N; seed++) {
    const wall = shuffle(buildWall(allCardIds, copies), makeRng(seed * 7919));
    let s = newRound(wall, seed % 2 ? P : A);
    let draws = 0, guard = 0;
    while (s.phase !== 'ended') {
      if (++guard > 2000) throw new Error('stuck at ' + label);
      if (s.phase === 'draw') {
        const before = s.wall.length;
        s = drawStep(s, deps);
        if (s.wall.length < before) draws++;
      } else if (s.phase === 'decide') {
        const act = aiChooseAction(s.hands[s.turn], deps);
        s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
      } else if (s.phase === 'awaitSteal') {
        const st = stealCheck(s, deps);
        let want = false;
        if (st) {
          if (stealMode === 'on') want = true;
          else if (stealMode === 'big') want = (st.best.score || 0) >= stealMin;
        }
        s = want ? declareSteal(s, deps) : passSteal(s);
      }
    }
    stats[s.result.type]++;
    stats.draws.push(draws);
  }
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const perPlayer = (med(stats.draws) / 2).toFixed(1);
  console.log('■ ' + label);
  console.log('   총 뽑기 중앙값 ' + med(stats.draws) + ' (≈ 1인 ' + perPlayer + '턴) / 평균 ' + avg(stats.draws));
  console.log('   종료: 쯔모 ' + stats.tsumo + ' / 뺏기 ' + stats.steal + ' / 유국 ' + stats.exhaust + '\n');
}

const noCross2 = { allowCrossGenreRun: false, minYakuToDeclare: 2 };
const noCross3 = { allowCrossGenreRun: false, minYakuToDeclare: 3 };

console.log('=== 국 길이 진단 (능력 OFF, 배포 엔진) ===\n');
runVariant('배포 기본 (A+B, 론 ON)', { rules: noCross2, stealMode: 'on' });
runVariant('론 OFF (쯔모만)', { rules: noCross2, stealMode: 'off' });
runVariant('론은 3점 이상만', { rules: noCross2, stealMode: 'big', stealMin: 3 });
runVariant('최소 3역 + 론 ON', { rules: noCross3, stealMode: 'on' });
runVariant('최소 3역 + 론 3점↑', { rules: noCross3, stealMode: 'big', stealMin: 3 });
