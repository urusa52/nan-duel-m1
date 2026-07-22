// eventBus.js — 모듈 간 통신 (기존 아키텍처 계승).
// 렌더/입력은 intent 이벤트만 발행하고, 진행 로직은 main이 구독한다.
const handlers = {};

export function on(type, fn) {
  (handlers[type] = handlers[type] || []).push(fn);
}

export function emit(type, payload) {
  for (const fn of handlers[type] || []) fn(payload);
}
