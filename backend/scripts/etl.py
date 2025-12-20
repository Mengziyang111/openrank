from __future__ import annotations
import argparse
from typing import Iterable
from app.db.init_db import init_db
from app.db.base import SessionLocal
from app.db.models import MetricPoint
from app.tools.opendigger_client import OpenDiggerClient

_METRIC_FILES = {
    "openrank": "openrank.json",
    "activity": "activity.json",
    "attention": "attention.json",
}


def _parse_metrics(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def fetch_metrics(repo: str, metrics: Iterable[str]) -> dict[str, int]:
    owner, name = repo.split("/", 1)
    client = OpenDiggerClient()
    counts: dict[str, int] = {}
    with SessionLocal() as db:
        for metric in metrics:
            metric_file = _METRIC_FILES.get(metric)
            if not metric_file:
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch OpenDigger metrics into the database")
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument(
        "--metrics",
        default="openrank,activity,attention",
        help="comma-separated metrics",
    )
    args = parser.parse_args()
    init_db()
    metrics = _parse_metrics(args.metrics)
    counts = fetch_metrics(args.repo, metrics)
    print({"repo": args.repo, "metrics": counts})


if __name__ == "__main__":
    main()
