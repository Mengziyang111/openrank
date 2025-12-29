#!/usr/bin/env python3
"""
测试健康度计算和评分列功能
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text
from app.services.metric_engine import MetricEngine

def main():
    print("🧪 测试健康度计算和评分列功能...")
    
    with SessionLocal() as db:
        try:
            # 测试1：检查odoo/odoo仓库的metric_points数据
            print("\n🔍 测试1：检查 odoo/odoo 仓库的metric_points数据...")
            
            odoo_metrics = db.execute(text("""
                SELECT * FROM metric_points 
                WHERE repo = 'odoo/odoo' AND dt = '2015-01-01'
                LIMIT 1
            """)).fetchone()
            
            if odoo_metrics:
                print("✅ 找到 odoo/odoo 仓库的指标数据")
                print(f"  仓库: {odoo_metrics.repo}")
                print(f"  日期: {odoo_metrics.dt}")
                print(f"  活跃度: {odoo_metrics.metric_activity}")
                print(f"  OpenRank: {odoo_metrics.metric_openrank}")
            else:
                print("❌ 未找到 odoo/odoo 仓库的指标数据")
                return
            
            # 测试2：检查仓库表是否有评分列
            print("\n🔍 测试2：检查 repo_odoo_odoo 表的评分列...")
            
            score_check = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'repo_odoo_odoo' 
                AND column_name LIKE 'score_%'
                ORDER BY column_name
            """)).fetchall()
            
            print(f"✅ 找到 {len(score_check)} 个评分列:")
            for col in score_check:
                print(f"  - {col[0]}")
            
            # 测试3：手动计算健康度分数
            print("\n🧮 测试3：手动计算健康度分数...")
            
            # 准备指标数据
            metrics_data = {
                'repo_full_name': 'odoo/odoo',
                'dt': '2015-01-01',
                'metric_activity': float(odoo_metrics.metric_activity or 0),
                'metric_openrank': float(odoo_metrics.metric_openrank or 0),
                'metric_participants': float(odoo_metrics.metric_participants or 0),
                'metric_issues_new': float(odoo_metrics.metric_issues_new or 0),
                'metric_prs_new': float(odoo_metrics.metric_change_requests_new or 0),
                'metric_bus_factor': float(odoo_metrics.metric_bus_factor or 0),
                'metric_hhi': float(odoo_metrics.metric_hhi or 0),
                'raw_payloads': {}
            }
            
            # 使用MetricEngine计算分数
            engine = MetricEngine()
            scores = engine.compute(metrics_data)
            
            print("✅ 计算得到的健康度分数:")
            print(f"  总分: {scores.get('score_health', 'N/A')}")
            print(f"  活跃度分: {scores.get('score_vitality', 'N/A')}")
            print(f"  响应度分: {scores.get('score_responsiveness', 'N/A')}")
            print(f"  抗风险分: {scores.get('score_resilience', 'N/A')}")
            print(f"  治理分: {scores.get('score_governance', 'N/A')}")
            print(f"  安全分: {scores.get('score_security', 'N/A')}")
            
            # 测试4：将分数保存到仓库表
            print("\n💾 测试4：将分数保存到仓库表...")
            
            # 更新仓库表中的分数
            db.execute(text(f"""
                UPDATE repo_odoo_odoo 
                SET score_health = :score_health,
                    score_vitality = :score_vitality,
                    score_responsiveness = :score_responsiveness,
                    score_resilience = :score_resilience,
                    score_governance = :score_governance,
                    score_security = :score_security
                WHERE dt = '2015-01-01'
            """), {
                'score_health': scores.get('score_health'),
                'score_vitality': scores.get('score_vitality'),
                'score_responsiveness': scores.get('score_responsiveness'),
                'score_resilience': scores.get('score_resilience'),
                'score_governance': scores.get('score_governance'),
                'score_security': scores.get('score_security'),
            })
            db.commit()
            
            print("✅ 分数已保存到 repo_odoo_odoo 表")
            
            # 验证保存结果
            saved_scores = db.execute(text("""
                SELECT score_health, score_vitality, score_responsiveness, 
                       score_resilience, score_governance, score_security
                FROM repo_odoo_odoo 
                WHERE dt = '2015-01-01'
            """)).fetchone()
            
            if saved_scores:
                print("\n✅ 验证保存的分数:")
                print(f"  总分: {saved_scores.score_health}")
                print(f"  活跃度分: {saved_scores.score_vitality}")
                print(f"  响应度分: {saved_scores.score_responsiveness}")
                print(f"  抗风险分: {saved_scores.score_resilience}")
                print(f"  治理分: {saved_scores.score_governance}")
                print(f"  安全分: {saved_scores.score_security}")
            
            print(f"\n🎉 健康度计算和评分列功能测试成功完成!")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()