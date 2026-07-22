// abilities.mjs — 특수 능력 단위 테스트. 실행: node test/abilities.mjs
// 순수 로직(abilities.js)과 duel의 능력 상태 전이(useForesight/useAdapt/useForeshadow) 검증.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeCardMap } from '../src/logic/handEval.js';
import {
  initAbilityState, canUse, spend,
  applyForesight, applyAdapt, applyForeshadow,
} from '../src/logic/abilities.js';
import { P, A, newRound, useForesight, useAdapt, useForeshadow } from '../src/logic/duel.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = loadJson('cards.json');
const cfg = loadJson('config.json');
const cardMap = makeCardMap(cardsData);
const deps = { cardMap };

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------- 순수 로직 ----------
console.log('[abilities 순수함수]');

const a0 = initAbilityState(cfg);
t('initAbilityState: config에서 3종 1회', a0.foresight === 1 && a0.adapt === 1 && a0.foreshadow === 1);
t('canUse: 잔여 있으면 true', canUse(a0, 'adapt') === true);
t('spend: 1회 차감', spend(a0, 'adapt').adapt === 0);
t('spend: 원본 불변', a0.adapt === 1);
t('canUse: 0이면 false', canUse(spend(a0, 'adapt'), 'adapt') === false);

// 예언서: 뽑는 순서 = 배열 끝에서부터
const wall = ['a', 'b', 'c', 'd', 'e'];
const peek = applyForesight(wall, 3);
t('applyForesight: 다음 3장 순서', peek.join(',') === 'e,d,c');
t('applyForesight: 산 불변', wall.length === 5 && wall[4] === 'e');
t('applyForesight: n>산 안전', applyForesight(['x'], 3).length === 1);

// 각색: 장르만 변경, 단계 유지, 실존 id
const adHand = ['ro-3', 'mu-1', 'sf-2'];
const adOut = applyAdapt(adHand, 0, 'mu', cardMap);
t('applyAdapt: 장르 교체 + 단계 유지', adOut[0] === 'mu-3');
t('applyAdapt: 길이 불변', adOut.length === 3);
t('applyAdapt: 원본 불변', adHand[0] === 'ro-3');

// 복선: 버림패 → 손
const fsHand = ['mu-1', 'mu-2'];
const fsDisc = ['ro-4', 'sf-1'];
const fsOut = applyForeshadow(fsHand, fsDisc, 1);
t('applyForeshadow: 손패 +1(회수 카드)', fsOut.hand.length === 3 && fsOut.hand.includes('sf-1'));
t('applyForeshadow: 버림패 -1', fsOut.discards.length === 1 && !fsOut.discards.includes('sf-1'));
t('applyForeshadow: 원본 불변', fsDisc.length === 2 && fsHand.length === 2);

// ---------- duel 상태 전이 ----------
console.log('[duel 능력 전이]');
const abilityInit = { [P]: initAbilityState(cfg), [A]: initAbilityState(cfg) };

// 예언서: decide 페이즈, 산 불변, 사용 차감
{
  const shuffled = ['z1','z2','z3','z4','z5','z6','z7','z8','w1','w2','w3','w4','w5','w6','n1','n2','n3'];
  const r0 = newRound(shuffled, P, abilityInit);
  const decide = { ...r0, phase: 'decide', turn: P };
  const wallLen0 = decide.wall.length;
  const { round, peek } = useForesight(decide, deps, 3);
  t('useForesight: peek 3장', peek.length === 3);
  t('useForesight: 산 잔량 불변', round.wall.length === wallLen0);
  t('useForesight: 사용 차감', round.abilities[P].foresight === 0);
  t('useForesight: 소진 후 canUse false', canUse(round.abilities[P], 'foresight') === false);
}

// 각색: decide 페이즈에서 손패 장르 변경
{
  const r0 = newRound(['a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','ro-3'], P, abilityInit);
  // draw로 손패 8장 만들기: 마지막 카드(ro-3)를 뽑게 되어 있음
  // newRound는 배패로 앞쪽 14장을 나눠가짐 → 남은 산 끝이 다음 뽑기
  const drawn = { ...r0, phase: 'decide', turn: P, hands: { ...r0.hands, [P]: ['ro-3','mu-1','mu-2','sf-1','sf-2','fa-1','fa-2','ho-1'] } };
  const out = useAdapt(drawn, deps, 0, 'mu');
  t('useAdapt: 손패[0] 장르 변경', out.hands[P][0] === 'mu-3');
  t('useAdapt: 사용 차감', out.abilities[P].adapt === 0);
}

// 복선: decide에서 뽑은 카드 무르고 버림패 회수 → 손패 8, 산+1(되돌림), 버림패-1
{
  const shuffled = ['s1','s2','s3','s4','s5','s6','s7','s8','w1','w2','w3','w4','w5','w6','x1','x2','x3'];
  const r0 = newRound(shuffled, P, abilityInit);
  const drew = {
    ...r0, phase: 'decide', turn: P,
    hands: { ...r0.hands, [P]: ['mu-1','mu-2','mu-3','sf-1','sf-2','fa-1','fa-2','ho-4'] }, // 끝(ho-4)=뽑은 것
    discards: { ...r0.discards, [P]: ['ro-1'] },
    lastDrawn: 'ho-4',
  };
  const wallLen0 = drew.wall.length;
  const out = useForeshadow(drew, deps, 0);
  t('useForeshadow: 손패 8 유지', out.hands[P].length === 8);
  t('useForeshadow: 회수 카드 손에', out.hands[P].includes('ro-1'));
  t('useForeshadow: 뽑은 카드 무름(손에서 빠짐)', !out.hands[P].includes('ho-4'));
  t('useForeshadow: 버림패 비워짐', out.discards[P].length === 0);
  t('useForeshadow: 산 +1(무른 카드 되돌림)', out.wall.length === wallLen0 + 1);
  t('useForeshadow: 되돌린 카드 산 맨 앞', out.wall[0] === 'ho-4');
  t('useForeshadow: 사용 차감', out.abilities[P].foreshadow === 0);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
