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
import { aiChooseAction, aiWantsSteal, aiChooseAbility } from './logic/ai.js';
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
  const dataBundle = { cfg, cardsData, bondsData, cardMap, yakuData, abilities: abilitiesData.abilities };
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
  const ABILITY_UI_RESET = { abilityMode: null, foresightPeek: null, adaptIndex: null, adaptGenre: null, foreshadowIndex: null, aiFlash: null };

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


  // 진행 엔진: 현재 페이즈를 보고 자동 진행이 필요한 부분만 민다.
  // 플레이어 입력이 필요한 지점(내 decide, 내 뺏기 결정)에서는 멈춘다.
  function advance() {
    const s = getState();
    let round = s.round;
    if (!round || round.phase === 'ended') { onRoundEnd(); return; }

    if (round.phase === 'draw') {
      round = drawStep(round, deps);
      // 내 턴이면 방금 뽑은 카드를 자동 선택 (마작식 — 뽑은 패가 기본 버림 후보).
      const patch = { round };
      if (round.phase === 'decide' && round.turn === P) {
        patch.ui = { ...getState().ui, selectedIndex: round.hands[P].length - 1 };
      }
      setState(patch);
      if (round.phase === 'ended') { onRoundEnd(); return; } // 유국
      // decide로 넘어감 — 잠깐의 템포 후 계속 (D2 빠른 템포)
      setTimeout(advance, cfg.tempo.drawMs);
      return;
    }

    if (round.phase === 'decide') {
      if (round.turn === A) {
        clearTimeout(aiTimer);
        aiTimer = setTimeout(() => {
          const cur0 = getState().round;
          if (!cur0 || cur0.phase !== 'decide' || cur0.turn !== A) return;
          // 능력 사용 시도 (v1: 즉시 완성되면 각색/복선). 잠깐 표시 후 선언.
          // config.abilities.aiUse: true=전부 / false=없음 / 배열=허용 능력 목록 (밸런스 레버).
          //   각색(adapt)은 즉시 완성 버튼이라 국을 너무 빨리 끝낸다 → 기본값에서 목록으로 제외.
          const aiUse = cfg.abilities ? cfg.abilities.aiUse : true;
          const aiAllow = Array.isArray(aiUse) ? new Set(aiUse) : null; // 배열이면 그 집합, 아니면 전부
          const choice = (aiUse === false) ? null : aiChooseAbility(cur0, deps, aiAllow);
          if (choice) {
            let cur = cur0;
            let label = '';
            if (choice.id === 'adapt') { cur = useAdapt(cur0, deps, choice.index, choice.genre); label = '각색'; }
            else if (choice.id === 'foreshadow') { cur = useForeshadow(cur0, deps, choice.discardIndex); label = '복선'; }
            setState({ round: cur, ui: { ...getState().ui, aiFlash: label } });
            clearTimeout(aiTimer);
            aiTimer = setTimeout(() => {
              setState({ ui: { ...getState().ui, aiFlash: null } });
              const c2 = getState().round;
              if (!c2 || c2.phase !== 'decide' || c2.turn !== A) return;
              const best = deps.evalHand(c2.hands[A]);
              if (best && best.declarable) { setState({ round: declareTsumo(c2, deps) }); onRoundEnd(); }
              else aiDecideAct(); // 안전장치 (정상 흐름에선 도달 안 함)
            }, 850);
            return;
          }
          aiDecideAct();
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

  // AI가 decide에서 실제 행동(선언 or 버리기) 수행. 능력 사용 후/미사용 공통 경로.
  function aiDecideAct() {
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

  // ---- 특수 능력 intent 배선 (전부 뽑은 뒤 decide에서 사용) ----
  // 예언서: 산 위 n장 미리보기. 손패·산 불변, 사용 1 차감.
  on('intent:foresight', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    if (!canUse(round.abilities[P], 'foresight')) return;
    const n = (cfg.abilities && cfg.abilities.foresight && cfg.abilities.foresight.peek) || 3;
    const { round: r2, peek } = useForesight(round, deps, n);
    setState({ round: r2, ui: { ...s.ui, abilityMode: 'foresight', foresightPeek: peek } });
  });

  // 복선: 회수 모드 진입 → 내 버림패 선택 → commit.
  on('intent:foreshadow-start', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    if (!(canUse(round.abilities[P], 'foreshadow') && round.discards[P].length > 0)) return;
    setState({ ui: { ...s.ui, abilityMode: 'foreshadow', foresightPeek: null } });
  });

  on('intent:foreshadow-commit', () => {
    const s = getState();
    const round = s.round;
    if (!round || round.turn !== P || round.phase !== 'decide') return;
    const idx = s.ui.foreshadowIndex;
    if (idx == null) return;
    const r2 = useForeshadow(round, deps, idx); // 뽑은 카드 무르고 버림패 회수(손패 8·산 불변)
    // 회수 후엔 무엇을 버릴지 다시 고르게 선택 해제
    setState({ round: r2, ui: { ...s.ui, abilityMode: null, foreshadowIndex: null, selectedIndex: null } });
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
