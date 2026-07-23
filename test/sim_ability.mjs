// sim_ability.mjs — AI가 능력을 섞어 자가대국. 무크래시·완주·능력 사용 빈도 확인.
// 실행: node test/sim_ability.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeRng, buildWall, shuffle } from '../src/logic/wall.js';
import { makeCardMap, makeBondSet } from '../src/logic/handEval.js';
import { makeYakuEvaluator } from '../src/logic/yakuEval.js';
import {
  P, A, newRound, drawStep, declareTsumo, discardStep,
  stealCheck, declareSteal, passSteal, useAdapt, useForeshadow,
} from '../src/logic/duel.js';
import { aiChooseAction, aiWantsSteal, aiChooseAbility } from '../src/logic/ai.js';
import { initAbilityState } from '../src/logic/abilities.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = loadJson('cards.json');
const bondsData = loadJson('bonds.json');
const yakuData = loadJson('yaku.json');
const cfg = loadJson('config.json');

const cardMap = makeCardMap(cardsData);
const bondSet = makeBondSet(bondsData);
const allCardIds = cardsData.cards.map((c) => c.id);
const rules = cfg.rules; // 배포 규칙 (혼합런 불인정 · 최소 2역)
const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
const deps = { cardMap, bondSet, allCardIds, evalHand, rules };
const abilityInit = { [P]: initAbilityState(cfg), [A]: initAbilityState(cfg) };

const N = 500;
const stat = { tsumo: 0, steal: 0, exhaust: 0, adapt: 0, foreshadow: 0, draws: [] };

for (let seed = 1; seed <= N; seed++) {
  const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(seed * 7919));
  let s = newRound(wall, seed % 2 ? P : A, abilityInit);
  let guard = 0, draws = 0;
  while (s.phase !== 'ended') {
    if (++guard > 3000) throw new Error('stuck at seed ' + seed);
    if (s.phase === 'draw') {
      const before = s.wall.length;
      s = drawStep(s, deps);
      if (s.wall.length < before) draws++;
    } else if (s.phase === 'decide') {
      const ch = aiChooseAbility(s, deps);
      if (ch) {
        if (ch.id === 'adapt') { s = useAdapt(s, deps, ch.index, ch.genre); stat.adapt++; }
        else if (ch.id === 'foreshadow') { s = useForeshadow(s, deps, ch.discardIndex); stat.foreshadow++; }
        continue; // 능력 후 다시 판단 (대개 선언)
      }
      const act = aiChooseAction(s.hands[s.turn], deps);
      s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
    } else if (s.phase === 'awaitSteal') {
      const st = stealCheck(s, deps);
      s = st && aiWantsSteal() ? declareSteal(s, deps) : passSteal(s);
    }
  }
  stat[s.result.type]++;
  stat.draws.push(draws);
}

const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`[sim_ability] ${N}국 완주 (무크래시)`);
console.log(`  종료: 쯔모 ${stat.tsumo} / 뺏기 ${stat.steal} / 유국 ${stat.exhaust}`);
console.log(`  국 길이(뽑기): 평균 ${avg(stat.draws)} / 중앙값 ${med(stat.draws)}`);
console.log(`  AI 능력 사용: 각색 ${stat.adapt}회 / 복선 ${stat.foreshadow}회 (총 ${N}국)`);
if (stat.tsumo + stat.steal + stat.exhaust !== N) { console.log('  ✗ 완주 수 불일치'); process.exit(1); }
console.log('  ✓ 전부 정상 완주');
