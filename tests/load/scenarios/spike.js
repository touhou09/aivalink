/**
 * Spike Test
 *
 * Ramps from 0 to 500 concurrent users in 30s, holds for 1m, then ramps down.
 * Tests both the gateway (WS) and platform (REST) under sudden load surge.
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import {
  BASE_URL_PLATFORM,
  BASE_URL_GATEWAY,
  WS_URL,
  jsonHeaders,
  authHeaders,
  TEST_USER,
} from '../k6-config.js';

const API = `${BASE_URL_PLATFORM}/api/v1`;

export const options = {
  scenarios: {
    spike_rest: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 },  // spike up in 30s
        { duration: '1m',  target: 500 },  // hold at peak
        { duration: '30s', target: 0 },    // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],       // tolerate up to 5% errors during spike
    http_req_duration: ['p(95)<2000'],      // p95 < 2s during spike
  },
};

export function setup() {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    { headers: jsonHeaders }
  );

  check(res, { 'setup: login ok': (r) => r.status === 200 });

  let token = '';
  try {
    token = JSON.parse(res.body).access_token || '';
  } catch (_) {}

  return { token };
}

export default function (data) {
  const token = data.token;
  const headers = authHeaders(token);

  // Mix of REST calls to simulate realistic spike traffic
  const pick = __ITER % 4;

  if (pick === 0) {
    // Auth check
    const r = http.get(`${API}/auth/me`, { headers });
    check(r, { 'spike /auth/me': (r) => r.status === 200 });
  } else if (pick === 1) {
    // Agent list
    const r = http.get(`${API}/agents`, { headers });
    check(r, { 'spike /agents': (r) => r.status === 200 });
  } else if (pick === 2) {
    // Persona list
    const r = http.get(`${API}/personas`, { headers });
    check(r, { 'spike /personas': (r) => r.status === 200 });
  } else {
    // WebSocket connect and immediately close (connection pressure)
    const res = ws.connect(
      `${WS_URL}?agentId=spike-${__VU}`,
      {},
      function (socket) {
        socket.on('open', () => {
          socket.send(
            JSON.stringify({
              type: 'session.start',
              agentId: `spike-${__VU}`,
              sessionId: `spike-sess-${__VU}-${__ITER}`,
            })
          );
          socket.setTimeout(() => socket.close(), 3000);
        });
        socket.on('error', (e) => {
          // Tolerate errors during spike — log but don't fail
          console.warn(`WS spike error [VU ${__VU}]: ${e.error()}`);
        });
      }
    );
    check(res, { 'spike WS connected': (r) => r && r.status === 101 });
  }

  sleep(0.5);
}
