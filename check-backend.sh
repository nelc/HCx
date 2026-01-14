#!/bin/bash

# Check if backend is running on port 3001
echo "🔍 Checking backend status..."

# Check if port 3001 is in use
PORT_PID=$(lsof -ti :3001)

if [ -z "$PORT_PID" ]; then
    echo "❌ Backend is not running on port 3001"
    echo "💡 Start the backend with: npm run dev"
    exit 1
else
    echo "✅ Port 3001 is in use (PID: $PORT_PID)"
    
    # Try to connect to the API
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/auth/me 2>/dev/null)
    
    if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "200" ]; then
        echo "✅ Backend API is responding correctly"
        echo "🎉 Backend is healthy and ready to accept requests"
        exit 0
    else
        echo "⚠️  Port is in use but API not responding (HTTP $RESPONSE)"
        echo "💡 Try restarting the backend"
        exit 1
    fi
fi

