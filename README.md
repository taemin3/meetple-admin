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

## 스테이징 배포

관리자 웹은 ECS 태스크가 아니라 비공개 S3 bucket에 정적 파일을 저장하고 CloudFront로 제공합니다. `/api/*` 요청은 CloudFront가 Spring Backend HTTPS origin으로 전달하므로 스테이징 빌드의 `VITE_API_BASE_URL`은 비워 둡니다.

Terraform output 4개는 GitHub의 `staging` Environment variable로 등록합니다. 자동 배포 여부는 job 시작 전에 평가되므로 `AUTO_DEPLOY_ENABLED`만 repository variable로 등록합니다.

| Variable | Terraform output |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `github_actions_admin_deploy_role_arn` |
| `ADMIN_BUCKET_NAME` | `admin_bucket_name` |
| `ADMIN_CLOUDFRONT_DISTRIBUTION_ID` | `admin_cloudfront_distribution_id` |
| `ADMIN_CLOUDFRONT_DOMAIN_NAME` | `admin_cloudfront_domain_name` |
| `AUTO_DEPLOY_ENABLED` | **Repository variable**. `true`이면 `main` push 후 자동 배포, 아니면 수동 배포만 허용 |

`.github/workflows/deploy-staging.yml`은 테스트와 빌드가 성공한 뒤 GitHub OIDC로 AWS 역할을 맡고 `dist/`를 S3에 동기화합니다. 이후 CloudFront cache를 무효화하고 `/`와 `/reports`의 SPA 응답을 확인합니다. AWS access key나 애플리케이션 secret은 GitHub에 저장하지 않습니다.
