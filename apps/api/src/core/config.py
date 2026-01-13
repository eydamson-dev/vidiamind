import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    PORT: int = 3333
    HOST: str = "0.0.0.0"

    MONGODB_URI: str = (
        "MONGODB_URI=mongodb://mongo:27017/vidiamind?directConnection=true"
    )
    DB_NAME: str = "vidiamind"
    COLLECTION_NAME: str = "video_vectors"

    # 3. AI / Ollama Settings
    OLLAMA_HOST: str = "http://ollama:11434"
    LLM_MODEL: str = "llama3.1"
    EMBED_MODEL: str = "nomic-embed-text"

    # 4. API Keys (Defaults to None if not provided)
    OPENROUTER_API_KEY: str | None = None
    OPEN_ROUTER_MODEL: str = "tngtech/deepseek-r1t2-chimera:free"

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env.dev"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Global instance to be used across the app
settings = Settings()
