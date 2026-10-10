# Meetple Admin

> 신고 증거와 AI 분석, 운영 정책을 함께 확인하고 관리자가 최종 제재를 승인하는 React 운영 콘솔

Meetple 전체 구성과 저장소 링크는 [프로젝트 허브](https://github.com/taemin3/meetple)에서 확인할 수 있습니다.

## 주요 기능

- 관리자 로그인과 access token 재발급
- 신고 유형·처리 상태·분석 상태 필터와 pagination
- 신고 원문, 증거, AI 분석, 정책 근거, 기존 제재 이력 통합 조회
- 신고 기각, 경고, 기간 정지, 영구 정지, 모임 강제 삭제 승인
- 모임 강제 삭제와 모임장 추가 정지를 한 번의 요청으로 처리
- 제재 해제와 강제 삭제된 모임 복구
- 운영 정책 등록, 새 버전 생성, 조항 관리와 활성·비활성 전환
- 정책별 임베딩 준비 상태 확인

AI 추천은 참고 정보입니다. 실제 증거와 정책 근거를 확인한 관리자가 최종 action을 선택하며, 권한 검증과 제재 실행은 Spring Backend가 담당합니다.

## 기술 구성

| 구분 | 기술 |
| --- | --- |
| UI | React 19, TypeScript, MUI, Emotion |
| Server State | TanStack Query |
| Build | Vite, pnpm |
| Test | Vitest, Testing Library, jsdom |

## 화면 흐름

```text
관리자 로그인
   ↓
신고 목록 필터·조회
   ↓
신고 상세
   ├─ 신고 및 증거 원문
   ├─ AI 분석과 추천 제재
   ├─ 운영 정책 근거
   └─ 현재 대상 상태와 제재 이력
   ↓
관리자 최종 승인 → Spring Backend → 제재 또는 복구
```

운영 정책은 기존 원문을 덮어쓰지 않고 새 버전으로 생성합니다. 신규 정책과 새 버전은 비활성 상태로 저장되며, 모든 조항의 임베딩이 준비된 뒤에만 활성화할 수 있습니다.

## 주요 구조

```text
src/
  App.tsx                 로그인, 신고 목록·상세, 제재 승인
  PolicyManagement.tsx    운영 정책과 버전 관리
  api.ts                  Backend API client와 token 재발급
  types.ts                API 요청·응답 계약
  main.tsx                QueryClient와 MUI 초기화
  styles.css              공통 화면 스타일
```

## 로컬 실행

Node.js `22.23.2`와 pnpm을 사용합니다.

```powershell
nvm use 22.23.2
pnpm install
pnpm dev
```

개발 서버는 `/api` 요청을 기본적으로 `http://localhost:8080`으로 전달합니다. 다른 Backend를 사용할 때는 `.env.example`을 복사해 `VITE_DEV_API_TARGET`을 변경합니다.

```text
VITE_API_BASE_URL=
VITE_DEV_API_TARGET=http://localhost:8080
```

`VITE_API_BASE_URL`을 비워 두면 배포 빌드도 같은 origin의 `/api`를 사용합니다. AWS 정적 호스팅과 `/api/*` CloudFront origin 구성은 [Backend Terraform 문서](https://github.com/taemin3/meetple-backend/tree/main/infra/terraform)에서 관리합니다.

## 인증과 데이터 보호

- Access Token과 Refresh Token은 브라우저 탭이 닫히면 제거되는 `sessionStorage`에만 저장합니다.
- 로그아웃·최종 401·계정 전환 시 token과 이전 관리자의 Query cache를 제거합니다.
- 신고 원문, 채팅 증거, 이메일과 회원 식별 정보는 로그·URL query·장기 저장소에 기록하지 않습니다.
- 401은 인증 만료, 403은 관리자 권한 부족으로 구분합니다.
- UI에서 버튼을 숨기는 것은 권한 검증이 아니며 Spring Security가 최종 책임을 집니다.

## 검증

```powershell
pnpm test
pnpm build
```

테스트는 API 계약, token 재발급, 필터·pagination, action 선택, 중복 승인 방지와 Query 갱신을 확인합니다. 테스트와 정적 build 통과만으로 실제 Backend 권한과 배포 환경의 E2E가 검증됐다고 보지 않습니다.

## 관련 저장소

- [Meetple Backend](https://github.com/taemin3/meetple-backend)
- [Meetple AI](https://github.com/taemin3/meetple-ai)
- [Meetple App](https://github.com/taemin3/meetple-app)
