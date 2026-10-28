from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.routers import (
    ai_caption,
    ai_care_plan,
    ai_chat,
    ai_daily_report,
    ai_diary_entry,
    ai_diary_photo_chips,
    ai_handoff_check,
    ai_inquiry,
    ai_life_record,
    ai_pet_mood,
    ai_pet_photo,
    ai_pet_review,
    ai_pet_voice,
    ai_report_chips,
    ai_safety_check,
    breed_needs,
    demo,
    feed,
    geo,
    health,
    me,
    media,
    meet_greet,
    pet_photos,
    profile_photos,
    rag,
    sweep,
    tone,
)

settings = get_settings()

app = FastAPI(title="Goldito API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(me.router)
app.include_router(meet_greet.router)
app.include_router(demo.router)
app.include_router(media.router)
app.include_router(profile_photos.router)
app.include_router(pet_photos.router)
app.include_router(breed_needs.router)
app.include_router(feed.router)
app.include_router(geo.router)
app.include_router(ai_care_plan.router)
app.include_router(ai_chat.router)
app.include_router(ai_caption.router)
app.include_router(ai_daily_report.router)
app.include_router(ai_handoff_check.router)
app.include_router(ai_inquiry.router)
app.include_router(ai_life_record.router)
app.include_router(ai_pet_mood.router)
app.include_router(ai_pet_photo.router)
app.include_router(ai_pet_review.router)
app.include_router(ai_pet_voice.router)
app.include_router(ai_report_chips.router)
app.include_router(ai_diary_photo_chips.router)
app.include_router(ai_diary_entry.router)
app.include_router(ai_safety_check.router)
app.include_router(rag.router)
app.include_router(sweep.router)
app.include_router(tone.router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "http_error"
    if exc.status_code == 401:
        code = "unauthorized"
    elif exc.status_code == 403:
        code = "forbidden"
    elif exc.status_code == 404:
        code = "not_found"
    elif exc.status_code == 409:
        code = "conflict"
    elif exc.status_code == 429:
        code = "rate_limited"
    elif exc.status_code == 503:
        code = "not_configured"
    elif exc.status_code == 502:
        code = "upstream_error"
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail, "code": code},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Invalid request body or parameters.",
            "code": "invalid_input",
            # `ctx` can hold the original exception object, which is not JSON serializable.
            "errors": [{k: v for k, v in err.items() if k != "ctx"} for err in exc.errors()],
        },
    )
