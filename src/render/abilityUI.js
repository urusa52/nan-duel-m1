// abilityUI.js — 특수 능력 버튼·연출 렌더. 읽기만 한다(상태 변경 금지).
// 클릭 처리는 controls.js가 intent로 바꾸고, 진행은 main이 담당한다.
// 두 영역만 그린다: #ability-bar(능력 버튼) · #ability-panel(선택/미리보기 트레이).

import { cardEl, genreName } from './table.js';

let data = null;   // { cardsData, cardMap, abilities(=abilities.json의 배열) }
let deps = null;
let refs = null;

export function initAbilityUI(dataBundle, logicDeps) {
  data = dataBundle;
  deps = logicDeps;
  refs = {
    bar: document.getElementById('ability-bar'),
    panel: document.getElementById('ability-panel'),
  };
}

// abilities.json에서 이름을 가져온다(텍스트는 데이터에서 — 하드코딩 회피).
function abName(id) {
  const d = (data.abilities || []).find((a) => a.id === id);
  return d ? d.name : id;
}

export function renderAbilities(s) {
  if (!refs) return;
  const round = s.round;
  if (!round) { refs.bar.innerHTML = ''; hidePanel(); return; }
  renderBar(s);
  renderPanel(s);
}

// ---- 능력 버튼 바 (내 턴에만) ----
function renderBar(s) {
  const round = s.round;
  const bar = refs.bar;
  bar.innerHTML = '';
  if (round.turn !== 'player' || round.phase === 'ended') return;
  const ab = (round.abilities && round.abilities.player) || {};

  if (round.phase === 'draw') {
    // 뽑기 전: 예언서 / (버림패 있으면)복선 / 뽑기
    addAbilityBtn(bar, 'foresight', ab.foresight);
    if (round.discards.player.length > 0) addAbilityBtn(bar, 'foreshadow', ab.foreshadow);
    const draw = document.createElement('button');
    draw.type = 'button';
    draw.id = 'btn-draw';
    draw.className = 'btn draw-btn';
    draw.textContent = '뽑기';
    bar.appendChild(draw);
  } else if (round.phase === 'decide') {
    // 뽑은 뒤: 각색 (버릴 카드를 고른 상태에서 눌러 장르 변경)
    addAbilityBtn(bar, 'adapt', ab.adapt);
  }
}

function addAbilityBtn(bar, id, left) {
  const n = left || 0;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'ab-' + id;
  b.className = 'btn ability-btn' + (n <= 0 ? ' used' : '');
  b.dataset.ability = id;
  b.disabled = n <= 0;
  b.textContent = abName(id) + ' (' + n + ')';
  bar.appendChild(b);
}

// ---- 컨텍스트 트레이 (예언서 미리보기 / 복선 회수 / 각색 장르선택) ----
function renderPanel(s) {
  const round = s.round;
  const ui = s.ui || {};
  const mode = ui.abilityMode;
  if (!mode) { hidePanel(); return; }
  const panel = refs.panel;
  panel.classList.remove('hidden');
  panel.innerHTML = '';

  if (mode === 'foresight') {
    const peek = ui.foresightPeek || [];
    title(panel, '예언서 — 다음에 올 ' + peek.length + '장 (나만 봄)');
    const row = document.createElement('div');
    row.className = 'peek-row';
    peek.forEach((id, i) => {
      const item = document.createElement('div');
      item.className = 'peek-item';
      const ord = document.createElement('span');
      ord.className = 'peek-order';
      ord.textContent = String(i + 1);
      const el = cardEl(id, { small: true });
      el.disabled = true;
      item.appendChild(ord);
      item.appendChild(el);
      row.appendChild(item);
    });
    panel.appendChild(row);
    panelBtn(panel, 'btn-ability-close', '닫기');
  } else if (mode === 'foreshadow') {
    title(panel, '복선 — 회수할 버림패를 고르세요');
    const row = document.createElement('div');
    row.className = 'pick-row';
    round.discards.player.forEach((id, i) => {
      const el = cardEl(id, { small: true, cls: 'pick' });
      el.dataset.discardIndex = String(i);
      row.appendChild(el);
    });
    panel.appendChild(row);
    panelBtn(panel, 'btn-ability-cancel', '취소');
  } else if (mode === 'adapt') {
    const idx = ui.adaptIndex;
    const cur = data.cardMap[round.hands.player[idx]];
    title(panel, '각색 — 「' + cur.name + '」을(를) 어떤 장르로?');
    const row = document.createElement('div');
    row.className = 'genre-pick';
    for (const g of data.cardsData.genres) {
      if (g.key === cur.genre) continue; // 같은 장르로는 못 바꿈
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn genre-btn g-' + g.key;
      b.dataset.genre = g.key;
      b.textContent = g.name;
      row.appendChild(b);
    }
    panel.appendChild(row);
    panelBtn(panel, 'btn-ability-cancel', '취소');
  } else {
    hidePanel();
  }
}

function hidePanel() {
  if (!refs) return;
  refs.panel.classList.add('hidden');
  refs.panel.innerHTML = '';
}

function title(panel, text) {
  const d = document.createElement('div');
  d.className = 'ap-title';
  d.textContent = text;
  panel.appendChild(d);
}

function panelBtn(panel, id, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = id;
  b.className = 'btn tiny';
  b.textContent = label;
  panel.appendChild(b);
}
