/* Goldito screens — the one list behind the Prototype page.
   live: "live" (captured screenshot in shot) · "built" (in the app, not captured yet) · "none" (not built yet).
   When a screen ships or gets captured, change its live/shot/captured fields here; the viewer follows. */
window.GOLDITO_FIGMA = "https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Pawddy-Design?node-id=";
window.GOLDITO_LOOKS = [
  {k: "c", label: "Balanced", ko: "밸런스드", journey: "pawnote-concept-c-balanced-skin.html"},
  {k: "b", label: "Playful", ko: "플레이풀", journey: "pawnote-concept-b-full-tamagotchi.html"},
  {k: "d", label: "Expressive", ko: "익스프레시브", journey: "pawnote-concept-d-expressive.html"},
];
window.GOLDITO_GROUPS = [["today", "Today's app · tabs", "지금 앱 · 탭"], ["stay", "The stay · 5 stages", "스테이 · 5단계"], ["onboarding", "Onboarding (exploration)", "온보딩 (탐색)"]];
window.GOLDITO_SCREENS = [
 {
  "id": "owner-home",
  "group": "today",
  "name": "Owner · Home",
  "live": "live",
  "shot": "redesign/live/owner-home.png",
  "captured": "Oct 5",
  "task": "D47 · Phase 03–05",
  "ours": {
   "kind": "tab",
   "id": "owner-home"
  },
  "why": "Answer “is my pet OK?” first",
  "changes": [
   "<b>One stay card replaces two “In care” cards.</b> Photo, “With Lucy now”, day 2 of 3, and today's care progress: the README's “learn without asking” at a glance.",
   "<b>Latest update right on Home</b> (photo + AI caption), so the owner doesn't have to open Diary to feel reassured.",
   "<b>The one primary action matches the moment:</b> “See today's updates” during a stay. “Add pet” becomes a text link (DESIGN.md §7.1).",
   "<b>Log out leaves the header</b> (D47: settings live in Profile). Bell + avatar only.",
   "Allergy stays visible as a <b>Heads-up tag</b>, warning tone, not a status chip."
  ],
  "components": [
   "Card",
   "Progress Bar",
   "Avatar",
   "Heads-up Tag",
   "Button",
   "Screen footer",
   "Icon Button"
  ],
  "figma": "174-50297",
  "figmaScreens": [
   "Owner · Home"
  ],
  "why_ko": "“우리 아이 괜찮나?”에 먼저 답해요",
  "changes_ko": [
   "<b>‘돌봄 중’ 카드 두 개를 스테이 카드 하나로.</b> 사진, “Lucy와 함께”, 3일 중 2일째, 오늘 돌봄 진행도까지 한눈에 — README의 “묻지 않아도 아는” 경험.",
   "<b>최신 소식을 홈에서 바로</b> (사진 + AI 캡션). 다이어리를 열지 않아도 안심돼요.",
   "<b>그 순간에 맞는 메인 버튼 하나:</b> 돌봄 중엔 “오늘 소식 보기”. “펫 추가”는 텍스트 링크로 (DESIGN.md §7.1).",
   "<b>로그아웃은 헤더에서 빠져요</b> (D47: 설정은 프로필에). 벨 + 아바타만.",
   "알레르기는 <b>주의 태그</b>로 계속 보여요 (경고 톤, 상태 칩 아님)."
  ],
  "name_ko": "보호자 · 홈"
 },
 {
  "id": "owner-bookings",
  "group": "today",
  "name": "Owner · Bookings",
  "live": "live",
  "shot": "redesign/live/owner-bookings.png",
  "captured": "Oct 5",
  "task": "3B · 03C",
  "ours": {
   "kind": "tab",
   "id": "owner-bookings"
  },
  "why": "Show where the stay is",
  "changes": [
   "<b>Upcoming · Requests · Past</b> segments (D47b already names Past) instead of one long list as bookings grow.",
   "<b>The 5-stage stepper</b> on each booking (Inquiry → Home). It's the README's main story; judges see the whole flow on one card.",
   "<b>Handoffs as two clear rows</b> with who drives and a check when done, instead of one dense paragraph. Realistic demo times (7:30 AM, not 12:37 AM).",
   "<b>Price and consents</b> summarised on the card (03C is built; surface it).",
   "Sitter row gets <b>rating and reply speed</b> (Rover benchmark)."
  ],
  "components": [
   "Segmented Control",
   "Stage Card",
   "Quote Card",
   "Profile Card",
   "Button"
  ],
  "figma": "174-50297",
  "figmaScreens": [
   "Owner · Bookings"
  ],
  "why_ko": "스테이가 어디까지 왔는지 보여줘요",
  "changes_ko": [
   "<b>예정 · 요청 · 지난</b> 세그먼트 — 예약이 늘어도 긴 목록이 되지 않게.",
   "예약마다 <b>5단계 진행</b> (문의 → 귀가). README의 핵심 흐름을 카드 하나로.",
   "<b>인계를 두 줄로</b>: 누가 운전하는지, 끝나면 체크. 데모 시간도 현실적으로 (오전 7:30).",
   "<b>가격과 동의</b>를 카드에 요약 (03C는 이미 구현됨).",
   "시터 줄에 <b>평점과 응답 속도</b>, 탭하면 프로필로 (›)."
  ],
  "name_ko": "보호자 · 예약"
 },
 {
  "id": "owner-feed",
  "group": "today",
  "name": "Owner · Feed",
  "live": "live",
  "shot": "redesign/live/owner-feed.png",
  "captured": "Oct 5",
  "task": "05 · 9.x (categories)",
  "ours": {
   "kind": "tab",
   "id": "owner-feed"
  },
  "why": "An album you can scan by day and kind",
  "changes": [
   "<b>Category chips (Meals · Walks · Naps · Play)</b>: the README's “timeline album”, missing on live. Pet and category filters share one selected style.",
   "<b>Grouped by day</b> with a count, plus a small category + time badge on each tile.",
   "<b>Tapping opens the caption card</b>: AI caption, who and when, Love it. Captions are the AI story judges need to see.",
   "“Only you” becomes an explicit <b>“🔒 Visible to Chloe”</b> line on the post, not a floating pill.",
   "<b>Demo photos must be Max</b> (Maltese). Live shows other breeds."
  ],
  "components": [
   "Filter Chip",
   "Feed Card",
   "Photo Tile",
   "Button"
  ],
  "figma": "174-50297",
  "figmaScreens": [
   "Owner · Feed"
  ],
  "why_ko": "날짜와 종류로 훑어보는 앨범",
  "changes_ko": [
   "<b>카테고리 칩 (식사 · 산책 · 낮잠 · 놀이)</b>: README의 ‘타임라인 앨범’, 라이브에는 아직 없어요. 펫·카테고리 필터는 선택 스타일 하나로.",
   "<b>날짜별 묶음</b>과 개수, 타일마다 카테고리 + 시간 배지.",
   "<b>탭하면 캡션 카드</b>: AI 캡션, 누가 언제, 좋아요. 심사위원에게 보여줄 AI 이야기예요.",
   "‘나만 보기’는 게시물 위 <b>“🔒 Chloe만 볼 수 있음”</b> 한 줄로."
  ],
  "name_ko": "보호자 · 피드"
 },
 {
  "id": "owner-diary",
  "group": "today",
  "name": "Owner · Diary",
  "live": "live",
  "shot": "redesign/live/owner-diary.png",
  "captured": "Oct 5",
  "task": "06 · 07 (daily note)",
  "ours": {
   "kind": "tab",
   "id": "owner-diary"
  },
  "why": "The diary is the product; don't show it empty",
  "changes": [
   "<b>“On air · Lucy”</b> signals a live stay (D47 “Live/On air”).",
   "<b>The AI daily note leads</b>, with the chips it was written from and “approved by Lucy”. Shows Nemotron and the no-typing sitter loop in one card (7.2 / 7.7, current focus).",
   "<b>Today's timeline</b> below: time rail, check-ins, photos. Same data as History, organised by time.",
   "<b>Seed the demo</b> with one sent note and a few check-ins so judges never land on “No diary yet” while Max is in care."
  ],
  "components": [
   "Daily Note",
   "Suggestion Chip",
   "Notification Row",
   "Card"
  ],
  "figma": "174-50297",
  "figmaScreens": [
   "Owner · Diary"
  ],
  "why_ko": "다이어리가 핵심이에요. 비워두지 마세요",
  "changes_ko": [
   "<b>“On air · Lucy”</b>로 진행 중인 스테이를 알려요 (D47).",
   "<b>AI 알림장이 맨 위</b>, 바탕이 된 칩과 “Lucy 승인”까지. Nemotron과 ‘타이핑 없는 시터’ 흐름을 카드 하나로 (7.2 / 7.7).",
   "아래는 <b>오늘 타임라인</b>: 시간 레일, 체크인, 사진.",
   "<b>데모 데이터를 미리 넣어</b> 심사위원이 ‘다이어리 없음’을 보지 않게."
  ],
  "name_ko": "보호자 · 다이어리"
 },
 {
  "id": "owner-mood",
  "group": "today",
  "name": "Owner · Mood",
  "live": "live",
  "shot": "redesign/live/owner-mood.png",
  "captured": "Oct 5",
  "task": "11.9 (P1)",
  "ours": {
   "kind": "tab",
   "id": "owner-mood"
  },
  "why": "Give the 5th tab something to show",
  "changes": [
   "An empty centered message makes a main tab look unfinished. A <b>seeded example result</b> shows the idea even before 11.9 ships.",
   "Keep <b>“Just for fun · not a health check”</b> visible (safety).",
   "Secondary button only: Mood is never the screen's main job.",
   "Alternative if 11.9 slips: hide the tab for the demo rather than ship an empty one. Decide together."
  ],
  "components": [
   "Filter Chip",
   "Card",
   "Button"
  ],
  "figma": "174-50297",
  "figmaScreens": [
   "Owner · Mood"
  ],
  "why_ko": "다섯 번째 탭에 보여줄 게 있게",
  "changes_ko": [
   "빈 메시지만 있으면 미완성처럼 보여요. <b>예시 결과</b>로 11.9 전에도 아이디어를 보여줘요.",
   "<b>“재미로 · 건강 진단 아님”</b>은 항상 보이게 (안전).",
   "보조 버튼만: 무드는 이 화면의 메인 일이 아니에요.",
   "11.9가 밀리면 빈 탭 대신 데모에서 숨기기. 같이 정해요."
  ],
  "name_ko": "보호자 · 무드"
 },
 {
  "id": "sitter-home",
  "group": "today",
  "name": "Sitter · Home",
  "live": "live",
  "shot": "redesign/live/sitter-home.png",
  "captured": "Oct 5",
  "task": "D47b · 06",
  "ours": {
   "kind": "tab",
   "id": "sitter-home"
  },
  "why": "One next task, one big button",
  "changes": [
   "<b>The next task is the hero</b> with “Complete with photo” (DESIGN.md §7.1 example): care, snap, tap.",
   "<b>Heads-up in warning tone</b> (live uses a green success fill with an orange border, which mixes signals).",
   "<b>Check-in tiles</b> (Ate · Potty · Walk · Mood) one tap away instead of “tap a pet to check in” in a card.",
   "Stats shrink to <b>one progress line</b>; the three big number tiles spend the best space on counts.",
   "<b>Treat scan (08) and the evening 5-second check</b> as the two secondary actions. The calendar icon moves into Bookings; Log out into Profile.",
   "Later (11.12): the pixel Tamagotchi status can sit above the next-task card."
  ],
  "components": [
   "Next Task Card",
   "Tag",
   "Check-in Tile",
   "Progress Bar",
   "Action Row"
  ],
  "figma": "174-50297",
  "figmaScreens": [
   "Sitter · Home"
  ],
  "why_ko": "다음 할 일 하나, 큰 버튼 하나",
  "changes_ko": [
   "<b>다음 할 일이 주인공</b>, “사진으로 완료” (DESIGN.md §7.1): 돌보고, 찍고, 탭.",
   "<b>주의사항은 경고 톤</b> (라이브는 초록 배경 + 주황 테두리로 신호가 섞여 있어요).",
   "<b>체크인 타일</b> (먹음 · 배변 · 산책 · 기분)을 한 번 탭으로.",
   "통계는 <b>진행 바 한 줄</b>로 줄여요.",
   "<b>간식 스캔(08)과 저녁 5초 체크</b>는 › 가 있는 액션 행으로 — 카드가 아니라 버튼으로 읽히게."
  ],
  "name_ko": "시터 · 홈"
 },
 {
  "id": "stage-1",
  "group": "stay",
  "name": "① Inquiry",
  "live": "none",
  "task": "07B · Up next",
  "ours": {
   "kind": "journey",
   "hash": "stage-1"
  },
  "why": "Ask Lucy, get an answer in her voice",
  "changes": [
   "Owner picks service, dates (calendar) and pets, then asks.",
   "The reply reads as Lucy's own message, with sources and a quote from the server — never from the AI (D10, D31).",
   "Health questions are handed to Lucy herself (§10)."
  ],
  "components": [
   "Message Bubble",
   "Source Tag",
   "Quote Card",
   "Typing Indicator",
   "Banner"
  ],
  "figma": "174-50318",
  "figmaScreens": [
   "Inquiry · AI reply (07B)",
   "① Dates are full",
   "① The assistant hands over"
  ],
  "why_ko": "Lucy에게 묻고, Lucy 말투로 답을 받아요",
  "changes_ko": [
   "서비스, 날짜(달력), 펫을 고르고 질문해요.",
   "답장은 Lucy 본인의 메시지로 보여요. 출처와 견적은 서버에서 — AI가 만들지 않아요 (D10, D31).",
   "건강 질문은 Lucy가 직접 답해요 (§10)."
  ],
  "name_ko": "① 문의"
 },
 {
  "id": "stage-2",
  "group": "stay",
  "name": "② Meet & Greet + care request",
  "live": "built",
  "task": "06 · 3B.9 — built, not captured",
  "ours": {
   "kind": "journey",
   "hash": "stage-2"
  },
  "why": "Turn a care request into a checklist",
  "changes": [
   "Owner writes the request; AI drafts an editable checklist with heads-up tags.",
   "Missing dose or an allergy conflict blocks Save (§10).",
   "Meet & Greet: in person or video, then who drives each handoff."
  ],
  "components": [
   "Checklist Row",
   "Tag",
   "Segment",
   "Card"
  ],
  "figma": "174-50318",
  "figmaScreens": [
   "Care request → checklist (06)",
   "Meet & Greet (3B.9)",
   "② Checklist needs a fix"
  ],
  "why_ko": "돌봄 요청을 체크리스트로",
  "changes_ko": [
   "보호자가 요청을 쓰면 AI가 수정 가능한 체크리스트와 주의 태그를 만들어요.",
   "용량이 없거나 알레르기와 겹치면 저장이 막혀요 (§10).",
   "만남 인사: 대면 또는 영상, 그리고 인계마다 누가 운전할지."
  ],
  "name_ko": "② 만남 인사 + 돌봄 요청"
 },
 {
  "id": "stage-3",
  "group": "stay",
  "name": "③ Booking · checkout",
  "live": "built",
  "task": "03B · 03C — built, not captured",
  "ours": {
   "kind": "journey",
   "hash": "stage-3"
  },
  "why": "Pay only after the five consents",
  "changes": [
   "Lucy accepts → quote, 5 consent cards, typed name, demo pay.",
   "Entry info stays locked until 2 h before pick-up; the code hides after 10 s.",
   "Payment failure keeps the consents and signature (§10)."
  ],
  "components": [
   "Quote Card",
   "Consent Card",
   "Text Field",
   "Entry Info Card",
   "Banner"
  ],
  "figma": "174-50318",
  "figmaScreens": [
   "Checkout · consents (03C)",
   "Paid · entry info (03C)",
   "③ Payment failed",
   "③ Sitter can't take it"
  ],
  "why_ko": "동의 5개를 마쳐야 결제돼요",
  "changes_ko": [
   "Lucy 수락 → 견적, 동의 카드 5개, 이름 입력, 데모 결제.",
   "출입 정보는 픽업 2시간 전까지 잠겨 있고, 코드는 10초 후 다시 숨어요.",
   "결제가 실패해도 동의와 서명은 그대로예요 (§10)."
  ],
  "name_ko": "③ 예약 · 결제"
 },
 {
  "id": "stage-4",
  "group": "stay",
  "name": "④ Pick-up · live trip",
  "live": "none",
  "task": "6B · last in P0 (D41)",
  "ours": {
   "kind": "journey",
   "hash": "stage-4"
  },
  "why": "See the drive, then the handoff photo",
  "changes": [
   "Live map with ETA; ± only, no drag (§7.7).",
   "Arrival card, then the handoff photo check — it never blocks (D5).",
   "Running late or location off fall back to status lines (§10)."
  ],
  "components": [
   "Trip Map",
   "Photo Check",
   "Banner",
   "Toast"
  ],
  "figma": "174-50325",
  "figmaScreens": [
   "Live trip (06B)",
   "Handoff photo check (06B)",
   "④ Sitter running late",
   "④ Location is off"
  ],
  "why_ko": "이동을 보고, 인계 사진까지",
  "changes_ko": [
   "ETA가 보이는 라이브 지도. ± 버튼만, 드래그 없음 (§7.7).",
   "도착 카드 다음 인계 사진 확인 — 절대 인계를 막지 않아요 (D5).",
   "늦거나 위치가 꺼지면 상태 문구로 대신해요 (§10)."
  ],
  "name_ko": "④ 픽업 · 라이브 이동"
 },
 {
  "id": "care",
  "group": "stay",
  "name": "④ Care in progress",
  "live": "built",
  "task": "05 · 06 — feed and tasks are live (see Today's app)",
  "ours": {
   "kind": "journey",
   "hash": "care"
  },
  "why": "Learn without asking during the stay",
  "changes": [
   "Feed, tasks and check-ins unlock at pick-up.",
   "Every check-off reaches the owner as it happens."
  ],
  "components": [
   "Task Row",
   "Feed Card",
   "Progress Bar"
  ],
  "figma": "174-50325",
  "figmaScreens": [],
  "why_ko": "돌봄 중엔 묻지 않아도 알아요",
  "changes_ko": [
   "픽업 후 피드, 할 일, 체크인이 열려요.",
   "체크할 때마다 보호자에게 바로 전달돼요."
  ],
  "name_ko": "④ 돌봄 중"
 },
 {
  "id": "check",
  "group": "stay",
  "name": "④ 5-second check · daily note",
  "live": "none",
  "task": "7.2–7.7 · current focus",
  "ours": {
   "kind": "journey",
   "hash": "check"
  },
  "why": "The sitter's report in five seconds",
  "changes": [
   "Up to 2 photos, AI-suggested chips (turn wrong ones off), optional one-line note.",
   "Draft only uses chips that are on; the sitter taps Send.",
   "If the AI fails, the chips go out as a plain list (D5)."
  ],
  "components": [
   "Photo Tile",
   "Suggestion Chip",
   "Daily Note",
   "Text Field"
  ],
  "figma": "174-50325",
  "figmaScreens": [
   "5-second check (7.7)",
   "Daily note · review (7.3)",
   "④ Offline check-ins"
  ],
  "why_ko": "시터의 리포트를 5초 만에",
  "changes_ko": [
   "사진 최대 2장, AI 추천 칩 (틀린 건 끄기), 한 줄 메모는 선택.",
   "초안은 켜진 칩만 써요. 시터가 보내기를 눌러요.",
   "AI가 실패하면 칩을 그대로 목록으로 보내요 (D5)."
  ],
  "name_ko": "④ 5초 체크 · 알림장"
 },
 {
  "id": "treat",
  "group": "stay",
  "name": "Treat Guard",
  "live": "none",
  "task": "08 · stretch after 07C",
  "ours": {
   "kind": "journey",
   "hash": "treat"
  },
  "why": "Danger is loud",
  "changes": [
   "DANGER is a full-screen modal that closes only with its button (§7.4).",
   "An unreadable label means don't feed (D5)."
  ],
  "components": [
   "Alert Modal · DANGER",
   "Banner"
  ],
  "figma": "174-50325",
  "figmaScreens": [
   "Treat Guard · DANGER (08)",
   "④ Treat label unreadable"
  ],
  "why_ko": "위험은 크게 알려요",
  "changes_ko": [
   "DANGER는 전체 화면이고 버튼으로만 닫혀요 (§7.4).",
   "라벨을 못 읽으면 주지 마세요 (D5)."
  ],
  "name_ko": "간식 가드"
 },
 {
  "id": "stage-5",
  "group": "stay",
  "name": "⑤ Home safe · review · Life Record",
  "live": "none",
  "task": "07C · Up next",
  "ours": {
   "kind": "journey",
   "hash": "stage-5"
  },
  "why": "Close the stay and remember it",
  "changes": [
   "Return photo, stars and thanks, then the Pet Life Record with sources.",
   "New facts need the owner's OK before they enter the record (D9)."
  ],
  "components": [
   "Photo Check",
   "Star",
   "Life Record Card",
   "Banner"
  ],
  "figma": "174-50332",
  "figmaScreens": [
   "Home safe · review (07C)",
   "Life Record (07C)",
   "⑤ Low rating",
   "⑤ New fact needs your OK"
  ],
  "why_ko": "스테이를 마무리하고 기억해요",
  "changes_ko": [
   "귀가 사진, 별점과 감사 인사, 출처가 달린 Pet Life Record.",
   "새로 알게 된 사실은 보호자가 확인해야 기록에 들어가요 (D9)."
  ],
  "name_ko": "⑤ 귀가 · 리뷰 · Life Record"
 },
 {
  "id": "owner",
  "group": "onboarding",
  "name": "Owner sign-up",
  "live": "built",
  "task": "OB.1–OB.2 — the app has a simpler Welcome tour",
  "ours": {
   "kind": "journey",
   "hash": "owner"
  },
  "why": "Exploration: a guided owner setup",
  "changes": [
   "Pet, look, health and care, notifications — explored, not planned (OB.4 on hold).",
   "The live app keeps its Welcome tour + sign-up."
  ],
  "components": [
   "Choice Card",
   "Text Field",
   "Switch Row",
   "Push Preview"
  ],
  "figma": "174-50358",
  "figmaScreens": [
   "Welcome",
   "Role",
   "Create account",
   "Add your pet",
   "Pick your colors",
   "Health & care",
   "Notifications"
  ],
  "why_ko": "탐색: 보호자 가입 흐름",
  "changes_ko": [
   "펫, 색상, 건강·돌봄, 알림 — 탐색용, 아직 계획 아님 (OB.4 보류).",
   "라이브 앱은 지금의 Welcome 투어 + 가입을 유지해요."
  ],
  "name_ko": "보호자 가입"
 },
 {
  "id": "sitter",
  "group": "onboarding",
  "name": "Sitter setup",
  "live": "built",
  "task": "Phase 03 · 3B.1 — sign-up and schedule exist",
  "ours": {
   "kind": "journey",
   "hash": "sitter"
  },
  "why": "Exploration: services, rules, availability",
  "changes": [
   "Rates with a live quote, house rules, an October calendar, then the public profile."
  ],
  "components": [
   "Stepper",
   "Switch Row",
   "Calendar Day",
   "Profile Card"
  ],
  "figma": "174-50368",
  "figmaScreens": [
   "Services & rates",
   "House rules",
   "Availability",
   "Live profile"
  ],
  "why_ko": "탐색: 서비스, 규칙, 일정",
  "changes_ko": [
   "실시간 견적이 보이는 요금, 집 규칙, 10월 달력, 그리고 공개 프로필."
  ],
  "name_ko": "시터 설정"
 }
];
