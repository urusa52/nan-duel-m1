// wall.js — 산(山) 로직. 순수함수만. (D16·D22)
// 왜 이 구조인가: 산은 "셀 수 있는 확률"의 토대이므로, 생성·셔플·뽑기를
// 모두 결정적(시드 rng)으로 만들어 테스트와 리플레이가 가능해야 한다.

// mulberry32 — 가볍고 결정적인 시드 rng
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 카드 정의 × 종당 매수 → 산 배열 (카드 id의 나열)
export function buildWall(cardIds, copiesPerCard) {
  const wall = [];
  for (const id of cardIds) {
    for (let i = 0; i < copiesPerCard; i++) wall.push(id);
  }
  return wall;
}

// Fisher–Yates. 원본을 바꾸지 않고 새 배열 반환.
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 비복원 뽑기: 마지막 요소를 꺼낸다. 새 산 배열과 뽑힌 카드를 함께 반환.
export function draw(wall) {
  if (wall.length === 0) return { wall, card: null };
  const next = wall.slice(0, -1);
  return { wall: next, card: wall[wall.length - 1] };
}

// "안 보인 장수" 집계 — 수읽기 UI의 재료.
// 전체 매수에서 공개 정보(내 손패 + 양측 버림패)만 뺀다.
// 상대 손패는 빼지 않는다 → 정보 누출 없음 (마작의 카운팅과 동일).
export function unseenCounts(cardIds, copiesPerCard, visibleCardIds) {
  const counts = {};
  for (const id of cardIds) counts[id] = copiesPerCard;
  for (const id of visibleCardIds) {
    if (counts[id] !== undefined) counts[id] = Math.max(0, counts[id] - 1);
  }
  return counts;
}
