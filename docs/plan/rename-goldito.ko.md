# 이름 변경: Pawddy → Goldito — 직접 해야 하는 일

> **2026-10-07** 리포 안의 이름은 모두 바꿨습니다 (앱 이름 · 문서 · 코드 · 테스트 · 설정). 아래는 **리포 밖(사이트 · 계정 · 이미지)이라 사람이 직접 해야 하는 일**과, **일부러 안 바꾼 것**입니다.
> 순서대로 하면 됩니다. 체크박스는 직접 표시하세요.

## 0. 리포에서 바뀐 것 (참고)

| 무엇 | 바뀐 값 |
| :--- | :--- |
| 앱 이름 (로그인 · Welcome · 프로필 문구 · 데스크톱 프레임 제목 · 동의서 템플릿 · 캘린더 일정 제목 · `.ics` 파일) | **Goldito** |
| `frontend/app.json` | `name: Goldito` · `slug: goldito` · `scheme: goldito` (딥링크 `goldito://`) |
| 패키지 이름 | `goldito-frontend` |
| 브라우저 저장 키 | `pawddy-auth` → `goldito-auth`, `pawddy:due-snoozes` → `goldito:due-snoozes` |
| Cloudinary 새 업로드 폴더 | `goldito/<pet_id>/<purpose>` |
| 백엔드 이름 · 로거 | `Goldito API` · `goldito.ai` |
| 문서 · README · DESIGN · CLAUDE · SQL 주석 · 테스트 문구 | 전부 Goldito |

## 1. 일부러 안 바꾼 것 (이유)

| 항목 | 이유 | 나중에 바꾸려면 |
| :--- | :--- | :--- |
| 데모 로그인 이메일 `demo-owner@pawddy.test` · `demo-sitter@pawddy.test` (코드 · 테스트 · 문서) | 호스팅 Supabase에 **이미 이 이메일로 계정이 있음**. 코드만 바꾸면 Try demo 로그인이 깨짐 | §2-5 |
| GitHub 주소 `github.com/minsikpaul92/Pawddy/…` (문서 · PR 템플릿 링크, `docs/plan/env-setup.ko.md`) | 저장소 이름을 바꾸기 **전**에 바꾸면 링크가 깨짐 (바꾼 뒤에는 GitHub이 옛 주소를 자동으로 새 주소로 넘겨 줌) | §2-1 뒤에 아래 명령 |
| Cloudinary 옛 폴더 `pawddy/…` · `pawnote/…` | 이미 올라간 사진 · 영상이 거기 있음. 백엔드는 `goldito` · `pawddy` · `pawnote` **셋 다** 읽음 | 필요 없음 (옛 파일은 그대로 보임) |
| `docs/CHANGELOG.md`의 이전 항목, "PawNote → Pawddy" 이력 문장 | 역사 기록 | — |
| `docs/plan/full-process.ko.md` 머리말의 "Pawddy Full Process" | 팀이 따로 갖고 있는 원본 PDF의 **제목** | 원본 PDF 이름을 바꿀 때 같이 |

## 2. 꼭 해야 하는 일 (순서대로)

### 2-1. GitHub 저장소 이름
- [ ] GitHub → `minsikpaul92/Pawddy` → **Settings → General → Repository name** → `Goldito` → Rename
- [ ] 로컬 remote 갱신:
  ```bash
  git remote set-url origin https://github.com/minsikpaul92/Goldito.git
  ```
- [ ] 문서의 옛 링크를 새 주소로 (저장소를 바꾼 **뒤에**, 한 번):
  ```bash
  git grep -l "minsikpaul92/Pawddy" | xargs sed -i '' 's#minsikpaul92/Pawddy#minsikpaul92/Goldito#g'
  ```
