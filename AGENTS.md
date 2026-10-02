# Meetple Admin 작업 가이드

이 문서는 `meetple-admin` 저장소에서 구현, 검증, PR 리뷰를 수행할 때 지켜야 할 기준이다.

## 저장소

- GitHub: https://github.com/taemin3/meetple-admin
- 로컬 경로: `C:\project\meetple\admin`
- 별도 Git 저장소이므로 Git 명령은 반드시 이 폴더에서 실행한다.
- Spring API는 `C:\project\meetple\backend`, AI 서버는 `C:\project\meetple\ai`의 계약을 따른다.

## 역할과 범위

`meetple-admin`은 관리자가 신고와 AI 분석 결과를 검토하고 최종 제재를 승인하는 운영 콘솔이다.

- AI 분석과 추천은 참고 정보이며 최종 제재의 근거가 될 뿐 자동 승인으로 바꾸지 않는다.
- 회원 정지, 영구 정지, 모임 강제 삭제, 제재 해제와 복구는 Spring 관리자 API를 통해서만 실행한다.
- 브라우저에서 AI 서버나 LLM을 직접 호출하지 않는다.
- 백엔드 계약 변경이 필요하면 프론트에서 추측해 우회하지 말고 영향 범위를 함께 보고한다.
- 과거 사례 RAG나 일반 사용자 화면처럼 현재 관리자 콘솔과 무관한 기능을 섞지 않는다.

## 기술 스택과 명령

- Node.js 22.23.2
- React 19 + TypeScript
- Vite
- TanStack Query
- MUI
- Vitest
- 패키지 매니저: pnpm

```powershell
pnpm install
pnpm dev
pnpm test
pnpm build
```

변경 후 가능한 경우 `pnpm test`와 `pnpm build`를 모두 실행한다. 실행하지 못한 검증과 이유는 최종 보고에 명시한다.

## 현재 구조

```text
src/
  App.tsx       관리자 화면과 상태 흐름
  api.ts        인증 및 Backend API 클라이언트
  types.ts      Backend 요청·응답 계약
  main.tsx      QueryClient와 MUI 설정
  styles.css    화면 스타일
```

구조 분리는 실제 재사용이나 복잡도 감소가 있을 때만 수행한다. 작은 변경을 이유로 파일과 추상화를 불필요하게 늘리지 않는다.

## API와 상태 관리 규칙

- 기본 API prefix는 `/api/v1`이다.
- 공통 응답은 Backend의 `ApiResponse<T>`와 `PageResponse<T>` 계약을 그대로 따른다.
- 상태값과 action 이름은 Java enum과 정확히 일치시킨다. 프론트 전용 별칭을 API payload에 보내지 않는다.
- 목록 필터 변경 시 페이지를 0으로 되돌리고, 결과 수가 줄면 마지막 유효 페이지로 보정한다.
- mutation 성공 후 영향받는 목록과 상세 query를 함께 갱신한다.
- 제재 모달은 열릴 때 현재 서버 상태에서 가능한 action을 다시 계산한다. 이전 신고의 선택값이나 사유를 재사용하지 않는다.
- 중복 클릭과 처리 중 닫기를 막고, 성공 여부가 확인되기 전에 성공 화면을 표시하지 않는다.
- 동일한 401에 대한 token reissue는 하나로 합치며, 재발급도 실패하면 로그인 상태와 Query 캐시를 함께 제거한다.
- 로그아웃 또는 계정 전환 시 이전 관리자의 신고·증거·정책 query가 남지 않게 QueryClient 캐시를 비운다.
- 403은 관리자 권한 부족으로, 401은 만료된 인증으로 구분해 처리한다.

## 인증과 개인정보 보호

- Access Token, Refresh Token, 비밀번호, API 키, 서비스 키를 코드·로그·문서에 기록하지 않는다.
- 실제 `.env` 파일은 커밋하지 않고 공개 가능한 키 이름만 `.env.example`에 둔다.
- 현재 token 저장 방식은 `sessionStorage` 계약을 유지하되 로그아웃·만료 시 즉시 제거한다.
- 신고 설명, 채팅 증거, 이메일, 회원 식별 정보는 로그, URL query, analytics에 남기지 않는다.
- 관리자 화면에 표시한 증거를 브라우저의 장기 저장소나 별도 캐시에 복제하지 않는다.
- 서버가 반환한 HTML을 직접 렌더링하지 않는다. 외부 입력은 기본 React escaping을 유지한다.
- ADMIN 권한 검증은 UI 숨김이 아니라 Spring Security가 최종 책임진다.

