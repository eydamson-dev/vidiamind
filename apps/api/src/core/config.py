import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    # 1. Server Settings
    PORT: int = 3333
    HOST: str = "0.0.0.0"
    
    # 2. MongoDB Settings
    MONGODB_URI: str = Field(default=...)
    DB_NAME: str = "vidiamind"
    COLLECTION_NAME: str = "video_vectors"
    
    # 3. AI / Ollama Settings
    OLLAMA_HOST: str = "http://ollama:11434"
    LLM_MODEL: str = "llama3.1"
    EMBED_MODEL: str = "nomic-embed-text"
    
    # 4. API Keys (Defaults to None if not provided)
    OPENROUTER_API_KEY: str | None = None
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env.dev"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Global instance to be used across the app
settings = Settings()
