#!/usr/bin/env python3
"""
显示仓库名表和health_overview_daily表的结构
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def show_table_structure(db, table_name, description):
    """显示表结构信息"""
    print(f"\n{'='*60}")
    print(f"📋 {description}")
    print(f"表名: {table_name}")
    print(f"{'='*60}")
    
    try:
        # 获取表结构
        result = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = :table_name AND table_schema = 'public'
            ORDER BY ordinal_position
        """), {"table_name": table_name}).fetchall()
        
        if result:
            print(f"\n📊 表结构 (共 {len(result)} 列):")
            print(f"{'序号':<4} {'字段名':<30} {'数据类型':<15} {'可空':<6} {'默认值':<20}")
            print("-" * 80)
            
            for i, (col_name, data_type, is_nullable, column_default) in enumerate(result, 1):
                nullable = "YES" if is_nullable == "YES" else "NO"
                default = str(column_default) if column_default else ""
                print(f"{i:<4} {col_name:<30} {data_type:<15} {nullable:<6} {default:<20}")
            
            # 显示一些示例数据
            print(f"\n🔍 示例数据:")
            sample_result = db.execute(text(f"SELECT * FROM {table_name} LIMIT 3")).fetchall()
            
            if sample_result:
                for i, row in enumerate(sample_result, 1):
                    print(f"  第{i}行: {row}")
            else:
                print("  (暂无数据)")
                
        else:
            print("❌ 未找到该表或表为空")
            
    except Exception as e:
        print(f"❌ 查询表结构时出错: {e}")

def main():
    print("🔍 查看仓库名表和健康度概览表的结构...")
    
    with SessionLocal() as db:
        try:
            # 1. 查看仓库名表 (repo_catalog)
            show_table_structure(db, "repo_catalog", "仓库名表")
            
            # 2. 查看健康度概览表 (health_overview_daily)
            show_table_structure(db, "health_overview_daily", "健康度概览表")
            
            # 3. 额外查看几个重要的仓库表
            print(f"\n\n{'='*60}")
            print("📋 额外查看：仓库专属表示例 (repo_kubernetes_kubernetes)")
            print(f"{'='*60}")
            
            show_table_structure(db, "repo_kubernetes_kubernetes", "Kubernetes仓库专属表")
            
            # 4. 查看所有仓库表
            print(f"\n\n{'='*60}")
            print("📋 所有仓库表列表")
            print(f"{'='*60}")
            
            tables_result = db.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE tablename LIKE 'repo_%' AND schemaname = 'public' 
                ORDER BY tablename
            """)).fetchall()
            
            print(f"\n📊 发现 {len(tables_result)} 个仓库表:")
            for table_row in tables_result:
                table_name = table_row[0]
                # 获取每个表的记录数
                count_result = db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                count = count_result[0] if count_result else 0
                print(f"  - {table_name} ({count} 条记录)")
            
            print(f"\n✅ 表结构信息查看完成!")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()