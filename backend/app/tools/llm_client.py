"""LLM client (placeholder)
建议：先用轻量方式接入模型（OpenAI-compatible），避免 LangChain 依赖树过大。
"""

from app.core.config import settings

def llm_chat(messages: list[dict]) -> str:
    # TODO: integrate real LLM (OpenAI-compatible)
    # Do not import heavy deps here until env is stable.
    _ = settings  # keep config referenced
    return "TODO: llm response"
