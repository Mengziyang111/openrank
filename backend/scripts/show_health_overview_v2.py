#!/usr/bin/env python3
"""
使用DESCRIBE命令查看health_overview_daily表结构
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
            # 使用更简单的方式查看表结构
            print("\n📊 方法1: 使用DESCRIBE命令")
            desc_result = db.execute(text("\\d health_overview_daily")).fetchall()
            if desc_result:
                for row in desc_result:
                    print(f"  {row}")
            
            # 使用SQL查询查看字段
            print(f"\n📊 方法2: SQL查询字段信息")
            result = db.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'health_overview_daily' 
                ORDER BY ordinal_position
            """)).fetchall()
            
            print(f"\n{'='*100}")
            print(f"📋 health_overview_daily表完整字段信息")
            print(f"{'='*100}")
            
            if result:
                print(f"\n📊 字段详情:")
                print(f"{'序号':<4} {'字段名':<35} {'数据类型':<25} {'可空性':<8} {'默认值'}")
                print("-" * 95)
                
                for i, (col_name, data_type, is_nullable, column_default) in enumerate(result, 1):
                    nullable = "允许空值" if is_nullable == "YES" else "不允许空值"
                    default = str(column_default) if column_default else "无默认值"
                    print(f"{i:<4} {col_name:<35} {data_type:<25} {nullable:<8} {default}")
            else:
                print("❌ 未找到字段信息，尝试其他方法...")
                
                # 直接查询表中的数据看字段
                print(f"\n📊 方法3: 通过查询实际数据推断字段")
                try:
                    sample_result = db.execute(text("SELECT * FROM health_overview_daily LIMIT 1")).fetchone()
                    if sample_result:
                        # 获取列名
                        columns_result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'health_overview_daily' ORDER BY ordinal_position")).fetchall()
                        columns = [r[0] for r in columns_result]
                        
                        print(f"从实际数据推断的字段名:")
                        for i, col_name in enumerate(columns, 1):
                            print(f"  {i:2d}. {col_name}")
                except Exception as e:
                    print(f"查询数据时出错: {e}")
                    
            # 查看表中的实际数据样例
            print(f"\n📊 方法4: 查看实际数据样例")
            try:
                sample_result = db.execute(text("SELECT * FROM health_overview_daily LIMIT 2")).fetchall()
                if sample_result:
                    # 获取列名
                    columns_result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'health_overview_daily' ORDER BY ordinal_position")).fetchall()
                    columns = [r[0] for r in columns_result]
                    
                    for i, row in enumerate(sample_result, 1):
                        print(f"\n第{i}行数据:")
                        for col_name, value in zip(columns, row):
                            print(f"  {col_name}: {value}")
                else:
                    print("  表中暂无数据")
            except Exception as e:
                print(f"查看数据时出错: {e}")
                
            # 获取总记录数
            print(f"\n📊 表统计:")
            count_result = db.execute(text("SELECT COUNT(*) FROM health_overview_daily")).fetchone()
            total_records = count_result[0] if count_result else 0
            print(f"  总记录数: {total_records}")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()