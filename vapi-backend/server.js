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

// Keep track of emitted messages to avoid broadcasting duplicates from conversation-update histories
const emittedMessageKeys = new Set();

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
    const callId = message.call?.id || body.call?.id || message.callId || body.callId || 'call';

    console.log(
      `[Vapi Webhook] Received event type: "${eventType || 'unknown'}" | Active Socket Clients: ${io.engine.clientsCount}`
    );

    let emittedCount = 0;

    // 1. Direct transcript event
    if (eventType === 'transcript') {
      const transcriptText = message.transcript || message.text || '';
      if (transcriptText) {
        const rawRole = (message.role || 'user').toLowerCase();
        const role = rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'ai' ? 'assistant' : 'user';

        const transcriptPayload = {
          text: typeof transcriptText === 'string' ? transcriptText.trim() : String(transcriptText),
          role: role,
          timestamp: message.timestamp ? Number(message.timestamp) : Date.now(),
        };

        io.emit('phone-transcript', transcriptPayload);
        emittedCount++;
        console.log(`[Vapi Webhook] Emitted phone-transcript (${transcriptPayload.role}): "${transcriptPayload.text}"`);

        return res.status(200).json({
          success: true,
          message: 'Transcript processed and broadcasted',
          data: transcriptPayload,
        });
      }
    }

    // 2. conversation-update event (Contains conversation history and turns)
    if (eventType === 'conversation-update') {
      const messagesList =
        message.conversation?.messages ||
        message.messages ||
        message.messagesOpenAIFormatted ||
        body.conversation?.messages ||
        body.messages ||
        [];

      console.log(`[Vapi Webhook] conversation-update: found ${messagesList.length} total message(s) in history`);

      messagesList.forEach((msg, idx) => {
        const rawRole = (msg.role || 'user').toLowerCase();
        // Skip system prompts, internal tool calls, or function messages
        if (rawRole === 'system' || rawRole === 'tool' || rawRole === 'function') {
          return;
        }

        const role = rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'ai' ? 'assistant' : 'user';
        const rawText = msg.message || msg.content || msg.text || '';
        const text = typeof rawText === 'string' ? rawText.trim() : String(rawText).trim();

        if (!text) return;

        // Unique signature for this turn in the conversation
        const key = `${callId}-${idx}-${role}-${text}`;

        if (!emittedMessageKeys.has(key)) {
          emittedMessageKeys.add(key);

          // Bound cache size to prevent memory leaks over long uptimes
          if (emittedMessageKeys.size > 2000) {
            const firstKey = emittedMessageKeys.values().next().value;
            emittedMessageKeys.delete(firstKey);
          }

          const transcriptPayload = {
            text: text,
            role: role,
            timestamp: msg.time ? Number(msg.time) : (msg.timestamp ? Number(msg.timestamp) : Date.now()),
          };

          io.emit('phone-transcript', transcriptPayload);
          emittedCount++;
          console.log(
            `[Vapi Webhook] Emitted phone-transcript from conversation-update (${role}): "${text}"`
          );
        }
      });

      return res.status(200).json({
        success: true,
        message: `Processed conversation-update: emitted ${emittedCount} new turn(s)`,
        emittedCount,
      });
    }

    // 3. speech-update event (Speech status notifications: started / stopped)
    if (eventType === 'speech-update') {
      const speechRole = (message.role || body.role || 'user').toLowerCase();
      const speechStatus = message.status || body.status || 'unknown';
      console.log(`[Vapi Webhook] speech-update: role=${speechRole}, status=${speechStatus}`);

      // If text/transcript is attached in speech-update, broadcast it
      const inlineText = message.transcript || message.text || message.content;
      if (inlineText && typeof inlineText === 'string' && inlineText.trim()) {
        const role = speechRole === 'assistant' || speechRole === 'bot' || speechRole === 'ai' ? 'assistant' : 'user';
        const transcriptPayload = {
          text: inlineText.trim(),
          role: role,
          timestamp: Date.now(),
        };

        io.emit('phone-transcript', transcriptPayload);
        emittedCount++;
        console.log(`[Vapi Webhook] Emitted phone-transcript from speech-update (${role}): "${inlineText.trim()}"`);
      }

      return res.status(200).json({
        success: true,
        message: `Processed speech-update (${speechRole}: ${speechStatus})`,
        status: speechStatus,
      });
    }

    // 4. Fallback for any other event containing transcript or text
    const fallbackText = message.transcript || message.text;
    if (fallbackText && typeof fallbackText === 'string' && fallbackText.trim()) {
      const rawRole = (message.role || 'user').toLowerCase();
      const role = rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'ai' ? 'assistant' : 'user';
      const transcriptPayload = {
        text: fallbackText.trim(),
        role: role,
        timestamp: Date.now(),
      };

      io.emit('phone-transcript', transcriptPayload);
      console.log(`[Vapi Webhook] Emitted phone-transcript from fallback (${role}): "${transcriptPayload.text}"`);

      return res.status(200).json({
        success: true,
        message: `Event '${eventType}' transcript broadcasted`,
        data: transcriptPayload,
      });
    }

    // Acknowledge other lifecycle events (call-start, status-update, end-of-call-report, etc.)
    return res.status(200).json({
      success: true,
      message: `Event '${eventType || 'unspecified'}' received and acknowledged`,
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
