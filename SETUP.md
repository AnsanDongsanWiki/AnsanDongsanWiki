# 동산위키 설치와 운영

이 버전은 HTML/CSS/JavaScript + Vite + Supabase입니다. 별도 Next.js 전환 없이 Vercel에 배포합니다. 회원은 이메일·비밀번호로 가입하며, 문서에는 닉네임이 표시됩니다.

## 1. Supabase 생성

1. 운영진 소유 Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/migrations/202611080001_wiki.sql` 전체를 **한 번** 실행합니다. 기존 동명의 테이블이 없는 새 프로젝트 기준입니다.
3. Authentication → Providers에서 Email 로그인을 활성화하고 **Confirm email을 켭니다**. Password 최소 길이도 12자 이상으로 설정합니다. 화면 검증과 별개로 서버 설정이 필요합니다.
4. Project URL과 **publishable key**(또는 기존 anon key)를 확인합니다. `service_role` / secret key / DB 비밀번호는 프런트엔드 환경 변수에 절대 넣지 않습니다.
5. Authentication → URL Configuration에서 Site URL을 실제 배포 주소로 지정합니다. Redirect URLs에도 실제 사이트 루트 URL과 개발 주소 `http://localhost:5173/`를 추가합니다. 개발 서버가 다른 포트를 사용하면 그 주소도 등록합니다.
6. 실제 학생들에게 가입 메일·복구 메일을 보내려면 **Custom SMTP**를 설정하고 발신 도메인을 인증합니다. 기본 메일 발송은 테스트용으로 제한됩니다. 발송량 제한·가입 제한도 프로젝트에 맞게 설정합니다.

## 2. 로컬 실행

Node.js 22.12 이상 또는 24 LTS를 사용합니다.

```sh
npm ci
cp .env.example .env
npm run dev
```

`.env`에 프로젝트 URL과 공개 키를 입력합니다. 구글폼 제안 경로가 준비되면 `VITE_SUGGESTION_URL`에 실제 폼 주소를 입력합니다. 미설정 시 제안 버튼은 숨겨집니다. `.env`는 Git에 올라가지 않습니다. 공개 키는 빌드 결과에 포함되는 정상적인 키이며, 데이터 보호는 DB의 RLS와 접근 권한이 담당합니다.

## 3. 첫 관리자 지정

사이트에서 회원가입하고 인증 이메일 링크를 눌러 인증한 뒤, Supabase SQL Editor에서 다음 쿼리를 실행합니다. 이메일을 실제 총괄 계정으로 바꿔 주세요.

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users
  where lower(email) = lower('YOUR_EMAIL@example.com')
    and email_confirmed_at is not null
);
```

화면을 새로고침하면 권한 관리 메뉴가 생깁니다. 일반 회원 → 편집자는 웹에서 관리자가 승인합니다. 관리자 추가·해제는 SQL Editor에서만 합니다. 계정을 공유하는 대신 담당자별 계정을 만들고 인수인계 시 역할을 이전하세요.

## 4. Vercel 배포

1. 변경 파일을 GitHub 저장소의 작업 브랜치에 올리고 검토 후 병합합니다.
2. Vercel에서 해당 저장소를 Import합니다. Framework는 Vite, Build Command는 `npm run build`, Output Directory는 `dist`입니다. `vercel.json`에도 지정되어 있습니다.
3. Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, 필요 시 `VITE_SUGGESTION_URL`을 입력합니다.
4. Deploy 후 생성된 실제 주소를 Supabase Site URL / Redirect URLs에 반영합니다. 환경 변수를 바꾸면 재배포해야 합니다.
5. Preview 배포를 인증 테스트에 사용할 경우 **해당 주소만** Redirect URLs에 추가합니다. 운영 환경에는 불필요한 와일드카드를 쓰지 않습니다.

GitHub Pages를 유지하려면 프로젝트 하위 경로에 맞춘 Vite `base`와 별도 Pages 빌드 작업이 필요합니다. 이 커밋은 요청한 Vercel 배포 기준입니다.

## 5. 권한과 문서 저장

- 방문자: 공개 문서와 수정 이력 읽기
- 일반 회원(reader): 위와 동일. 이메일 인증은 재학생 인증이 아닙니다.
- 편집자(editor): 문서 작성·수정, 이력 조회
- 관리자(admin): 편집 기능 + 일반 회원/편집자 역할 변경
- 회원 목록은 본인/관리자만 읽을 수 있습니다. 이메일은 public 테이블에 복사하지 않습니다.
- 비밀번호는 Supabase Auth에서 처리하며 문서 테이블에 저장하지 않습니다.
- 문서와 이력은 `save_page` DB 함수로 한 번에 저장합니다. 다른 운영진이 같은 버전을 먼저 수정했다면 저장을 거부해 덮어쓰기를 막습니다.
- 본문은 일반 텍스트입니다. 임의 HTML, Markdown 실행은 지원하지 않습니다.
- 문서 삭제·파일 업로드·이력 복구 버튼·회원 탈퇴·닉네임 변경·전체 관리자 목록 페이지네이션은 이 버전 범위에 없습니다. 수정 이력은 최근 50개, 관리자 화면은 최근 500명입니다. 대규모 운영 전 확장하세요.
- 구글폼 제안 → 운영진 검토 → 위키 게시 원칙을 유지합니다. 학생용 문서 직접 편집은 열지 않습니다.

## 6. 확인

```sh
npm test
npm run build
```

자동 검사는 실제 PostgreSQL 엔진(PGlite)에서 DB 권한을 확인합니다. 실제 Supabase/메일/Vercel 접속 시험을 대신하지 않습니다. 연결 후에는 다음을 확인하세요.

1. 회원가입 → 이메일 인증 → 로그인 → 로그아웃
2. 비밀번호 찾기 → 이메일 링크 → 새 비밀번호 → 새 비밀번호 로그인
3. 일반 회원 계정으로 직접 API 문서 저장/역할 변경이 거부되는지
4. 편집자 승인 후 작성 → 수정 → 이력 조회
5. 두 탭에서 같은 문서 수정 시 오래된 버전의 저장 거부
6. 관리자만 권한 관리 가능, 일반 계정의 역할 자동 상승 불가

## 공식 문서

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-smtp
- https://vercel.com/docs/frameworks/frontend/vite
