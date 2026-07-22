// abilities.js — 특수 능력 순수 로직. DOM·상태 접근 금지. (분기후보_특수능력.md)
// 능력 3종: 예언서(정보) · 각색(손패 장르 변경) · 복선(버림패 회수).
// 왜 순수함수인가: duel과 같은 원칙 — 입력→새 값 반환이라 테스트·자가대국이 쉽다.
// 잔여 횟수는 국(round) 상태에 담고 newRound에서 초기화 → "국 바뀌면 리셋"이 자동.

// config.abilities.uses(능력별 횟수)로 국 시작 잔여 상태를 만든다.
export function initAbilityState(cfg) {
  const a = (cfg && cfg.abilities) || {};
  const enabled = a.enabled || [];
  const uses = a.uses || {};
  const state = {};
  for (const id of enabled) state[id] = uses[id] != null ? uses[id] : 1;
  return state;
}

export function canUse(abilState, id) {
  return !!abilState && (abilState[id] || 0) > 0;
}

// 사용 1회 차감한 새 잔여 상태 반환(원본 불변).
export function spend(abilState, id) {
  return { ...abilState, [id]: Math.max(0, (abilState[id] || 0) - 1) };
}

// 예언서: 다음에 뽑힐 n장을 "뽑는 순서대로" 반환(산 불변).
// wall.draw()는 배열 끝에서 꺼내므로, 다음 카드는 wall[len-1], 그다음 wall[len-2] ...
export function applyForesight(wall, n) {
  const out = [];
  for (let i = 0; i < n && i < wall.length; i++) out.push(wall[wall.length - 1 - i]);
  return out;
}

// 각색: 손패 index 카드의 장르만 newGenre로 바꾼다(단계 유지). 새 손패 반환.
// 같은 단계의 다른 장르 = 실존 카드 id(`${genre}-${stage}`)로 치환 → handEval 그대로 재사용.
export function applyAdapt(hand, index, newGenre, cardMap) {
  const cur = cardMap[hand[index]];
  if (!cur) throw new Error('applyAdapt: unknown card ' + hand[index]);
  const newId = `${newGenre}-${cur.stage}`;
  if (!cardMap[newId]) throw new Error('applyAdapt: no card for ' + newId);
  const next = hand.slice();
  next[index] = newId;
  return next;
}

// 복선: 내 버림패 discardIndex 카드를 손으로 회수. {hand, discards} 반환(산 불변).
export function applyForeshadow(hand, discards, discardIndex) {
  const card = discards[discardIndex];
  if (card == null) throw new Error('applyForeshadow: no discard at ' + discardIndex);
  const nextDiscards = discards.slice(0, discardIndex).concat(discards.slice(discardIndex + 1));
  const nextHand = hand.concat([card]);
  return { hand: nextHand, discards: nextDiscards };
}
