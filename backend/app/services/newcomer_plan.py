from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import HealthOverviewDaily, RepoCatalog
from app.tools.github_client import GitHubClient

REPO_PROFILE: Dict[str, Dict[str, Any]] = {
    "vuejs/core": {
        "domains": ["Web前端"],
        "stacks": ["JavaScript/TypeScript"],
        "tags": ["vue", "frontend", "framework", "js"],
        "url": "https://github.com/vuejs/core",
    },
    "facebook/react": {
        "domains": ["Web前端"],
        "stacks": ["JavaScript/TypeScript"],
        "tags": ["react", "frontend", "framework", "js"],
        "url": "https://github.com/facebook/react",
    },
    "microsoft/vscode": {
        "domains": ["开发工具", "Web前端"],
        "stacks": ["JavaScript/TypeScript"],
        "tags": ["editor", "ide", "extension", "typescript"],
        "url": "https://github.com/microsoft/vscode",
    },
    "pytorch/pytorch": {
        "domains": ["AI/深度学习"],
        "stacks": ["Python"],
        "tags": ["ml", "ai", "deep learning", "python"],
        "url": "https://github.com/pytorch/pytorch",
    },
    "odoo/odoo": {
        "domains": ["后端/企业应用"],
        "stacks": ["Python"],
        "tags": ["erp", "business", "backend", "python"],
        "url": "https://github.com/odoo/odoo",
    },
    "kubernetes/kubernetes": {
        "domains": ["云原生/基础设施"],
        "stacks": ["Go"],
        "tags": ["cloud-native", "k8s", "infrastructure", "go"],
        "url": "https://github.com/kubernetes/kubernetes",
    },
    "ossf/scorecard": {
        "domains": ["安全/合规"],
        "stacks": ["Go"],
        "tags": ["security", "supply-chain", "ossf", "go"],
        "url": "https://github.com/ossf/scorecard",
    },
    "X-lab2017/open-digger": {
        "domains": ["开源生态分析"],
        "stacks": ["Go"],
        "tags": ["open source", "analytics", "metrics", "go"],
        "url": "https://github.com/X-lab2017/open-digger",
    },
}


@dataclass
class Snapshot:
    repo_full_name: str
    dt: Optional[str]
    score_health: Optional[float]
    score_vitality: Optional[float]
    score_responsiveness: Optional[float]
    metric_activity_growth: Optional[float]
    metric_issue_response_time_h: Optional[float]
    metric_issue_age_h: Optional[float]


