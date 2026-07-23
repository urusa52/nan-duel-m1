// tutorial.js — 첫 실행 안내 슬라이드 + 연출된 첫 판(상황 툴팁).
// 독립 모듈: 대국 로직·상태를 변경하지 않는다. 상태를 "읽고" 오버레이/툴팁만 얹는다.
// 진행 여부는 자체 플래그로 관리하며, 저장은 in-memory (Artifacts 제약과 무관하게
// 정적 배포에서도 동작하도록 sessionStorage 없이 첫 로드 1회만 자동 표시).

const SLIDES = [
  {
    title: '미완의 서고에 오신 걸 환영합니다',
    body: '결말을 받지 못한 영웅들이 잠든 서고. 당신은 이야기꾼이 되어, 라이벌보다 먼저 한 편의 이야기를 완성해야 합니다.',
  },
  {
    title: '카드 읽는 법',
    body: '카드에는 <b>장르</b>(색)와 <b>서사 단계</b>(글자)가 있습니다. 기(기) → 승(승) → 전(전) → 결(결)의 네 단계로 이야기가 흐릅니다. 색은 무협·SF·판타지·로맨스·호러 다섯 장르입니다.',
    demo: true,
  },
  {
    title: '완성이란',
    body: '손패 8장이 <b>세트 3장 × 2 + 짝 2장</b>을 이루면 완성입니다. 아래 예시처럼 세 묶음으로 나뉘면 이야기가 완성돼요.',
    example: true,
  },
  {
    title: '수싸움',
    body: '산의 구성은 공개되어 있습니다(각 20종 × 3장). 상대의 <b>버림패</b>를 보고 무엇을 모으는지 읽고, "수읽기" 버튼으로 남은 장수를 세어 내 차례를 계산하세요.',
  },
  {
    title: '운명 뺏기',
    body: '상대가 버린 카드로 내 이야기가 완성될 때, 그 카드를 <b>가로챌</b> 수 있습니다. 상대의 실수가 곧 나의 결말이 됩니다.',
  },
];

// 상황 툴팁: 상태를 보고 "지금 처음 일어난 일"을 한 번만 짚어준다.
const COACH = [
  {
    id: 'firstTurn',
    when: (s) => s.round && s.round.turn === 'player' && s.round.phase === 'decide'
      && s.round.hands.player.length === 8,
    anchor: '#my-hand',
    text: '카드를 한 장 뽑았습니다. 손패에서 버릴 카드를 한 장 골라 탭하세요.',
  },
  {
    id: 'assistTenpai',
    when: (s) => s.ui && s.round && s.round.phase !== 'ended'
      && document.querySelector('#assist .assist-tenpai'),
    anchor: '#assist',
    text: '한 장만 더 오면 완성되는 <b>텐파이</b> 상태입니다. 대기 카드와 남은 장수가 여기 표시됩니다.',
  },
  {
    id: 'assistDeclare',
    when: (s) => document.querySelector('#assist .assist-declare'),
    anchor: '#actions',
    text: '완성됐습니다! 아래 <b>완성 선언</b> 버튼을 누르면 이 국을 가져옵니다.',
  },
  {
    id: 'steal',
    when: (s) => !document.getElementById('overlay').classList.contains('hidden')
      && document.getElementById('btn-steal'),
    anchor: '#btn-steal',
    text: '상대가 버린 카드로 완성할 수 있습니다 — <b>운명 뺏기</b>의 순간입니다.',
  },
  {
    id: 'counts',
    when: (s) => s.ui && s.ui.showCounts,
    anchor: '#count-panel',
    text: '내 손패와 양쪽 버림패로 확인된 카드를 뺀, 아직 <b>안 보인 장수</b>입니다. 0이면 그 카드는 더 나오지 않습니다.',
  },
];

let active = false;
let firstGameCoaching = false;
const shownCoach = new Set();
let refs = null;

export function initTutorial() {
  refs = { root: document.getElementById('tutorial') };
  wireStaticButtons();
}

// 첫 로드 시 자동 시작 (도움말의 "튜토리얼 다시 보기"로 재시작 가능)
export function maybeAutoStart() {
  startSlides();
}

function wireStaticButtons() {
  refs.root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.act === 'next') gotoSlide(curSlide + 1);
    if (t.dataset.act === 'prev') gotoSlide(curSlide - 1);
    if (t.dataset.act === 'skip' || t.dataset.act === 'start') endSlides();
    if (t.id === 'coach-got') dismissCoach();
    if (t.id === 'tutorial' && t === refs.root && refs.root.dataset.mode === 'coach') dismissCoach();
  });
}

let curSlide = 0;
function startSlides() {
  active = true;
  curSlide = 0;
  refs.root.dataset.mode = 'slides';
  renderSlide();
  refs.root.classList.remove('hidden');
}

function gotoSlide(i) {
  if (i < 0) return;
  if (i >= SLIDES.length) { endSlides(); return; }
  curSlide = i;
  renderSlide();
}

