#!/usr/bin/env python3
"""
为真正的仓库表批量添加健康度评分列
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def main():
    print("🔧 开始为真正的仓库表添加健康度评分列...")
    
    with SessionLocal() as db:
        try:
            # 获取所有真正的仓库表（排除目录表、快照表等）
            tables_result = db.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE tablename LIKE 'repo_%' 
                AND schemaname = 'public'
                AND tablename NOT IN ('repo_catalog', 'repo_snapshots', 'repo_ossf_scorecard', 'reports')
                ORDER BY tablename
            """)).fetchall()
            
            print(f"\n📋 发现 {len(tables_result)} 个真正的仓库表:")
            for table_row in tables_result:
                table_name = table_row[0]
                print(f"  - {table_name}")
            
            # 为每个仓库表添加健康度评分列
            score_columns = ['score_health', 'score_vitality', 'score_responsiveness', 
                           'score_resilience', 'score_governance', 'score_security']
            
            print(f"\n🔧 开始添加健康度评分列:")
            
            for table_row in tables_result:
                table_name = table_row[0]
                print(f"\n  处理表: {table_name}")
                
                for col in score_columns:
                    try:
                        # 检查列是否已存在
                        col_result = db.execute(text("""
                            SELECT EXISTS (
                                SELECT 1 FROM information_schema.columns 
                                WHERE table_name = :table_name 
                                AND column_name = :column_name 
                                AND table_schema = 'public'
                            )
                        """), {"table_name": table_name, "column_name": col}).fetchone()
                        
                        exists = col_result[0] if col_result else False
                        
                        if not exists:
                            # 添加列
                            db.execute(text(f"""
                                ALTER TABLE public.{table_name} 
                                ADD COLUMN {col} DOUBLE PRECISION
                            """))
                            db.commit()
                            print(f"    ✅ 成功添加列: {col}")
                        else:
                            print(f"    ⚪ 列已存在: {col}")
                            
                    except Exception as e:
                        print(f"    ❌ 添加列 {col} 失败: {e}")
                        db.rollback()
            
            print(f"\n✅ 所有仓库表的健康度评分列处理完成!")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()