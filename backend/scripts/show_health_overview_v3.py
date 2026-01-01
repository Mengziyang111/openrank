#!/usr/bin/env python3
"""
使用SQL查询查看health_overview_daily表结构
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def main():
    print("🔍 查看health_overview_daily表结构...")
    
    with SessionLocal() as db:
        try:
            # 直接查询information_schema
            print(f"\n📊 字段详情:")
            result = db.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default, ordinal_position
                FROM information_schema.columns 
                WHERE table_name = 'health_overview_daily' 
                ORDER BY ordinal_position
            """)).fetchall()
            
            print(f"\n{'='*100}")
            print(f"📋 health_overview_daily表完整字段信息 (共{len(result)}列)")
            print(f"{'='*100}")
            
            if result:
                print(f"\n📊 字段详情:")
                print(f"{'序号':<4} {'字段名':<35} {'数据类型':<25} {'可空性':<10} {'默认值'}")
                print("-" * 100)
                
                for i, (col_name, data_type, is_nullable, column_default, ordinal_pos) in enumerate(result, 1):
                    nullable = "YES" if is_nullable == "YES" else "NO"
                    default = str(column_default) if column_default else "NULL"
                    print(f"{i:<4} {col_name:<35} {data_type:<25} {nullable:<10} {default}")
                    
                # 获取总记录数
                count_result = db.execute(text("SELECT COUNT(*) FROM health_overview_daily")).fetchone()
                total_records = count_result[0] if count_result else 0
                
                print(f"\n📊 表统计信息:")
                print(f"  - 总字段数: {len(result)}")
                print(f"  - 总记录数: {total_records}")
                
                # 查看实际数据样例
                print(f"\n🔍 示例数据 (前2条):")
                sample_result = db.execute(text("SELECT * FROM health_overview_daily LIMIT 2")).fetchall()
                
                if sample_result:
                    for i, row in enumerate(sample_result, 1):
                        print(f"\n第{i}行数据:")
                        for col_name, value in zip([r[0] for r in result], row):
                            print(f"  {col_name:<30}: {value}")
                else:
                    print("  (表为空)")
                    
                # 特别显示评分字段
                print(f"\n🎯 健康度评分字段:")
                score_fields = [r for r in result if r[0].startswith('score_')]
                if score_fields:
                    for col_name, data_type, is_nullable, column_default, ordinal_pos in score_fields:
                        print(f"  - {col_name} ({data_type})")
                        if col_name == 'score_health':
                            print(f"    → 总体健康度分数")
                        elif col_name == 'score_vitality':
                            print(f"    → 项目活跃度分数")
                        elif col_name == 'score_responsiveness':
                            print(f"    → 问题响应度分数")
                        elif col_name == 'score_resilience':
                            print(f"    → 项目抗风险分数")
                        elif col_name == 'score_governance':
                            print(f"    → 项目治理分数")
                        elif col_name == 'score_security':
                            print(f"    → 项目安全分数")
                else:
                    print("  未找到评分字段")
            else:
                print("❌ 未找到表或表为空")
                
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()