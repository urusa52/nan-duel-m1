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

// 노려볼 역 — 런 기반 손패 구성의 가벼운 가능성 판정(정확한 완성 판정 아님, 방향 안내용).
// 아크 진척도(기승전 쪽 / 승전결 쪽)를 장르별로 보고 어떤 역을 노릴 만한지 싸게 추정한다.
export function reachableYaku(hand, ctx) {
  const cs = hand.map((id) => ctx.cardMap[id]);
  const byGenre = {}; const gc = {};
  for (const c of cs) {
    (byGenre[c.genre] = byGenre[c.genre] || new Set()).add(c.stage);
    gc[c.genre] = (gc[c.genre] || 0) + 1;
  }
  const genres = Object.keys(byGenre);
  const maxG = genres.length ? Math.max(...genres.map((g) => gc[g])) : 0;
  // 기승전(1-2-3) 쪽 진척 / 승전결(2-3-4) 쪽 진척: 해당 단계가 몇 개나 모였나
  const openProg = (g) => [1, 2, 3].filter((n) => byGenre[g].has(n)).length;
  const finProg = (g) => [2, 3, 4].filter((n) => byGenre[g].has(n)).length;
  const openGenres = genres.filter((g) => openProg(g) >= 2);
  const finGenres = genres.filter((g) => finProg(g) >= 2);
  const sameGenreSaga = genres.some((g) => openProg(g) >= 2 && finProg(g) >= 2); // 한 장르로 기→결
  const hasBond = hand.some((id, i) => hand.some((jd, j) => i !== j && isPair(id, jd, ctx.bondSet).bond));

  const ok = {
    doubleFinale: finGenres.length >= 2,                    // 승전결 두 편
    sagaMix: openGenres.length >= 1 && finGenres.length >= 1, // 기→결 완주(합작)
    sagaSame: sameGenreSaga,                                 // 일대기(같은 장르 완주)
    bond: hasBond,
    complete: maxG >= 6,                                     // 전집(한 장르 몰기)
    masterpiece: maxG >= 6 && sameGenreSaga,                 // 역만
  };
  return ctx.yakuData.yaku
    .filter((y) => ok[y.id])
    .map((y) => ({ id: y.id, name: y.name, score: y.score }));
}
