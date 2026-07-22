// store.js — 단일 상태 저장소 (기존 아키텍처 계승).
// 상태 변경은 setState 한 경로로만. 렌더는 subscribe로 반응.
let state = {};
const listeners = new Set();

export function getState() { return state; }

export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
