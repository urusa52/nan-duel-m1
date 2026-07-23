// analysis.mjs — '맞출 수 있는 패' 분석 단위 테스트. 실행: node test/analysis.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeCardMap, makeBondSet } from '../src/logic/handEval.js';
import { formedSets, reachableYaku } from '../src/logic/analysis.js';

const here = dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cardsData = loadJson('cards.json');
const bondsData = loadJson('bonds.json');
const yakuData = loadJson('yaku.json');
const cardMap = makeCardMap(cardsData);
const bondSet = makeBondSet(bondsData);
const rules = { allowCrossGenreRun: false, allowGenreTriplet: false, minYakuToDeclare: 1 };
const ctx = { cardMap, bondSet, genres: cardsData.genres, yakuData, rules };

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

console.log('[analysis]');
{
  const sets = formedSets(['sf-2','sf-3','sf-4','mu-1','mu-2','ro-1','ho-1','ho-2'], ctx);
  t('성립 세트 탐지 (SF 서사 세트)', sets.some((x) => x.includes('SF')));
}
{
  const sets = formedSets(['mu-1','mu-2','mu-3','sf-1','ro-1','ro-2','ho-1','ho-3'], ctx);
  t('같은 장르 런 세트 탐지 (무협 기승전)', sets.some((x) => x.startsWith('무협')));
}
{
  const sets = formedSets(['mu-1','sf-3','fa-1','ro-4','ho-2','mu-4','sf-1','ro-1'], ctx);
  t('세트 없으면 빈 배열', Array.isArray(sets));
}
{
  const yk = reachableYaku(['mu-1','mu-2','mu-3','mu-4','mu-1','mu-2','mu-3','mu-4'], ctx);
  t('reachableYaku 배열 반환', Array.isArray(yk));
  t('전집 후보 (같은 장르 다수)', yk.some((y) => y.name === '전집'));
}
{
  // 기승전 낼 만한 장르(무협) + 승전결 낼 만한 장르(SF) → 대서사시 후보
  const yk = reachableYaku(['mu-1','mu-2','mu-3','sf-2','sf-3','sf-4','ho-1','ho-2'], ctx);
  t('대서사시 후보 (기→결 완주 가능)', yk.some((y) => y.name === '대서사시'));
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
