// cutin.js — 하이라이트 연출 (M1'은 골격, 고도화는 M3).
// 원칙 계승: 연출은 상황이 트리거(D3), 모든 연출 탭 스킵(D5).

import { cardEl, genreName } from './table.js';

let refs = null;
let data = null;

export function initCutin(dataBundle) {
  data = dataBundle;
  refs = { overlay: document.getElementById('overlay') };
}

export function hideOverlay() {
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

// 국 종료 컷인 — 승자·역·점수. 탭하면 닫힘(스킵 규칙 D5).
export function showRoundEnd(s) {
  const r = s.round.result;
  refs.overlay.classList.remove('hidden');

  if (r.type === 'exhaust') {
    const line = (who, label) =>
      '<p class="ex-line">' + label + ' — ' + (r.tenpai[who] ? '텐파이 (+' + data.cfg.tenpaiScore + '점)' : '노텐') + '</p>';
    refs.overlay.innerHTML =
      '<div class="modal roundend"><p class="re-type">유국 — 산이 말랐다</p>' +
      line('player', '나') + line('ai', '라이벌') +
      '<button type="button" id="btn-next" class="btn declare">다음 국</button></div>';
    return;
  }

  const winnerMe = r.winner === 'player';
  const typeLabel = r.type === 'steal' ? '운명 뺏기!' : '완성 선언!';
  const handHtml = document.createElement('div');
  handHtml.className = 're-hand';
  // 완성 손패를 분해 순서(세트·세트·짝)로 보여준다 — 완성의 "형태"가 읽히도록
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
