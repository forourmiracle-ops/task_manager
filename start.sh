#!/bin/bash
# TaskFlow 一键启动脚本
# 用法: ./start.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "=========================================="
echo "  TaskFlow 任务管理系统"
echo "=========================================="

# 1. 检查依赖
if [ ! -d "node_modules" ]; then
  echo ""
  echo "[1/3] 安装依赖..."
  npm install
else
  echo ""
  echo "[1/3] 依赖已就绪"
fi

# 2. 检查端口
PORT=5173
if lsof -i :$PORT > /dev/null 2>&1; then
  echo "[2/3] 端口 $PORT 已被占用，尝试终止旧进程..."
  kill $(lsof -t -i:$PORT) 2>/dev/null || true
  sleep 1
fi

# 3. 启动开发服务器
echo "[3/3] 启动开发服务器..."
echo ""
echo "  前端界面: http://localhost:$PORT"
echo "  按 Ctrl+C 停止服务器"
echo "=========================================="
echo ""

npx vite --host 0.0.0.0 --port $PORT