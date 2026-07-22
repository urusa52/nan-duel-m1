// main.js — 조립·배선만. 진행 규칙은 logic/, 표시는 render/, 입력은 input/.
import { getState, setState, subscribe } from './core/store.js';
import { on } from './core/eventBus.js';
import { makeRng, buildWall, shuffle } from './logic/wall.js';
import { makeCardMap, makeBondSet } from './logic/handEval.js';
import { makeYakuEvaluator } from './logic/yakuEval.js';
import {
  P, A, newRound, drawStep, tsumoCheck, declareTsumo,
  discardStep, stealCheck, declareSteal, passSteal,
} from './logic/duel.js';
import { newMatch, applyRoundResult } from './logic/match.js';
import { aiChooseAction, aiWantsSteal } from './logic/ai.js';
import { initTable, renderTable } from './render/table.js';
import { initHandUI, renderHand } from './render/handUI.js';
import { initCutin, hideOverlay, showStealPrompt, showRoundEnd, showMatchEnd } from './render/cutin.js';
import { initHud, renderHud } from './render/hud.js';
import { initControls } from './input/controls.js';

async function loadJson(path) {
  const res = await fetch(path);
  return res.json();
}

async function boot() {
  const [cfg, cardsData, bondsData, yakuData] = await Promise.all([
    loadJson('./src/data/config.json'),
    loadJson('./src/data/cards.json'),
    loadJson('./src/data/bonds.json'),
    loadJson('./src/data/yaku.json'),
  ]);

  const cardMap = makeCardMap(cardsData);
  const bondSet = makeBondSet(bondsData);
  const allCardIds = cardsData.cards.map((c) => c.id);
  const evalHand = makeYakuEvaluator(yakuData, cardMap, bondSet);
  const deps = { cardMap, bondSet, allCardIds, evalHand };
  const dataBundle = { cfg, cardsData, bondsData, cardMap };

  initTable(dataBundle);
  initHandUI(dataBundle, deps);
  initCutin(dataBundle);
  initHud();
  initControls();

  let rng = makeRng(Date.now() % 2147483647);
  let aiTimer = null;

  function renderAll(s) {
    renderHud(s);
    renderTable(s);
    renderHand(s);
  }
  subscribe(renderAll);

  function startMatch() {
    const match = newMatch(cfg);
    setState({ cfg, match, round: null, ui: { selectedIndex: null, showCounts: false } });
    startRound();
  }

  function startRound() {
    const s = getState();
    const wall = shuffle(buildWall(allCardIds, cfg.copiesPerCard), rng);
    const round = newRound(wall, s.match.firstTurn);
    hideOverlay();
    setState({ round, ui: { ...s.ui, selectedIndex: null } });
    advance();
  }

  // 진행 엔진: 현재 페이즈를 보고 자동 진행이 필요한 부분만 민다.
  // 플레이어 입력이 필요한 지점(내 decide, 내 뺏기 결정)에서는 멈춘다.
  function advance() {
    const s = getState();
    let round = s.round;
    if (!round || round.phase === 'ended') { onRoundEnd(); return; }

    if (round.phase === 'draw') {
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
          const act = aiChooseAction(cur.hands[A], deps);
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

  on('intent:next-round', () => startRound());
  on('intent:rematch', () => startMatch());

  startMatch();
}

boot();
