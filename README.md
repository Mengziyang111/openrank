# OpenSODA-OSS-Copilot

一个面向开源数字生态的 **一站式 Agent 综合体**：
- 数据洞察（Analyze）
- 热度/趋势预测（Predict）
- 监控预警与治理建议（Monitor & Governance）
并覆盖 5 个用户场景：维护者 / 企业 OSPO / 新人 / 技术决策者 / 生态治理者。

> 该仓库为“比赛交付导向”的骨架：目录齐全 + 关键入口可运行（/health）。
> 你们只需要按模块逐步填充 TODO 即可。

---

## Quick Start (后端)
- 先官网下载docker desktop：https://www.docker.com/，然后启动docker desktop，左下角出现绿色Engine running，说明启动成功
- 然后进入终端，在根目录下输入，这样就能抓取数据，让postgres数据库进入docker容器中
```bash
docker compose -f docker-compose.db.yml up -d
```
- 然后启动后端服务
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
python -m pip install -U pip setuptools wheel
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
## Quick Start (前端)
- 先下载react
```bash
npm create vite@latest ui-react -- --template react
```
然后进入ui-react文件夹，安装依赖
```bash
cd ui-react
npm install
```


- 后端启动:
```bash
uvicorn app.main:app --reload
```
- http://127.0.0.1:8000/health

-前端启动：
```bash
cd ui-react
npm run dev 
```
- http://127.0.0.1:5173/
---

## Project Structure
见 docs/ProjectTree.md

