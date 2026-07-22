// main.js — 조립·배선만. 진행 규칙은 logic/, 표시는 render/, 입력은 input/.
import { getState, setState, subscribe } from './core/store.js';
import { on } from './core/eventBus.js';
import { makeRng, buildWall, shuffle } from './logic/wall.js';
import { makeCardMap, makeBondSet, waitsFor } from './logic/handEval.js';
import { makeYakuEvaluator } from './logic/yakuEval.js';
import {
  P, A, newRound, drawStep, tsumoCheck, declareTsumo,
  discardStep, stealCheck, declareSteal, passSteal,
  useForesight, useAdapt, useForeshadow,
} from './logic/duel.js';
import { initAbilityState, canUse } from './logic/abilities.js';
import { newMatch, applyRoundResult } from './logic/match.js';
import { aiChooseAction, aiWantsSteal } from './logic/ai.js';
import { initTable, renderTable } from './render/table.js';
import { initHandUI, renderHand } from './render/handUI.js';
import { initCutin, hideOverlay, showStealPrompt, showRoundEnd, showMatchEnd } from './render/cutin.js';
import { initHud, renderHud } from './render/hud.js';
import { initControls } from './input/controls.js';
import { initAbilityUI, renderAbilities } from './render/abilityUI.js';
import { initTutorial, maybeAutoStart, onState as tutorialOnState, restart as tutorialRestart } from './render/tutorial.js';

async function loadJson(path) {
  const res = await fetch(path);
  return res.json();
}

