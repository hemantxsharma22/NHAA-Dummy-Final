import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Enable CORS for Express REST endpoints
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middleware to parse JSON payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Setup Socket.io with CORS enabled for all origins
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
  });
});

/**
 * Health check endpoint for deployment validation
 * Expected by Railway, Render, and monitor pings
 */
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

/**
 * Root endpoint for basic verification
 */
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Vapi Webhook & Socket.io Backend',
    endpoints: {
      health: '/health',
      webhook: '/api/vapi-webhook',
    },
  });
});

/**
 * POST /api/vapi-webhook
 * Endpoint to receive Vapi voice AI server-side webhook events
 */
app.post('/api/vapi-webhook', (req, res) => {
  try {
    const body = req.body || {};

    // Vapi webhook events may wrap details inside `message` or directly at root
    const message = body.message || body;
    const eventType = message.type || body.type;

    console.log(`[Vapi Webhook] Received event type: ${eventType || 'unknown'}`);

    // Check if event type is "transcript"
    if (eventType === 'transcript') {
      const transcriptText = message.transcript || message.text || '';
      const rawRole = (message.role || 'user').toLowerCase();
      const role = rawRole === 'assistant' ? 'assistant' : 'user';

      const transcriptPayload = {
        text: typeof transcriptText === 'string' ? transcriptText.trim() : String(transcriptText),
        role: role,
        timestamp: Date.now(),
      };

      // Emit "phone-transcript" event to all connected Socket.io clients
      io.emit('phone-transcript', transcriptPayload);

      console.log(
        `[Vapi Webhook] Emitted phone-transcript (${transcriptPayload.role}): "${transcriptPayload.text}"`
      );

      return res.status(200).json({
        success: true,
        message: 'Transcript processed and broadcasted',
        data: transcriptPayload,
      });
    }

    // Acknowledge other event types (e.g. call-start, end-of-call-report, status-update)
    return res.status(200).json({
      success: true,
      message: `Event '${eventType || 'unspecified'}' received successfully`,
    });
  } catch (error) {
    console.error('[Vapi Webhook Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error while processing webhook',
    });
  }
});

// Start HTTP and WebSocket server
server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Vapi Backend Server running on port ${PORT}`);
  console.log(`📡 WebSocket (Socket.io) ready on port ${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  console.log(`📞 Vapi Webhook: http://localhost:${PORT}/api/vapi-webhook`);
  console.log(`=========================================`);
});
