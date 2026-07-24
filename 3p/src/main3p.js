// main3p.js — 3인 대국 컨트롤러(프로토타입). 순수 로직(duelN 등)을 화면·입력에 배선.
// 능력(예언서·각색·복선)은 이 프로토타입에선 비활성(자리만) — 1:1에서 이식 예정.

import { makeRng, buildWall, shuffle, unseenCounts } from './logic/wall.js';
import { makeCardMap, makeBondSet, isFormalTenpai } from './logic/handEval.js';
import { makeYakuEvaluator } from './logic/yakuEval.js';
import {
  newRoundN, drawStepN, tsumoCheckN, declareTsumoN,
  discardStepN, stealCandidatesN, declareStealN, passStealN,
} from './logic/duelN.js';
import { aiChooseAction } from './logic/ai.js';
import { formedSets, reachableYaku } from './logic/analysis.js';
import { cardEl, backEl, makeGenreName, STG } from './render/cards3p.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

let cfg, cardMap, bondSet, yakuData, allCardIds, deps, genreName, seats, PLAYER, seatMeta;
const state = { match: null, round: null, ui: { selected: -1, flash: {}, steal: null, seed: 1 } };
let timer = null;
const schedule = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
const rnd = () => Math.floor(200 + Math.random() * 500); // 사고 시간 (여긴 연출용이라 Math.random OK)
const postDiscardMs = () => (cfg.tempo && cfg.tempo.postDiscardMs) || 700;

async function boot() {
  const load = async (p) => (await fetch(p)).json();
  [cfg, cardMap, bondSet, yakuData] = [];
  cfg = await load('./src/data/config.json');
  const cardsData = await load('./src/data/cards.json');
  const bondsData = await load('./src/data/bonds.json');
  yakuData = await load('./src/data/yaku.json');
  cardMap = makeCardMap(cardsData);
  bondSet = makeBondSet(bondsData);
  allCardIds = cardsData.cards.map((c) => c.id);
  genreName = makeGenreName(cardsData);
  const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, cfg.rules);
  deps = { cardMap, bondSet, allCardIds, evalHand, rules: cfg.rules };
  seats = cfg.seats || ['player', 'rivalL', 'rivalR'];
  PLAYER = 'player';
  seatMeta = {
    player: { name: (cfg.seatNames && cfg.seatNames.player) || '나', tag: '', avatar: '★' },
    rivalL: { name: (cfg.seatNames && cfg.seatNames.rivalL) || '라이벌 L', tag: '속공형', avatar: '✎' },
    rivalR: { name: (cfg.seatNames && cfg.seatNames.rivalR) || '라이벌 R', tag: '고점형', avatar: '📖' },
  };
  $('#target-label').textContent = '먼저 ' + cfg.targetScore + '점';
  wireStaticButtons();
  startMatch();
}

function startMatch() {
  state.match = { scores: Object.fromEntries(seats.map((s) => [s, 0])), firstIdx: 0, over: false, winner: null, round: 1 };
  startRound();
}

function startRound() {
  const seed = (state.ui.seed = state.ui.seed + 1);
  const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), makeRng(seed * 131 + state.match.round));
  state.round = newRoundN(wall, seats, state.match.firstIdx, {});
  state.ui.selected = -1; state.ui.steal = null; state.ui.flash = {};
  hideOverlay();
  render();
  schedule(tick, 400);
}

// ---------- 상태 머신 구동 ----------
function tick() {
  const r = state.round;
  if (!r || r.phase === 'ended') { if (r && r.phase === 'ended') onRoundEnd(); return; }
  const seat = r.seats[r.turnIdx];
  const isPlayer = seat === PLAYER;

  if (r.phase === 'draw') {
    const nr = drawStepN(r, deps);
    state.round = nr;
    if (nr.phase === 'ended') { render(); schedule(onRoundEnd, 500); return; } // 유국
    if (isPlayer) { state.ui.selected = nr.hands[PLAYER].length - 1; render(); } // 뽑은 카드 자동 선택 → 입력 대기
    else { render(); schedule(() => aiDecide(seat), rnd()); }
    return;
  }
  if (r.phase === 'decide') {
    if (isPlayer) render(); // 입력 대기
    else schedule(() => aiDecide(seat), rnd());
    return;
  }
  if (r.phase === 'awaitSteal') { resolveSteal(); return; }
}

