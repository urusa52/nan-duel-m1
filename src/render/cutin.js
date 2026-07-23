// cutin.js — 하이라이트 연출 (M1'은 골격, 고도화는 M3).
// 원칙 계승: 연출은 상황이 트리거(D3), 모든 연출 탭 스킵(D5).

import { cardEl, genreName } from './table.js';

let refs = null;
let data = null;
let cutinTimer = null;

export function initCutin(dataBundle) {
  data = dataBundle;
  refs = { overlay: document.getElementById('overlay') };
}

export function hideOverlay() {
  clearTimeout(cutinTimer);
  refs.overlay.onclick = null;
  refs.overlay.classList.add('hidden');
  refs.overlay.innerHTML = '';
}

// 운명 뺏기 프롬프트 — 상대 버림패로 완성 가능할 때
export function showStealPrompt(s, stealInfo) {
  const c = data.cardMap[stealInfo.card];
  refs.overlay.classList.remove('hidden');
  refs.overlay.innerHTML =
    '<div class="modal steal">' +
    '<p class="steal-title">운명 뺏기</p>' +
    '<p class="steal-desc">상대가 버린 「' + c.name + '」(으)로 이야기가 완성됩니다</p>' +
    '<p class="steal-score">' +
    stealInfo.yaku.map((y) => y.name).join(' + ') + ' — ' + stealInfo.score + '점</p>' +
    '<div class="modal-btns">' +
    '<button type="button" id="btn-steal" class="btn declare">뺏는다</button>' +
    '<button type="button" id="btn-pass-steal" class="btn">넘긴다</button>' +
    '</div></div>';
}

// 국 종료 — 승리는 완성 컷인 연출 후 결과 모달, 유국은 바로 결과. 탭 스킵(D5).
export function showRoundEnd(s) {
  const r = s.round.result;
  refs.overlay.classList.remove('hidden');
  refs.overlay.onclick = null;

  if (r.type === 'exhaust') {
    const line = (who, label) =>
      '<p class="ex-line">' + label + ' — ' + (r.tenpai[who] ? '텐파이 (+' + data.cfg.tenpaiScore + '점)' : '노텐') + '</p>';
    refs.overlay.innerHTML =
      '<div class="modal roundend"><p class="re-type">유국 — 산이 말랐다</p>' +
      line('player', '나') + line('ai', '라이벌') +
      '<button type="button" id="btn-next" class="btn declare">다음 국</button></div>';
    return;
  }

  // 완성 순간 컷인(모든 완성) → 역만·고득점이면 더 화려하게 → 탭/시간 후 결과 모달.
  playWinCutin(r, () => renderRoundResult(r));
}

// 완성 등급: 역만(불후의 명작·13점↑) / 대작(6점↑) / 일반
function winTier(r) {
  if ((r.yaku && r.yaku.some((y) => y.yakuman)) || r.score >= 13) return 'yakuman';
  if (r.score >= 6) return 'big';
  return 'normal';
}
function topYakuName(r) {
  if (!r.yaku || !r.yaku.length) return '';
  return r.yaku.slice().sort((a, b) => b.score - a.score)[0].name;
}

// 완성 컷인. "내 의지로 맞춘" 순간을 잡아주는 연출. 탭하면 즉시 결과로(스킵).
function playWinCutin(r, onDone) {
  const tier = winTier(r);
  const typeLabel = r.type === 'steal' ? '운명 뺏기' : '완성 선언';
  const headline = tier === 'normal'
    ? '이야기 완성'
    : (topYakuName(r) || (tier === 'yakuman' ? '불후의 명작' : '이야기 완성'));
  refs.overlay.innerHTML =
    '<div class="cutin tier-' + tier + '">' +
    (tier !== 'normal' ? '<div class="cutin-rays"></div>' : '') +
    '<div class="cutin-sub">' + typeLabel + '</div>' +
    '<div class="cutin-main">' + headline + '</div>' +
    '<div class="cutin-score">' + r.score + '점</div>' +
    '</div>';
  let done = false;
  const go = () => { if (done) return; done = true; clearTimeout(cutinTimer); onDone(); };
  refs.overlay.onclick = go; // 탭 스킵
  cutinTimer = setTimeout(go, tier === 'normal' ? 1100 : 1900);
}

// 결과 모달 — 완성 손패(세트·세트·짝) + 역 + 점수
function renderRoundResult(r) {
  refs.overlay.onclick = null;
  const winnerMe = r.winner === 'player';
  const typeLabel = r.type === 'steal' ? '운명 뺏기!' : '완성 선언!';
  const handHtml = document.createElement('div');
  handHtml.className = 're-hand';
  const d = r.decomp;
  const groups = [d.sets[0].ids, d.sets[1].ids, d.pair.ids];
  for (const g of groups) {
    const wrap = document.createElement('span');
    wrap.className = 're-group';
    for (const id of g) {
      const el = cardEl(id, { small: true });
      el.disabled = true;
      if (r.type === 'steal' && id === r.stolenCard) el.classList.add('stolen');
      wrap.appendChild(el);
    }
    handHtml.appendChild(wrap);
  }
  const yakuLines = r.yaku
    .map((y) => '<p class="re-yaku"><span>' + y.name + '</span><small>' + y.sub + '</small><b>+' + y.score + '</b></p>')
    .join('');
  refs.overlay.innerHTML =
    '<div class="modal roundend ' + (winnerMe ? 'win' : 'lose') + '">' +
    '<p class="re-type">' + typeLabel + '</p>' +
    '<p class="re-who">' + (winnerMe ? '나의 이야기가 완성되었다' : '라이벌의 이야기가 완성되었다') + '</p>' +
    '</div>';
  const modal = refs.overlay.querySelector('.modal');
  modal.appendChild(handHtml);
  modal.insertAdjacentHTML('beforeend',
    yakuLines +
    '<p class="re-score">' + r.score + '점</p>' +
    '<button type="button" id="btn-next" class="btn declare">다음 국</button>');
}

// 매치 종료
export function showMatchEnd(s) {
  const m = s.match;
  const winnerMe = m.winner === 'player';
  refs.overlay.classList.remove('hidden');
  refs.overlay.innerHTML =
    '<div class="modal matchend ' + (winnerMe ? 'win' : 'lose') + '">' +
    '<p class="me-title">' + (winnerMe ? '『 』에 제목이 채워질 자격' : '아직 우리는 『 』입니다') + '</p>' +
    '<p class="me-desc">' + (winnerMe ? '당신의 이야기가 먼저 세상에 닿았다' : '라이벌의 이야기가 먼저 닿았다 — 다음 판이 있다') + '</p>' +
    '<p class="me-score">' + m.scores.player + ' : ' + m.scores.ai + '</p>' +
    '<button type="button" id="btn-rematch" class="btn declare">다시 대국</button></div>';
}
