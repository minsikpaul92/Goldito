"""POST /api/ai/safety-check — Snap → Treat check (Phase 12.1, the Phase 08 design, D61).

A treat label photo → the vision model copies out the ingredients → the server's rule table (allergens, species
toxins, hidden allergen sources) → Tavily on trusted vet / government sites, every time → Nemotron Ultra decides once
with that evidence → the final status is never lower than the rules'. The pet's owner and the sitter on duty may check.
A DANGER found by the sitter tells the owner (013 trigger).
"""

import json
import logging
import re
import time
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from app.ai import safety
from app.ai.prompts import load_prompt
from app.deps import limits
from app.deps.auth import CurrentUser, get_current_user
from app.deps.supabase import get_service_client
from app.services import authz, nebius, tavily
from app.services import cloudinary as cloudinary_service

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(limits.ai_calls)])
log = logging.getLogger("goldito.ai")

VISION_TIMEOUT_S = 30.0
REASONING_TIMEOUT_S = 60.0
MAX_INGREDIENTS = 60
MAX_ITEM_CHARS = 120
MAX_SOURCES = 5
_SPLIT = re.compile(r"[;,]")

Status = Literal["SAFE", "WARNING", "DANGER"]


class SafetyCheckRequest(BaseModel):
    pet_id: UUID
    media_id: UUID


def _clean_items(value, limit: int = MAX_INGREDIENTS) -> tuple[list[str], bool]:
    """Tidied, de-duplicated items, and whether anything had to be dropped (too many, or too long even re-split)."""
    if not isinstance(value, list):
        return [], False
    out: list[str] = []
    cut = False
    for item in value:
        text = " ".join(nebius.strip_think(str(item)).split()).strip(" .;:").lower()
        # A whole list sent as one string: split it again instead of cutting it at 120 characters.
        parts = [text] if len(text) <= MAX_ITEM_CHARS else [p.strip(" .;:") for p in _SPLIT.split(text)]
        for part in parts:
            if not part:
                continue
            if len(part) > MAX_ITEM_CHARS:
                cut = True
                part = part[:MAX_ITEM_CHARS]
            if part not in out:
                out.append(part)
    return out[:limit], cut or len(out) > limit


def _clean_list(value, limit: int = MAX_INGREDIENTS) -> list[str]:
    return _clean_items(value, limit)[0]


class LabelReading(BaseModel):
    """What the vision model copied from the label."""

    readable: bool = False
    # None: the model did not say (older prompt) — not treated as partial, but logged.
    complete: bool | None = None
    product_name: str | None = None
    ingredients: list[str] = Field(default_factory=list)
    # Set by the server, never by the model: the list had to be cut.
    truncated: bool = False

    @model_validator(mode="before")
    @classmethod
    def _tidy(cls, data):
        if isinstance(data, dict):
            items, cut = _clean_items(data.get("ingredients"))
            data = {**data, "ingredients": items, "truncated": cut}
        return data

    @field_validator("product_name", mode="before")
    @classmethod
    def _product(cls, value):
        text = " ".join(str(value or "").split())[:120]
        return text or None


class HiddenSource(BaseModel):
    ingredient: str
    may_contain: str
    reason: str = ""


class Judgement(BaseModel):
    """What Nemotron Ultra decided (the server may still raise the status)."""

    safety_status: Status
    matched_allergens: list[str] = Field(default_factory=list)
    hidden_sources: list[HiddenSource] = Field(default_factory=list)
    toxic_ingredients: list[str] = Field(default_factory=list)
    unknown_ingredients: list[str] = Field(default_factory=list)
    warning_message: str = ""
    # The numbers (`id`) of the site excerpts the verdict relied on. The server still checks each one (safety.sources_to_show).
    sources: list[int] = Field(default_factory=list)

    @field_validator("safety_status", mode="before")
    @classmethod
    def _status(cls, value):
        return str(value).strip().upper()

    @field_validator("matched_allergens", "toxic_ingredients", "unknown_ingredients", mode="before")
    @classmethod
    def _lists(cls, value):
        return _clean_list(value, 20)

    @field_validator("sources", mode="before")
    @classmethod
    def _used(cls, value):
        if not isinstance(value, list):
            return []
        return [n for n in value if isinstance(n, int) and not isinstance(n, bool)][:MAX_SOURCES]

    @field_validator("hidden_sources", mode="before")
    @classmethod
    def _hidden(cls, value):
        return value[:10] if isinstance(value, list) else []

    @field_validator("warning_message", mode="before")
    @classmethod
    def _message(cls, value):
        return " ".join(nebius.strip_think(str(value or "")).split())[:300]


