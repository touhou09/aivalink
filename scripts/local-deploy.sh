#!/bin/bash
set -e

HOST="192.168.200.55"
BACKEND_DIR="/Users/yuseungju/workspace/aivalink"
FRONTEND_DIR="/Users/yuseungju/workspace/aivalink-web"

echo "=== AivaLink Local Deploy ($HOST) ==="

# 1. Start DB + Redis via Docker
echo "[1/4] Starting PostgreSQL + Redis..."
cd "$BACKEND_DIR"
docker compose up -d postgres redis
echo "Waiting for services to be healthy..."
sleep 3

# 2. Run Alembic migrations
echo "[2/4] Running database migrations..."
uv run alembic upgrade head

# 3. Start Backend (background)
echo "[3/4] Starting Backend on 0.0.0.0:8000..."
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# 4. Start Frontend (background)
echo "[4/4] Starting Frontend on 0.0.0.0:5173..."
cd "$FRONTEND_DIR"
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "=== Deploy Complete ==="
echo "Frontend: http://$HOST:5173"
echo "Backend:  http://$HOST:8000"
echo "API Docs: http://$HOST:8000/docs"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID && docker compose down"

# Wait for both processes
wait
