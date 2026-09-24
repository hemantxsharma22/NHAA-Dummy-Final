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
 * Extracts the message list from any Vapi payload structure.
 * Supports message.conversation (array), message.messages, message.messagesOpenAIFormatted, etc.
 */
function extractMessagesList(body, message) {
  if (Array.isArray(message?.conversation)) return message.conversation;
  if (Array.isArray(message?.messages)) return message.messages;
  if (Array.isArray(message?.messagesOpenAIFormatted)) return message.messagesOpenAIFormatted;
  if (Array.isArray(message?.conversation?.messages)) return message.conversation.messages;
  if (Array.isArray(body?.conversation)) return body.conversation;
  if (Array.isArray(body?.messages)) return body.messages;
  if (Array.isArray(body?.conversation?.messages)) return body.conversation.messages;
  return [];
}

/**
 * POST /api/vapi-webhook
 * Endpoint to receive Vapi voice AI server-side webhook events
 */
app.post('/api/vapi-webhook', (req, res) => {
  try {
    const body = req.body || {};

    // Vapi webhook events may wrap details inside `message` or directly at root
    const message = body.message || body;
    const eventType = message.type || body.type || 'unknown';
    const callId = message.call?.id || body.call?.id || message.callId || body.callId || 'call';

    console.log(
      `[Vapi Webhook] Received event: "${eventType}" | Socket Clients: ${io.engine.clientsCount}`
    );

    let emittedCount = 0;

    // 1. speech-update event (Speech status notifications: started / stopped)
    // NOTE: speech-update must NEVER emit transcripts or cumulative history
    if (eventType === 'speech-update') {
      const speechRole = (message.role || body.role || 'user').toLowerCase();
      const speechStatus = message.status || body.status || 'unknown';
      console.log(`[Vapi Webhook] speech-update: role=${speechRole}, status=${speechStatus}`);

      return res.status(200).json({
        success: true,
        message: `Processed speech-update (${speechRole}: ${speechStatus})`,
        status: speechStatus,
      });
    }

    // 2. Check for conversation history array (from conversation-update, end-of-call-report, etc.)
    const messagesList = extractMessagesList(body, message);
    if (messagesList.length > 0) {
      console.log(
        `[Vapi Webhook] Processing ${messagesList.length} conversation turn(s) from event "${eventType}"`
      );

      messagesList.forEach((msg, idx) => {
        const rawRole = (msg.role || '').toLowerCase().trim();
        // Skip system prompts, internal tool calls, or function messages
        if (!rawRole || rawRole === 'system' || rawRole === 'tool' || rawRole === 'function') {
          return;
        }

        const role = (rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'ai') ? 'assistant' : 'user';

        let text = '';
        if (typeof msg.message === 'string') {
          text = msg.message.trim();
        } else if (typeof msg.content === 'string') {
          text = msg.content.trim();
        } else if (Array.isArray(msg.content)) {
          text = msg.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' ').trim();
        } else if (typeof msg.text === 'string') {
          text = msg.text.trim();
        }

        if (!text) return;

        // Strip accidental "AI: " or "User: " prefixes if embedded inside text
        if (role === 'assistant' && /^AI:\s*/i.test(text)) {
          text = text.replace(/^AI:\s*/i, '').trim();
        } else if (role === 'user' && /^(User|Caller):\s*/i.test(text)) {
          text = text.replace(/^(User|Caller):\s*/i, '').trim();
        }

        // Unique signature for this turn in the conversation
        const key = `${callId}-${idx}-${role}-${text.slice(0, 80)}`;

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
            `[Vapi Webhook] Emitted individual turn -> extracted role: "${rawRole}" | emitted role: "${role}" | text: "${text}"`
          );
        }
      });

      return res.status(200).json({
        success: true,
        message: `Processed conversation history: emitted ${emittedCount} new turn(s)`,
        emittedCount,
      });
    }

    // 3. Fallback: Parse multi-turn transcript string if provided without messages array
    const rawTranscript = message.transcript || body.transcript;
    if (
      typeof rawTranscript === 'string' &&
      (rawTranscript.includes('AI:') || rawTranscript.includes('User:') || rawTranscript.includes('\n'))
    ) {
      console.log(`[Vapi Webhook] Parsing multi-line transcript string into individual turns`);
      const lines = rawTranscript.split('\n').map((l) => l.trim()).filter(Boolean);

      lines.forEach((line, lineIdx) => {
        let lineRole = null;
        let lineText = '';

        if (/^(AI|Assistant):\s*/i.test(line)) {
          lineRole = 'assistant';
          lineText = line.replace(/^(AI|Assistant):\s*/i, '').trim();
        } else if (/^(User|Caller):\s*/i.test(line)) {
          lineRole = 'user';
          lineText = line.replace(/^(User|Caller):\s*/i, '').trim();
        }

        if (lineRole && lineText) {
          const lineKey = `${callId}-line-${lineIdx}-${lineRole}-${lineText.slice(0, 80)}`;
          if (!emittedMessageKeys.has(lineKey)) {
            emittedMessageKeys.add(lineKey);
            const transcriptPayload = {
              text: lineText,
              role: lineRole,
              timestamp: Date.now(),
            };
            io.emit('phone-transcript', transcriptPayload);
            emittedCount++;
            console.log(
              `[Vapi Webhook] Emitted individual turn -> extracted role: "${lineRole}" | emitted role: "${lineRole}" | text: "${lineText}"`
            );
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: `Parsed transcript string: emitted ${emittedCount} turn(s)`,
        emittedCount,
      });
    }

    // 4. Single-turn transcript event (streaming STT)
    if (eventType === 'transcript') {
      const transcriptText = message.transcript || message.text || '';
      // Ensure single turn text does not contain multiple speaker labels
      if (
        transcriptText &&
        !transcriptText.includes('\nAI:') &&
        !transcriptText.includes('\nUser:')
      ) {
        const rawRole = (message.role || 'user').toLowerCase().trim();
        const role = (rawRole === 'assistant' || rawRole === 'ai' || rawRole === 'bot') ? 'assistant' : 'user';

        let cleanText = transcriptText.trim();
        if (role === 'assistant' && /^AI:\s*/i.test(cleanText)) {
          cleanText = cleanText.replace(/^AI:\s*/i, '').trim();
        } else if (role === 'user' && /^(User|Caller):\s*/i.test(cleanText)) {
          cleanText = cleanText.replace(/^(User|Caller):\s*/i, '').trim();
        }

        const key = `${callId}-stt-${role}-${cleanText.slice(0, 80)}`;
        if (!emittedMessageKeys.has(key)) {
          emittedMessageKeys.add(key);
          const transcriptPayload = {
            text: cleanText,
            role,
            timestamp: message.timestamp ? Number(message.timestamp) : Date.now(),
          };
          io.emit('phone-transcript', transcriptPayload);
          console.log(
            `[Vapi Webhook] Emitted STT turn -> extracted role: "${rawRole}" | emitted role: "${role}" | text: "${cleanText}"`
          );
        }

        return res.status(200).json({
          success: true,
          message: 'Single transcript processed',
          data: cleanText,
        });
      }
    }

    // Acknowledge other lifecycle events without broadcasting full cumulative transcripts
    return res.status(200).json({
      success: true,
      message: `Event '${eventType}' received and acknowledged`,
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