function aiDecide(seat) {
  const r = state.round;
  if (!r || r.phase !== 'decide' || r.seats[r.turnIdx] !== seat) return;
  const act = aiChooseAction(r.hands[seat], deps, situationFor(seat));
  if (act.action === 'declare') {
    flash(seat, '완성!'); render();
    state.round = declareTsumoN(r, deps);
    schedule(onRoundEnd, 650);
  } else {
    state.round = discardStepN(r, act.card);
    render();
    schedule(resolveSteal, postDiscardMs());
  }
}

function resolveSteal() {
  const r = state.round;
  if (!r || r.phase !== 'awaitSteal') return;
  const cands = stealCandidatesN(r, deps);
  if (!cands.length) { state.round = passStealN(r); tick(); return; }
  const top = cands[0];
  if (top.taker === PLAYER) { state.ui.steal = top; render(); return; } // 플레이어 선택 대기
  flash(top.taker, '운명 뺏기!'); render();
  state.round = declareStealN(r, deps, top.taker);
  schedule(onRoundEnd, 700);
}

// 플레이어 뺏기 선택
function playerSteal() {
  const r = state.round; state.ui.steal = null;
  state.round = declareStealN(r, deps, PLAYER);
  flash(PLAYER, '운명 뺏기!'); render();
  schedule(onRoundEnd, 700);
}
function playerPassSteal() {
  const r = state.round; state.ui.steal = null;
  const rivals = stealCandidatesN(r, deps).filter((c) => c.taker !== PLAYER);
  if (rivals.length) { flash(rivals[0].taker, '운명 뺏기!'); render(); state.round = declareStealN(r, deps, rivals[0].taker); schedule(onRoundEnd, 700); }
  else { state.round = passStealN(r); tick(); }
}

// 플레이어 행동
function playerDiscard() {
  const r = state.round;
  if (r.phase !== 'decide' || r.seats[r.turnIdx] !== PLAYER) return;
  const idx = state.ui.selected;
  const card = r.hands[PLAYER][idx];
  if (card == null) return;
  state.round = discardStepN(r, card);
  state.ui.selected = -1;
  render();
  schedule(resolveSteal, postDiscardMs());
}
function playerDeclare() {
  const r = state.round;
  if (r.phase !== 'decide' || r.seats[r.turnIdx] !== PLAYER) return;
  if (!tsumoCheckN(r, deps)) return;
  flash(PLAYER, '완성!');
  state.round = declareTsumoN(r, deps);
  render();
  schedule(onRoundEnd, 650);
}

function situationFor(seat) {
  if (seat === 'rivalL') return null; // 속공: 완성되면 즉시 선언
  const sc = state.match.scores;
  const others = seats.filter((s) => s !== seat).map((s) => sc[s]);
  return { myScore: sc[seat], oppScore: Math.max(...others), targetScore: cfg.targetScore,
    wallLeft: state.round.wall.length, strategy: { patienceGap: 2, bigEnough: 6, giveUpWall: 8 } };
}

// ---------- 국 종료 / 매치 ----------
function onRoundEnd() {
  const r = state.round; if (!r || r.phase !== 'ended') return;
  const res = r.result, m = state.match;
  if (res.type === 'tsumo' || res.type === 'steal') m.scores[res.winner] += res.score;
  else if (res.type === 'exhaust') for (const s of seats) if (res.tenpai[s]) m.scores[s] += (cfg.tenpaiScore || 1);
  for (const s of seats) if (m.scores[s] >= cfg.targetScore) { m.over = true; if (m.winner == null) m.winner = s; }
  render();
  showResult(res);
}

function nextRound() {
  const m = state.match;
  if (m.over) { showMatchEnd(); return; }
  m.round += 1; m.firstIdx = (m.firstIdx + 1) % seats.length;
  startRound();
}

// ---------- 렌더 ----------
function nameOf(s) { return seatMeta[s].name; }
function flash(seat, msg) { state.ui.flash[seat] = msg; }

