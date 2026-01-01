#!/usr/bin/env python3
"""
为所有已存在的仓库表批量添加得分列
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def main():
    print("🔧 开始为所有仓库表添加健康度评分列...")
    
    with SessionLocal() as db:
        try:
            # 执行动态SQL：为所有repo_*表添加评分列
            result = db.execute(text("""
                DO $$ 
                DECLARE 
                    row record; 
                    col_name text; 
                    scores text[] := ARRAY['score_health', 'score_vitality', 'score_responsiveness', 'score_resilience', 'score_governance', 'score_security']; 
                BEGIN 
                    RAISE NOTICE '开始为仓库表添加评分列...';
                    
                    FOR row IN SELECT tablename FROM pg_tables WHERE tablename LIKE 'repo_%' AND schemaname = 'public' 
                    LOOP 
                        RAISE NOTICE '处理表: %', row.tablename;
                        
                        FOREACH col_name IN ARRAY scores 
                        LOOP 
                            BEGIN
                                EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I DOUBLE PRECISION', row.tablename, col_name);
                                RAISE NOTICE '  添加列: %', col_name;
                            EXCEPTION WHEN OTHERS THEN
                                RAISE WARNING '为表 % 添加列 % 时出错: %', row.tablename, col_name, SQLERRM;
                            END;
                        END LOOP; 
                    END LOOP; 
                    
                    RAISE NOTICE '所有仓库表的评分列添加完成!';
                END $$;
            """))
            
            print("✅ 成功为所有仓库表添加了健康度评分列!")
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()