async function boot() {
  const [cfg, cardsData, bondsData, yakuData, abilitiesData] = await Promise.all([
    loadJson('./src/data/config.json'),
    loadJson('./src/data/cards.json'),
    loadJson('./src/data/bonds.json'),
    loadJson('./src/data/yaku.json'),
    loadJson('./src/data/abilities.json'),
  ]);

  const cardMap = makeCardMap(cardsData);
  const bondSet = makeBondSet(bondsData);
  const allCardIds = cardsData.cards.map((c) => c.id);
  const rules = { allowCrossGenreRun: true, minYakuToDeclare: 1, ...(cfg.rules || {}) };
  // 난이도 프리셋에서 AI 전략을 파생 (단일 진실원천). difficulty가 없으면 normal.
  const presets = cfg.difficultyPresets || {};
  const aiStrategy = presets[cfg.difficulty] || presets.normal || {};
  const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet, rules);
  const declEval = (h) => { const b = evalHand(h); return b && b.declarable ? b : null; };
  const deps = { cardMap, bondSet, allCardIds, evalHand, rules, waitsFor, declEval };
  const dataBundle = { cfg, cardsData, bondsData, cardMap, abilities: abilitiesData.abilities };
  // 능력 초기 잔여(공용 — 양측 동일). 국마다 newRound에 넘겨 자동 리셋된다.
  const abilityInit = { [P]: initAbilityState(cfg), [A]: initAbilityState(cfg) };

  initTable(dataBundle, deps);
  initHandUI(dataBundle, deps);
  initCutin(dataBundle);
  initHud();
  initControls();
  initAbilityUI(dataBundle, deps);
  initTutorial();

  // 국/매치 시작 때 능력 관련 ui를 깨끗이 비우는 기본값
  const ABILITY_UI_RESET = { abilityMode: null, foresightPeek: null, adaptIndex: null, adaptGenre: null, foreshadowIndex: null };

  let rng = makeRng(Date.now() % 2147483647);
  let aiTimer = null;

  function renderAll(s) {
    renderHud(s);
    renderTable(s);
    renderHand(s);
    renderAbilities(s);
  }
  subscribe(renderAll);
  subscribe((s) => tutorialOnState(s));
  on('intent:restart-tutorial', () => tutorialRestart());

  function startMatch() {
    const match = newMatch(cfg);
    setState({ cfg, match, round: null, ui: { selectedIndex: null, showCounts: false, ...ABILITY_UI_RESET } });
    startRound();
  }

  function startRound() {
    const s = getState();
    const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), rng);
    const round = newRound(wall, s.match.firstTurn, abilityInit);
    hideOverlay();
    setState({ round, ui: { ...s.ui, selectedIndex: null, ...ABILITY_UI_RESET } });
    advance();
  }

  // 내 턴 '뽑기 전'에 쓸 수 있는 능력(예언서/복선)이 남아 있는가.
  // 복선은 회수할 내 버림패가 있어야 의미가 있으므로 함께 확인.
  function playerHasPreDraw(round) {
    const ab = (round.abilities && round.abilities[P]) || {};
    const foresight = (ab.foresight || 0) > 0;
    const foreshadow = (ab.foreshadow || 0) > 0 && round.discards[P].length > 0;
    return foresight || foreshadow;
  }

  // 진행 엔진: 현재 페이즈를 보고 자동 진행이 필요한 부분만 민다.
  // 플레이어 입력이 필요한 지점(내 decide, 내 뺏기 결정)에서는 멈춘다.
  function advance() {
    const s = getState();
    let round = s.round;
    if (!round || round.phase === 'ended') { onRoundEnd(); return; }

    if (round.phase === 'draw') {
      // 조건부 정지: 내 턴이고 '뽑기 전' 쓸 능력이 남아 있으면 자동으로 안 뽑고 멈춘다.
      // (능력이 없거나 다 썼으면 기존처럼 자동 뽑기 → 평범한 턴엔 군더더기 없음.)
      if (round.turn === P && playerHasPreDraw(round)) return; // abilityUI가 예언서/복선/뽑기를 그림
      round = drawStep(round, deps);
      setState({ round });
      if (round.phase === 'ended') { onRoundEnd(); return; } // 유국
      // decide로 넘어감 — 잠깐의 템포 후 계속 (D2 빠른 템포)
      setTimeout(advance, cfg.tempo.drawMs);
      return;
    }

    if (round.phase === 'decide') {
      if (round.turn === A) {
        clearTimeout(aiTimer);
        aiTimer = setTimeout(() => {
          const cur = getState().round;
          if (!cur || cur.phase !== 'decide' || cur.turn !== A) return;
          const m = getState().match;
          const situation = {
            myScore: m.scores.ai, oppScore: m.scores.player,
            targetScore: cfg.targetScore, wallLeft: cur.wall.length,
            strategy: aiStrategy,
          };
          const act = aiChooseAction(cur.hands[A], deps, situation);
          if (act.action === 'declare') {
            setState({ round: declareTsumo(cur, deps) });
            onRoundEnd();
          } else {
            setState({ round: discardStep(cur, act.card) });
            advance();
          }
        }, aiThink());
      }
      // 플레이어면 입력 대기 (버튼은 handUI가 그림)
      return;
    }

    if (round.phase === 'awaitSteal') {
      const st = stealCheck(round, deps);
      if (!st) {
        setState({ round: passSteal(round) });
        advance();
        return;
      }
      if (st.taker === A) {
        clearTimeout(aiTimer);
        aiTimer = setTimeout(() => {
          const cur = getState().round;
          if (!cur || cur.phase !== 'awaitSteal') return;
          if (aiWantsSteal()) {
            setState({ round: declareSteal(cur, deps) });
            onRoundEnd();
          } else {
            setState({ round: passSteal(cur) });
            advance();
          }
        }, aiThink());
        return;
      }
      // 내가 뺏을 수 있음 → 프롬프트 띄우고 입력 대기
      showStealPrompt(getState(), {
        card: round.lastDiscard.card,
        yaku: st.best.yaku,
        score: st.best.score,
      });
      return;
    }
  }

  function aiThink() {
    const { thinkMsMin, thinkMsMax } = cfg.ai;
    return thinkMsMin + Math.random() * (thinkMsMax - thinkMsMin);
  }

  function onRoundEnd() {
    const s = getState();
    const round = s.round;
    if (!round || round.phase !== 'ended') return;
    const match = applyRoundResult(s.match, round.result, cfg);
    setState({ match });
    setTimeout(() => {
      if (match.over) showMatchEnd(getState());
      else showRoundEnd(getState());
    }, 200);
  }

  // ---- intent 배선 ----
  on('intent:discard', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    const i = s.ui.selectedIndex;
    if (i == null) return;
    const cardId = round.hands[P][i];
    setState({
      round: discardStep(round, cardId),
      ui: { ...s.ui, selectedIndex: null },
    });
    advance();
  });

  on('intent:declare', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    if (!tsumoCheck(round, deps)) return;
    setState({ round: declareTsumo(round, deps) });
    onRoundEnd();
  });

  on('intent:steal', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.phase !== 'awaitSteal') return;
    if (!stealCheck(round, deps)) return;
    hideOverlay();
    setState({ round: declareSteal(round, deps) });
    onRoundEnd();
  });

  on('intent:pass-steal', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.phase !== 'awaitSteal') return;
    hideOverlay();
    setState({ round: passSteal(round) });
    advance();
  });

  // ---- 특수 능력 intent 배선 ----
  // 예언서: 뽑기 전, 다음 n장 미리보기. draw 페이즈 유지(플레이어가 뽑기/복선 선택).
  on('intent:foresight', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'draw') return;
    if (!canUse(round.abilities[P], 'foresight')) return;
    const n = (cfg.abilities && cfg.abilities.foresight && cfg.abilities.foresight.peek) || 3;
    const { round: r2, peek } = useForesight(round, deps, n);
    setState({ round: r2, ui: { ...s.ui, abilityMode: 'foresight', foresightPeek: peek } });
  });

  // 뽑기: 조건부 정지에서 정상 뽑기로 진행(정지를 끝낸다).
  on('intent:draw', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'draw') return;
    setState({ ui: { ...s.ui, abilityMode: null, foresightPeek: null } });
    const r2 = drawStep(getState().round, deps);
    setState({ round: r2 });
    if (r2.phase === 'ended') { onRoundEnd(); return; }
    setTimeout(advance, cfg.tempo.drawMs);
  });

  // 복선: 회수 모드 진입 → 내 버림패 선택 → commit.
  on('intent:foreshadow-start', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'draw') return;
    if (!(canUse(round.abilities[P], 'foreshadow') && round.discards[P].length > 0)) return;
    setState({ ui: { ...s.ui, abilityMode: 'foreshadow', foresightPeek: null } });
  });

  on('intent:foreshadow-commit', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'draw') return;
    const idx = s.ui.foreshadowIndex;
    if (idx == null) return;
    const r2 = useForeshadow(round, deps, idx); // 손패 7→8, decide로, 산 불변
    setState({ round: r2, ui: { ...s.ui, abilityMode: null, foreshadowIndex: null } });
    advance();
  });

  // 각색: 버릴 카드를 고른 상태에서 시작 → 장르 선택 → commit.
  on('intent:adapt-start', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    if (!canUse(round.abilities[P], 'adapt')) return;
    if (s.ui.selectedIndex == null) return; // 바꿀 손패를 먼저 선택해야 함
    setState({ ui: { ...s.ui, abilityMode: 'adapt', adaptIndex: s.ui.selectedIndex } });
  });

  on('intent:adapt-commit', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    const idx = s.ui.adaptIndex;
    const genre = s.ui.adaptGenre;
    if (idx == null || !genre) return;
    const r2 = useAdapt(round, deps, idx, genre);
    setState({ round: r2, ui: { ...s.ui, abilityMode: null, adaptIndex: null, adaptGenre: null, selectedIndex: null } });
  });

  on('intent:ability-cancel', () => {
    const s = getState();
    setState({ ui: { ...s.ui, abilityMode: null, foresightPeek: null, adaptIndex: null, adaptGenre: null, foreshadowIndex: null } });
  });

  on('intent:next-round', () => startRound());
  on('intent:rematch', () => startMatch());

  startMatch();
  maybeAutoStart();
}

boot();
