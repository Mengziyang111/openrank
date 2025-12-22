"""MaxKB integration (placeholder)
用途：指标解释库 / 治理策略库（SOP模板）。
提供简单的本地 mock summarize 功能，便于 demo 使用。
"""
from app.core.config import settings


def search_kb(query: str) -> list[dict]:
    # TODO: call MaxKB API
    return []


def summarize_findings(snapshot: dict) -> str:
    """Return a short human-readable summary for a snapshot.
    In mock mode, generate a simple templated summary.
    """
    if settings.USE_MOCK:
        metrics = snapshot.get("metrics", {})
        parts = []
        for k, info in metrics.items():
            latest = info.get("latest") if info.get("latest") is not None else "N/A"
            change = info.get("change_pct")
            change_txt = f" ({change:+.0%})" if change is not None else ""
            parts.append(f"{k}: {latest}{change_txt}")
        return "; ".join(parts) or "No notable findings"
    # fallback stub
    return "No KB notes available"
