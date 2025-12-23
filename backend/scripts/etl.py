from __future__ import annotations
import argparse
import json
import urllib.request
from pathlib import Path
from typing import Iterable, Iterator, Any, Dict
from datetime import datetime

from app.db.init_db import init_db
from app.db.base import SessionLocal
from app.db.models import MetricPoint
# 导入 registry 里的配置
from app.registry import METRIC_FILES, ensure_supported

# 模拟浏览器 UA
HEADERS = {'User-Agent': 'Mozilla/5.0'}

def _parse_metrics(value: str) -> list[str]:
    # 升级点 1: 支持 'all' 关键字
    if value.lower() == "all":
        return list(METRIC_FILES.keys())
    return [item.strip() for item in value.split(",") if item.strip()]

def fetch_raw_json(owner: str, repo: str, filename: str) -> Dict | None:
    """
    升级点 2: 强壮的下载器
    使用 urllib 直接下载，遇到 404 自动捕获异常，不会让程序崩溃。
    """
    url = f"https://oss.x-lab.info/open_digger/github/{owner}/{repo}/{filename}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"   ⚠️  [404] 该仓库没有此指标: {filename} (已跳过)")
        else:
            print(f"   ❌ [HTTP Error] 下载失败 {filename}: {e.code}")
        return None
    except Exception as e:
        print(f"   ❌ [Error] 网络或其他错误 {filename}: {e}")
        return None

def parse_opendigger_data(raw_data: Dict) -> Dict[str, float]:
    """
    升级点 3: 智能解析器
    处理 OpenDigger 各种奇葩的返回格式 (列表、字典、嵌套avg)
    """
    result = {}
    
    # 自动识别数据是在根目录，还是在 'avg'/'sum' 里面
    target_dict = raw_data
    if "avg" in raw_data and isinstance(raw_data["avg"], dict):
        target_dict = raw_data["avg"]
    elif "sum" in raw_data and isinstance(raw_data["sum"], dict):
        target_dict = raw_data["sum"]
        
    for key, val in target_dict.items():
        # 过滤掉非日期 key (比如 "2023", "meta" 等)
        # 有效的日期格式通常是 "YYYY-MM" (长度7, 中间是横杠)
        if len(key) != 7 or key[4] != '-': 
            continue
            
        numeric_val = 0.0
        # 数据清洗：转成 float
        if isinstance(val, (int, float)):
            numeric_val = float(val)
        elif isinstance(val, list):
            numeric_val = float(len(val)) # 列表转长度
            
        # 补全日期为 YYYY-MM-01
        full_date = f"{key}-01"
        result[full_date] = numeric_val
        
    return result

def fetch_metrics(repo: str, metrics: Iterable[str]) -> dict[str, int]:
    owner, name = repo.split("/", 1)
    counts: dict[str, int] = {}
    
    with SessionLocal() as db:
        for metric in metrics:
            metric_file = METRIC_FILES.get(metric)
            if not metric_file: continue

            # 1. 安全下载 (遇到 404 会返回 None，不会崩)
            raw_data = fetch_raw_json(owner, name, metric_file)
            if not raw_data: 
                continue

            # 2. 智能解析
            parsed_data = parse_opendigger_data(raw_data)
            if not parsed_data: 
                continue

            counts[metric] = 0
            
            # 3. 入库
            for date_str, value in parsed_data.items():
                dt_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                
                row = (
                    db.query(MetricPoint)
                    .filter(
                        MetricPoint.repo == repo,
                        MetricPoint.metric == metric,
                        MetricPoint.dt == dt_obj,
                    )
                    .first()
                )
                if row:
                    row.value = value
                else:
                    db.add(
                        MetricPoint(
                            repo=repo,
                            metric=metric,
                            dt=dt_obj,
                            value=value,
                        )
                    )
                counts[metric] += 1
        db.commit()
    return counts

def _iter_repos(repos_file: Path) -> Iterator[str]:
    seen: set[str] = set()
    if not repos_file.exists(): return
    with repos_file.open("r", encoding="utf-8") as handle:
        for line in handle:
            repo = line.strip()
            if not repo or repo.startswith("#") or repo in seen: continue
            seen.add(repo)
            yield repo

def _load_resume_marker(state_file: Path | None, resume: bool) -> str | None:
    if not resume or state_file is None or not state_file.exists(): return None
    return state_file.read_text(encoding="utf-8").strip() or None

def _store_resume_marker(state_file: Path | None, repo: str) -> None:
    if state_file is None: return
    state_file.write_text(repo, encoding="utf-8")

def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--repo", help="owner/repo")
    group.add_argument("--repos-file", type=Path)
    parser.add_argument("--metrics", default="openrank,activity,attention", help="comma-separated metrics or 'all'")
    parser.add_argument("--state-file", type=Path)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    init_db()

    # 解析 metrics (处理 'all')
    metrics = _parse_metrics(args.metrics)
    
    # 此时 metrics 已经是完整的列表了，可以直接确保支持
    ensure_supported(metrics)

    if args.repo:
        print(f"🚀 正在处理 {args.repo} (共 {len(metrics)} 个指标)...")
        counts = fetch_metrics(args.repo, metrics)
        print(f"✅ 完成: {counts}")
        return

    repos_file: Path = args.repos_file
    resume_marker = _load_resume_marker(args.state_file, args.resume)
    skipping = resume_marker is not None
    
    for repo in _iter_repos(repos_file):
        if skipping:
            if repo == resume_marker: skipping = False
            continue
        print(f"🚀 正在处理 {repo}...")
        counts = fetch_metrics(repo, metrics)
        _store_resume_marker(args.state_file, repo)
        print(f"   -> {counts}")

if __name__ == "__main__":
    main()