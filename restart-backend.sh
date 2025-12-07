#!/bin/bash

echo "🔧 Fixing Backend Server..."
echo ""

# Kill any process on port 3001
echo "1️⃣ Killing processes on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1

# Check if port is free
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "❌ Port 3001 still in use!"
    echo "Please manually kill the process and try again."
    exit 1
fi

echo "✅ Port 3001 is free"
echo ""

# Start backend
echo "2️⃣ Starting backend server..."
cd /Users/hbinasfour/Desktop/HRnelc/backend
node src/index.js &
BACKEND_PID=$!

echo "Backend PID: $BACKEND_PID"
sleep 3

# Test backend
echo ""
echo "3️⃣ Testing backend health..."
HEALTH=$(curl -s http://localhost:3001/api/health)

if [ -z "$HEALTH" ]; then
    echo "❌ Backend not responding!"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Backend is healthy!"
echo "Response: $HEALTH"
echo ""
echo "🎉 Backend is ready!"
echo ""
echo "📝 Backend PID: $BACKEND_PID"
echo "To stop: kill $BACKEND_PID"
echo ""
echo "Now try the CSV upload again!"