function render() {
  const r = state.round; if (!r) return;
  const turnSeat = r.seats[r.turnIdx];

  // 점수판
  const sc = $('#scores'); sc.innerHTML = '';
  for (const s of seats) {
    const d = el('div', 'sc' + (s === turnSeat ? ' turn' : ''));
    d.innerHTML = '<div class="nm">' + nameOf(s) + '</div><div class="pt">' + state.match.scores[s] + '</div>';
    sc.appendChild(d);
  }

  // 라이벌 좌/우
  renderRival('rivalL', $('#seat-rivalL'), r);
  renderRival('rivalR', $('#seat-rivalR'), r);

  // 산
  $('#wall-count').textContent = r.wall.length;

  // 왼쪽 맞출 수 있는 패 (플레이어 기준)
  renderAssist(r);

  // 내 버림패
  const md = $('#my-disc'); md.innerHTML = '';
  for (const id of r.discards[PLAYER]) md.appendChild(cardEl(id, cardMap, { size: 'sm', genreName }));

  // 내 손패
  const mh = $('#my-hand'); mh.innerHTML = '';
  const myHand = r.hands[PLAYER];
  const myTurn = turnSeat === PLAYER && r.phase === 'decide';
  const sorted = myHand.map((id, i) => ({ id, i })).sort(sortCards);
  sorted.forEach(({ id, i }) => {
    mh.appendChild(cardEl(id, cardMap, {
      genreName, selected: i === state.ui.selected, drawn: myTurn && i === myHand.length - 1,
      onClick: myTurn ? (() => { state.ui.selected = i; render(); }) : null,
    }));
  });

  // 행동 바
  renderActbar(r, myTurn);

  // 능력(비활성 자리)
  const ab = $('#ability-bar'); ab.innerHTML = '';
  ['예언서', '각색', '복선'].forEach((n) => { const b = el('button', 'a'); b.textContent = n; b.disabled = true; b.title = '프로토타입에선 비활성 (1:1에서 이식 예정)'; ab.appendChild(b); });
}

function sortCards(a, b) {
  const ca = cardMap[a.id], cb = cardMap[b.id];
  const order = { mu: 0, sf: 1, fa: 2, ro: 3, ho: 4 };
  return (order[ca.genre] - order[cb.genre]) || (ca.stage - cb.stage);
}

function renderRival(seat, root, r) {
  root.innerHTML = '';
  const meta = seatMeta[seat];
  const head = el('div', 'head');
  const av = el('div', 'avatar', meta.avatar);
  const info = el('div', '', '<div class="name">' + meta.name + '</div><div class="tag">' + meta.tag + '</div>');
  head.appendChild(av); head.appendChild(info);
  const fl = state.ui.flash[seat];
  if (fl) head.appendChild(el('div', 'flash', fl));
  else if (r.hands[seat].length === 7 && isFormalTenpai(r.hands[seat], cardMap, bondSet, allCardIds, cfg.rules))
    head.appendChild(el('div', 'warn', '완성 임박!'));
  root.appendChild(head);

  const backs = el('div', 'hand backs');
  for (let i = 0; i < r.hands[seat].length; i++) backs.appendChild(backEl());
  root.appendChild(backs);

  root.appendChild(el('div', 'disc-cap', '버림패'));
  const disc = el('div', 'disc');
  for (const id of r.discards[seat]) disc.appendChild(cardEl(id, cardMap, { size: 'sm', genreName }));
  root.appendChild(disc);
}

function renderAssist(r) {
  const box = $('#assist'); box.innerHTML = '';
  const ctx = { cardMap, bondSet, genres: [], yakuData, rules: cfg.rules };
  // genres for gname
  ctx.genres = Object.keys({ mu: 1, sf: 1, fa: 1, ro: 1, ho: 1 }).map((k) => ({ key: k, name: genreName(k) }));
  const hand = r.hands[PLAYER];
  const sets = formedSets(hand, ctx);
  const yks = reachableYaku(hand, ctx);
  box.appendChild(el('div', 'row', '지금 성립: <b>' + (sets.length ? sets.join(', ') : '—') + '</b>'));
  box.appendChild(el('div', 'row', '노려볼 역:'));
  const wrap = el('div');
  if (yks.length) yks.forEach((y) => wrap.appendChild(el('span', 'yk', y.name + ' ' + y.score)));
  else wrap.appendChild(el('span', 'yk', '아직 없음'));
  box.appendChild(wrap);
}

function renderActbar(r, myTurn) {
  const info = $('#card-info'), acts = $('#actions');
  info.innerHTML = ''; acts.innerHTML = '';
  // 뺏기 선택 대기
  if (state.ui.steal) {
    info.innerHTML = '상대가 버린 <b>' + labelOf(state.ui.steal.hand8 ? r.lastDiscard.card : '') + '</b>로 완성! 가로챌까요?';
    const b1 = el('button', 'btn', '가로채기'); b1.onclick = playerSteal;
    const b2 = el('button', 'btn ghost', '넘기기'); b2.onclick = playerPassSteal;
    acts.appendChild(b1); acts.appendChild(b2);
    return;
  }
  if (!myTurn) { info.textContent = r.phase === 'ended' ? '' : nameOf(r.seats[r.turnIdx]) + ' 차례…'; return; }
  const can = tsumoCheckN(r, deps);
  if (can) info.innerHTML = '완성! <b>' + can.yaku.map((y) => y.name).join(' + ') + '</b> (' + can.score + '점) — 선언하거나 계속 다듬을 수 있어요.';
  else info.textContent = '버릴 카드를 고르세요 (뽑은 카드가 자동 선택돼 있어요).';
  const bd = el('button', 'btn', '완성 선언'); bd.disabled = !can; bd.onclick = playerDeclare;
  const bx = el('button', 'btn ghost', '버리기'); bx.disabled = state.ui.selected < 0; bx.onclick = playerDiscard;
  acts.appendChild(bd); acts.appendChild(bx);
}
function labelOf(id) { if (!id) return ''; const c = cardMap[id]; return genreName(c.genre) + ' ' + STG[c.stage]; }

