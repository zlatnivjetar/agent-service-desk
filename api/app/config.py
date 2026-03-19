import json
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379"
    openai_api_key: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60
    cors_origins: list[str] = ["http://localhost:3000"]
    mock_ai: bool = False  # Set MOCK_AI=1 to bypass OpenAI calls for local testing
    environment: str = "development"

    model_config = {"env_file": Path(__file__).resolve().parents[1] / ".env.local"}

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v


settings = Settings()
