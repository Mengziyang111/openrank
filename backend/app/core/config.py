from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    OPENDIGGER_BASE_URL: str = "https://oss.open-digger.cn"
    OPENDIGGER_PLATFORM: str = "github"

    # If True, clients will use local demo/mock data for quick development
    USE_MOCK: bool = True

    DATAEASE_BASE_URL: str | None = None
    MAXKB_BASE_URL: str | None = None
    LLM_BASE_URL: str | None = None
    LLM_API_KEY: str | None = None

    class Config:
        env_file = ".env"

settings = Settings()
