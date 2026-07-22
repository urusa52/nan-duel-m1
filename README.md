# 우리는 아직 『 』입니다 — 대국 (C-Plan Duel M1)

NAN 게임 제작 해커톤 출품작. 순수 클라이언트(HTML/CSS/JS)로 동작하는
1:1 이야기 대국 게임입니다. 별도 서버 없이 GitHub Pages 정적 배포로 실행됩니다.

## 실행
- 배포된 페이지에서 바로 플레이할 수 있습니다.
- 로컬에서 볼 때는 정적 서버가 필요합니다(ES 모듈 사용):
  `npx serve` 또는 `python -m http.server` 후 `index.html` 접속.

## 구조
- `index.html` — 진입점
- `css/` — 스타일
- `src/core/` — 상태(store) · 이벤트버스
- `src/logic/` — 규칙(대국/손패평가/역/산/AI)
- `src/render/` — 화면 렌더링
- `src/input/` — 입력 처리
- `src/data/` — 밸런스·텍스트·레벨 데이터(JSON)
- `test/` — 헤드리스 스모크 테스트
- `docs/ARCHITECTURE.md` — 구조 설명

## 테스트
`node test/smoke.mjs`
