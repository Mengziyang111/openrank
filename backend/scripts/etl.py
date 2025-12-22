from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, Iterator

from app.db.init_db import init_db
from app.db.base import SessionLocal
from app.db.models import MetricPoint
from app.registry import METRIC_FILES, SUPPORTED_METRICS, ensure_supported
from app.tools.opendigger_client import OpenDiggerClient


def _parse_metrics(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def fetch_metrics(repo: str, metrics: Iterable[str]) -> dict[str, int]:
    owner, name = repo.split("/", 1)
    client = OpenDiggerClient()
    counts: dict[str, int] = {}
    with SessionLocal() as db:
        for metric in metrics:
            metric_file = METRIC_FILES.get(metric)
            if not metric_file:
                # should not happen if ensure_supported() was called
                continue

            records = client.fetch_metric(owner, name, metric_file)
            counts[metric] = 0
            for record in records:
                row = (
                    db.query(MetricPoint)
                    .filter(
                        MetricPoint.repo == repo,
                        MetricPoint.metric == metric,
                        MetricPoint.dt == record.date,
                    )
                    .first()
                )
                if row:
                    row.value = record.value
                else:
                    db.add(
                        MetricPoint(
                            repo=repo,
                            metric=metric,
                            dt=record.date,
                            value=record.value,
                        )
                    )
                counts[metric] += 1
        db.commit()
    return counts


def _iter_repos(repos_file: Path) -> Iterator[str]:
    seen: set[str] = set()
    with repos_file.open("r", encoding="utf-8") as handle:
        for line in handle:
            repo = line.strip()
            if not repo or repo.startswith("#"):
                continue
            if repo in seen:
                continue
            seen.add(repo)
            yield repo


def _load_resume_marker(state_file: Path | None, resume: bool) -> str | None:
    if not resume or state_file is None or not state_file.exists():
        return None
    return state_file.read_text(encoding="utf-8").strip() or None


def _store_resume_marker(state_file: Path | None, repo: str) -> None:
    if state_file is None:
        return
    state_file.write_text(repo, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch OpenDigger metrics into the database")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--repo", help="owner/repo")
    group.add_argument("--repos-file", type=Path, help="path to repos.txt")
    parser.add_argument(
        "--metrics",
        default="openrank,activity,attention",
        help=f"comma-separated metrics (supported: {', '.join(SUPPORTED_METRICS)})",
    )
    parser.add_argument(
        "--state-file",
        type=Path,
        help="optional checkpoint file for resume support",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="resume from last repo recorded in --state-file",
    )
    args = parser.parse_args()

    init_db()

    metrics = _parse_metrics(args.metrics)
    # validate early (fail-fast)
    ensure_supported(metrics)

    if args.repo:
        counts = fetch_metrics(args.repo, metrics)
        _store_resume_marker(args.state_file, args.repo)
        print({"repo": args.repo, "metrics": counts})
        return

    repos_file: Path = args.repos_file
    resume_marker = _load_resume_marker(args.state_file, args.resume)
    skipping = resume_marker is not None
    for repo in _iter_repos(repos_file):
        if skipping:
            if repo == resume_marker:
                skipping = False
            continue
        counts = fetch_metrics(repo, metrics)
        _store_resume_marker(args.state_file, repo)
        print({"repo": repo, "metrics": counts})


if __name__ == "__main__":
    main()
