/**
 * WebSocket Chat Load Test
 *
 * Target: 100 concurrent users, p95 connection/response < 500ms
 * Endpoint: ws://localhost:3001/ws/chat
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { WS_URL, wsThresholds } from '../k6-config.js';

const msgReceived = new Counter('ws_msgs_received_custom');
const msgRtt = new Trend('ws_msg_rtt_ms');

export const options = {
  scenarios: {
    ws_chat: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
    },
  },
  thresholds: {
    ...wsThresholds,
    ws_msg_rtt_ms: ['p(95)<500'],
    ws_connecting: ['p(95)<500'],
  },
};

export default function () {
  const agentId = `agent-${Math.floor(Math.random() * 10) + 1}`;
  const url = `${WS_URL}?agentId=${agentId}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Send initial handshake / session start message
      const startMsg = JSON.stringify({
        type: 'session.start',
        agentId,
        sessionId: `sess-${__VU}-${__ITER}`,
      });
      socket.send(startMsg);
    });

    socket.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (_) {
        return;
      }

      msgReceived.add(1);

      if (msg.type === 'session.ready' || msg.type === 'message.response') {
        const sentAt = msg._sentAt || 0;
        if (sentAt) {
          msgRtt.add(Date.now() - sentAt);
        }
      }
    });

    socket.on('error', (e) => {
      console.error(`WS error [VU ${__VU}]: ${e.error()}`);
    });

    // Simulate a conversation: send 5 messages with think time between them
    socket.setTimeout(() => {
      for (let i = 0; i < 5; i++) {
        socket.setTimeout(() => {
          const chatMsg = JSON.stringify({
            type: 'message.send',
            agentId,
            content: `Hello from VU ${__VU}, message ${i + 1}`,
            _sentAt: Date.now(),
          });
          socket.send(chatMsg);
        }, i * 3000); // one message every 3 seconds
      }
    }, 500);

    // Keep socket open for the conversation window then close
    socket.setTimeout(() => {
      socket.close();
    }, 20000);
  });

  check(res, {
    'WebSocket connected (101)': (r) => r && r.status === 101,
  });

  sleep(1);
}
