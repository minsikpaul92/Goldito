# Phase 06 — 투약·산책 의뢰 & 완료 보고

> 공통 전제: [architecture.ko.md](architecture.ko.md) — D8 시간대, D9 missed, D17 리마인더

## Goal

키즈노트 **투약의뢰서/투약보고서** 흐름을 강아지·고양이에 맞춘다: 견주가 **약·산책·식사·화장실·놀이 일정**을 등록 (종별 허용 type은 [phase-02 D23](phase-02.md#종별-케어-규칙-d23)) → 펫시터에게 **오늘 할 일**이 자동으로 보이고 시간이 되면 **인앱 리마인더** → **인증 사진 한 장**으로 완료 → **견주 알림 + 피드 게시**.

### Goal 달성 기준

- [ ] Owner: Care 탭에서 Bori(dog) 08:00 medication(`Heartworm pill`, `1 tablet`) + 10:30 walk, Mochi(cat) 12:00 litter 생성
- [ ] 고양이 선택 시 type 목록에 Walk가 없고, 강아지 선택 시 Litter box가 없음
- [ ] Sitter: Tasks 탭에 오늘 task_logs가 **자동으로** 생성·표시 (버튼 없음)
- [ ] due 시각 ±5분이 되면 sitter 앱에 배너 + 토스트 "Time for Bori's medication 💊"
- [ ] **Complete with photo** → status done + feed_post(task 뱃지) + owner `task_done` 알림
- [ ] Owner Care 탭: 오늘 각 task의 ✅ done(완료 시각·사진) / ⏳ pending / ⚠️ missed 표시

---

## 선행 조건

- [Phase 05](phase-05.md) 알림 인프라, `createFeedPost` 패턴
- [Phase 04](phase-04.md) `uploadMedia()`

---

## 범위

| 포함 | 제외 |
| :--- | :--- |
| care_tasks CRUD (owner), daily 반복만 | RRULE(요일별 등) |
| RPC `ensure_today_task_logs`, `complete_task_log` (`005_tasks.sql`) | 서버 푸시 리마인더 (6.7 stretch) |
| 클라이언트 인앱 리마인더 (D17) | SMS, missed 알림 |
| 완료 시 자동 feed_post | 완료 취소 (P1) |

---

## 작업 상세

| ID | 작업 | 상세 |
| :--- | :--- | :--- |
| 6.1 | OwnerTaskScreen `/(owner)/tasks` | 상단: 오늘 상태 리스트. 하단: 등록된 task 목록 + **Add task** 시트 — type 선택은 **선택된 pet의 species 기준** (dog: 💊 Medication · 🦮 Walk · 🍽️ Feeding · 🎾 Play · 😴 Bedtime / cat: 💊 Medication · 🍽️ Feeding · 🧺 Litter box · 🎾 Play · 😴 Bedtime), title(med 필수, 나머지는 type 라벨이 기본값), dose(med만), time picker(15분 단위 — 직접 만든 칩·스테퍼, 웹 미지원 datetimepicker 금지 · DESIGN.md §7.7), notes. 수정·비활성(`active=false`) |
| 6.2 | `ensure_today_task_logs(p_pet uuid)` RPC | security definer, `can_access_pet` 확인. `APP_TIMEZONE` 기준 오늘 날짜 + `scheduled_time` → `due_at` (`local_ts(app_today(), scheduled_time)` — 003 헬퍼). `active and repeat_daily`인 task마다 `insert … on conflict (task_id, due_at) do nothing`. 오늘 로그 목록 반환. **호출 시점:** sitter Today/Tasks, owner Care 화면 진입 시 (멱등) |
| 6.3 | SitterTasksScreen `/(sitter)/tasks` | 정렬: missed → pending(due 순) → done. TaskRow: 아이콘, title·dose, due 시각, 상태 뱃지, 우측 큰 **Complete** 버튼 (1 주 액션). Today 탭 상단에 "Next up" 카드로도 노출 |
| 6.4 | Complete flow | 탭 → `pickMedia()`(4.7 — 데스크톱·데모는 샘플 트레이) → `uploadMedia({purpose:'task_proof'})` → `rpc('complete_task_log', {p_task_log, p_media})`. RPC: 호출자가 **그 시각에 이 반려동물을 맡고 있는지** 확인 (`in_care_window(pet, due_at)` — 맡긴 시각 ~ 찾는 시각, phase-02), 아니면 `not_in_care_window`. 시터 Tasks 목록도 맡긴 구간 안의 task_logs만 보여줌. `status='done', completed_at=now(), completed_by, media_id` 갱신, feed_post insert (`task_log_id`, caption은 type별 템플릿 — `"💊 {title} given"` / `"🦮 Walk done"` / `"🍽️ Fed {name}"` / `"🧺 Litter box cleaned"` / `"🎾 Play time with {name}"` / `"😴 {name} is asleep"`, `caption_source='task'`), owner 알림 `task_done` insert. 이미 done이면 exception `already_done` |
| 6.5 | missed / late 표시 | 파생 (D9): pending & now > due+60m → ⚠️ "Missed", done & completed_at > due+60m → "Done late". 완료는 missed여도 허용 |
| 6.6 | 인앱 리마인더 (D17) | `useDueReminder()` hook (sitter 레이아웃에 1개): 30초 interval, pending 중 `due_at-5m ≤ now ≤ due_at+60m`인 로그 → 상단 배너 + 토스트 1회(`sessionStorage`에 shown id 기록) |
| 6.7 | (Stretch) 서버 리마인더 | Nebius Serverless Job(cron 5분) 또는 FastAPI APScheduler: due 5분 전 sitter에게 `task_due` notification insert. README "Other Nebius services" 포인트 |

### 완료와 피드 연동 (확정)

- 완료 시 **항상** feed_post 생성 (`task_log_id` 연결) → owner 피드에 뱃지 카드로 표시. 알림은 `task_done` 1개만 (feed 트리거는 `task_log_id is not null`이면 skip — Phase 05.3).
- Phase 09 이후에도 task 게시물 캡션은 AI 대신 고정 문구 유지 (빠름·정확). 선택: 09.4에서 AI 캡션 추가.

---

## Definition of Done (DoD)

1. missed 표시: due_at을 과거로 둔 task로 ⚠️ 확인
2. Owner가 완료 사진을 Care 탭 행 탭 → 사진 모달, 그리고 피드에서 확인
3. sitter **메시지/타이핑 없이** Complete 탭 + 사진만으로 완료
4. `ensure_today_task_logs` 2회 호출 → 로그 중복 없음
5. 시간대: `APP_TIMEZONE`과 다른 브라우저 시간대에서도 due 시각이 올바르게 표시 (`lib/time.ts`)
6. 데스크톱 폰 프레임에서 마우스만으로 6.1 등록(시간 선택 포함) → 6.4 샘플 사진으로 완료까지 동작 (D25)

---

## 산출물

- `frontend/app/(owner)/tasks.tsx`, `frontend/app/(sitter)/tasks.tsx`, `frontend/components/TaskRow.tsx`, `frontend/hooks/useDueReminder.ts`
- `supabase/migrations/005_tasks.sql` (RPC 2개)

---

## AI 프롬프트

Playbook §8 — (6.1) / (6.2, 6.4 RPC) / (6.3, 6.5, 6.6 UI)

---

## 다음 Phase

→ [Phase 07 — 알림장 AI](phase-07.md) (병렬: 슬기 7.1 Nebius client는 Phase 01 이후 언제든)
