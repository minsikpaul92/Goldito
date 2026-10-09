from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.routers import (
    ai_caption,
    ai_care_plan,
    ai_daily_report,
    ai_inquiry,
    ai_life_record,
    ai_report_chips,
    feed,
    health,
    me,
    media,
    meet_greet,
    rag,
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
app.include_router(media.router)
app.include_router(feed.router)
app.include_router(ai_care_plan.router)
app.include_router(ai_caption.router)
app.include_router(ai_daily_report.router)
app.include_router(ai_inquiry.router)
app.include_router(ai_life_record.router)
app.include_router(ai_report_chips.router)
app.include_router(rag.router)
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
