# Vapi Voice AI Webhook & Real-time Socket.io Backend

Node.js + Express backend jo [Vapi.ai](https://vapi.ai) voice assistant ke server-side webhook events ko handle karta hai aur real-time live transcripts ko WebSocket (Socket.io) ke zariye connected frontend clients tak broadcast karta hai.

---

## 📋 Features

1. **Real-time WebSockets**: Socket.io setup with CORS (`*`) for live communication.
2. **Vapi Webhook Endpoint**: `POST /api/vapi-webhook` handles incoming Vapi webhook payloads.
3. **Live Transcript Extraction**: `transcript` events ko detect karke text aur role (`user` ya `assistant`) extract karta hai.
4. **Socket.io Broadcasting**: Clients ko real-time `phone-transcript` event bhejta hai:
   ```json
   {
     "text": "Hello, how can I help you?",
     "role": "assistant",
     "timestamp": 1727177800000
   }
   ```
5. **Health Check Endpoint**: `GET /health` returns `OK` (HTTP 200).
6. **Cross-Origin Resource Sharing (CORS)**: Preconfigured for any frontend domain.
7. **Environment Config**: Port management using `.env`.

---

## 📁 Project Structure

```text
vapi-backend/
├── .env                  # Environment variables (PORT)
├── .env.example          # Sample environment variables
├── .gitignore            # Git ignore rules
├── package.json          # Node dependencies & start scripts
├── server.js             # Main Express + Socket.io server
└── README.md             # Setup & deployment documentation
```

---

## 🚀 Local Setup & Installation

### 1. Dependencies Install karein:
```bash
cd vapi-backend
npm install
```

### 2. Environment Variables configure karein:
`.env` file banakar ya edit karke port define karein:
```env
PORT=5000
```

### 3. Server Start karein:
- **Production mode:**
  ```bash
  npm start
  ```
- **Development mode (Auto-reload on save):**
  ```bash
  npm run dev
  ```

Server `http://localhost:5000` par start ho jayega.

---

## 🧪 Testing Locally

### 1. Health Check Test:
```bash
curl http://localhost:5000/health
# Output: OK
```

### 2. Webhook Event Test:
```bash
curl -X POST http://localhost:5000/api/vapi-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "transcript",
      "role": "user",
      "transcript": "Namaste, mujhe madad chahiye."
    }
  }'
```
Server response:
```json
{
  "success": true,
  "message": "Transcript processed and broadcasted",
  "data": {
    "text": "Namaste, mujhe madad chahiye.",
    "role": "user",
    "timestamp": 1727177800000
  }
}
```

---

## 🌐 Deployment Guide (Railway & Render)

Jab aap is backend ko cloud par deploy karenge, to public URL mil jayega (jaise `https://my-vapi-backend.up.railway.app` ya `https://my-vapi-backend.onrender.com`).

---

### Option A: Railway par Deploy karna

1. **Railway Account**: [railway.app](https://railway.app) par login karein.
2. **New Project**: **+ New Project** button click karein -> **Deploy from GitHub repo**.
3. **Repository Select karein**: Apna GitHub repo choose karein.
4. **Root Directory Set karein** (Agar mono-repo mein `vapi-backend` folder alag hai):
   - Railway project dashboard mein service par click karein.
   - **Settings** tab mein jayein.
   - **Root Directory** field mein likhein: `vapi-backend`.
5. **Start Command**: Railway automatically `npm start` detect kar lega.
6. **Environment Variables**:
   - **Variables** tab mein jayein.
   - `PORT` variable set karein: `PORT=5000` (Railway automatically bhi dynamically port assign karta hai jise hamara `process.env.PORT` support karta hai).
7. **Domain Generate karein**:
   - **Settings** -> **Networking** -> **Generate Domain** par click karein.
   - Aapka public URL mil jayega (e.g. `https://vapi-backend-production.up.railway.app`).
8. **Verify karein**:
   - Browser mein open karein: `https://<YOUR-RAILWAY-URL>/health` -> "OK" aana chahiye.

---

### Option B: Render par Deploy karna

1. **Render Account**: [render.com](https://render.com) par login karein.
2. **New Web Service**: Dashboard par jaakar **New +** -> **Web Service** select karein.
3. **Connect Repository**: Apna GitHub repository select karein.
4. **Service Configuration**:
   - **Name**: `vapi-backend` (koi bhi pasandeeda naam)
   - **Region**: Singapore / Frankfurt / Oregon (koi bhi select karein)
   - **Root Directory**: `vapi-backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. **Environment Variables (Optional)**:
   - Render automatically `PORT` provide karta hai jo code automatically read karega.
6. **Health Check Path**:
   - Advanced settings open karein -> **Health Check Path**: `/health`
7. **Deploy**:
   - **Create Web Service** button dabayein.
   - Render build aur deploy process start karega.
8. **Verify karein**:
   - Render dashboard par URL milega (e.g. `https://vapi-backend.onrender.com`).
   - Browser mein check karein: `https://vapi-backend.onrender.com/health` -> Screen par `OK` dikhega.

---

## 🔗 Vapi Dashboard Setup (Webhook Connect karein)

Apne Vapi Voice Assistant se webhook jodney ke liye:

1. [Vapi Dashboard](https://dashboard.vapi.ai) par login karein.
2. **Assistants** menu mein jakar apna Assistant select karein.
3. **Server URL** (Webhook) field dhoondhein:
   - URL daalein: `https://<YOUR-DEPLOYED-URL>/api/vapi-webhook`
   - Example: `https://vapi-backend.onrender.com/api/vapi-webhook`
4. **Server Message Types** mein **"transcript"** event enable karein.
5. **Save** karein. Ab jab bhi call par user ya assistant bolege, Vapi live transcript events is backend par bhejega.

---

## 💻 Frontend Client Setup (React / Vanilla JS)

Frontend app mein real-time transcripts sunne ke liye:

```bash
npm install socket.io-client
```

```javascript
import { io } from "socket.io-client";

// Backend URL (Localhost ya deployed Render/Railway URL)
const BACKEND_URL = "https://your-backend-app.onrender.com";

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("Connected to Vapi WebSocket server, ID:", socket.id);
});

// "phone-transcript" event listen karein
socket.on("phone-transcript", (data) => {
  console.log("Transcript received:", data);
  // data format:
  // {
  //   text: "Hello, how can I help you?",
  //   role: "assistant", // ya "user"
  //   timestamp: 1727177800000
  // }
});

socket.on("disconnect", () => {
  console.log("Disconnected from WebSocket server");
});
```
