// sim_run.mjs — 런 기반 완성 규칙(config.rules)으로 자가대국. 국 길이·유국률·종료유형·점수·역 분포.
// 실행: node test/sim_run.mjs
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
const load = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cfg = load('config.json');
const cardsData = load('cards.json');
const cardMap = makeCardMap(cardsData);
const bondSet = makeBondSet(load('bonds.json'));
const yakuData = load('yaku.json');
const allCardIds = cardsData.cards.map((c) => c.id);
const rules = cfg.rules;
const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
const deps = { cardMap, bondSet, allCardIds, evalHand, rules };

const aiUseCfg = cfg.abilities ? cfg.abilities.aiUse : true;
const aiAllow = Array.isArray(aiUseCfg) ? new Set(aiUseCfg) : null;

const N = 400;
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

function run(label, useAbilities) {
  const abilityInit = useAbilities ? { [P]: initAbilityState(cfg), [A]: initAbilityState(cfg) } : null;
  const st = { tsumo: 0, steal: 0, exhaust: 0, draws: [], scores: [], yakuFreq: {} };
  for (let seed = 1; seed <= N; seed++) {
    const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(seed * 7919));
    let s = abilityInit ? newRound(wall, seed % 2 ? P : A, abilityInit) : newRound(wall, seed % 2 ? P : A);
    let draws = 0, guard = 0;
    while (s.phase !== 'ended') {
      if (++guard > 3000) throw new Error('stuck ' + label + ' seed ' + seed);
      if (s.phase === 'draw') {
        const before = s.wall.length;
        s = drawStep(s, deps);
        if (s.wall.length < before) draws++;
      } else if (s.phase === 'decide') {
        if (useAbilities) {
          const ch = aiChooseAbility(s, deps, aiAllow);
          if (ch) {
            if (ch.id === 'adapt') s = useAdapt(s, deps, ch.index, ch.genre);
            else if (ch.id === 'foreshadow') s = useForeshadow(s, deps, ch.discardIndex);
            continue;
          }
        }
        const act = aiChooseAction(s.hands[s.turn], deps);
        s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
      } else if (s.phase === 'awaitSteal') {
        const c = stealCheck(s, deps);
        s = c && aiWantsSteal() ? declareSteal(s, deps) : passSteal(s);
      }
    }
    const r = s.result;
    st[r.type]++;
    st.draws.push(draws);
    if (r.score) {
      st.scores.push(r.score);
      for (const y of r.yaku) st.yakuFreq[y.name] = (st.yakuFreq[y.name] || 0) + 1;
    }
  }
  const exhaustPct = (st.exhaust * 100 / N).toFixed(0);
  const perP = (med(st.draws) / 2).toFixed(1);
  console.log('■ ' + label);
  console.log('   국 길이: 총 뽑기 중앙값 ' + med(st.draws) + ' (≈1인 ' + perP + '턴) / 평균 ' + avg(st.draws));
  console.log('   종료: 쯔모 ' + st.tsumo + ' / 뺏기 ' + st.steal + ' / 유국 ' + st.exhaust + ' (유국률 ' + exhaustPct + '%)');
  if (st.scores.length) {
    console.log('   승점: 중앙값 ' + med(st.scores) + ' / 평균 ' + avg(st.scores));
    const top = Object.entries(st.yakuFreq).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => k + ' ' + (v * 100 / st.scores.length).toFixed(0) + '%').join(', ');
    console.log('   역 분포: ' + top);
  }
  console.log('');
}

console.log('=== 런 기반 완성 규칙 자가대국 (' + N + '국) ===\n');
run('능력 OFF (순수 구조 길이)', false);
run('능력 ON (config: AI 각색 잠금)', true);
