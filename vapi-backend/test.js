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
  const testRunId = Date.now();
  const webhookRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'transcript',
        role: 'user',
        call: { id: `test_stt_${testRunId}` },
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
        call: { id: `test_call_${testRunId}` },
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

  console.log('\n--- 5. Testing speech-update (MUST NOT emit phone-transcript) ---');
  let speechUpdateEmitted = false;
  const speechUpdateListener = () => {
    speechUpdateEmitted = true;
  };
  socket.on('phone-transcript', speechUpdateListener);

  const speechRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'speech-update',
        status: 'started',
        role: 'user',
        transcript: 'AI: Old text\nUser: Old text',
      },
    }),
  });
  const speechJson = await speechRes.json();
  console.log('Speech-update Response:', speechJson);

  await sleep(500);
  socket.off('phone-transcript', speechUpdateListener);

  if (speechUpdateEmitted) {
    console.error('❌ speech-update illegally emitted a transcript!');
    process.exit(1);
  } else {
    console.log('✅ speech-update correctly ignored cumulative transcript!');
  }

  console.log('\n--- 6. Testing multi-line transcript string fallback ---');
  const multiLinePromise = new Promise((resolve, reject) => {
    const lines = [];
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for multi-line parsed events')), 5000);

    socket.on('phone-transcript', (data) => {
      lines.push(data);
      if (lines.length === 2) {
        clearTimeout(timeout);
        resolve(lines);
      }
    });
  });

  const mlRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'status-update',
        call: { id: `test_call_ml_${testRunId}` },
        transcript: "AI: How can I help you?\nUser: I am in danger right now.",
      },
    }),
  });
  const mlJson = await mlRes.json();
  console.log('Multi-line fallback Response:', mlJson);

  const parsedLines = await multiLinePromise;
  console.log('✅ Received parsed multi-line turns:', parsedLines);

  if (
    parsedLines.length === 2 &&
    parsedLines[0].role === 'assistant' &&
    parsedLines[0].text === 'How can I help you?' &&
    parsedLines[1].role === 'user' &&
    parsedLines[1].text === 'I am in danger right now.'
  ) {
    console.log('✅ Multi-line transcript parsing succeeded!');
  } else {
    console.error('❌ Multi-line parsing failed:', parsedLines);
    process.exit(1);
  }

  console.log('\n--- 7. Testing Conversation Turns Role Attribution (Caller vs AI Emergency Messages) ---');
  const roleAttributionPromise = new Promise((resolve, reject) => {
    const turns = [];
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for conversation-update turns')), 5000);

    socket.on('phone-transcript', (data) => {
      turns.push(data);
      if (turns.length === 4) {
        clearTimeout(timeout);
        resolve(turns);
      }
    });
  });

  const emergencyConvRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'conversation-update',
        call: { id: 'test_call_emergency_101' },
        messages: [
          { role: 'user', message: "I'm in immediate danger. Someone is threatening me." },
          { role: 'assistant', message: "I hear you. Please call 911 right now if you're in the U.S. or Canada." },
          { role: 'user', message: "I'm really frightened." },
          { role: 'assistant', message: "And I'm right here with you." },
        ],
      },
    }),
  });

  const emergencyJson = await emergencyConvRes.json();
  console.log('Emergency Conversation Webhook Response:', emergencyJson);

  const emergencyTurns = await roleAttributionPromise;
  console.log('✅ Received emergency turns:', emergencyTurns);

  if (
    emergencyTurns.length === 4 &&
    emergencyTurns[0].role === 'user' &&
    emergencyTurns[0].text === "I'm in immediate danger. Someone is threatening me." &&
    emergencyTurns[1].role === 'assistant' &&
    emergencyTurns[1].text === "I hear you. Please call 911 right now if you're in the U.S. or Canada." &&
    emergencyTurns[2].role === 'user' &&
    emergencyTurns[2].text === "I'm really frightened." &&
    emergencyTurns[3].role === 'assistant' &&
    emergencyTurns[3].text === "And I'm right here with you."
  ) {
    console.log('✅ Emergency conversation turns role attribution succeeded perfectly!');
  } else {
    console.error('❌ Emergency turns role mismatch:', emergencyTurns);
    process.exit(1);
  }

  console.log('\n--- 8. Testing Call Termination Events (end-of-call-report & status-update ended) ---');
  const callEndedEvents = [];
  const callEndedListener = (data) => {
    console.log('✅ Received phone-call-ended event:', data);
    callEndedEvents.push(data);
  };
  socket.on('phone-call-ended', callEndedListener);

  const termCallId = `test_termination_call_${Date.now()}`;

  // Step 8a: Send end-of-call-report
  const endCallRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'end-of-call-report',
        call: { id: termCallId, status: 'ended' },
        endedReason: 'customer-ended-call',
        messages: [
          { role: 'user', message: 'Thank you, goodbye.' },
        ],
      },
    }),
  });
  const endCallJson = await endCallRes.json();
  console.log('End-of-call-report response:', endCallJson);

  // Wait a short moment to receive the event
  await sleep(400);

  if (callEndedEvents.length === 1 && callEndedEvents[0].callId === termCallId) {
    console.log('✅ phone-call-ended emitted successfully on end-of-call-report!');
  } else {
    console.error('❌ phone-call-ended was not emitted properly:', callEndedEvents);
    process.exit(1);
  }

  // Step 8b: Send subsequent status-update (status: ended) for the SAME callId
  // MUST NOT trigger duplicate phone-call-ended event
  const duplicateStatusRes = await fetch(`${BASE_URL}/api/vapi-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'status-update',
        status: 'ended',
        call: { id: termCallId, status: 'ended' },
        endedReason: 'customer-ended-call',
      },
    }),
  });
  const dupJson = await duplicateStatusRes.json();
  console.log('Duplicate status-update response:', dupJson);

  await sleep(400);

  if (callEndedEvents.length === 1) {
    console.log('✅ Duplicate protection verified: exactly 1 phone-call-ended emitted!');
  } else {
    console.error('❌ Duplicate phone-call-ended emitted! Count:', callEndedEvents.length);
    process.exit(1);
  }

  socket.off('phone-call-ended', callEndedListener);

  socket.disconnect();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