class NewcomerPlanService:
    def __init__(self, db: Session, github_client: Optional[GitHubClient] = None) -> None:
        self.db = db
        self.github = github_client or GitHubClient()

    def build_plan(self, domain: str, stack: str, time_per_week: str, keywords: str) -> Dict[str, Any]:
        profiles = self._fetch_profiles()
        repo_pool = list(profiles.keys())
        snapshots = self._fetch_latest_snapshots(repo_pool)
        recommendations = self._build_recommendations(repo_pool, profiles, snapshots, domain, stack, keywords)
        top_repos = [rec["repo_full_name"] for rec in recommendations[:3]]
        tasks = self._build_tasks(top_repos)
        top_repo = recommendations[0]["repo_full_name"] if recommendations else None
        default_steps = self._build_default_steps(top_repo)

        return {
            "profile": {
                "domain": domain,
                "stack": stack,
                "time_per_week": time_per_week,
                "keywords": keywords,
            },
            "repos": recommendations,
            "tasks": tasks,
            "default_steps": default_steps,
        }

    def _fetch_profiles(self) -> Dict[str, Dict[str, Any]]:
        stmt = select(
            RepoCatalog.repo_full_name,
            RepoCatalog.seed_domain,
            RepoCatalog.primary_language,
            RepoCatalog.tags,
        ).order_by(RepoCatalog.repo_full_name)

        profiles: Dict[str, Dict[str, Any]] = {}
        for row in self.db.execute(stmt).all():
            repo_full_name, seed_domain, primary_language, tags = row
            profiles[repo_full_name] = {
                "domains": [seed_domain] if seed_domain else [],
                "stacks": [primary_language] if primary_language else [],
                "tags": tags or [],
                "url": f"https://github.com/{repo_full_name}",
            }

        # 兼容老的内置配置（如健康分已有但 catalog 缺失）
        for repo, profile in REPO_PROFILE.items():
            profiles.setdefault(repo, profile)

        return profiles

    def _fetch_latest_snapshots(self, repos: Sequence[str]) -> Dict[str, Snapshot]:
        if not repos:
            return {}

        ho = HealthOverviewDaily
        ranked = (
            select(
                ho.repo_full_name,
                ho.dt,
                ho.score_health,
                ho.score_vitality,
                ho.score_responsiveness,
                ho.metric_activity_growth,
                ho.metric_issue_response_time_h,
                ho.metric_issue_age_h,
                func.row_number()
                .over(partition_by=ho.repo_full_name, order_by=ho.dt.desc())
                .label("rn"),
            )
            .where(ho.repo_full_name.in_(repos))
        ).subquery()

        rows = self.db.execute(
            select(
                ranked.c.repo_full_name,
                ranked.c.dt,
                ranked.c.score_health,
                ranked.c.score_vitality,
                ranked.c.score_responsiveness,
                ranked.c.metric_activity_growth,
                ranked.c.metric_issue_response_time_h,
                ranked.c.metric_issue_age_h,
            ).where(ranked.c.rn == 1)
        ).mappings()

        snapshots: Dict[str, Snapshot] = {}
        for row in rows:
            multiplier = 100.0 if row["score_health"] is not None and row["score_health"] <= 1.5 else 1.0
            snapshots[row["repo_full_name"]] = Snapshot(
                repo_full_name=row["repo_full_name"],
                dt=row["dt"].isoformat() if row["dt"] else None,
                score_health=self._scale(row["score_health"], multiplier),
                score_vitality=self._scale(row["score_vitality"], multiplier),
                score_responsiveness=self._scale(row["score_responsiveness"], multiplier),
                metric_activity_growth=row["metric_activity_growth"],
                metric_issue_response_time_h=row["metric_issue_response_time_h"],
                metric_issue_age_h=row["metric_issue_age_h"],
            )
        return snapshots

    def _build_recommendations(
        self,
        repo_pool: Sequence[str],
        profiles: Dict[str, Dict[str, Any]],
        snapshots: Dict[str, Snapshot],
        domain: str,
        stack: str,
        keywords: str,
    ) -> List[Dict[str, Any]]:
        keyword_list = [k.strip().lower() for k in re.split(r"[\s,]+", keywords or "") if k.strip()]

        cards: List[Dict[str, Any]] = []
        for repo in repo_pool:
            profile = profiles.get(repo)
            if not profile:
                continue

            snap = snapshots.get(repo) or Snapshot(
                repo_full_name=repo,
                dt=None,
                # 给无快照的仓库一个温和的基线分，避免全是 0
                score_health=60.0,
                score_vitality=60.0,
                score_responsiveness=60.0,
                metric_activity_growth=0.0,
                metric_issue_response_time_h=48.0,
                metric_issue_age_h=168.0,
            )

            match_score = self._calc_match(profile, domain, stack, keyword_list, repo_name=repo)
            # 没有任何匹配则跳过，避免无关仓库充斥列表
            if match_score <= 0:
                continue

            resp_score = self._calc_resp_score(snap)
            health_score = snap.score_health or 0.0
            risk_score = self._calc_risk(snap, health_score)
            final_score = 0.45 * match_score + 0.35 * resp_score + 0.20 * health_score - 0.10 * risk_score

            issue_resp_h = snap.metric_issue_response_time_h
            difficulty = self._difficulty(health_score, issue_resp_h)
            trend_pct = self._trend_percent(snap.metric_activity_growth)
            activity_percent = int(round(self._safe(snap.score_vitality)))
            maintainer_resp_percent = int(round(self._safe(snap.score_responsiveness or resp_score)))

            reasons = [f"领域匹配：{domain}", f"技能匹配：{stack}"]
            if issue_resp_h is not None:
                reasons.append(f"Issue 首响：{int(round(issue_resp_h))} 小时")
            reasons.append(f"健康度：{int(round(health_score))} 分")
            trend_text = f"+{trend_pct}%" if trend_pct >= 0 else f"{trend_pct}%"
            reasons.append(f"近30天活跃趋势：{trend_text}")

            cards.append(
                {
                    "repo_full_name": repo,
                    "url": profile.get("url"),
                    "match_percent": int(round(match_score)),
                    "difficulty": difficulty,
                    "activity_percent": activity_percent,
                    "maintainer_response_percent": maintainer_resp_percent,
                    "trend_30d_percent": trend_pct,
                    "reasons": reasons,
                    "scores": {
                        "match": match_score,
                        "resp": resp_score,
                        "health": health_score,
                        "risk": risk_score,
                        "final": final_score,
                    },
                }
            )

        # 不再只取固定 5 个，返回完整排序结果，前端自行展示
        return sorted(cards, key=lambda c: c["scores"]["final"], reverse=True)

    def _calc_match(
        self,
        profile: Dict[str, Any],
        domain: str,
        stack: str,
        keywords: List[str],
        repo_name: str | None = None,
    ) -> float:
        match = 0.0
        domain_lower = domain.lower() if domain else ""
        domain_alias = {
            "web前端": "frontend",
            "前端": "frontend",
            "后端": "backend",
            "企业": "backend",
            "移动": "mobile",
            "云原生": "cloud",
            "基础设施": "cloud",
            "ai": "ai",
            "深度学习": "ai",
            "安全": "security",
            "合规": "security",
            "文档": "docs",
            "翻译": "i18n",
            "生态": "oss-analytics",
            "分析": "oss-analytics",
        }
        mapped_domain = domain_alias.get(domain_lower, domain_lower)
        profile_domains = [d.lower() for d in profile.get("domains", [])]
        if mapped_domain and any(
            mapped_domain == d or mapped_domain in d or d in mapped_domain for d in profile_domains
        ):
            match += 40.0

        stack_lower = stack.lower() if stack else ""
        profile_stacks = [s.lower() for s in profile.get("stacks", [])]
        if stack_lower and any(stack_lower == s or stack_lower in s or s in stack_lower for s in profile_stacks):
            match += 40.0

        if keywords:
            tags = [t.lower() for t in profile.get("tags", [])]
            repo_text = " ".join([
                repo_name or "",
                profile.get("url", ""),
                " ".join(profile_domains),
            ]).lower()
            for kw in keywords:
                if kw in tags or kw in repo_text:
                    match += 20.0
                    break
        return min(match, 100.0)

    def _calc_resp_score(self, snap: Snapshot) -> float:
        if snap.metric_issue_response_time_h is not None:
            return self._clamp(100.0 - 2.0 * snap.metric_issue_response_time_h)
        if snap.score_responsiveness is not None:
            return self._clamp(snap.score_responsiveness)
        return 0.0

    def _calc_risk(self, snap: Snapshot, health_score: float) -> float:
        risk = 0.0
        if snap.metric_issue_age_h is not None and snap.metric_issue_age_h > 720:
            risk += 10.0
        if health_score < 50:
            risk += 10.0
        return risk

    def _difficulty(self, health_score: float, issue_resp_h: Optional[float]) -> str:
        if health_score >= 80 and (issue_resp_h is not None and issue_resp_h <= 48):
            return "Easy"
        if health_score >= 60:
            return "Medium"
        return "Hard"

    def _trend_percent(self, growth: Optional[float]) -> int:
        if growth is None:
            return 0
        if 0 <= growth <= 1:
            return int(round(growth * 100))
        return int(round(growth))

    def _build_tasks(self, repos: Sequence[str]) -> Dict[str, List[Dict[str, Any]]]:
        buckets: Dict[str, List[Dict[str, Any]]] = {
            "good_first_issue": [],
            "help_wanted": [],
            "docs": [],
            "translation": [],
        }
        for repo in repos:
            buckets["good_first_issue"].extend(self._fetch_issues(repo, ["good first issue"]))
            buckets["help_wanted"].extend(self._fetch_issues(repo, ["help wanted"]))
            buckets["docs"].extend(self._fetch_issues(repo, ["documentation", "docs", "doc"]))
            buckets["translation"].extend(
                self._fetch_issues(repo, ["translation", "i18n", "l10n", "localization"])
            )

        return {key: self._dedup_tasks(items)[:15] for key, items in buckets.items()}

    def _fetch_issues(self, repo: str, labels: Sequence[str]) -> List[Dict[str, Any]]:
        for label in labels:
            items = self.github.search_issues(repo, label)
            normalized = [self._normalize_issue(repo, item) for item in items]
            if normalized:
                return normalized
        return []

    def _normalize_issue(self, repo: str, item: Dict[str, Any]) -> Dict[str, Any]:
        labels = [lbl.get("name", "") for lbl in item.get("labels", [])] if isinstance(item, dict) else []
        title = item.get("title", "") if isinstance(item, dict) else ""
        url = item.get("html_url") if isinstance(item, dict) else None
        updated_at = item.get("updated_at") if isinstance(item, dict) else None
        return {
            "title": title,
            "repo_full_name": repo,
            "url": url,
            "labels": labels,
            "difficulty": self._classify_issue(labels, title),
            "updated_at": updated_at,
        }

    def _classify_issue(self, labels: List[str], title: str) -> str:
        label_set = {lbl.lower() for lbl in labels}
        easy_labels = {"documentation", "docs", "doc", "translation", "i18n", "l10n", "localization"}
        title_lower = title.lower()
        if easy_labels & label_set or "typo" in title_lower or "readme" in title_lower:
            return "Easy"
        return "Medium"

    def _dedup_tasks(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        deduped: List[Dict[str, Any]] = []
        for item in items:
            url = item.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            deduped.append(item)
        return deduped

    def _build_default_steps(self, repo: Optional[str]) -> Dict[str, Any]:
        if not repo:
            return {
                "repo_full_name": None,
                "setup_steps": [],
                "build_steps": [],
                "pr_steps": self._pr_steps(),
                "copy_markdown": "",
                "notes": "未找到可用的仓库默认路径",
            }

        readme = self.github.get_readme(repo) or ""
        contrib = self.github.get_content(repo, "CONTRIBUTING.md") or self.github.get_content(
            repo, ".github/CONTRIBUTING.md"
        )
        pr_template = self.github.get_content(repo, ".github/PULL_REQUEST_TEMPLATE.md") or ""
        content = "\n\n".join([part for part in [readme, contrib, pr_template] if part])

        commands = self._extract_commands(content)
        setup_steps, build_steps = self._split_commands(commands)
        pr_steps = self._pr_steps()
        notes = None if commands else "文档未提供明确命令"

        copy_md = self._render_copy(repo, setup_steps, build_steps, pr_steps, notes)
        return {
            "repo_full_name": repo,
            "setup_steps": setup_steps,
            "build_steps": build_steps,
            "pr_steps": pr_steps,
            "copy_markdown": copy_md,
            "notes": notes,
        }

    def _extract_commands(self, content: str) -> List[str]:
        if not content:
            return []
        blocks = re.findall(r"```[\w+-]*\s*\n(.*?)```", content, flags=re.DOTALL)
        commands: List[str] = []
        keywords = ["git", "npm", "yarn", "pnpm", "pip", "poetry", "pytest", "make", "go test", "go build"]

        # 优先从代码块提取
        for block in blocks:
            for line in block.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                lower = stripped.lower()
                if any(key in lower for key in keywords):
                    commands.append(stripped)

        # 如果代码块为空，再从全文行扫描（处理没有围栏的命令行）
        if not commands:
            for line in content.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                lower = stripped.lower()
                if any(key in lower for key in keywords):
                    commands.append(stripped)

        return self._dedup_preserve(commands)

    def _split_commands(self, commands: List[str]) -> tuple[List[str], List[str]]:
        setup_keywords = ["git clone", "npm install", "yarn install", "pnpm install", "pip install", "poetry install"]
        build_indicators = ["npm run", "yarn run", "pnpm run", "npm start", "yarn start", "pnpm dev", "pytest", "make", "go test", "go build", "npm test"]
        setup_steps: List[str] = []
        build_steps: List[str] = []
        for cmd in commands:
            lower = cmd.lower()
            if any(k in lower for k in setup_keywords):
                setup_steps.append(cmd)
            elif any(k in lower for k in build_indicators):
                build_steps.append(cmd)
        return self._dedup_preserve(setup_steps), self._dedup_preserve(build_steps)

    def _pr_steps(self) -> List[str]:
        return [
            "Fork 仓库并创建分支",
            "本地提交并推送到远端分支",
            "提交 Pull Request（填写变更摘要）",
            "请求评审并根据反馈更新",
            "CI 通过后等待合并",
        ]

    def _render_copy(
        self,
        repo: str,
        setup_steps: List[str],
        build_steps: List[str],
        pr_steps: List[str],
        notes: Optional[str],
    ) -> str:
        lines: List[str] = [f"## {repo} 默认贡献路径", ""]
        lines.append("### Setup")
        lines.extend([f"- {s}" for s in (setup_steps or ["参考仓库文档补充安装命令"])])

        lines.append("")
        lines.append("### Build & Test")
        lines.extend([f"- {s}" for s in (build_steps or ["文档未提供构建/测试命令"])])

        lines.append("")
        lines.append("### PR Checklist")
        lines.extend([f"- {s}" for s in pr_steps])

        if notes:
            lines.append("")
            lines.append(f"> {notes}")
        return "\n".join(lines)

    def _dedup_preserve(self, items: List[str]) -> List[str]:
        seen = set()
        result: List[str] = []
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            result.append(item)
        return result

    def _clamp(self, value: float, lower: float = 0.0, upper: float = 100.0) -> float:
        return max(lower, min(upper, value))

    def _scale(self, value: Optional[float], multiplier: float) -> Optional[float]:
        if value is None:
            return None
        return value * multiplier

    def _safe(self, value: Optional[float]) -> float:
        try:
            val = float(value) if value is not None else 0.0
        except (TypeError, ValueError):
            return 0.0
        if math.isnan(val):
            return 0.0
        return val