## UI 구현 규칙

- AI 추천보다 실제 증거, 정책 근거, 현재 대상 상태를 먼저 확인할 수 있게 한다.
- 영구 정지와 강제 삭제 같은 되돌리기 어려운 action은 명확한 위험 표시와 승인 단계를 유지한다.
- loading, empty, error, 401, 403 상태를 구분한다.
- 클릭 가능한 요소는 키보드 접근과 focus 상태를 제공한다.
- 모바일 폭에서도 핵심 검토 정보와 승인 버튼이 가려지지 않게 확인한다.
- 새 의존성은 기존 React, TanStack Query, MUI로 해결하기 어려울 때만 추가한다.

## 테스트 기준

- API 변경: 경로, method, header, payload, 응답 필드 테스트
- 인증 변경: login, reissue, 최종 401, logout, 계정 전환 캐시 제거 테스트
- 제재 변경: 대상 유형별 가능한 action과 위험 action 표시 테스트
- 목록 변경: 필터, pagination, 결과 감소 후 page 보정 테스트
- mutation 변경: 중복 실행 방지와 관련 query 갱신 테스트
- 버그 수정: 재현 조건을 고정하는 회귀 테스트를 우선 추가

테스트 통과만으로 실제 Backend 연동이나 관리자 권한 E2E가 검증됐다고 표현하지 않는다.

## Git과 PR 작업 방식

- 작업 시작 전에 `git status --short --branch`를 확인한다.
- 사용자의 기존 변경과 미커밋 파일을 삭제하거나 덮어쓰지 않는다.
- `main`에 직접 push하지 않고 `type/short-description` 형식의 기능 브랜치를 사용한다.
- 관련 없는 리팩터링과 의존성 업데이트를 기능 변경에 섞지 않는다.
- 커밋 메시지는 `feat:`, `fix:`, `test:`, `docs:`, `refactor:` 형식을 사용한다.
- Codex는 구현, 테스트, 커밋, push까지 수행한다. PR 생성과 merge는 사용자가 명시적으로 요청한 경우에만 수행한다.
- PR 리뷰 반영은 타당한 지적만 최소 범위로 수정하고 같은 브랜치에 push한다.
- PR 본문에는 작업 내용, 테스트 결과, 리뷰 포인트, 검증하지 못한 항목을 포함한다.

## Code Review Rules

- 리뷰 요약과 인라인 코멘트는 한국어로 짧고 명확하게 작성한다. 코드 식별자, 타입, API 경로는 원문 영어를 유지한다.
- 현재 diff에서 실제로 발생 가능한 버그, 보안 문제, API 계약 불일치, 테스트 누락을 우선한다.
- 중요도 순서는 다음을 기준으로 한다.
  1. 다른 관리자에게 이전 계정의 신고·증거가 노출되는 인증·캐시 격리 문제
  2. 잘못된 회원이나 모임에 제재가 실행되거나 같은 action이 중복 실행되는 문제
  3. Backend 경로, enum, payload, pagination, 인증 header 불일치
  4. token, 신고 원문, 채팅 증거, 개인정보의 로그·URL·저장소 노출
  5. stale query, 잘못된 invalidation, 401/403 오처리로 화면 상태가 서버와 달라지는 문제
  6. loading/error/empty 처리, 접근성, 반응형 UI의 명확한 회귀
- AI 추천을 그대로 실행하거나 위험 action을 기본 승인하는 변경을 지적한다.
- 클라이언트의 버튼 숨김을 권한 검증으로 간주하는 변경을 지적한다.
- 단순 취향, 대규모 구조 변경, 현재 PR과 무관한 개선 제안은 blocking finding으로 올리지 않는다.
- lockfile이나 생성 파일 자체를 문제 삼지 말고 실제 버전·보안·빌드 영향이 있을 때만 지적한다.
- finding에는 재현 조건, 사용자 영향, 수정 방향을 포함하고 가능한 한 정확한 변경 라인에 남긴다.
- 문제가 없으면 억지 코멘트를 만들지 말고 검증한 범위와 남은 위험만 요약한다.
