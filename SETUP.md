# 🚀 Quick Setup Guide

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

Wait for all packages to install (~2-3 minutes)

---

## Step 2: Create .env File

```bash
cp .env.example .env
```

Then edit `.env`:

```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=my-super-secret-key-change-in-production
SESSION_NAME=gamehub.sid
SESSION_MAX_AGE=86400000
USE_REDIS=false
MAX_ROOMS=1000
ROOM_EXPIRY_MINUTES=120
MAX_PLAYERS_PER_ROOM=4
```

**⚠️ IMPORTANT:** Change `SESSION_SECRET` to a random string!

---

## Step 3: Start Development Server

```bash
npm run start:dev
```

You should see:
```
🚀 Server running on http://localhost:3001
🎮 WebSocket running on ws://localhost:3001/game
🌐 Frontend URL: http://localhost:5173
```

---

## Step 4: Test the API

### Option A: Using cURL

```bash
# Create a room
curl -X POST http://localhost:3001/api/rooms/create \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "playerName": "TestPlayer",
    "playerColor": "red",
    "maxPlayers": 4
  }'
```

### Option B: Using Browser

1. Open: `http://localhost:3001/api/rooms/all`
2. You should see: `{"success":true,"data":{"count":0,"rooms":[]}}`

---

## Step 5: Connect Frontend

In your frontend `.env`:

```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001/game
```

---

## ✅ Verification Checklist

- [ ] Server starts without errors
- [ ] No TypeScript compilation errors
- [ ] Port 3001 is accessible
- [ ] `/api/rooms/all` returns JSON
- [ ] Session cookies are set
- [ ] CORS allows frontend URL

---

## 🐛 Common Issues

### Issue: Port 3001 already in use
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9
```

### Issue: Module not found
```bash
# Delete and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: Session not working
- Check `SESSION_SECRET` is set
- Verify `FRONTEND_URL` matches your frontend
- Ensure cookies are enabled in browser

---

## 📚 Next Steps

1. ✅ Backend is running
2. ✅ API endpoints are accessible
3. ⏳ Connect your frontend
4. ⏳ Test room creation
5. ⏳ Test WebSocket connection

---

## 🎮 Testing Multiplayer Locally

1. Start backend: `npm run start:dev`
2. Start frontend: `npm run dev`
3. Open 2 browser windows
4. Window 1: Create room
5. Window 2: Join room with code
6. Test chat, colors, ready status

---

## 📞 Need Help?

Check the full README.md for:
- Complete API documentation
- WebSocket events reference
- Security features
- Troubleshooting guide

**Happy coding! 🚀**
