from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="local", alias="APP_ENV")
    app_timezone: str = Field(default="America/Toronto", alias="APP_TIMEZONE")
    cors_origins: str = Field(
        default="http://localhost:8081,http://localhost:19006",
        alias="CORS_ORIGINS",
    )

    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_service_role_key: str | None = Field(
        default=None, alias="SUPABASE_SERVICE_ROLE_KEY"
    )
    supabase_jwt_secret: str | None = Field(default=None, alias="SUPABASE_JWT_SECRET")

    cloudinary_cloud_name: str | None = Field(default=None, alias="CLOUDINARY_CLOUD_NAME")
    cloudinary_api_key: str | None = Field(default=None, alias="CLOUDINARY_API_KEY")
    cloudinary_api_secret: str | None = Field(default=None, alias="CLOUDINARY_API_SECRET")

    nebius_api_key: str | None = Field(default=None, alias="NEBIUS_API_KEY")

    model_vision: str = Field(
        default="openbmb/MiniCPM-V-4_5", alias="MODEL_VISION"
    )
    model_vision_base_url: str = Field(
        default="https://api.tokenfactory.us-central1.nebius.com/v1/",
        alias="MODEL_VISION_BASE_URL",
    )
    model_safety: str = Field(
        default="nvidia/Nemotron-3-Ultra-550b-a55b", alias="MODEL_SAFETY"
    )
    model_safety_base_url: str = Field(
        default="https://api.tokenfactory.us-central1.nebius.com/v1/",
        alias="MODEL_SAFETY_BASE_URL",
    )
    model_report: str = Field(
        default="nvidia/nemotron-3-super-120b-a12b", alias="MODEL_REPORT"
    )
    model_report_base_url: str = Field(
        default="https://api.tokenfactory.us-central1.nebius.com/v1/",
        alias="MODEL_REPORT_BASE_URL",
    )
    model_fast: str = Field(
        default="nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", alias="MODEL_FAST"
    )
    model_fast_base_url: str = Field(
        default="https://api.tokenfactory.nebius.com/v1/",
        alias="MODEL_FAST_BASE_URL",
    )

    # Embeddings for RAG (D33): Qwen3-Embedding, 1024 dimensions → pgvector vector(1024).
    model_embed: str = Field(default="Qwen/Qwen3-Embedding-8B", alias="MODEL_EMBED")
    model_embed_base_url: str = Field(
        default="https://api.tokenfactory.nebius.com/v1/", alias="MODEL_EMBED_BASE_URL"
    )
    model_embed_dim: int = Field(default=1024, alias="MODEL_EMBED_DIM")

    # Inquiry replies via a tool-calling agent (7B.11, D46): off = always one grounded call; on = always the agent;
    # auto (default) = the agent only for questions that need a lookup (see ai/inquiry_agent.needs_agent).
    inquiry_agent: Literal["off", "auto", "on"] = Field(default="auto", alias="INQUIRY_AGENT")

    tavily_api_key: str | None = Field(default=None, alias="TAVILY_API_KEY")

    demo_password: str | None = Field(default=None, alias="DEMO_PASSWORD")

    # Video Meet & Greet (3B.11, D45): the Goldito Google account creates Calendar events
    # with a Google Meet link. The refresh token comes from one consent by that account.
    google_oauth_client_id: str | None = Field(default=None, alias="GOOGLE_OAUTH_CLIENT_ID")
    google_oauth_client_secret: str | None = Field(default=None, alias="GOOGLE_OAUTH_CLIENT_SECRET")
    google_oauth_refresh_token: str | None = Field(default=None, alias="GOOGLE_OAUTH_REFRESH_TOKEN")
    google_calendar_id: str = Field(default="primary", alias="GOOGLE_CALENDAR_ID")
    # false = links only, no invite emails (demo `.test` addresses never get one anyway).
    meet_invite_attendees: bool = Field(default=True, alias="MEET_INVITE_ATTENDEES")

    @property
    def google_meet_configured(self) -> bool:
        return bool(
            self.google_oauth_client_id
            and self.google_oauth_client_secret
            and self.google_oauth_refresh_token
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
