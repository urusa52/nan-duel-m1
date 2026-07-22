// headless.mjs — 로직 단위 테스트. 실행: node test/headless.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeRng, buildWall, shuffle, draw, unseenCounts } from '../src/logic/wall.js';
import {
  makeCardMap, makeBondSet, classifySet, isPair, decompose,
  isCompleteForm, waitsFor, isFormalTenpai,
} from '../src/logic/handEval.js';
import { makeYakuEvaluator } from '../src/logic/yakuEval.js';
import {
  P, A, other, newRound, drawStep, tsumoCheck, declareTsumo,
  discardStep, stealCheck, declareSteal, passSteal,
} from '../src/logic/duel.js';
import { newMatch, applyRoundResult } from '../src/logic/match.js';
import { aiChooseAction, aiWantsSteal } from '../src/logic/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = loadJson('cards.json');
const bondsData = loadJson('bonds.json');
const yakuData = loadJson('yaku.json');
const cfg = loadJson('config.json');

const cardMap = makeCardMap(cardsData);
const bondSet = makeBondSet(bondsData);
const allCardIds = cardsData.cards.map((c) => c.id);
const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet);
const deps = { cardMap, bondSet, allCardIds, evalHand };

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------- wall ----------
console.log('[wall]');
const wall0 = buildWall(allCardIds, cfg.copiesPerCard);
t('산 총 장수 = 20종 × ' + cfg.copiesPerCard, wall0.length === 20 * cfg.copiesPerCard);
const rng = makeRng(42);
const sh1 = shuffle(wall0, makeRng(42));
const sh2 = shuffle(wall0, makeRng(42));
t('같은 시드 → 같은 셔플 (결정성)', sh1.join() === sh2.join());
t('셔플은 원본 불변', wall0.join() === buildWall(allCardIds, cfg.copiesPerCard).join());
{
  const r = draw(sh1);
  t('비복원: 뽑으면 1장 감소', r.wall.length === sh1.length - 1 && r.card !== null);
}
{
  const u = unseenCounts(allCardIds, 3, ['mu-1', 'mu-1', 'sf-2']);
  t('안 보인 장수 집계', u['mu-1'] === 1 && u['sf-2'] === 2 && u['ho-4'] === 3);
}

// ---------- handEval: 세트/짝 ----------
console.log('[handEval]');
t('장르 세트 인정 (무협 3장)', classifySet(['mu-1', 'mu-2', 'mu-4'], cardMap)?.sameGenre === true);
t('서사 세트 인정 (장르 무관 1-2-3)', classifySet(['mu-1', 'sf-2', 'fa-3'], cardMap)?.isRun === true);
t('정통 세트 = 같은 장르 + 연속', classifySet(['mu-2', 'mu-3', 'mu-4'], cardMap)?.pureRun === true);
t('불인정: 장르도 순서도 아님', classifySet(['mu-1', 'sf-1', 'fa-4'], cardMap) === null);
t('불인정: 1-2-4는 연속 아님', classifySet(['mu-1', 'sf-2', 'fa-4'], cardMap) === null);
t('짝: 같은 카드', isPair('mu-1', 'mu-1', bondSet).ok === true);
t('짝: 인연 (검과 붓)', isPair('mu-3', 'ro-3', bondSet).ok && isPair('mu-3', 'ro-3', bondSet).bond);
t('짝 불인정: 무관한 두 장', isPair('mu-1', 'sf-4', bondSet).ok === false);

// 완성형: [무협123 정통] + [SF장르셋] + [호러짝]
const handComplete = ['mu-1', 'mu-2', 'mu-3', 'sf-1', 'sf-2', 'sf-4', 'ho-1', 'ho-1'];
t('8장 완성형 분해 성공', isCompleteForm(handComplete, cardMap, bondSet));
t('7장은 완성 불가', decompose(handComplete.slice(0, 7), cardMap, bondSet).length === 0);
const handNo = ['mu-1', 'sf-1', 'fa-1', 'ro-1', 'ho-1', 'mu-4', 'sf-4', 'fa-4'];
t('무연결 8장은 미완성', !isCompleteForm(handNo, cardMap, bondSet));

// 텐파이/대기: 위 완성형에서 mu-3 제거 → mu-3 대기 (or 다른 완성 카드)
const hand7 = ['mu-1', 'mu-2', 'sf-1', 'sf-2', 'sf-4', 'ho-1', 'ho-1'];
const waits = waitsFor(hand7, cardMap, bondSet, allCardIds, evalHand);
t('텐파이 판정 + 대기 목록에 mu-3', waits.includes('mu-3'), 'waits=' + waits.join(','));
t('형식 텐파이 true', isFormalTenpai(hand7, cardMap, bondSet, allCardIds));
t('무연결 7장은 노텐', !isFormalTenpai(handNo.slice(0, 7), cardMap, bondSet, allCardIds));

