// analysis.js — 왼쪽 '맞출 수 있는 패' 패널용 분석. 순수 · 표시 전용(게임 판정과 무관).
// 두 가지를 준다: ① 지금 손패에 성립한 세트 ② 손패 구성상 노려볼 만한 역(가벼운 휴리스틱).
// 정확한 완성 가능성 판정이 아니라 "방향 안내"다 — 오판정으로 판을 바꾸지 않으므로 안전.

import { classifySet, isPair } from './handEval.js';

const STG = { 1: '기', 2: '승', 3: '전', 4: '결' };
// ctx = { cardMap, bondSet, genres(cardsData.genres), yakuData, rules }
const gname = (ctx, key) => (ctx.genres.find((g) => g.key === key) || {}).name || key;

// 지금 성립 중인 세트를 겹치지 않게 greedy로 찾아 표시 문자열로 (최대 2개).
export function formedSets(hand, ctx) {
  const used = new Array(hand.length).fill(false);
  const out = [];
  for (let a = 0; a < hand.length; a++) {
    if (used[a]) continue;
    let found = false;
    for (let b = a + 1; b < hand.length && !found; b++) {
      if (used[b]) continue;
      for (let c = b + 1; c < hand.length && !found; c++) {
        if (used[c]) continue;
        const info = classifySet([hand[a], hand[b], hand[c]], ctx.cardMap, ctx.rules);
        if (!info) continue;
        used[a] = used[b] = used[c] = true;
        found = true;
        const cs = [hand[a], hand[b], hand[c]].map((id) => ctx.cardMap[id]);
        const st = cs.map((x) => x.stage).sort((x, y) => x - y).map((n) => STG[n]).join('·');
        out.push(info.sameGenre ? `${gname(ctx, info.genre)} ${st}` : `서사 ${st}`);
      }
    }
    if (out.length >= 2) break;
  }
  return out;
}

// 노려볼 역 — 손패 구성 기반의 가벼운 가능성 판정(정확한 완성 판정 아님).
// yaku.json에서 이름·점수를 가져오고, id별 "아직 가능성이 남았나"만 싸게 본다.
export function reachableYaku(hand, ctx) {
  const cs = hand.map((id) => ctx.cardMap[id]);
  const byGenre = {}; const gc = {}; const stages = new Set();
  for (const c of cs) {
    (byGenre[c.genre] = byGenre[c.genre] || new Set()).add(c.stage);
    gc[c.genre] = (gc[c.genre] || 0) + 1;
    stages.add(c.stage);
  }
  const genres = Object.keys(byGenre);
  const maxG = genres.length ? Math.max(...genres.map((g) => gc[g])) : 0;
  const consecSame = genres.some((g) => [1, 2, 3].some((n) => byGenre[g].has(n) && byGenre[g].has(n + 1)));
  const consecAny = [1, 2, 3].some((n) => stages.has(n) && stages.has(n + 1));
  const twoGenres = genres.filter((g) => gc[g] >= 2).length >= 2;
  const hasBond = hand.some((id, i) => hand.some((jd, j) => i !== j && isPair(id, jd, ctx.bondSet).bond));
  const all4 = [1, 2, 3, 4].every((n) => stages.has(n));

  const ok = {
    crossover: consecAny,
    anthology2: twoGenres,
    bond: hasBond,
    pureSerial: consecSame,
    finale: stages.has(4) && consecAny,
    exclusive: maxG >= 4,
    complete: maxG >= 6,
    fourAct: all4,
    fiveGenre: genres.length >= 4,
    masterpiece: maxG >= 6 && all4,
  };
  return ctx.yakuData.yaku
    .filter((y) => ok[y.id])
    .map((y) => ({ name: y.name, score: y.score }));
}