- [ ] 열려 있는 PR(#55, #56 등)은 저장소 이름이 바뀌어도 그대로 유지됨
- [ ] Vercel이 GitHub에 연결돼 있다면 연결이 끊기지 않았는지 확인 (보통 자동으로 따라감)

### 2-2. 내 컴퓨터의 폴더 이름
- [ ] Claude / 터미널 / 에디터를 닫고 `~/projects/Pawddy` → `~/projects/Goldito`
- [ ] 열어 둔 개발 서버 · Claude 세션은 새 경로로 다시 열기 (이전 세션의 메모리 · 작업 경로는 옛 이름에 묶여 있음)

### 2-3. Vercel (프론트 배포)
- [ ] Project → Settings → General → **Project Name** `goldito` (주소가 `goldito.vercel.app` 이 됨 — 이미 쓰는 이름이면 다른 이름)
- [ ] 새 주소를 **백엔드 `CORS_ORIGINS`** 에 추가 (옛 주소도 잠시 같이 둬도 됨)
- [ ] **Supabase Auth → URL Configuration**: Site URL · Redirect URLs를 새 주소로 (옛 주소는 전환 끝나면 삭제)
- [ ] 환경변수 이름은 안 바뀌었음 (`EXPO_PUBLIC_*`)

### 2-4. Supabase
- [ ] Project Settings → General → 프로젝트 이름 `Goldito` (프로젝트 ref `cnfnpiadlxajokpddgbi` 와 URL은 **그대로**, 앱 설정 변경 없음)
- [ ] Auth → Email Templates · SMTP 보낸 사람 이름에 "Pawddy"가 있으면 변경
- [ ] (선택) 새 가입자의 기본 표시 이름이 아직 **"Pawddy user"** 입니다 — `003_functions_triggers.sql`의 `handle_new_user` 안 문구는 파일에서만 "Goldito user"로 바뀌었고, 이미 적용된 DB 함수는 그대로. 바꾸려면 그 함수 블록만 SQL Editor에서 다시 실행 (`create or replace function public.handle_new_user …`)

### 2-5. 데모 로그인 이메일 (선택 — 안 해도 동작함)
`@pawddy.test` 도메인이 어색하면 **세 곳을 한꺼번에** 바꿔야 합니다. 하나라도 빠지면 Try demo가 깨집니다.
- [ ] Supabase SQL Editor:
  ```sql
  update auth.users set email = replace(email, '@pawddy.test', '@goldito.test') where email like '%@pawddy.test';
  update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(replace(identity_data->>'email', '@pawddy.test', '@goldito.test'))) where identity_data->>'email' like '%@pawddy.test';
  ```
- [ ] 코드 · 문서 · 테스트 일괄:
  ```bash
  git grep -l "@pawddy.test" | xargs sed -i '' 's#@pawddy.test#@goldito.test#g'
  ```
- [ ] `backend/scripts/seed_demo.py`로 데모 데이터를 다시 시드할 때 이메일이 새 도메인인지 확인

### 2-6. Cloudinary
- [ ] 클라우드 이름은 그대로 (바꿀 필요 없음). 새 업로드는 `goldito/` 폴더로 쌓임
- [ ] (선택) 대시보드 Media Library에서 폴더 이름 정리 — 하지 마세요: 옛 파일의 `public_id`가 DB(`media.cloudinary_public_id`)에 저장돼 있어서 폴더를 옮기면 사진이 깨집니다

### 2-7. Google Cloud (Meet 링크용 계정)
- [ ] OAuth 동의 화면 → **앱 이름** `Goldito`, 지원 이메일 · 앱 로고
- [ ] 개인정보처리방침 · 홈페이지 링크를 새 도메인으로 (OAuth "In production" 게시 전에 같이 하면 한 번에 끝남 — TODO의 *OAuth In production* 항목)
- [ ] Google 계정 표시 이름 (일정 주최자 이름) "Goldito"

### 2-8. Nebius
- [ ] 프로젝트 / Serverless Endpoint / 컨테이너 이미지 이름에 Pawddy가 있으면 새 이름 (배포 전이면 처음부터 Goldito로)
- [ ] 예산 알림 · 태그 이름

### 2-9. 이미지 · 브랜딩 (코드로 못 바꾸는 것)
- [ ] `frontend/assets/icon.png` · `splash-icon.png` · `favicon.png` · `android-icon-*.png` 에 옛 이름 / 로고가 들어 있으면 교체
- [ ] 묵님 Figma 파일 · 프레임 이름, 로고
- [ ] README 상단 스크린샷 · 데모 영상 제목 · 자막 · 썸네일 (README의 이미지 링크가 있다면)
- [ ] 앱 아이콘 / 스토어 이름 (네이티브 빌드 전에 `ios.bundleIdentifier` · `android.package` 를 정하세요 — 지금 `app.json`에는 없음. 예: `com.goldito.app`)

### 2-10. 외부 문서 · 제출물
- [ ] Devpost 프로젝트 이름 · 태그라인 · 스토리 ([devpost-submission.ko.md](../hackathon/devpost-submission.ko.md), [project-story.md](../hackathon/project-story.md)는 이미 새 이름으로 바뀜 — Devpost 사이트에는 직접 반영)
- [ ] Notion · Google Drive · 팀 채팅 · 캘린더 초대에 쓰인 이름
- [ ] 해커톤 제출 양식의 프로젝트 이름 · 공개 저장소 URL (§2-1 이후의 새 주소)
- [ ] 도메인을 살 거면 (예: `goldito.app`) 구입 → Vercel 도메인 연결 → §2-3의 CORS · Supabase URL을 그 도메인으로

## 3. 바꾼 뒤 알아 둘 일

1. **모두 한 번 로그아웃됩니다** — 로그인 세션 저장 키(`pawddy-auth` → `goldito-auth`)가 바뀌었기 때문. 데모 계정은 다시 Try demo로 들어가면 됩니다. 시터의 "할 일 미루기" 기록도 한 번 초기화됩니다.
2. **새로 올리는 사진 · 영상**은 `goldito/…` 폴더에 쌓이고, **옛 것**은 그대로 보입니다 (백엔드 · 앱 모두 확인 완료).
3. **딥링크**가 `goldito://` 로 바뀌었습니다. 아직 네이티브 앱을 안 내놨으니 지금은 영향 없음.
4. 자동 테스트 (백엔드 296 · Playwright 167 · 프레임 12 · SQL 스모크)는 이름 변경 뒤에도 통과했습니다.