// ---------- yakuEval ----------
console.log('[yakuEval]');
function yakuIds(hand) {
  const b = evalHand(hand);
  return b ? b.yaku.map((y) => y.id).sort() : null;
}
// 크로스오버: 혼합 서사 세트 포함
{
  const h = ['mu-1', 'sf-2', 'fa-3', 'ro-1', 'ro-2', 'ro-3', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('크로스오버 성립', ids && ids.includes('crossover'), JSON.stringify(ids));
}
// 단편집: 서로 다른 장르 세트 2 (순서 없는 조합으로)
{
  const h = ['mu-1', 'mu-2', 'mu-4', 'sf-1', 'sf-2', 'sf-4', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('단편집 성립', ids && ids.includes('anthology2'), JSON.stringify(ids));
}
// 인연 짝
{
  const h = ['mu-1', 'mu-2', 'mu-4', 'sf-1', 'sf-2', 'sf-4', 'mu-3', 'ro-3'];
  const ids = yakuIds(h);
  t('인연 성립', ids && ids.includes('bond'), JSON.stringify(ids));
}
// 정통 연재 + 완결 (mu 2-3-4)
{
  const h = ['mu-2', 'mu-3', 'mu-4', 'sf-1', 'sf-2', 'sf-4', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('정통 연재 성립', ids && ids.includes('pureSerial'), JSON.stringify(ids));
  t('완결 성립 (2-3-4)', ids && ids.includes('finale'));
}
// 전속 작가: 두 세트 같은 장르 (mu123 + mu 1,2,4 아님… mu 장르셋 두 개 필요 → mu 6장)
{
  const h = ['mu-1', 'mu-1', 'mu-2', 'mu-3', 'mu-4', 'mu-4', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('전속 작가 성립', ids && ids.includes('exclusive'), JSON.stringify(ids));
}
// 전집: 8장 전부 같은 장르
{
  const h = ['mu-1', 'mu-1', 'mu-2', 'mu-3', 'mu-4', 'mu-4', 'mu-2', 'mu-2'];
  const ids = yakuIds(h);
  t('전집 성립', ids && ids.includes('complete'), JSON.stringify(ids));
}
// 오대 장르
{
  const h = ['mu-1', 'sf-2', 'fa-3', 'ro-2', 'ro-3', 'ro-4', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('오대 장르 성립', ids && ids.includes('fiveGenre'), JSON.stringify(ids));
}
// 기승전결: 123 + 234
{
  const h = ['mu-1', 'sf-2', 'fa-3', 'ro-2', 'fa-3', 'ho-4', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('기승전결 성립', ids && ids.includes('fourAct'), JSON.stringify(ids));
}
// 불후의 명작: 한 장르로 123+234+짝 → 단독 13점
{
  const h = ['mu-1', 'mu-2', 'mu-3', 'mu-2', 'mu-3', 'mu-4', 'mu-1', 'mu-1'];
  const b = evalHand(h);
  t('불후의 명작 성립', b && b.yaku.some((y) => y.id === 'masterpiece'), JSON.stringify(yakuIds(h)));
  t('역만은 단독 13점 (합산 아님)', b && b.score === 13, 'score=' + (b && b.score));
}
// 최고 해석 선택: 같은 손을 더 높은 점수로 읽는가
{
  // mu 2-3-4 정통(2)+완결(2) vs mu 장르셋 해석 — 최고점을 골라야 함
  const h = ['mu-2', 'mu-3', 'mu-4', 'sf-1', 'sf-2', 'sf-4', 'ho-1', 'ho-1'];
  const b = evalHand(h);
  t('최고 점수 해석 선택 (≥4점)', b.score >= 4, 'score=' + b.score);
}

// ---------- duel ----------
console.log('[duel]');
{
  const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(7));
  let s = newRound(wall, P);
  t('배패: 양측 7장', s.hands[P].length === 7 && s.hands[A].length === 7);
  t('배패 후 산 = 60-14', s.wall.length === 60 - 14);
  s = drawStep(s, deps);
  t('뽑기: 손패 8장, decide 페이즈', s.hands[P].length === 8 && s.phase === 'decide');
  const before = s.wall.length;
  const discardCard = s.hands[P][0];
  s = discardStep(s, discardCard);
  t('버리기: 손패 7장, 버림패 공개', s.hands[P].length === 7 && s.discards[P][0] === discardCard);
  t('버린 뒤 awaitSteal 페이즈', s.phase === 'awaitSteal');
  s = passSteal(s);
  t('뺏기 포기 → 턴 교대', s.turn === A && s.phase === 'draw');
  t('산은 뽑을 때만 줆', s.wall.length === before);
}
// 운명 뺏기 시나리오를 수동 구성
{
  const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(11));
  let s = newRound(wall, A);
  // AI가 mu-3을 버리면 P가 뺏어 완성하도록 손패 조작 (테스트 전용)
  s = { ...s, hands: { [P]: ['mu-1', 'mu-2', 'sf-1', 'sf-2', 'sf-4', 'ho-1', 'ho-1'], [A]: s.hands[A] } };
  s = drawStep(s, deps); // AI 뽑기
  // AI 손패에 mu-3 주입 후 버리게 함
  s = { ...s, hands: { ...s.hands, [A]: s.hands[A].slice(0, 7).concat(['mu-3']) } };
  s = discardStep(s, 'mu-3');
  const st = stealCheck(s, deps);
  t('운명 뺏기 감지', !!st && st.taker === P, JSON.stringify(st && st.best.yaku));
  const ended = declareSteal(s, deps);
  t('운명 뺏기 결과: P 승, 점수>0', ended.result.type === 'steal' && ended.result.winner === P && ended.result.score > 0);
}

// ---------- match ----------
console.log('[match]');
{
  let m = newMatch({ ...cfg, matchMode: 'race', targetScore: 5 });
  m = applyRoundResult(m, { type: 'tsumo', winner: P, score: 3 }, { ...cfg, targetScore: 5 });
  t('점수 반영 + 다음 국', m.scores[P] === 3 && m.round === 2 && !m.over);
  t('선 교대', m.firstTurn === A);
  m = applyRoundResult(m, { type: 'tsumo', winner: P, score: 2 }, { ...cfg, targetScore: 5 });
  t('선취 도달 → 매치 종료, P 승', m.over && m.winner === P);
}
{
  let m = newMatch({ ...cfg, matchMode: 'fixed', fixedRounds: 2 });
  const c = { ...cfg, matchMode: 'fixed', fixedRounds: 2 };
  m = applyRoundResult(m, { type: 'tsumo', winner: A, score: 2 }, c);
  m = applyRoundResult(m, { type: 'tsumo', winner: P, score: 5 }, c);
  t('고정국 모드: 2국 후 총점 승부', m.over && m.winner === P);
}
{
  let m = newMatch({ ...cfg, matchMode: 'race', targetScore: 5 });
  m = applyRoundResult(m, { type: 'exhaust', tenpai: { [P]: true, [A]: false } }, { ...cfg, targetScore: 5 });
  t('유국: 텐파이 쪽 소점', m.scores[P] === cfg.tenpaiScore && m.scores[A] === 0);
}

// ---------- AI 자가대국 (통합) ----------
console.log('[AI 자가대국]');
function playOneRound(seed, firstTurn) {
  const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(seed));
  let s = newRound(wall, firstTurn);
  let guard = 0;
  while (s.phase !== 'ended') {
    if (++guard > 500) throw new Error('round did not end');
    if (s.phase === 'draw') {
      s = drawStep(s, deps);
    } else if (s.phase === 'decide') {
      const act = aiChooseAction(s.hands[s.turn], deps);
      s = act.action === 'declare' ? declareTsumo(s, deps) : discardStep(s, act.card);
    } else if (s.phase === 'awaitSteal') {
      const st = stealCheck(s, deps);
      s = st && aiWantsSteal() ? declareSteal(s, deps) : passSteal(s);
    }
  }
  return s.result;
}
{
  let ok = true;
  const types = { tsumo: 0, steal: 0, exhaust: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const r = playOneRound(seed, seed % 2 ? P : A);
    if (!r || !['tsumo', 'steal', 'exhaust'].includes(r.type)) { ok = false; break; }
    types[r.type]++;
    if ((r.type === 'tsumo' || r.type === 'steal') && !(r.score > 0)) { ok = false; break; }
  }
  t('300국 완주 (무한루프·크래시 없음)', ok);
  t('완성 승리가 실제로 발생', types.tsumo + types.steal > 0,
    JSON.stringify(types));
  console.log('    → 분포: ' + JSON.stringify(types));
}
{
  // 매치 통합: race 모드로 끝까지
  let m = newMatch(cfg);
  let guard = 0;
  let seed = 1000;
  while (!m.over) {
    if (++guard > 200) throw new Error('match did not end');
    const r = playOneRound(seed++, m.firstTurn);
    m = applyRoundResult(m, r, cfg);
  }
  t('매치가 끝까지 돈다 (race ' + cfg.targetScore + '점)', m.over && (m.winner === P || m.winner === A),
    JSON.stringify(m.scores));
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
