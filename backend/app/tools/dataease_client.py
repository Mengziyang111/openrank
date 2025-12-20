"""DataEase integration (lightweight)
说明：初期不一定要调用 DataEase API。更稳的做法是：
- 生成“带参数的看板链接”
- 或在 README/PPT 放截图
"""

def build_dashboard_link(dashboard_base_url: str, repo: str) -> str:
    # TODO: 拼接 DataEase 看板 URL 参数
    return f"{dashboard_base_url}?repo={repo}"
