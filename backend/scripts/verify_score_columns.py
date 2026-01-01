#!/usr/bin/env python3
"""
验证仓库表是否成功添加了健康度评分列
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def main():
    print("🔍 验证仓库表的健康度评分列...")
    
    with SessionLocal() as db:
        try:
            # 获取所有仓库表名
            tables_result = db.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE tablename LIKE 'repo_%' AND schemaname = 'public' 
                ORDER BY tablename
            """)).fetchall()
            
            print(f"\n📋 发现 {len(tables_result)} 个仓库表:")
            for table_row in tables_result:
                table_name = table_row[0]
                print(f"  - {table_name}")
            
            # 检查每个表的健康度评分列
            score_columns = ['score_health', 'score_vitality', 'score_responsiveness', 
                           'score_resilience', 'score_governance', 'score_security']
            
            print(f"\n🔍 检查健康度评分列:")
            for table_row in tables_result:
                table_name = table_row[0]
                print(f"\n  表: {table_name}")
                
                for col in score_columns:
                    # 检查列是否存在
                    col_result = db.execute(text("""
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = :table_name 
                            AND column_name = :column_name 
                            AND table_schema = 'public'
                        )
                    """), {"table_name": table_name, "column_name": col}).fetchone()
                    
                    exists = col_result[0] if col_result else False
                    status = "✅" if exists else "❌"
                    print(f"    {status} {col}")
            
            print(f"\n✅ 验证完成!")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()