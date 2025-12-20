# OpenSODA-OSS-Copilot

一个面向开源数字生态的 **一站式 Agent 综合体**：
- 数据洞察（Analyze）
- 热度/趋势预测（Predict）
- 监控预警与治理建议（Monitor & Governance）
并覆盖 5 个用户场景：维护者 / 企业 OSPO / 新人 / 技术决策者 / 生态治理者。

> 该仓库为“比赛交付导向”的骨架：目录齐全 + 关键入口可运行（/health）。
> 你们只需要按模块逐步填充 TODO 即可。

---

## Quick Start (Backend)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
python -m pip install -U pip setuptools wheel
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open:
- http://127.0.0.1:8000/health

---

## Project Structure
见 docs/ProjectTree.md