function renderSlide() {
  const s = SLIDES[curSlide];
  const demo = s.demo ? demoCardsHtml() : '';
  const example = s.example ? exampleHandHtml() : '';
  const last = curSlide === SLIDES.length - 1;
  refs.root.innerHTML =
    '<div class="tut-slide">' +
    '<div class="tut-dots">' +
    SLIDES.map((_, i) => '<span class="' + (i === curSlide ? 'on' : '') + '"></span>').join('') +
    '</div>' +
    '<p class="tut-title">' + s.title + '</p>' +
    demo +
    '<p class="tut-body">' + s.body + '</p>' +
    example +
    '<div class="tut-btns">' +
    (curSlide > 0 ? '<button type="button" class="btn" data-act="prev">이전</button>' : '') +
    '<button type="button" class="btn" data-act="skip">건너뛰기</button>' +
    '<button type="button" class="btn declare" data-act="' + (last ? 'start' : 'next') + '">' +
    (last ? '대국 시작' : '다음') + '</button>' +
    '</div></div>';
}

// 완성 손패 정적 예시: 세트[무협 기·시·각] + 세트[SF 같은장르] + 짝[인연]
// 학습용 표시 전용 타일 — 실제 카드 로직과 무관.
function exampleHandHtml() {
  const groups = [
    {
      label: '세트 ① — 서사 (같은 장르 연속)',
      cards: [
        { g: 'mu', s: '기', n: '무협' },
        { g: 'mu', s: '승', n: '무협' },
        { g: 'mu', s: '전', n: '무협' },
      ],
    },
    {
      label: '세트 ② — 장르 (같은 장르 3장)',
      cards: [
        { g: 'sf', s: '기', n: 'SF' },
        { g: 'sf', s: '전', n: 'SF' },
        { g: 'sf', s: '결', n: 'SF' },
      ],
    },
    {
      label: '짝 — 인연',
      cards: [
        { g: 'ro', s: '전', n: '로맨스' },
        { g: 'mu', s: '전', n: '무협' },
      ],
    },
  ];
  const tile = (c) =>
    '<span class="card small g-' + c.g + '"><span class="c-stage">' + c.s +
    '</span><span class="c-genre">' + c.n + '</span></span>';
  return '<div class="tut-example">' + groups.map((grp) =>
    '<div class="tut-ex-group">' +
    '<div class="tut-ex-cards">' + grp.cards.map(tile).join('') + '</div>' +
    '<span class="tut-ex-label">' + grp.label + '</span>' +
    '</div>').join('<span class="tut-ex-plus">+</span>') + '</div>';
}

function demoCardsHtml() {
  // 순수 표시용 데모 타일 (로직 카드와 무관, 학습용)
  const tiles = [
    { g: 'mu', s: '기', n: '무협·기' },
    { g: 'sf', s: '전', n: 'SF·전' },
    { g: 'ro', s: '결', n: '로맨스·결' },
  ];
  return '<div class="tut-demo">' + tiles.map((t) =>
    '<span class="card g-' + t.g + '"><span class="c-stage">' + t.s + '</span>' +
    '<span class="c-genre">' + t.n.split('·')[0] + '</span></span>').join('') + '</div>';
}

function endSlides() {
  refs.root.classList.add('hidden');
  refs.root.innerHTML = '';
  active = false;
  firstGameCoaching = true; // 이제부터 첫 판 코칭 시작
}

// 매 상태 변경마다 호출 — 조건에 맞는 첫 툴팁을 한 번씩 띄운다
export function onState(s) {
  if (active || !firstGameCoaching) return;
  if (!document.getElementById('overlay').classList.contains('hidden')
      && refs.root.dataset.mode !== 'coach') {
    // 라운드 종료/매치 종료 오버레이가 떠 있으면 코칭 양보 (steal 제외는 아래 when으로)
  }
  for (const c of COACH) {
    if (shownCoach.has(c.id)) continue;
    let ok = false;
    try { ok = c.when(s); } catch (_) { ok = false; }
    if (ok) { showCoach(c); break; }
  }
  // 첫 국이 끝나면 코칭 종료
  if (s.round && s.round.phase === 'ended' && shownCoach.size >= 2) {
    firstGameCoaching = false;
  }
}

function showCoach(c) {
  shownCoach.add(c.id);
  const anchor = document.querySelector(c.anchor);
  refs.root.dataset.mode = 'coach';
  refs.root.classList.remove('hidden');
  // 코치마크는 화면 중앙에 띄운다 (손패가 하단에 붙어 가려지지 않게). 대상은 하이라이트만.
  refs.root.innerHTML =
    '<div class="coach-mark centered">' +
    '<p>' + c.text + '</p>' +
    '<button type="button" id="coach-got" class="btn declare">알겠어요</button>' +
    '</div>';
  if (anchor) highlightAnchor(anchor);
}

let highlighted = null;
function highlightAnchor(el) {
  clearHighlight();
  el.classList.add('tut-highlight');
  highlighted = el;
}
function clearHighlight() {
  if (highlighted) highlighted.classList.remove('tut-highlight');
  highlighted = null;
}

function dismissCoach() {
  clearHighlight();
  refs.root.classList.add('hidden');
  refs.root.innerHTML = '';
  refs.root.dataset.mode = '';
}

// 도움말에서 "튜토리얼 다시 보기"
export function restart() {
  shownCoach.clear();
  firstGameCoaching = false;
  startSlides();
}
