// cards3p.js — 카드 DOM 빌더. 지금은 양피지 카드, 나중에 이미지도 끼울 수 있게 seam 포함.
// 이미지 넣는 법: (1) cards.json 각 카드에 "img" 필드, 또는 (2) 아래 CARD_IMAGES[id]에 URL/dataURI.
// 둘 중 하나라도 있으면 그 카드는 양피지 대신 그림으로 렌더된다.

const STG = { 1: '기', 2: '승', 3: '전', 4: '결' };

export const CARD_IMAGES = {}; // 예: { 'mu-1': 'https://.../mu-1.png' }  ← 나중에 채우면 자동 적용

export function makeGenreName(cardsData) {
  const m = {};
  for (const g of (cardsData.genres || [])) m[g.key] = g.name;
  return (key) => m[key] || key;
}

// id → 카드 엘리먼트. opts: { size:'big'|'sm', genreName, selected, drawn, onClick }
export function cardEl(id, cardMap, opts = {}) {
  const c = cardMap[id];
  const el = document.createElement('div');
  el.className = 'card ' + (opts.size || 'big') + ' ' + c.genre
    + (opts.selected ? ' sel' : '') + (opts.drawn ? ' drawn' : '');
  el.dataset.id = id;
  const gname = opts.genreName ? opts.genreName(c.genre) : c.genre;
  const img = (opts.img != null ? opts.img : (CARD_IMAGES[id] != null ? CARD_IMAGES[id] : c.img));
  el.innerHTML =
    '<div class="art"></div>' +
    '<div class="band">' + gname + '</div>' +
    '<div class="body"><span class="st">' + STG[c.stage] + '</span></div>' +
    '<div class="chip">' + STG[c.stage] + '</div>';
  if (img) {
    el.classList.add('has-art');
    el.querySelector('.art').style.backgroundImage = 'url("' + img + '")';
  }
  if (c.name) el.title = c.name + ' (' + gname + '·' + STG[c.stage] + ')';
  if (opts.onClick) el.addEventListener('click', () => opts.onClick(id));
  return el;
}

export function backEl() {
  const el = document.createElement('div');
  el.className = 'back';
  return el;
}

export { STG };
