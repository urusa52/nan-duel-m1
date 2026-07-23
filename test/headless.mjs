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
const rules = cfg.rules; // 런 기반 실규칙으로 테스트
const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
const deps = { cardMap, bondSet, allCardIds, evalHand, rules };

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

// 완성형(런 기반): [무협 기승전] + [SF 승전결] + [호러 짝]
const handComplete = ['mu-1', 'mu-2', 'mu-3', 'sf-2', 'sf-3', 'sf-4', 'ho-1', 'ho-1'];
t('8장 완성형 분해 성공', isCompleteForm(handComplete, cardMap, bondSet, rules));
t('7장은 완성 불가', decompose(handComplete.slice(0, 7), cardMap, bondSet, rules).length === 0);
const handNo = ['mu-1', 'sf-1', 'fa-1', 'ro-1', 'ho-1', 'mu-4', 'sf-4', 'fa-4'];
t('무연결 8장은 미완성', !isCompleteForm(handNo, cardMap, bondSet, rules));
// 같은 장르 삼중첩은 세트 아님 (런만 인정)
t('삼중첩은 완성 아님', !isCompleteForm(['mu-1', 'mu-1', 'mu-4', 'sf-2', 'sf-3', 'sf-4', 'ho-1', 'ho-1'], cardMap, bondSet, rules));

// 텐파이/대기: 완성형에서 sf-4(결말) 제거 → sf-4 대기
const hand7 = ['mu-1', 'mu-2', 'mu-3', 'sf-2', 'sf-3', 'ho-1', 'ho-1'];
const waits = waitsFor(hand7, cardMap, bondSet, allCardIds, evalHand, rules);
t('텐파이 판정 + 대기 목록에 sf-4', waits.includes('sf-4'), 'waits=' + waits.join(','));
t('형식 텐파이 true', isFormalTenpai(hand7, cardMap, bondSet, allCardIds, rules));
t('무연결 7장은 노텐', !isFormalTenpai(handNo.slice(0, 7), cardMap, bondSet, allCardIds, rules));

// ---------- yakuEval (런 기반) ----------
console.log('[yakuEval]');
function yakuIds(hand) {
  const b = evalHand(hand);
  return b ? b.yaku.map((y) => y.id).sort() : null;
}
// 양대 완결: 승전결 두 개 (다른 장르)
{
  const h = ['mu-2', 'mu-3', 'mu-4', 'ho-2', 'ho-3', 'ho-4', 'fa-1', 'fa-1'];
  const ids = yakuIds(h);
  t('양대 완결 성립', ids && ids.includes('doubleFinale'), JSON.stringify(ids));
}
// 대서사시: 기승전 + 승전결로 기→결 완주 (다른 장르 합작)
{
  const h = ['mu-1', 'mu-2', 'mu-3', 'sf-2', 'sf-3', 'sf-4', 'fa-1', 'fa-1'];
  const ids = yakuIds(h);
  t('대서사시 성립', ids && ids.includes('sagaMix'), JSON.stringify(ids));
}
// 인연 짝 (+대서사시)
{
  const h = ['mu-1', 'mu-2', 'mu-3', 'sf-2', 'sf-3', 'sf-4', 'mu-3', 'ro-3'];
  const ids = yakuIds(h);
  t('인연 성립', ids && ids.includes('bond'), JSON.stringify(ids));
}
// 일대기: 같은 장르로 기→결 완주 (한 작가의 연작)
{
  const h = ['fa-1', 'fa-2', 'fa-3', 'fa-2', 'fa-3', 'fa-4', 'mu-1', 'mu-1'];
  const ids = yakuIds(h);
  t('일대기 성립', ids && ids.includes('sagaSame'), JSON.stringify(ids));
}
// 전집: 8장 전부 같은 장르 (승전결 두 편 + 짝)
{
  const h = ['ho-2', 'ho-3', 'ho-4', 'ho-2', 'ho-3', 'ho-4', 'ho-1', 'ho-1'];
  const ids = yakuIds(h);
  t('전집 성립', ids && ids.includes('complete'), JSON.stringify(ids));
}
// 불후의 명작: 한 장르로 기→결 완주 → 단독 13점
{
  const h = ['ho-1', 'ho-2', 'ho-3', 'ho-2', 'ho-3', 'ho-4', 'ho-1', 'ho-1'];
  const b = evalHand(h);
  t('불후의 명작 성립', b && b.yaku.some((y) => y.id === 'masterpiece'), JSON.stringify(yakuIds(h)));
  t('역만은 단독 13점 (합산 아님)', b && b.score === 13, 'score=' + (b && b.score));
}
// 선언 게이트: 기승전 + 기승전(결말 없음) → 선언 불가
{
  const h = ['mu-1', 'mu-2', 'mu-3', 'sf-1', 'sf-2', 'sf-3', 'fa-1', 'fa-1'];
  const b = evalHand(h);
  t('결말 없으면 선언 불가', b && b.declarable === false, 'score=' + (b && b.score));
}
// 일대기는 6점 이상 (격 차등: 합작 3 → 같은 작품 6)
{
  const h = ['fa-1', 'fa-2', 'fa-3', 'fa-2', 'fa-3', 'fa-4', 'ho-1', 'ho-1'];
  const b = evalHand(h);
  t('일대기 ≥6점', b.declarable && b.score >= 6, 'score=' + b.score);
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
  // AI가 sf-4(결말)를 버리면 P가 뺏어 대서사시로 완성하도록 손패 조작 (테스트 전용)
  s = { ...s, hands: { [P]: ['mu-1', 'mu-2', 'mu-3', 'sf-2', 'sf-3', 'ho-1', 'ho-1'], [A]: s.hands[A] } };
  s = drawStep(s, deps); // AI 뽑기
  // AI 손패에 sf-4 주입 후 버리게 함
  s = { ...s, hands: { ...s.hands, [A]: s.hands[A].slice(0, 7).concat(['sf-4']) } };
  s = discardStep(s, 'sf-4');
  const st = stealCheck(s, deps);
  t('운명 뺏기 감지', !!st && st.taker === P, JSON.stringify(st && st.best && st.best.yaku));
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
