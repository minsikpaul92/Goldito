# Tavily — PawNote에서 쓰는 방법

## Tavily가 뭐야?

**Tavily**는 **AI 에이전트(에이전틱 앱)용 웹 검색 API**입니다.

| 일반 Google 검색 | Tavily |
| :--- | :--- |
| 링크 목록 위주 | LLM이 바로 읽을 **정리된 본문** + (선택) **짧은 답변** |
| 앱이 직접 크롤링·파싱 | 검색·추출을 API 한 번에 |

PawNote에서는 **Nemotron(고정된 학습 지식)** 만으로는 모르는 **최신 정보**를 가져올 때 씁니다.

---

## PawNote에서 어디에 쓰나?

**간식 세이프티 가드** — [Phase 08.7](phases/phase-08.md) (stretch, 8.1–8.6 끝나면 바로). Phase 08 자체가 시나리오 코어(03B–07C) 뒤 P0 stretch (D27). 못 하면 Phase 11.3:

1. Vision이 성분표를 읽고 Ultra가 알레르기를 판단
2. 결과가 **WARNING**이거나 **모르는 성분**이 있으면 → **Tavily `search`**
3. 검색 요약 + URL을 Ultra에 다시 넣어 최종 JSON
4. UI 경고 모달에 **Sources(출처 링크)** 표시 → 견주·심사위원이 신뢰 가능

`search` 하나만 씁니다. `/extract`·`/crawl`·`/research`는 쓰지 않습니다.

### 검색어 규칙

Tavily 권장: **챗봇에게 묻듯 문장으로 쓰지 말고, 검색창에 치듯 키워드로.** (Sep 29 Builders & Brews Toronto Tavily 세션)

| 목적 | 쿼리 (키워드) | 옵션 |
| :--- | :--- | :--- |
| 종별 독성 | `"{ingredient} toxic {species}s"` → `propylene glycol toxic cats` | `include_domains` = 신뢰 도메인 |
| 숨은 알레르기 출처 | `"{ingredient} {allergen} derived"` → `animal fat chicken derived` | `include_domains` = 신뢰 도메인 |
| 리콜 (제품명 있을 때 1회) | `"{product} {species} treat recall"` | `topic="news"`, `time_range="year"` |

- **신뢰 도메인:** `aspca.org`, `fda.gov`, `avma.org`, `petpoisonhelpline.com`, `vcahospitals.com` — 결과가 0개면 도메인 필터 없이 1회 재시도.
- 한 번의 스캔에서 쿼리 **최대 4개**(성분 3 + 리콜 1), 병렬 호출, **총 8초** 제한. 실패하면 Tavily 없이 Ultra 1차 결과를 그대로 반환.

---

## 해커톤 상 · 크레딧

| 항목 | 내용 |
| :--- | :--- |
| **Best Use of Tavily** | **$3,000** — 앱이 **런타임에 Tavily API를 실제 호출**해야 함 |
| **Builders & Brews Toronto** | **8,000 Tavily credits** (이벤트 혜택) — Phase 11 전에도 실험 가능 |
| **키** | [tavily.com](https://tavily.com) 대시보드 → API Key → `backend/.env`의 `TAVILY_API_KEY` |

추론은 **Nebius Token Factory(Nemotron)**, **검색만 Tavily** — 둘 다 README·영상·피드백에 역할을 나눠 적습니다.

---

## 코드 (백엔드만)

```python
from tavily import TavilyClient

client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
res = client.search(
    query="xylitol toxic dogs",
    search_depth="basic",
    max_results=3,
    include_answer=True,
    include_domains=["aspca.org", "fda.gov", "avma.org", "petpoisonhelpline.com", "vcahospitals.com"],
)
# res["answer"], res["results"][i]["content"], res["results"][i]["url"]
```

의존성: `tavily-python` (Phase 08.7 PR에서 추가).

---

## Supabase / Cloudinary / Nebius와 관계

- **Tavily는 DB·사진 저장을 대체하지 않습니다.**
- **Supabase** · **Cloudinary** · **Nebius AI Cloud(API 서버)** 그대로 두고, Tavily는 **안전 검사 단계의 웹 검색**만 담당합니다.