class Source(BaseModel):
    title: str
    url: str
    domain: str


class SafetyCheckResponse(BaseModel):
    safety_check_id: str
    safety_status: Status
    product_name: str | None
    detected_ingredients: list[str]
    matched_allergens: list[str]
    hidden_sources: list[HiddenSource]
    toxic_ingredients: list[str]
    unknown_ingredients: list[str]
    sources: list[Source]
    # Tavily did not answer this time: the result stands on the label, the rules and the model only.
    sources_unavailable: bool
    # The reasoning model did not answer: rules only, and never SAFE.
    double_checked: bool
    # Part of the ingredient list is missing (cut off in the photo, or too long): never SAFE.
    partial_label: bool
    warning_message: str
    model: str
    latency_ms: int


def _authorize(user: CurrentUser, pet_id: UUID) -> None:
    """The pet's owner, or the sitter on duty for it (D61)."""
    if user.role == "owner":
        authz.assert_owner_of(user, pet_id)
    else:
        authz.assert_on_duty_for(user, pet_id)


def _union(*lists: list[str]) -> list[str]:
    out: list[str] = []
    for items in lists:
        for item in items:
            if item not in out:
                out.append(item)
    return out


@router.post("/safety-check", response_model=SafetyCheckResponse)
def safety_check(body: SafetyCheckRequest, user: CurrentUser = Depends(get_current_user)) -> SafetyCheckResponse:
    started = time.monotonic()
    pet_id = str(body.pet_id)
    _authorize(user, body.pet_id)
    db = get_service_client()

    rows = (
        db.table("media")
        .select("id, pet_id, uploaded_by, cloudinary_public_id, resource_type, purpose")
        .eq("id", str(body.media_id))
        .limit(1)
        .execute()
        .data
    )
    media = rows[0] if rows else None
    if not media or media["uploaded_by"] != user.id or media["pet_id"] != pet_id or media["purpose"] != "safety_label":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That photo isn't yours to check.")

    pets = db.table("pets").select("id, name, species, breed, weight_kg").eq("id", pet_id).limit(1).execute().data
    if not pets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")
    pet = pets[0]
    allergens = [a["allergen"] for a in db.table("pet_allergies").select("allergen").eq("pet_id", pet_id).execute().data]

    # 1. Read the label.
    try:
        data_url = cloudinary_service.fetch_as_data_url(media["cloudinary_public_id"], media["resource_type"])
        label, vision = nebius.chat_json(
            "vision",
            [
                {"role": "system", "content": load_prompt("safety/vision_system.md")},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Copy out this treat label."},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            LabelReading,
            endpoint="safety-check-vision",
            max_tokens=700,
            temperature=0.0,
            timeout=VISION_TIMEOUT_S,
        )
    except (nebius.AIUnavailable, cloudinary_service.MediaFetchError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Couldn't read the label right now. Try again in a moment.",
        ) from exc
    except nebius.AIInvalidOutput as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Couldn't read the label. Try a closer, well-lit photo."
        ) from exc
    if not label.readable or not label.ingredients:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Couldn't read the label. Try a closer, well-lit photo of the ingredient list.",
        )

    partial = label.complete is False or label.truncated
    if label.complete is None:
        log.info("safety-check: vision did not say whether the list is complete")

    # 2. The rule table, then 3. the trusted sites.
    rules =safety.check_rules(label.ingredients, allergens, pet["species"])
    queries = safety.search_queries(label.ingredients, allergens, pet["species"], label.product_name, rules)
    hits, searched = tavily.search_many(queries)

    # 4. Ultra decides once, with the evidence.
    facts = {
        "pet": {k: pet.get(k) for k in ("name", "species", "breed", "weight_kg")},
        "allergies": allergens,
        "product_name": label.product_name,
        "ingredients": label.ingredients,
        "label_complete": not partial,
        "rule_findings": {
            "status": rules.status,
            "matched_allergens": rules.matched_allergens,
            "toxic_ingredients": rules.toxic_ingredients,
            "hidden_sources": rules.hidden_sources,
        },
        "site_excerpts": [{"id": i, "source": h["domain"], "title": h["title"], "text": h["content"]} for i, h in enumerate(hits[:8], 1)],
    }
    judgement: Judgement | None = None
    model_name = vision.model
    try:
        judgement, reasoning = nebius.chat_json(
            "safety",
            [
                {"role": "system", "content": load_prompt("safety/reasoning_system.md")},
                {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
            ],
            Judgement,
            endpoint="safety-check",
            reasoning=True,
            max_tokens=2000,
            temperature=0.2,
            timeout=REASONING_TIMEOUT_S,
        )
        model_name = reasoning.model
    except (nebius.AIUnavailable, nebius.AIInvalidOutput) as exc:
        log.info("safety-check: rules only (%s)", exc.__class__.__name__)

    # 5. Never lower than the rules; without the model's double check, never SAFE.
    if judgement:
        final = safety.worst(rules.status, judgement.safety_status)
        message = judgement.warning_message or safety.fallback_message(pet["name"], final, rules)
        if final != judgement.safety_status:
            message = safety.fallback_message(pet["name"], final, rules)
    else:
        final = safety.worst(rules.status, "WARNING")
        message = safety.fallback_message(pet["name"], final, rules)
    if partial and final == "SAFE":
        # Only the missing part keeps it from SAFE: say that, not a rule sentence.
        final, message = "WARNING", safety.partial_message(pet["name"])

    hidden =[HiddenSource(**h) for h in rules.hidden_sources]
    for item in judgement.hidden_sources if judgement else []:
        if all(h.ingredient != item.ingredient for h in hidden):
            hidden.append(item)
    # Pages the owner sees: only ones the model cited that are about this verdict, and none when the pet's own allergy
    # and the label already settle it (a search result there is noise, not proof).
    terms = [
        *rules.matched_allergens,
        *rules.toxic_ingredients,
        *(judgement.toxic_ingredients if judgement else []),
        *(judgement.unknown_ingredients if judgement else []),
        *(x for h in hidden for x in (h.ingredient, h.may_contain)),
        *([label.product_name] if label.product_name else []),
    ]
    shown = safety.sources_to_show(
        hits[:8],
        judgement.sources if judgement else [],
        terms,
        rule_allergen_hit=bool(rules.matched_allergens),
        limit=MAX_SOURCES,
    )
    sources = [Source(title=h["title"], url=h["url"], domain=h["domain"]) for h in shown]

    result = SafetyCheckResponse(
        safety_check_id="",
        safety_status=final,
        product_name=label.product_name,
        detected_ingredients=label.ingredients,
        matched_allergens=_union(rules.matched_allergens, judgement.matched_allergens if judgement else []),
        hidden_sources=hidden,
        toxic_ingredients=_union(rules.toxic_ingredients, judgement.toxic_ingredients if judgement else []),
        unknown_ingredients=judgement.unknown_ingredients if judgement else [],
        sources=sources,
        sources_unavailable=not searched,
        double_checked=judgement is not None,
        partial_label=partial,
        warning_message=message,
        model=model_name,
        latency_ms=int((time.monotonic() - started) * 1000),
    )

    saved = (
        db.table("safety_checks")
        .insert(
            {
                "pet_id": pet_id,
                "checked_by": user.id,
                "media_id": str(body.media_id),
                "safety_status": final,
                "result_json": {
                    **result.model_dump(exclude={"safety_check_id"}),
                    "rule_status": rules.status,
                    "model_status": judgement.safety_status if judgement else None,
                    "label_complete": label.complete,
                    "queries": [q.text for q in queries],
                },
                "model_vision": vision.model,
                "model_reasoning": model_name if judgement else None,
            }
        )
        .execute()
        .data
    )
    result.safety_check_id = saved[0]["id"]
    return result
