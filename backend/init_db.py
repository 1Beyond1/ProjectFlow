#!/usr/bin/env python3
"""
数据库初始化脚本
用于手动初始化或重置数据库
"""
import asyncio
import sys
import os

# 添加 backend 目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db


async def main():
    print("🗄️ 正在初始化数据库...")
    await init_db()
    print("✅ 数据库初始化完成！")


if __name__ == "__main__":
    asyncio.run(main())
