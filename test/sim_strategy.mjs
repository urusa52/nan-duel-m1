// sim_strategy.mjs — AI 전략(뒤지면 큰 손 노리기) 효과 측정.
// 실행: node test/sim_strategy.mjs
// 전략 off vs on 을 매치 단위로 돌려 완성 점수 분포·유국률·역전 발생을 비교.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRng, buildWall, shuffle } from '../src/logic/wall.js';
import { makeCardMap, makeBondSet } from '../src/logic/handEval.js';
import { makeYakuEvaluator } from '../src/logic/yakuEval.js';
import { P, A, newRound, drawStep, declareTsumo, discardStep, stealCheck, declareSteal, passSteal } from '../src/logic/duel.js';
import { newMatch, applyRoundResult } from '../src/logic/match.js';
import { aiChooseAction, aiWantsSteal } from '../src/logic/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = J('cards.json'), bondsData = J('bonds.json'), yakuData = J('yaku.json'), cfg = J('config.json');
const cardMap = makeCardMap(cardsData), bondSet = makeBondSet(bondsData);
const allCardIds = cardsData.cards.map((c) => c.id);
const rules = { allowCrossGenreRun: false, minYakuToDeclare: 2, ...(cfg.rules || {}) };
const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
const deps = { cardMap, bondSet, allCardIds, evalHand, rules };

// 양쪽 다 AI. situationFn(who, match, wall) → situation | null
function playRound(seed, firstTurn, situationFor) {
  const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(seed));
  let s = newRound(wall, firstTurn), g = 0;
  while (s.phase !== 'ended') {
    if (++g > 1500) return { type: 'STUCK' };
    if (s.phase === 'draw') s = drawStep(s, deps);
    else if (s.phase === 'decide') {
      const sit = situationFor ? situationFor(s.turn, s.wall.length) : null;
      const act = aiChooseAction(s.hands[s.turn], deps, sit);
      s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
    } else if (s.phase === 'awaitSteal') {
      const st = stealCheck(s, deps);
      s = st && aiWantsSteal() ? declareSteal(s, deps) : passSteal(s);
    }
  }
  return s.result;
}

function runMatches(label, useStrategy) {
  const scores = [], types = { tsumo: 0, steal: 0, exhaust: 0, STUCK: 0 };
  let matches = 0, comebacks = 0, roundsTotal = 0;
  for (let mi = 0; mi < 300; mi++) {
    let match = newMatch(cfg);
    let seed = mi * 1009 + 1, guard = 0;
    let everBehindWinner = false;
    let leaderHistory = [];
    while (!match.over) {
      if (++guard > 200) break;
      const situationFor = useStrategy ? (who, wallLeft) => ({
        myScore: match.scores[who], oppScore: match.scores[who === P ? A : P],
        targetScore: cfg.targetScore, wallLeft, strategy: cfg.aiStrategy || {},
      }) : null;
      const r = playRound(seed++, match.firstTurn, situationFor);
      types[r.type]++;
      roundsTotal++;
      if (r.score) scores.push(r.score);
      leaderHistory.push(match.scores.player - match.scores.ai);
      match = applyRoundResult(match, r, cfg);
    }
    matches++;
    // 역전: 중간에 뒤지던 쪽이 최종 승리했는지 (간이 판정)
    const finalDiff = match.scores.player - match.scores.ai;
    const wasBehind = leaderHistory.some((d) => (finalDiff > 0 ? d < 0 : d > 0));
    if (wasBehind) comebacks++;
  }
  scores.sort((a, b) => a - b);
  const n = scores.length;
  const avg = (scores.reduce((a, b) => a + b, 0) / n).toFixed(1);
  const med = scores[Math.floor(n / 2)];
  const low = (scores.filter((x) => x <= 4).length * 100 / n).toFixed(0);
  const big = (scores.filter((x) => x >= 6).length * 100 / n).toFixed(0);
  console.log('■ ' + label);
  console.log('  완성 점수: 평균 ' + avg + ' / 중앙값 ' + med + ' / 최저권(≤4) ' + low + '% / 큰 완성(≥6) ' + big + '%');
  console.log('  종료 분포: ' + JSON.stringify(types) + '  (국 ' + roundsTotal + '개)');
  console.log('  유국률 ' + (types.exhaust * 100 / roundsTotal).toFixed(1) + '%  |  역전 매치 ' + (comebacks * 100 / matches).toFixed(0) + '%\n');
}

runMatches('전략 OFF (현행 — 늘 즉시 선언)', false);
runMatches('전략 ON (뒤지면 큰 손 노리기)', true);
