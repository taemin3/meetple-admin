# Meetple Admin

Meetple 신고 검토, 관리자 제재 승인과 운영 정책 버전 관리를 위한 React 관리자 콘솔입니다.

운영 정책은 기존 원문을 수정하지 않고 새 버전으로 생성합니다. 신규 정책과 새 버전은 비활성 상태로 저장되며, Backend의 임베딩 동기화 작업이 완료된 뒤에만 활성화할 수 있습니다.

## 실행

```powershell
nvm use 22.23.2
pnpm install
pnpm dev
```

개발 서버는 `/api` 요청을 기본적으로 `http://localhost:8080`으로 전달합니다. 다른 Backend를 사용할 때는 `.env.example`을 복사해 `VITE_DEV_API_TARGET`을 변경합니다. 배포 시 `VITE_API_BASE_URL`을 비워 두면 같은 Origin의 `/api`를 사용합니다.

## 검증

```powershell
pnpm test
pnpm build
```

Access Token과 Refresh Token은 브라우저 탭이 닫히면 제거되는 `sessionStorage`에만 저장하며 로그로 출력하지 않습니다.
