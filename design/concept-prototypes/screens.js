/* Goldito screens — the one list behind the Prototype page.
   live: "live" (captured screenshot in shot) · "built" (in the app, not captured yet) · "none" (not built yet).
   When a screen ships or gets captured, change its live/shot/captured fields here; the viewer follows.
   readme: README.md heading anchor on GitHub · docs: [label, repo path] pairs. App status matches main @ 7877079 (Oct 15). */
window.GOLDITO_REPO = "https://github.com/minsikpaul92/Goldito/blob/main/";
window.GOLDITO_FIGMA = "https://www.figma.com/design/stZjrJJU6KOhLauxPjaV8l/Pawddy-Design?node-id=";
// Expressive is the look we're building (Oct 15). Balanced and Playful are paused, not deleted:
// to bring them back, set GOLDITO_SHOW_ALL_LOOKS = true (their files and screens are all still here).
window.GOLDITO_PRIMARY_LOOK = "d";
window.GOLDITO_SHOW_ALL_LOOKS = false;
window.GOLDITO_LOOKS = [
  {k: "c", label: "Balanced", ko: "밸런스드", journey: "pawnote-concept-c-balanced-skin.html"},
  {k: "b", label: "Playful", ko: "플레이풀", journey: "pawnote-concept-b-full-tamagotchi.html"},
  {k: "d", label: "Expressive", ko: "익스프레시브", journey: "pawnote-concept-d-expressive.html"},
];
window.GOLDITO_GROUPS = [["today", "Today's app · tabs", "지금 앱 · 탭"], ["stay", "The stay · 5 stages", "스테이 · 5단계"], ["next", "Being built now (P1)", "지금 만드는 중 (P1)"], ["onboarding", "Onboarding (exploration)", "온보딩 (탐색)"], ["steps", "Step by step (older users)", "단계별 (어르신 친화)"]];
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
   "<b>One stay card replaces two “In care” cards.</b> Photo, “With Chloe now”, day 2 of 3, and today's care progress: the README's “learn without asking” at a glance.",
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
   "<b>‘돌봄 중’ 카드 두 개를 스테이 카드 하나로.</b> 사진, “Chloe와 함께”, 3일 중 2일째, 오늘 돌봄 진행도까지 한눈에 — README의 “묻지 않아도 아는” 경험.",
   "<b>최신 소식을 홈에서 바로</b> (사진 + AI 캡션). 다이어리를 열지 않아도 안심돼요.",
   "<b>그 순간에 맞는 메인 버튼 하나:</b> 돌봄 중엔 “오늘 소식 보기”. “펫 추가”는 텍스트 링크로 (DESIGN.md §7.1).",
   "<b>로그아웃은 헤더에서 빠져요</b> (D47: 설정은 프로필에). 벨 + 아바타만.",
   "알레르기는 <b>주의 태그</b>로 계속 보여요 (경고 톤, 상태 칩 아님)."
  ],
  "name_ko": "보호자 · 홈",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 05",
    "docs/plan/phases/phase-05.md"
   ],
   [
    "Phase 06",
    "docs/plan/phases/phase-06.md"
   ]
  ]
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
  "name_ko": "보호자 · 예약",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 03B",
    "docs/plan/phases/phase-03b.md"
   ],
   [
    "Phase 03C",
    "docs/plan/phases/phase-03c.md"
   ]
  ]
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
   "“Only you” becomes an explicit <b>“🔒 Visible to Robert”</b> line on the post, not a floating pill.",
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
   "‘나만 보기’는 게시물 위 <b>“🔒 Robert만 볼 수 있음”</b> 한 줄로."
  ],
  "name_ko": "보호자 · 피드",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 05",
    "docs/plan/phases/phase-05.md"
   ],
   [
    "Phase 09",
    "docs/plan/phases/phase-09.md"
   ]
  ]
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
   "<b>“On air · Chloe”</b> signals a live stay (D47 “Live/On air”).",
   "<b>The AI daily note leads</b>, with the chips it was written from and “approved by Chloe”. Shows Nemotron and the no-typing sitter loop in one card (7.2 / 7.7, current focus).",
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
   "<b>“On air · Chloe”</b>로 진행 중인 스테이를 알려요 (D47).",
   "<b>AI 알림장이 맨 위</b>, 바탕이 된 칩과 “Chloe 승인”까지. Nemotron과 ‘타이핑 없는 시터’ 흐름을 카드 하나로 (7.2 / 7.7).",
   "아래는 <b>오늘 타임라인</b>: 시간 레일, 체크인, 사진.",
   "<b>데모 데이터를 미리 넣어</b> 심사위원이 ‘다이어리 없음’을 보지 않게."
  ],
  "name_ko": "보호자 · 다이어리",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 07",
    "docs/plan/phases/phase-07.md"
   ]
  ]
 },
 {
  "id": "owner-snap",
  "group": "today",
  "name": "Owner · Snap",
  "live": "built",
  "shot": "",
  "captured": "",
  "task": "12 · Snap tab (#90, #91), shipped Oct 15 — not captured",
  "ours": {
   "kind": "tab",
   "id": "owner-snap"
  },
  "why": "One tab, three photo tools",
  "changes": [
   "<b>Snap replaced Mood</b> as the fifth tab on Oct 15 (D61), for owners and sitters.",
   "<b>Treat check first</b>: the safety tool, with Max's allergies and pet toxins, and the README's DANGER moment.",
   "Each tool says what it does in one line; Mood keeps “Just for fun”.",
   "<b>Recent checks</b> show the verdict as a tag on its own surface (D3), always with the reason."
  ],
  "components": [
   "Filter Chip",
   "Card",
   "Tag"
  ],
  "figma": "174-50297",
  "figmaScreens": [],
  "why_ko": "탭 하나, 사진 도구 셋",
  "changes_ko": [
   "<b>Mood 대신 Snap</b>이 다섯 번째 탭이 됐어요 (10/15, D61). 보호자와 시터 모두.",
   "<b>간식 확인이 먼저</b>: Max의 알레르기와 독성 성분을 확인하는 안전 도구이자 README의 DANGER 장면.",
   "도구마다 한 줄로 무엇을 하는지 말해요. Mood는 “재미로만”을 유지해요.",
   "<b>최근 확인</b>은 판정을 이유와 함께 자기 바탕의 태그로 보여 줘요 (D3)."
  ],
  "name_ko": "보호자 · Snap",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 12",
    "docs/plan/phases/phase-12-snap.md"
   ]
  ]
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
  "name_ko": "시터 · 홈",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 06",
    "docs/plan/phases/phase-06.md"
   ]
  ]
 },
 {
  "id": "stage-1",
  "group": "stay",
  "name": "① Inquiry",
  "live": "built",
  "task": "07B · FB-30–34 — built, not captured",
  "ours": {
   "kind": "journey",
   "hash": "stage-1"
  },
  "why": "Ask Chloe, get an answer in her voice",
  "changes": [
   "Owner picks service, dates (calendar) and pets, then asks.",
   "The reply reads as Chloe's own message, with sources and a quote from the server — never from the AI (D10, D31).",
   "Health questions are handed to Chloe herself (§10).",
   "<b>Try the full dates:</b> asking for Oct 20–23 gets a polite no with other dates and <b>Find other sitters</b> (test guide ①).",
   "<b>How Chloe's reply was made</b> opens Chloe's side: the draft in her style, its sources, and auto-send at a human pace — the owner only ever sees Chloe's message.",
   "<b>Ask before booking</b> and <b>Book</b> sit side by side on Chloe's profile, as in the app since Oct 10 (FB-33).",
   "With both pets picked, Oct 16–17 show as full: Chloe has room for one pet only (INQ-22)."
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
  "why_ko": "Chloe에게 묻고, Chloe 말투로 답을 받아요",
  "changes_ko": [
   "서비스, 날짜(달력), 펫을 고르고 질문해요.",
   "답장은 Chloe 본인의 메시지로 보여요. 출처와 견적은 서버에서 — AI가 만들지 않아요 (D10, D31).",
   "건강 질문은 Chloe가 직접 답해요 (§10).",
   "<b>꽉 찬 날짜 체험:</b> 10/20–23을 물으면 정중한 거절과 다른 날짜, <b>Find other sitters</b>가 나와요 (테스트 가이드 ①).",
   "<b>Chloe의 답장은 어떻게 만들어졌나</b>를 열면 Chloe 쪽 화면이 보여요: 그녀의 말투로 쓴 초안, 근거, 사람 속도의 자동 발송. 보호자에게는 Chloe의 메시지만 보여요.",
   "Chloe 프로필에 <b>Ask before booking</b>과 <b>Book</b>이 나란히 (10/10 앱과 같음, FB-33).",
   "두 마리를 고르면 10/16–17이 꽉 찬 날로: Chloe는 한 마리만 받을 수 있어요 (INQ-22)."
  ],
  "name_ko": "① 문의",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 07B",
    "docs/plan/phases/phase-07b.md"
   ]
  ]
 },
 {
  "id": "stage-2",
  "group": "stay",
  "name": "② Meet & Greet + care request",
  "live": "built",
  "task": "06 · 3B.9 · 3B.11 (Meet link) — built, not captured",
  "ours": {
   "kind": "journey",
   "hash": "stage-2"
  },
  "why": "Turn a care request into a checklist",
  "changes": [
   "Owner writes the request; AI drafts an editable checklist with heads-up tags.",
   "Missing dose or an allergy conflict blocks Save (§10).",
   "Meet & Greet: in person or video, then who drives each handoff.",
   "<b>Google Meet link and calendar invite</b> appear once a video Meet & Greet is confirmed; in person offers either side's saved spot.",
   "<b>Ask to skip</b> (Chloe can agree), and repeat clients skip the Meet & Greet automatically."
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
   "만남 인사: 대면 또는 영상, 그리고 인계마다 누가 운전할지.",
   "영상 미팅이 확정되면 <b>Google Meet 링크와 캘린더 초대</b>가 나와요. 대면은 양쪽이 저장한 장소 중에서 골라요.",
   "<b>건너뛰기 요청</b>(Chloe가 동의 가능), 재방문 고객은 미팅을 자동으로 건너뛰어요."
  ],
  "name_ko": "② 만남 인사 + 돌봄 요청",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 06",
    "docs/plan/phases/phase-06.md"
   ],
   [
    "Phase 03B",
    "docs/plan/phases/phase-03b.md"
   ]
  ]
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
   "Chloe accepts → quote, 5 consent cards, typed name, demo pay.",
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
   "Chloe 수락 → 견적, 동의 카드 5개, 이름 입력, 데모 결제.",
   "출입 정보는 픽업 2시간 전까지 잠겨 있고, 코드는 10초 후 다시 숨어요.",
   "결제가 실패해도 동의와 서명은 그대로예요 (§10)."
  ],
  "name_ko": "③ 예약 · 결제",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 03C",
    "docs/plan/phases/phase-03c.md"
   ]
  ]
 },
 {
  "id": "stage-4",
  "group": "stay",
  "name": "④ Pick-up · live trip",
  "live": "built",
  "task": "06B — merged Oct 12 (#83), not captured",
  "ours": {
   "kind": "journey",
   "hash": "stage-4"
  },
  "why": "See the drive, then the handoff photo",
  "changes": [
   "Live map with ETA; ± only, no drag (§7.7).",
   "Arrival card, then the handoff photo check — it never blocks (D5).",
   "Running late or location off fall back to status lines (§10).",
   "<b>Location permission first</b> for whoever drives: only during the trip, only with the other person, no route history (README Privacy).",
   "On arrival the sitter's phone shows the <b>buzzer and lockbox card</b>; the owner gets visitor parking.",
   "<b>Not the same as the app any more:</b> since Oct 11 the app has the owner drive to a meeting place and Chloe tap <b>Received</b>; the handoff photo check is P1, not in the app (README 🔭)."
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
   "늦거나 위치가 꺼지면 상태 문구로 대신해요 (§10).",
   "운전하는 사람은 먼저 <b>위치 권한</b>: 이동 중에만, 상대방에게만, 경로 기록 없음 (README 개인정보).",
   "도착하면 시터 폰에 <b>부저 · 락박스 카드</b>, 보호자에게는 방문자 주차 안내.",
   "<b>이제 앱과 달라요:</b> 10/11부터 앱은 보호자가 만남 장소로 운전하고 Chloe가 <b>Received</b>를 눌러요. 인계 사진 확인은 P1이라 앱에 없어요 (README 🔭)."
  ],
  "name_ko": "④ 픽업 · 라이브 이동",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 06B",
    "docs/plan/phases/phase-06b.md"
   ]
  ]
 },
 {
  "id": "care",
  "group": "stay",
  "name": "④ Care in progress",
  "live": "built",
  "task": "05 · 06 · 09 album — built (see Today's app)",
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
  "name_ko": "④ 돌봄 중",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 05",
    "docs/plan/phases/phase-05.md"
   ],
   [
    "Phase 06",
    "docs/plan/phases/phase-06.md"
   ],
   [
    "Phase 09",
    "docs/plan/phases/phase-09.md"
   ]
  ]
 },
 {
  "id": "check",
  "group": "stay",
  "name": "④ 5-second check · daily note",
  "live": "built",
  "task": "07 · 7.2–7.7 merged Oct 8, not captured",
  "ours": {
   "kind": "journey",
   "hash": "check"
  },
  "why": "The sitter's report in five seconds",
  "changes": [
   "Up to 2 photos, AI-suggested chips (turn wrong ones off), optional one-line note.",
   "Draft only uses chips that are on; the sitter taps Send.",
   "If the AI fails, the chips go out as a plain list (D5).",
   "With two pets, Chloe picks the pet first; <b>Anything to add?</b> turns each line into her own chip, and her lines lead the note (REPORT-1, REPORT-4)."
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
   "AI가 실패하면 칩을 그대로 목록으로 보내요 (D5).",
   "펫이 둘이면 먼저 펫을 골라요. <b>Anything to add?</b>에 쓴 줄은 내 칩이 되고 알림장 맨 앞에 들어가요 (REPORT-1, REPORT-4)."
  ],
  "name_ko": "④ 5초 체크 · 알림장",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 07",
    "docs/plan/phases/phase-07.md"
   ]
  ]
 },
 {
  "id": "treat",
  "group": "stay",
  "name": "④ Treat Guard",
  "live": "none",
  "task": "08 · stretch, not built",
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
  "name_ko": "④ 간식 가드",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 08",
    "docs/plan/phases/phase-08.md"
   ]
  ]
 },
 {
  "id": "stage-5",
  "group": "stay",
  "name": "⑤ Completion · review · Life Record",
  "live": "built",
  "task": "07C · merged Oct 8, not captured",
  "ours": {
   "kind": "journey",
   "hash": "stage-5"
  },
  "why": "Close the stay and remember it",
  "changes": [
   "Return photo, stars and thanks, then the Pet Life Record with sources.",
   "New facts need the owner's OK before they enter the record (D9).",
   "<b>Max and Mochi are home safe</b> with a stay summary (nights · daily notes · photos · tasks), as built in 07C.",
   "Review takes stars, a quick thank-you and an optional comment (≤ 500 characters)."
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
   "새로 알게 된 사실은 보호자가 확인해야 기록에 들어가요 (D9).",
   "<b>Max와 Mochi 귀가 완료</b>와 스테이 요약(박 수 · 알림장 · 사진 · 할 일), 07C와 같아요.",
   "리뷰는 별점, 감사 칩, 선택 코멘트(500자 이하)."
  ],
  "name_ko": "⑤ 귀가 · 리뷰 · Life Record",
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 07C",
    "docs/plan/phases/phase-07c.md"
   ]
  ]
 },
 {
  "id": "owner-settings",
  "group": "next",
  "name": "Profile → Settings",
  "name_ko": "프로필 → 설정",
  "live": "built",
  "shot": "",
  "captured": "",
  "task": "11.11 · merged Oct 15 (#98), not captured",
  "ours": {
   "kind": "tab",
   "id": "owner-settings"
  },
  "why": "Short, with What's New on top",
  "why_ko": "짧게, What's New를 맨 위에",
  "changes": [
   "<b>Shipped Oct 15 (#98).</b> This Draft adds What's New at the top with a gold “3 new” count until it's opened.",
   "Account and Notifications as in the spec; Notifications is a stub, so each switch says what it controls.",
   "Sign out lives here (D47) as a quiet secondary button with red text.",
   "Version and date at the bottom (release rule: every deploy updates What's New)."
  ],
  "changes_ko": [
   "<b>10/15 출시 (#98).</b> 이 초안은 What's New를 맨 위에 두고, 열기 전까지 금색 “3 new”를 보여 줘요.",
   "스펙대로 계정 · 알림. 알림은 자리만 있어서 스위치마다 무엇을 켜는지 적었어요.",
   "로그아웃은 여기 (D47), 빨간 글자의 조용한 보조 버튼.",
   "맨 아래 버전과 날짜 (배포마다 What's New 갱신 규칙)."
  ],
  "components": [
   "Card",
   "Switch Row",
   "Tag",
   "Button"
  ],
  "figma": "174-50297",
  "figmaScreens": [],
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 11",
    "docs/plan/phases/phase-11-p1.md"
   ],
   [
    "CHANGELOG",
    "docs/CHANGELOG.md"
   ]
  ]
 },
 {
  "id": "owner-whatsnew",
  "group": "next",
  "name": "Settings → What's New",
  "name_ko": "설정 → What's New",
  "live": "built",
  "shot": "",
  "captured": "",
  "task": "11.11 · merged Oct 15 (#98), not captured",
  "ours": {
   "kind": "tab",
   "id": "owner-whatsnew"
  },
  "why": "Release notes people can read",
  "why_ko": "사람이 읽을 수 있는 업데이트 소식",
  "changes": [
   "<b>Shipped Oct 15 (#98)</b> with a user-facing changelog (0.2.0), so What's New reads in plain words, as proposed here.",
   "One headline for a big release, then two or three plain lines on what you can do now.",
   "Copy and design notes: design/handoff/2026-10-15-whats-new.md."
  ],
  "changes_ko": [
   "<b>10/15 출시 (#98)</b>, 사용자용 변경 기록(0.2.0)과 함께라서 What's New가 여기 제안처럼 쉬운 말로 보여요.",
   "큰 릴리스엔 제목 하나, 그 아래 지금 할 수 있는 일 두세 줄.",
   "문구와 디자인 노트: design/handoff/2026-10-15-whats-new.md."
  ],
  "components": [
   "Card",
   "Tag"
  ],
  "figma": "174-50297",
  "figmaScreens": [],
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 11",
    "docs/plan/phases/phase-11-p1.md"
   ],
   [
    "CHANGELOG",
    "docs/CHANGELOG.md"
   ]
  ]
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
  "name_ko": "보호자 가입",
  "readme": "what-changes",
  "docs": [
   [
    "Onboarding plan",
    "docs/plan/onboarding.md"
   ]
  ]
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
  "name_ko": "시터 설정",
  "readme": "how-goldito-works",
  "docs": [
   [
    "Phase 03B",
    "docs/plan/phases/phase-03b.md"
   ],
   [
    "Onboarding plan",
    "docs/plan/onboarding.md"
   ]
  ]
 },
 {
  "id": "steps-book",
  "group": "steps",
  "name": "Booking request · 6 steps",
  "name_ko": "예약 요청 · 6단계",
  "live": "built",
  "task": "3B.3 — built as one form",
  "ours": {
   "kind": "steps",
   "flow": "book"
  },
  "why": "One question per screen",
  "why_ko": "한 화면에 질문 하나",
  "changes": [
   "Pets → where → which days → drop-off → pick-up → summary with Change on every line.",
   "The likely answer is first and already picked; times are big buttons, not a wheel.",
   "Price shows early, and checkout shows the same total."
  ],
  "changes_ko": [
   "펫 → 장소 → 날짜 → 맡기기 → 찾기 → 줄마다 변경이 있는 요약.",
   "가장 흔한 답이 맨 위에 미리 골라져 있고, 시간은 휠이 아니라 큰 버튼.",
   "가격은 일찍 보이고 결제 금액과 같아요."
  ],
  "components": [
   "Choice Card",
   "Chip",
   "Calendar Day",
   "Button"
  ],
  "figma": "174-50318",
  "figmaScreens": [],
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 03B",
    "docs/plan/phases/phase-03b.md"
   ]
  ]
 },
 {
  "id": "steps-care",
  "group": "steps",
  "name": "Care request · step by step",
  "name_ko": "케어 의뢰서 · 단계별",
  "live": "built",
  "task": "6.20 — built as a chip builder + table",
  "ours": {
   "kind": "steps",
   "flow": "care"
  },
  "why": "Tell Chloe how to care for Max, one topic at a time",
  "why_ko": "주제 하나씩 Chloe에게 돌봄 방법 알려주기",
  "changes": [
   "Pick topics (meals, medicine, walks, things to watch for), then one screen each.",
   "No typing except the medicine's name; the profile's allergy is always included.",
   "You check the generated checklist before Chloe sees it."
  ],
  "changes_ko": [
   "주제(식사, 약, 산책, 주의할 것)를 고르고 하나씩.",
   "약 이름 말고는 타이핑 없음, 프로필의 알레르기는 항상 포함.",
   "만든 체크리스트를 Chloe보다 먼저 확인."
  ],
  "components": [
   "Choice Card",
   "Chip",
   "Stepper",
   "Checklist Row",
   "Heads-up Tag"
  ],
  "figma": "174-50318",
  "figmaScreens": [],
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 06",
    "docs/plan/phases/phase-06.md"
   ]
  ]
 },
 {
  "id": "steps-meet",
  "group": "steps",
  "name": "Meet & Greet · step by step",
  "name_ko": "Meet & Greet · 단계별",
  "live": "built",
  "task": "3B.9 · 3B.11 — built as a card + sheet",
  "ours": {
   "kind": "steps",
   "flow": "meet"
  },
  "why": "Video, in person, or skip, in plain words",
  "why_ko": "영상, 대면, 건너뛰기를 쉬운 말로",
  "changes": [
   "Three choices that say what they mean; skipping explains the risk first.",
   "Only times Chloe is free; the invite and Meet link happen for you."
  ],
  "changes_ko": [
   "뜻이 적힌 선택 세 개, 건너뛰기는 위험을 먼저 알려줘요.",
   "Chloe가 되는 시간만, 초대와 Meet 링크는 알아서."
  ],
  "components": [
   "Choice Card",
   "Button",
   "Banner"
  ],
  "figma": "174-50318",
  "figmaScreens": [],
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 03B",
    "docs/plan/phases/phase-03b.md"
   ]
  ]
 },
 {
  "id": "steps-pay",
  "group": "steps",
  "name": "Checkout · one agreement per screen",
  "name_ko": "결제 · 동의서 한 화면에 하나",
  "live": "built",
  "task": "03C — built as one checkout screen",
  "ours": {
   "kind": "steps",
   "flow": "pay"
  },
  "why": "Read, agree, sign, pay — one at a time",
  "why_ko": "읽고, 동의하고, 서명하고, 결제 — 하나씩",
  "changes": [
   "Total first, then 5 agreements one per screen with “I have a question”, then name, then pay.",
   "The last screen lists what happens next, with times."
  ],
  "changes_ko": [
   "금액 먼저, 동의서 5개를 한 화면씩(“질문이 있어요” 포함), 이름, 결제.",
   "마지막 화면은 다음 일을 시간과 함께."
  ],
  "components": [
   "Quote Card",
   "Consent Card",
   "Text Field",
   "Button"
  ],
  "figma": "174-50318",
  "figmaScreens": [],
  "readme": "a-stay-with-goldito-demo-path",
  "docs": [
   [
    "Phase 03C",
    "docs/plan/phases/phase-03c.md"
   ]
  ]
 }
];
// Every README promise → where to play it in the Draft, its Figma section, and its status in the app (test-guide.md §2, main @ 1a7be5a, Oct 15). Optional 6th field: "no" = not in the Draft yet, "related" = a related Draft screen.
// app: "built" · "part" · "none". screen: an id above (Play opens that screen in the Prototype).
window.GOLDITO_FEATURES = [
 ["① Inquiry", [
  ["Sitter profile: Ask before booking next to Book", "시터 프로필: Ask before booking과 Book 나란히", "stage-1", "built", "FB-33"],
  ["Ask with service, dates and pets", "서비스 · 날짜 · 펫을 골라 문의", "stage-1", "built", "07B"],
  ["Calendar shows days that are full for these pets", "이 펫들로는 꽉 찬 날을 달력에 표시", "stage-1", "built", "FB-33"],
  ["Reply in the sitter's style, with sources and the server's quote", "시터 말투로 쓴 답장, 근거와 서버 견적", "stage-1", "built", "07B"],
  ["Send with one tap, or auto-send at a human pace", "한 번 탭해 보내기, 또는 사람 속도의 자동 발송", "stage-1", "built", "7B.10"],
  ["Full dates → other dates and other sitters", "꽉 찬 날짜 → 다른 날짜와 다른 시터", "stage-1", "built", "7B.5"]]],
 ["② Meet & Greet", [
  ["Care request → checklist and Heads-up, reviewed by the owner", "케어 요청 → 체크리스트와 주의 사항, 보호자가 확인", "stage-2", "built", "06"],
  ["Meet first: in person or video, or ask to skip", "먼저 만나기: 대면 또는 영상, 건너뛰기 요청", "stage-2", "built", "3B.9"],
  ["Google Meet link and calendar invite", "Google Meet 링크와 캘린더 초대", "stage-2", "part", "3B.11"],
  ["Owner drives or Sitter drives", "보호자가 운전 / 시터가 운전", "stage-2", "built", "3B"],
  ["Chloe says “Yes, let's meet”: her dates are held, both see a step bar", "Chloe의 “Yes, let's meet”: 날짜를 잡아 두고 둘 다 단계 바를 봐요", "stage-2", "built", "#79", "no"]]],
 ["③ Booking", [
  ["Quote with holiday and multi-pet rates", "공휴일 · 다두 요금이 들어간 견적", "stage-3", "built", "03C"],
  ["Five consents, typed signature, demo payment", "동의서 5개, 이름 서명, 데모 결제", "stage-3", "built", "03C"],
  ["Address, parking and packing list unlock after payment", "결제 후 주소 · 주차 · 준비물 공개", "stage-3", "built", "03C"],
  ["Entry info unlocks 2 h before, owner notified", "출입 정보는 2시간 전 공개, 보호자에게 알림", "stage-3", "built", "03C"],
  ["Decline, or “Not this sitter”, with a reason chip", "거절 또는 “Not this sitter”, 이유 칩과 함께", "stage-3", "built", "#78", "no"]]],
 ["④ Care & Pet Transit", [
  ["Live trip: location permission, map and ETA", "실시간 이동: 위치 권한, 지도, ETA", "stage-4", "built", "06B"],
  ["Arrival cards: visitor parking / buzzer and lockbox", "도착 카드: 방문자 주차 / 부저와 락박스", "stage-4", "built", "06B"],
  ["No location sharing → the meeting place and Open in Google Maps", "위치 공유 안 함 → 만남 장소와 Google 지도 열기", "stage-4", "built", "06B", "no"],
  ["Handoff photo check (pet visible, secured)", "인계 사진 확인 (펫이 보이고 고정됨)", "stage-4", "none", "P1 · API ready"],
  ["Feed, tasks and check-ins during the stay", "돌봄 중 피드 · 할 일 · 체크인", "care", "built", "05 · 06"],
  ["5-second check → AI daily note, sitter approves", "5초 체크 → AI 알림장, 시터가 승인", "check", "built", "07"],
  ["Daily note: pick the pet, add your own lines", "알림장: 펫 고르기, 내 줄 추가", "check", "built", "7.3 · FB-19"],
  ["Timeline album: Meals · Walks · Naps", "타임라인 앨범: 식사 · 산책 · 낮잠", "care", "built", "09"],
  ["Treat check (DANGER that only “I understand” closes)", "간식 확인 (“I understand”로만 닫히는 DANGER)", "treat", "built", "12 · #90"],
  ["Snap tab: treat check for owners too, pet mood, stickers", "Snap 탭: 보호자도 간식 확인, 기분, 스티커", "owner-snap", "built", "12 · #90 #91"],
  ["Stickers on a picture-diary page", "그림일기 페이지에 스티커", "owner-snap", "built", "12.4", "related"]]],
 ["⑤ Completion", [
  ["Home safe, with a stay summary", "귀가 완료와 스테이 요약", "stage-5", "built", "07C"],
  ["Stars, thanks and a comment", "별점, 감사, 코멘트", "stage-5", "built", "07C"],
  ["Returned, with a confirm sheet", "확인 시트가 있는 Returned", "stage-5", "built", "06B", "no"],
  ["Favorites, and the sitter's private note about the owner", "즐겨찾기, 시터만 보는 보호자 메모", "stage-5", "built", "#60", "no"],
  ["Pet Life Record, only recorded facts", "Pet Life Record, 기록된 사실만", "stage-5", "built", "07C"],
  ["Next stay starts from the Life Record", "다음 스테이는 Life Record에서 시작", "stage-1", "built", "7C.6"]]],
 ["P1 and judging extras", [
  ["Ask the sitter for a photo", "시터에게 사진 요청", "owner-feed", "built", "11.1 · #94", "no"],
  ["Settings and What's New, in plain words", "설정과 What's New, 쉬운 말로", "owner-whatsnew", "built", "11.11 · #98"],
  ["Split view: owner and sitter phones side by side", "분할 화면: 보호자와 시터 폰을 나란히", "owner-home", "built", "10.10 · #97", "no"]]],
 ["New pet profile (11.15, built last)", [
  ["One question per screen, large text, photo and voice", "한 화면 한 질문, 큰 글씨, 사진과 음성", "steps-care", "none", "11.15", "related"],
  ["“Max at a glance” card for the sitter", "시터가 보는 “Max at a glance” 카드", "stage-2", "none", "11.15", "no"]]],
];
