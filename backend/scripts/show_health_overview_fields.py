#!/usr/bin/env python3
"""
专门显示health_overview_daily表的完整字段信息
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def main():
    print("🔍 查看health_overview_daily表的所有字段...")
    
    with SessionLocal() as db:
        try:
            # 获取表结构
            result = db.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'health_overview_daily' AND table_schema = 'public'
                ORDER BY ordinal_position
            """)).fetchall()
            
            print(f"\n{'='*80}")
            print(f"📋 health_overview_daily表结构 (共 {len(result)} 列)")
            print(f"{'='*80}")
            
            print(f"\n📊 完整字段列表:")
            print(f"{'序号':<4} {'字段名':<35} {'数据类型':<20} {'可空':<6} {'默认值':<15}")
            print("-" * 85)
            
            for i, (col_name, data_type, is_nullable, column_default) in enumerate(result, 1):
                nullable = "YES" if is_nullable == "YES" else "NO"
                default = str(column_default) if column_default else "NULL"
                print(f"{i:<4} {col_name:<35} {data_type:<20} {nullable:<6} {default:<15}")
            
            # 获取表中的记录总数
            count_result = db.execute(text("SELECT COUNT(*) FROM health_overview_daily")).fetchone()
            total_records = count_result[0] if count_result else 0
            
            print(f"\n📊 表统计信息:")
            print(f"  - 总字段数: {len(result)}")
            print(f"  - 总记录数: {total_records}")
            
            # 显示一些示例数据
            print(f"\n🔍 示例数据 (前3条):")
            sample_result = db.execute(text("SELECT * FROM health_overview_daily LIMIT 3")).fetchall()
            
            if sample_result:
                for i, row in enumerate(sample_result, 1):
                    print(f"\n  第{i}行数据:")
                    for j, (col_name, value) in enumerate(zip([r[0] for r in result], row)):
                        print(f"    {col_name}: {value}")
            else:
                print("  (暂无数据)")
                
            # 特别显示核心评分字段
            print(f"\n🎯 健康度评分字段详情:")
            score_fields = [r for r in result if r[0].startswith('score_')]
            for i, (col_name, data_type, is_nullable, column_default) in enumerate(score_fields, 1):
                print(f"  {i}. {col_name} ({data_type})")
                if col_name == 'score_health':
                    print(f"     → 总体健康度分数")
                elif col_name == 'score_vitality':
                    print(f"     → 项目活跃度分数")
                elif col_name == 'score_responsiveness':
                    print(f"     → 问题响应度分数")
                elif col_name == 'score_resilience':
                    print(f"     → 项目抗风险分数")
                elif col_name == 'score_governance':
                    print(f"     → 项目治理分数")
                elif col_name == 'score_security':
                    print(f"     → 项目安全分数")
            
            print(f"\n✅ health_overview_daily表字段信息查看完成!")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()