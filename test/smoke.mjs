// smoke.mjs — 배선 통합 점검. 실행: node test/smoke.mjs
// 브라우저 없이 확인 가능한 것: 모듈 임포트, DOM id 배선, intent 커버리지, 경로.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// 2인 대국 페이지의 파일명. 루트 index.html 은 시작 화면(모드 선택)으로 넘어갔고,
// 대국 화면은 duel.html 로 이름만 바뀌었다(같은 폴더 유지 — 상대경로 보존).
// 또 옮길 일이 생기면 이 한 줄만 고치면 된다.
const DUEL_PAGE = 'duel.html';

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// 1) 로직·코어 모듈 임포트 (main은 boot 실행 때문에 제외)
console.log('[임포트]');
for (const m of [
  '../src/logic/wall.js', '../src/logic/handEval.js', '../src/logic/yakuEval.js',
  '../src/logic/duel.js', '../src/logic/match.js', '../src/logic/ai.js', '../src/logic/analysis.js',
  '../src/core/store.js', '../src/core/eventBus.js',
  '../src/render/table.js', '../src/render/handUI.js',
  '../src/render/cutin.js', '../src/render/hud.js', '../src/render/tutorial.js',
  '../src/render/abilityUI.js',
  '../src/input/controls.js',
]) {
  try {
    await import(m);
    t(m.replace('../src/', '') + ' 임포트', true);
  } catch (e) {
    t(m + ' 임포트', false, e.message);
  }
}

// 2) DOM id 배선: JS가 참조하는 모든 id가 대국 페이지에 존재하는가
console.log('[DOM id]');
const html = read(DUEL_PAGE);
const jsFiles = [
  'src/main.js', 'src/render/table.js', 'src/render/handUI.js',
  'src/render/cutin.js', 'src/render/hud.js', 'src/input/controls.js',
  'src/render/tutorial.js', 'src/render/abilityUI.js',
];
const dynamicIds = ['btn-declare', 'btn-discard', 'btn-steal', 'btn-pass-steal', 'btn-next', 'btn-rematch'];
const idRefs = new Set();
for (const f of jsFiles) {
  const src = read(f);
  for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) {
    if (!dynamicIds.includes(m[1])) idRefs.add(m[1]); // 동적 생성 버튼은 별도 검사
  }
}
let allIds = true;
for (const id of idRefs) {
  if (!html.includes('id="' + id + '"')) {
    allIds = false;
    t('id #' + id + ' 존재', false);
  }
}
t('JS가 참조하는 DOM id ' + idRefs.size + '개 모두 존재', allIds);

// 동적 생성 버튼 id (cutin/handUI가 만들고 controls가 위임 처리)
const cutinSrc = read('src/render/cutin.js') + read('src/render/handUI.js');
const controlsSrc = read('src/input/controls.js');
let dynOk = true;
for (const id of dynamicIds) {
  if (!cutinSrc.includes(id) || !controlsSrc.includes(id)) { dynOk = false; t('동적 버튼 ' + id, false); }
}
t('동적 버튼 6종 생성·처리 양쪽 존재', dynOk);

// 3) intent 커버리지: controls가 emit하는 모든 intent를 main이 구독하는가
console.log('[intent]');
const mainSrc = read('src/main.js');
const emitted = [...controlsSrc.matchAll(/emit\('([^']+)'/g)].map((m) => m[1]);
let intOk = true;
for (const ev of emitted) {
  if (!mainSrc.includes("on('" + ev + "'")) { intOk = false; t('intent ' + ev + ' 핸들러', false); }
}
t('emit되는 intent ' + emitted.length + '종 모두 main이 구독', intOk);

// 4) 자산 경로
console.log('[경로]');
t('css/style.css 존재', existsSync(join(root, 'css/style.css')));
t(DUEL_PAGE + '이 main.js 로드', html.includes('src/main.js'));
for (const d of ['config', 'cards', 'bonds', 'yaku']) {
  t('data/' + d + '.json 존재+로드', existsSync(join(root, 'src/data/' + d + '.json'))
    && mainSrc.includes(d + '.json'));
}

// 5) 시작 화면 배선: 모드 카드가 가리키는 파일이 실제로 있는가.
//    링크 하나만 깨져도 플레이어는 첫 화면에서 막힌다 — 배포 전 가장 싸게 잡히는 사고.
console.log('[시작 화면]');
const home = read('index.html');
const hrefs = [...home.matchAll(/href\s*:\s*'([^']+)'/g)].map((m) => m[1]);
t('모드 카드 3개 정의', hrefs.length === 3, '찾은 수: ' + hrefs.length);
for (const h of hrefs) {
  t('링크 대상 존재: ' + h, existsSync(join(root, h.replace(/^\.\//, ''))));
}
// 되돌아오는 길 — 세 게임 화면에 '처음으로' 링크가 살아 있는가
for (const [page, back] of [
  [DUEL_PAGE, './index.html'],
  ['3p/index.html', '../index.html'],
  ['3p/m2.html', '../index.html'],
]) {
  t(page + ' → 처음으로 링크', read(page).includes(`class="home-link" href="${back}"`));
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
