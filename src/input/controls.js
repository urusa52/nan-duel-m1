// controls.js — 입력. DOM 이벤트를 intent 이벤트로 변환만 한다 (로직 없음).
import { emit } from '../core/eventBus.js';
import { getState, setState } from '../core/store.js';

export function initControls() {
  // 손패 탭 → 선택 (내 decide 페이즈에서만 handUI가 tappable을 붙임)
  document.getElementById('my-hand').addEventListener('click', (e) => {
    const card = e.target.closest('.card.tappable');
    if (!card) return;
    const i = Number(card.dataset.index);
    const s = getState();
    setState({ ui: { ...s.ui, selectedIndex: s.ui.selectedIndex === i ? null : i } });
  });

  // 행동 버튼 (동적 생성이므로 위임)
  document.getElementById('actions').addEventListener('click', (e) => {
    if (e.target.id === 'btn-declare') emit('intent:declare');
    if (e.target.id === 'btn-discard') emit('intent:discard');
  });

  // 오버레이 버튼 (운명 뺏기 / 다음 국 / 재대국)
  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target.id === 'btn-steal') emit('intent:steal');
    if (e.target.id === 'btn-pass-steal') emit('intent:pass-steal');
    if (e.target.id === 'btn-next') emit('intent:next-round');
    if (e.target.id === 'btn-rematch') emit('intent:rematch');
  });

  // 수읽기 패널 토글
  document.getElementById('btn-counts').addEventListener('click', () => {
    const s = getState();
    setState({ ui: { ...s.ui, showCounts: !s.ui.showCounts } });
  });

  // 도움말
  document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('help').classList.toggle('hidden');
  });
  document.getElementById('help').addEventListener('click', (e) => {
    if (e.target.id === 'btn-tutorial-again') {
      document.getElementById('help').classList.add('hidden');
      emit('intent:restart-tutorial');
      return;
    }
    if (e.target.id === 'help' || e.target.id === 'btn-help-close') {
      document.getElementById('help').classList.add('hidden');
    }
  });
}
