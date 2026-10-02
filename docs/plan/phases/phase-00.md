# Phase 00 — 사전 준비 (Prerequisites)

> 공통 전제: [architecture.ko.md](architecture.ko.md) (결정 로그 D1–D42, env 마스터 §4)

## Goal

**코드를 작성하기 전에** Supabase·Cloudinary·Nebius(·Tavily) 계정과 로컬 환경 변수를 준비해, Phase 01부터 개발이 막히지 않게 한다.

### Goal 달성 기준

- [ ] Supabase 프로젝트 URL·anon key·service role key 확보, **Confirm email OFF**
- [ ] Cloudinary cloud name / API key / secret 확보
- [ ] 사용할 **Nemotron model ID + base URL**이 `docs/plan/phases/notes/model-ids.md`에 기록됨
- [ ] `backend/.env`, `frontend/.env`가 [architecture §4](architecture.ko.md#4-환경-변수-마스터-목록) 변수명 그대로 채워짐 (git에는 `.env.example`만)

---

## 왜 이 Phase가 먼저인가

Phase 01은 키 없이 가능하지만 Phase 02(migration)·03(Auth)은 **즉시 Supabase가 필요**합니다. Cloudinary는 Phase 04, Nebius는 Phase 07.1부터 필수입니다. → 0.1·0.2(민식), 0.3(슬기)은 **Phase 01과 병행**해도 됩니다.

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| 계정 생성, API 키 발급, 대시보드 설정 | 애플리케이션 코드 |
| 로컬 `.env` 작성 (0.5는 Phase 01.1의 `.env.example` 생성 후) | Devpost 제출 |
| Nebius 크레딧 신청 (`NEBIUS-DEVPOST-GLOBAL26`) + Builders Program | Tavily 연동 코드 (Phase 08.7) |

---

## 작업 상세

| ID | 작업 | 담당 | 상세 체크리스트 |
| :--- | :--- | :--- | :--- |
| 0.1 | Supabase 프로젝트 | 민식 | ① 리전: **Canada Central 또는 US East** (팀·심사 북미) ② Auth → Providers → Email ON, **Confirm email OFF** (D15) ③ Settings → API에서 URL·anon·service_role 복사 ④ Settings → JWT: signing key 종류(**asymmetric JWKS vs legacy HS256**) 메모 → HS256이면 `SUPABASE_JWT_SECRET`도 복사 (D14) ⑤ 무료 tier: **7일 비활성 시 일시정지** 확인 → Phase 10.7 keep-alive 필요 |
| 0.2 | Cloudinary | 민식 | cloud name, API key/secret. **unsigned preset 만들지 않음** (signed only). 폴더 규칙은 서버가 강제: `pawnote/{pet_id}/{purpose}/` |
| 0.3 | Nebius Token Factory | 슬기 | ① 크레딧 코드 적용 ② `GET /v1/models`를 **두 base URL**(eu-north1, us-central1)에 각각 호출 ③ 아래 4개 role별 model ID·base URL 확정 ④ `notes/model-ids.md`에 표 + 호출일 기록 ⑤ Nano Omni 없으면 fallback 비전 모델 ID 기록 (NVIDIA 모델이 아닐 경우 README에 명시) |
| 0.4 | Tavily | 슬기·민식 | [tavily.com](https://tavily.com) API Key → `TAVILY_API_KEY`. Builders & Brews Toronto **8,000 credits** (Phase 08.7) |
| 0.5 | `.env` | 민식 | Phase 01.1이 만든 `.env.example` 복사 → 값 채움. `git status`에 `.env`가 안 보이는지 확인 |

### 0.3 산출물 형식 — `docs/plan/phases/notes/model-ids.md`

```markdown
| Role (env)    | Model ID                              | Base URL                                              | Checked    |
| MODEL_VISION  | openbmb/MiniCPM-V-4_5                 | https://api.tokenfactory.us-central1.nebius.com/v1/   | 2026-09-29 |
| MODEL_SAFETY  | nvidia/Nemotron-3-Ultra-550b-a55b     | https://api.tokenfactory.us-central1.nebius.com/v1/   |            |
| MODEL_REPORT  | nvidia/nemotron-3-super-120b-a12b     | https://api.tokenfactory.us-central1.nebius.com/v1/   |            |
| MODEL_FAST    | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | https://api.tokenfactory.nebius.com/v1/               |            |
```
+ 영어 출력 품질 한 줄 메모, image 입력(base64 data URL) 지원 여부, `response_format` json 지원 여부.

### Nebius 크레딧 (권장)

1. Devpost 폼 + 코드 `NEBIUS-DEVPOST-GLOBAL26` ($25 Token Factory)
2. Nebius Builders Program 가입
3. **Builders & Brews Toronto (참석 시):** Token Factory **$100**, Nebius AI Cloud **$100**, Tavily **8,000 credits** — Supabase/Cloudinary **유지**, API 서버는 **AI Cloud Endpoint** (D18)

---

## Definition of Done (DoD)

1. 슬기: `curl`(또는 playground)로 MODEL_FAST 1회, MODEL_VISION에 이미지 1장 1회 호출 성공
2. 민식: Supabase SQL Editor 접속 + `select now();` 성공
3. `.env`가 `.gitignore`에 있고 커밋되지 않음 (`git check-ignore backend/.env frontend/.env`)

### 검증 예시

```bash
curl -s https://api.tokenfactory.nebius.com/v1/models -H "Authorization: Bearer $NEBIUS_API_KEY" | head -c 2000
```

---

## 리스크 & 대응

| 리스크 | 대응 |
| :--- | :--- |
| Nano Omni 카탈로그 미노출 (2026-09-29 확인) | `MODEL_VISION` = MiniCPM-V-4_5. Nemotron은 Ultra(세이프티)·Super(알림장)로 핵심 유지 |
| 모델마다 리전 다름 | role별 `*_BASE_URL` env (architecture §4) |
| Supabase 무료 일시정지 | Phase 10.7 keep-alive cron |

---

## 다음 Phase

→ [Phase 01 — 모노레포 틀](phase-01.md)