// ---------- 결과 오버레이 ----------
function showResult(res) {
  const ov = $('#overlay'); ov.innerHTML = '';
  const box = el('div', 'result');
  if (res.type === 'exhaust') {
    const tp = seats.filter((s) => res.tenpai[s]).map(nameOf);
    box.innerHTML = '<h2>유국</h2><div class="who">' + (tp.length ? tp.join(', ') + ' 텐파이 소점' : '텐파이 없음') + '</div>';
  } else {
    const kind = res.type === 'steal' ? '운명 뺏기' : '완성';
    box.innerHTML = '<h2>' + nameOf(res.winner) + ' — ' + kind + '</h2>'
      + (res.type === 'steal' ? '<div class="who">' + nameOf(res.loser) + '의 ' + labelOf(res.stolenCard) + '을(를) 가로챔</div>' : '');
    const hs = el('div', 'hand-show');
    for (const id of res.hand) hs.appendChild(cardEl(id, cardMap, { size: 'sm', genreName }));
    box.appendChild(hs);
    box.appendChild(el('div', 'yaku', res.yaku.map((y) => y.name + ' ' + y.score).join('  +  ')));
    box.appendChild(el('div', 'score', '+' + res.score + '점'));
  }
  const btn = el('button', 'btn', state.match.over ? '매치 결과 보기' : '다음 국');
  btn.onclick = nextRound;
  box.appendChild(btn);
  ov.appendChild(box); ov.classList.remove('hidden');
}

function showMatchEnd() {
  const ov = $('#overlay'); ov.innerHTML = '';
  const box = el('div', 'result');
  const rank = [...seats].sort((a, b) => state.match.scores[b] - state.match.scores[a]);
  box.innerHTML = '<h2>' + nameOf(state.match.winner) + ' 승리!</h2>'
    + '<div class="who">' + rank.map((s) => nameOf(s) + ' ' + state.match.scores[s] + '점').join(' · ') + '</div>';
  const btn = el('button', 'btn', '새 매치'); btn.onclick = startMatch;
  box.appendChild(btn); ov.appendChild(box); ov.classList.remove('hidden');
}
function hideOverlay() { const ov = $('#overlay'); ov.classList.add('hidden'); ov.innerHTML = ''; }

// ---------- 정적 버튼 ----------
function wireStaticButtons() {
  $('#btn-help').onclick = () => {
    const ov = $('#overlay'); ov.innerHTML = '';
    const box = el('div', 'result');
    box.innerHTML = '<h2>3인 대국 — 규칙</h2>'
      + '<div class="yaku" style="text-align:left;line-height:1.7">'
      + '세트 = 같은 장르로 이어지는 <b>기승전</b> 또는 <b>승전결</b> 3장.<br>'
      + '손패 8장 = 세트 2 + 짝, 그리고 <b>결말(승전결) 세트가 하나 이상</b>이면 완성.<br>'
      + '상대가 버린 카드로 내 손이 완성되면 <b>운명 뺏기</b>.<br>'
      + '먼저 ' + cfg.targetScore + '점에 닿으면 승리.</div>';
    const b = el('button', 'btn', '닫기'); b.onclick = hideOverlay; box.appendChild(b);
    ov.appendChild(box); ov.classList.remove('hidden');
  };
  $('#btn-counts').onclick = () => {
    const seen = [];
    const r = state.round;
    for (const s of seats) { if (s === PLAYER) seen.push(...r.hands[PLAYER]); seen.push(...r.discards[s]); }
    const left = unseenCounts(allCardIds, cfg.copiesPerCard, seen);
    const p = $('#count-panel');
    if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
    p.innerHTML = allCardIds.map((id) => labelOf(id) + ':' + left[id]).join('  ');
    p.classList.remove('hidden');
  };
}

boot();
