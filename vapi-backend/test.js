import http from 'http';
import { io } from 'socket.io-client';
import './server.js'; // Starts server on PORT in .env (5000)

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

// Helper delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('\n--- 1. Testing GET /health ---');
  await sleep(1000); // Wait for server to bind

  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthText = await healthRes.text();
  console.log(`GET /health status: ${healthRes.status}, body: "${healthText}"`);

  if (healthRes.status === 200 && healthText === 'OK') {
    console.log('✅ GET /health test passed!');
  } else {
    console.error('❌ GET /health test failed!');
    process.exit(1);
  }

  console.log('\n--- 2. Testing Socket.io Connection & Event ---');
  const socket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('✅ Socket.io client connected with ID:', socket.id);
      resolve();
    });
    socket.on('connect_error', reject);
  });

  const transcriptPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for phone-transcript event')), 5000);

    socket.on('phone-transcript', (data) => {
      clearTimeout(timeout);
      console.log('✅ Received phone-transcript event:', data);
      resolve(data);
    });
  });

  console.log('\n--- 3. Testing POST /api/vapi-webhook with transcript ---');
  const webhookRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'transcript',
        role: 'user',
        transcript: 'Hello, this is a live test transcript.',
      },
    }),
  });

  const webhookJson = await webhookRes.json();
  console.log('Webhook Response:', webhookJson);

  const receivedData = await transcriptPromise;
  if (
    receivedData.text === 'Hello, this is a live test transcript.' &&
    receivedData.role === 'user' &&
    typeof receivedData.timestamp === 'number'
  ) {
    console.log('✅ phone-transcript verification succeeded!');
  } else {
    console.error('❌ phone-transcript data mismatch:', receivedData);
    process.exit(1);
  }

  console.log('\n--- 4. Testing POST /api/vapi-webhook with conversation-update ---');
  const conversationPromise = new Promise((resolve, reject) => {
    const received = [];
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for conversation-update events')), 5000);

    socket.on('phone-transcript', (data) => {
      received.push(data);
      if (received.length === 2) {
        clearTimeout(timeout);
        resolve(received);
      }
    });
  });

  const convRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'conversation-update',
        call: { id: 'test_call_99' },
        messages: [
          { role: 'system', message: 'You are a test assistant' },
          { role: 'user', message: 'Mujhe madad chahiye' },
          { role: 'assistant', message: 'Ji boliye, main aapki kya madad kar sakti hoon?' },
        ],
      },
    }),
  });

  const convJson = await convRes.json();
  console.log('Conversation Webhook Response:', convJson);

  const convMessages = await conversationPromise;
  console.log('✅ Received conversation-update transcripts:', convMessages);

  if (
    convMessages.length === 2 &&
    convMessages[0].role === 'user' &&
    convMessages[0].text === 'Mujhe madad chahiye' &&
    convMessages[1].role === 'assistant'
  ) {
    console.log('✅ conversation-update verification succeeded!');
  } else {
    console.error('❌ conversation-update mismatch:', convMessages);
    process.exit(1);
  }

  socket.disconnect();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
