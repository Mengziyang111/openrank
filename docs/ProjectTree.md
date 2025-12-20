# Project Tree (Annotated)

```text
OpenSODA-OSS-Copilot/
├── backend/                                  # 后端：FastAPI + Agent 编排 + ETL + 监控
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── logging.py
│   │   ├── api/
│   │   │   ├── health.py
│   │   │   ├── chat.py
│   │   │   ├── metrics.py
│   │   │   ├── forecast.py
│   │   │   ├── monitor.py
│   │   │   ├── portfolio.py
│   │   │   └── graph.py
│   │   ├── schemas/
│   │   │   ├── output_schema.py
│   │   │   └── requests.py
│   │   ├── db/
│   │   │   ├── base.py
│   │   │   ├── models.py
│   │   │   └── migrations/
│   │   ├── services/
│   │   │   ├── router.py
│   │   │   ├── orchestrator.py
│   │   │   ├── evidence.py
│   │   │   ├── snapshot.py
│   │   │   ├── report.py
│   │   │   ├── forecast.py
│   │   │   ├── monitor.py
│   │   │   ├── portfolio.py
│   │   │   ├── recommend.py
│   │   │   ├── compare.py
│   │   │   └── governance.py
│   │   ├── skills/
│   │   │   ├── base.py
│   │   │   ├── maintainer.py
│   │   │   ├── ospo.py
│   │   │   ├── newcomer.py
│   │   │   ├── advisor.py
│   │   │   └── ecosystem.py
│   │   ├── tools/
│   │   │   ├── opendigger_client.py
│   │   │   ├── dataease_client.py
│   │   │   ├── maxkb_client.py
│   │   │   ├── easygraph_engine.py
│   │   │   └── llm_client.py
│   │   ├── jobs/
│   │   │   ├── scheduler.py
│   │   │   └── monitor_tick.py
│   │   └── tests/
│   │       ├── fixtures/
│   │       └── test_demo_paths.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/                                 # 前端（可选）：轻量 UI（Vue/React 均可）
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
│
├── dashboards/
│   ├── datasets/
│   ├── screenshots/
│   └── README.md
│
├── knowledge_base/
│   ├── seed/
│   └── README.md
│
├── graph_lab/
│   ├── build_graph.py
│   ├── metrics.py
│   └── samples/
│
├── data/
│   ├── repo_catalog_seed.csv
│   ├── demo_portfolio.json
│   └── cache/
│
├── docs/
│   ├── Scope.md
│   ├── Skills.md
│   ├── DataSpec.md
│   ├── Architecture.md
│   ├── diagrams/
│   ├── assets/
│   ├── PPT/
│   ├── DemoScript.md
│   └── Progress/
│
├── scripts/
│   ├── setup_db.sh
│   ├── import_seed.sh
│   └── run_demo.sh
│
├── docker-compose.yml
├── Makefile
├── LICENSE
└── README.md
```
