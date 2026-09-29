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

**간식 세이프티 가드** (Phase 08 / 11):

1. Vision이 성분표를 읽고 Ultra가 알레르기를 판단
2. **모르는 성분**, **애매한 표기**(예: animal fat), **리콜**이 필요하면 → **Tavily `search`**
3. 검색 요약 + URL을 Ultra에 다시 넣어 최종 JSON
4. UI 경고 모달에 **Sources(출처 링크)** 표시 → 견주·심사위원이 신뢰 가능

예시 쿼리:

- `Is hydrolyzed poultry protein safe for dogs with chicken allergy?`
- `{brand} {product name} dog treat recall 2026`
- `Is propylene glycol safe for cats?` (고양이 전용 독성 확인)

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
    query="Is xylitol toxic to dogs?",
    search_depth="basic",
    max_results=5,
    include_answer=True,
)
# res["answer"], res["results"][i]["content"], res["results"][i]["url"]
```

의존성: `tavily-python` (Phase 11 또는 safety 파이프라인 PR에서 추가).

---

## Supabase / Cloudinary / Nebius와 관계

- **Tavily는 DB·사진 저장을 대체하지 않습니다.**
- **Supabase** · **Cloudinary** · **Nebius AI Cloud(API 서버)** 그대로 두고, Tavily는 **안전 검사 단계의 웹 검색**만 담당합니다.
