// hud.js — 점수판·라운드 표시.
let refs = null;

export function initHud() {
  refs = {
    myScore: document.getElementById('my-score'),
    aiScore: document.getElementById('ai-score'),
    roundNo: document.getElementById('round-no'),
    target: document.getElementById('target-score'),
  };
}

export function renderHud(s) {
  if (!s.match) return;
  refs.myScore.textContent = s.match.scores.player;
  refs.aiScore.textContent = s.match.scores.ai;
  refs.roundNo.textContent = s.match.round;
  refs.target.textContent = s.cfg.matchMode === 'race'
    ? '선취 ' + s.cfg.targetScore + '점'
    : s.cfg.fixedRounds + '국 총점';
}
