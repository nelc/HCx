#!/bin/bash

# Fix backend port issue by killing any process using port 3001
echo "🔧 Fixing backend port issue..."

# Check if port 3001 is in use
PORT_PID=$(lsof -ti :3001)

if [ -z "$PORT_PID" ]; then
    echo "✅ Port 3001 is free"
else
    echo "⚠️  Port 3001 is in use by process(es): $PORT_PID"
    echo "🔨 Killing process(es)..."
    lsof -ti :3001 | xargs kill -9 2>/dev/null
    
    sleep 1
    
    # Check again
    NEW_PID=$(lsof -ti :3001)
    if [ -z "$NEW_PID" ]; then
        echo "✅ Port 3001 is now free"
        echo "💡 Restart your backend with: npm run dev"
    else
        echo "❌ Failed to free port 3001"
        exit 1
    fi
fi

exit 0

