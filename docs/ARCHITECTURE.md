# 아키텍처 제안 — M1' 대국 코어

> 구상정리 마스터 v1 (D1~D36) 기반.
> 이 제안을 유저가 확정하면 ARCHITECTURE.md로 승격하고 구현을 시작한다.
> 원칙: 상태는 store 한 곳 / 모듈은 이벤트로 통신 / 수치는 데이터 / 로직은 순수함수.

## 1. 파일 구조

```
game/
  index.html
  css/style.css
  src/
    data/
      config.json      밸런스 전부: 손패 수(8), 산 종당 매수(3),
                       목표점, 유국 소점, matchMode(선취/고정국) 등
      cards.json       카드 20종 (장르 5 × 단계 4), 대표 사연 필드
      bonds.json       인연 짝 정의 (대표 4~6명, 2~3쌍)
      yaku.json        가산역 10종 (조건 id + 점수)
    logic/             전부 순수함수 (DOM·상태 접근 금지)
      wall.js          산: 생성(구성표→덱), 셔플(시드 rng), 뽑기,
                       남은 장수 집계
      handEval.js      완성형 판정: 8장 → [세트,세트,짝] 분해 탐색,
                       텐파이 판정(무엇이 오면 완성인지 대기 카드 목록)
      yakuEval.js      가산역 판정·합산, 최소 1역 체크(D35)
      duel.js          한 국의 상태 머신: 뽑기→버리기→운명뺏기 확인
                       →다음 턴→유국(D34)
      match.js         라운드 누적, 선취 목표점/고정 국수 분기(D36)
      ai.js            상대 AI v1: 손패 평가 기반 버리기 선택
                       (규칙 기반, 난이도는 config)
    core/
      store.js         (기존 계승) 단일 상태 저장소
      eventBus.js      (기존 계승) 모듈 간 이벤트 통신
    render/
      table.js         대국 화면: 산 잔량, 양측 버림패, 상대 영역
      handUI.js        내 손패 + 자동 판정 표시(D33):
                       성립 세트 하이라이트, 텐파이·대기 카드, 성립 역
      cutin.js         하이라이트 연출: 선언·운명 뺏기·역만 컷인
                       (M1'은 자리만, M3에서 고도화)
      hud.js           점수판, 라운드 진행
    input/
      controls.js      버릴 카드 선택, 선언/운명 뺏기 버튼
    main.js            조립·배선만
  test/
    headless.mjs       로직 단위 테스트 (wall/handEval/yakuEval/duel/match)
    smoke.mjs          배선 통합 테스트
```

## 2. 상태(store) 구조 초안

```
match:  { playerScore, aiScore, round, mode }
round:  { wall, turn(player|ai), phase(draw|discard|claim|ended),
          winner, endReason(declare|steal|draw) }
player: { hand[], discards[] }
ai:     { hand[](비공개), discards[] }
ui:     { tenpai, waitingCards[], liveYaku[], liveSets[] }
```

상태 변경은 duel.js/match.js가 계산한 결과를 store에 반영하는
정해진 경로로만 (렌더·입력은 읽기와 이벤트 발행만).

## 3. 핵심 난제와 접근

- handEval의 8장 분해: 세트 후보(장르 3장 / 서사 순서 3장)와 짝 후보를
  전수 탐색. 8장이라 조합 수가 작아(수백 수준) 브루트포스로 충분.
  텐파이 판정은 "손패 7장 + 가상의 1장"을 20종에 대해 돌려 대기 목록 산출.
- 운명 뺏기 판정: 상대가 버린 직후, 내 손 7장(방금 버린 상태) + 그 카드로
  완성+1역이 되는지 handEval·yakuEval 재사용.
- AI v1: ①버릴 카드 = 제거 시 텐파이 거리(부족 장수)가 가장 안 나빠지는 것
  ②완성 가능하면 즉시 선언. 수읽기·방어는 M2로.

## 4. 구현 순서 (모듈 단위, 각 단계마다 테스트)

1. data 4종 (config/cards/bonds/yaku)
2. wall.js + 테스트
3. handEval.js + 테스트 (가장 큼 — 세트 분해·텐파이)
4. yakuEval.js + 테스트 (역 10종 각각)
5. duel.js + match.js + 테스트 (한 국이 끝까지 돈다)
6. ai.js + 테스트 (헤드리스로 AI끼리 1,000국 완주)
7. render/input/main 배선 + smoke 테스트
8. 배포 (hero-card 저장소, 기존 게임은 legacy/ 폴더로 보존)

## 5. 기존 코드 재사용

- 그대로 계승: store.js, eventBus.js, 테스트 러너 방식, 연출 유틸 일부
- 참고만: 기존 gacha/yaku/scoring/round (구조는 다르나 패턴 재활용)
- 보존: 기존 게임 전체를 legacy/로 이동 (커밋 기록 유지, 삭제 금지)
