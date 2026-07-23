// demo_run.mjs — 새 런 기반 채점을 실제 evalHand로 예시 손패에 적용해 출력.
// 설계_런기반_완성구조_가산역 표가 코드에서 그대로 나오는지 육안 확인용.
// 실행: node test/demo_run.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeCardMap, makeBondSet } from '../src/logic/handEval.js';
import { makeYakuEvaluator } from '../src/logic/yakuEval.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(here, '../src/data', p), 'utf8'));
const cfg = load('config.json');
const cardMap = makeCardMap(load('cards.json'));
const bondSet = makeBondSet(load('bonds.json'));
const yakuData = load('yaku.json');
const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, cfg.rules);

const NM = { 1: '기', 2: '승', 3: '전', 4: '결' };
const show = (h) => h.map((id) => { const c = cardMap[id]; return c.genre + NM[c.stage]; }).join(' ');

const cases = [
  ['대서사시·합작 (기→결, 다른 장르)', ['mu-1', 'mu-2', 'mu-3', 'sf-2', 'sf-3', 'sf-4', 'fa-1', 'fa-1']],
  ['양대 완결 (승전결 + 승전결)',       ['mu-2', 'mu-3', 'mu-4', 'ho-2', 'ho-3', 'ho-4', 'fa-1', 'fa-1']],
  ['일대기 (같은 장르 기→결)',          ['fa-1', 'fa-2', 'fa-3', 'fa-2', 'fa-3', 'fa-4', 'mu-1', 'mu-1']],
  ['일대기 + 인연 짝',                  ['fa-1', 'fa-2', 'fa-3', 'fa-2', 'fa-3', 'fa-4', 'mu-3', 'ro-3']],
  ['불후의 명작 (한 장르 완주, 역만)',   ['ho-1', 'ho-2', 'ho-3', 'ho-2', 'ho-3', 'ho-4', 'ho-1', 'ho-1']],
  ['선언 불가 (기승전 + 기승전, 결말 X)', ['mu-1', 'mu-2', 'mu-3', 'sf-1', 'sf-2', 'sf-3', 'fa-1', 'fa-1']],
];

console.log('=== 새 런 기반 채점 — 예시 손패 적용 결과 ===\n');
for (const [label, hand] of cases) {
  const r = evalHand(hand);
  const yaku = r && r.yaku.length ? r.yaku.map((y) => `${y.name}(${y.score})`).join(' + ') : '—';
  const line = r
    ? `${r.declarable ? '선언 O' : '선언 X'} · ${r.score}점 · ${yaku}`
    : '완성형 아님';
  console.log(`■ ${label}`);
  console.log(`   패: ${show(hand)}`);
  console.log(`   → ${line}\n`);
}
