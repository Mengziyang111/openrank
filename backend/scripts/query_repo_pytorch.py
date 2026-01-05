#!/usr/bin/env python3
"""
快速检查 per-repo 表 repo_pytorch_pytorch 是否已同步健康分数。
"""

from sqlalchemy import text
from app.db.base import SessionLocal


def main():
    table = "repo_pytorch_pytorch"
    with SessionLocal() as db:
        cnt_row = db.execute(text(f"SELECT COUNT(*) FROM {table}")).fetchone()
        cnt = cnt_row[0] if cnt_row else 0
        print(f"{table} 记录数: {cnt}")

        sample = db.execute(
            text(
                f"SELECT dt, score_health, score_vitality, score_responsiveness, score_resilience, score_governance, score_security FROM {table} ORDER BY dt DESC LIMIT 5"
            )
        ).fetchall()
        if sample:
            print("最新5条样例:")
            for r in sample:
                print(
                    f"  dt={r.dt} health={r.score_health} vitality={r.score_vitality} resp={r.score_responsiveness} resil={r.score_resilience} gov={r.score_governance} sec={r.score_security}"
                )
        else:
            print("未查到样例数据")


if __name__ == "__main__":
    main()
