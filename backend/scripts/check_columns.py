#!/usr/bin/env python3
"""
检查metric_points表的列名
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.base import SessionLocal
from sqlalchemy import text

def main():
    print("🔍 检查 metric_points 表的列名...")
    
    with SessionLocal() as db:
        try:
            # 获取表结构
            result = db.execute(text('''
                SELECT column_name
                FROM information_schema.columns 
                WHERE table_name = 'metric_points' AND table_schema = 'public'
                ORDER BY ordinal_position
            ''')).fetchall()
            
            print('\n=== metric_points 表列名 ===')
            for col_name, in result:
                print(f'{col_name}')
            
            print(f'\n✅ 总共 {len(result)} 列!')
            
        except Exception as e:
            print(f'❌ 错误: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()