```text
OpenSODA-OSS-Copilot/
├── backend/                                  # 后端：FastAPI + Agent 编排 + ETL + 监控
│   ├── app/
│   │   ├── main.py                           # FastAPI 入口（挂载路由、启动事件）
│   │   ├── core/                             # 核心配置/日志/常量
│   │   │   ├── config.py                     # 配置（DB/Redis/OpenDigger/LLM/MaxKB 等）
│   │   │   └── logging.py                    # 日志配置（含请求耗时/缓存命中）
│   │   ├── api/                              # API 路由层（对外接口）
│   │   │   ├── health.py                     # /health 健康检查
│   │   │   ├── chat.py                       # /api/chat 统一入口（Router → Skill → Tools）
│   │   │   ├── metrics.py                    # 指标查询接口：trend/compare/snapshot
│   │   │   ├── forecast.py                   # 预测接口：/api/forecast
│   │   │   ├── monitor.py                    # 监控接口：watchlist/alerts
│   │   │   ├── portfolio.py                  # 组合接口：portfolios/ranking/report
│   │   │   └── graph.py                      # 图分析接口（可选）：结构归因/集中度
│   │   ├── schemas/                          # 统一输出协议（非常关键：PPT/前端/报告共用）
│   │   │   ├── output_schema.py              # summary/evidence/charts/actions/links
│   │   │   └── requests.py                   # ChatRequest / Profile / Portfolio 等
│   │   ├── db/                               # 数据层：模型/会话/迁移
│   │   │   ├── base.py                       # SQLAlchemy engine/session
│   │   │   ├── models.py                     # metric_points/snapshots/reports/watchlist/alerts/repo_catalog
│   │   │   └── migrations/                   # PostgreSQL 迁移脚本（生产/复赛交付用）
│   │   ├── services/                         # 业务服务层（可测试、可复用）
│   │   │   ├── router.py                     # Intent Router：识别 scenario + task
│   │   │   ├── orchestrator.py               # Tool Orchestrator：拉数→证据卡→建议→写回
│   │   │   ├── evidence.py                   # Evidence Cards 构建（防幻觉：每条结论可追溯）
│   │   │   ├── snapshot.py                   # 健康快照：30/90/180 天对比、环比、同比等
│   │   │   ├── report.py                     # 报告生成：周报/月报/季度报告（Markdown/HTML）
│   │   │   ├── forecast.py                   # 预测：openrank/activity/attention baseline→可升级
│   │   │   ├── monitor.py                    # 规则引擎：watchlist→alerts（连续下降/跌幅/阈值）
│   │   │   ├── portfolio.py                  # OSPO 组合评分/排名/ROI 代理指标
│   │   │   ├── recommend.py                  # 新人推荐：Newcomer-Fit Score + 7天路线
│   │   │   ├── compare.py                    # 技术对比：tech mapping → 对比报告 + 风险红线
│   │   │   └── governance.py                 # 生态治理：生态雷达/风险源/治理策略模板
│   │   ├── skills/                           # 5 个场景 Skill 插件（同一引擎不同策略）
│   │   │   ├── base.py                       # Skill 抽象类：run(query, ctx) → OutputSchema
│   │   │   ├── maintainer.py                 # 场景1：项目维护者助手
│   │   │   ├── ospo.py                       # 场景2：企业 OSPO 平台
│   │   │   ├── newcomer.py                   # 场景3：新人导师
│   │   │   ├── advisor.py                    # 场景4：技术决策顾问
│   │   │   └── ecosystem.py                  # 场景5：生态治理
│   │   ├── tools/                            # 工具集成层（比赛给的工具/API都放这里）
│   │   │   ├── opendigger_client.py          # OpenDigger 拉数（静态JSON→统一时序）
│   │   │   ├── dataease_client.py            # DataEase 链接拼接/参数化（不一定要API）
│   │   │   ├── maxkb_client.py               # MaxKB：策略库/解释库（SOP模板）
│   │   │   ├── easygraph_engine.py           # EasyGraph：协作结构/集中度/关键节点（加分项）
│   │   │   └── llm_client.py                 # LLM 适配层（可切换模型/供应商）
│   │   ├── jobs/                             # 定时任务（监控轮询、日报生成）
│   │   │   ├── scheduler.py                  # APScheduler 配置
│   │   │   └── monitor_tick.py               # 每6小时刷新 → 生成 alerts
│   │   └── tests/                            # 回归测试（五场景各一条问句，防演示翻车）
│   │       ├── fixtures/                     # 示例 JSON/预置输入
│   │       └── test_demo_paths.py            # demo 脚本路径测试
│   ├── requirements.txt                      # Python依赖（建议先最小可跑版本）
│   ├── Dockerfile                            # 后端镜像
│   └── .env.example                          # 环境变量模板（不要提交真实密钥）
│
├── frontend/                                 # 前端（可选）：轻量 UI（Vue/React 均可）
│   ├── src/
│   │   ├── pages/                            # Chat/Portfolio/Reports 页面
│   │   ├── components/                       # Summary/Evidence/Charts/Actions 组件
│   │   ├── services/                         # 调用后端 API
│   │   └── utils/                            # schema 渲染、格式化
│   └── package.json
│
├── dashboards/                               # DataEase 相关（SQL、截图、仪表盘说明）
│   ├── datasets/                             # 数据集SQL（metric_points/snapshots/alerts）
│   ├── screenshots/                          # 三张核心大屏截图（PPT/README用）
│   └── README.md                             # 如何在 DataEase 复现看板
│
├── knowledge_base/                           # MaxKB 知识库内容（治理策略/SOP/指标解释）
│   ├── seed/                                 # 初始条目（≥60条：解释/策略/模板）
│   └── README.md                             # 如何导入 MaxKB
│
├── graph_lab/                                # EasyGraph 图分析实验区（可选但很加分）
│   ├── build_graph.py                        # 构图脚本（协作网络/依赖网络）
│   ├── metrics.py                            # 图指标：中心性/集中度/关键节点
│   └── samples/                              # 示例输出（结构归因卡）
│
├── data/                                     # 数据与种子文件
│   ├── repo_catalog_seed.csv                 # repo_catalog 种子（技术对比/新人推荐映射）
│   ├── demo_portfolio.json                   # 演示用 portfolio（健康+风险各一套）
│   └── cache/                                # 本地缓存（可忽略不提交）
│
├── docs/                                     # 比赛交付文档（写作与演示资产）
│   ├── Scope.md                              # 范围冻结（一定要有）
│   ├── Skills.md                             # 5场景说明（一定要有）
│   ├── DataSpec.md                           # 指标口径/表结构/窗口计算（一定要有）
│   ├── Architecture.md                       # 架构说明（配图）
│   ├── diagrams/                             # Mermaid 源文件
│   ├── assets/                               # 架构图/流程图/SkillMap PNG（PPT直接用）
│   ├── PPT/                                  # 初赛PPT/复赛PPT
│   ├── DemoScript.md                         # 演示脚本（每场景至少1问）
│   └── Progress/                             # 每日进度日志（方便你们两人协作）
│
├── scripts/                                  # 一键脚本（可复现/评委友好）
│   ├── setup_db.sh                           # 初始化数据库
│   ├── import_seed.sh                        # 导入 repo_catalog / demo 数据
│   └── run_demo.sh                           # 自动跑 demo（生成报告/预警）
│
├── docker-compose.yml                        # 一键启动：backend + db + redis (+可选工具)
├── Makefile                                  # make up / make demo / make down
├── LICENSE                                   # 开源协议
└── README.md                                 # 项目说明（放项目结构树/截图/快速开始）
```
