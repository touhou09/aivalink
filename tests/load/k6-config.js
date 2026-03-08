// Shared k6 configuration for AivaLink load tests

export const BASE_URL_GATEWAY = 'http://localhost:3001';
export const BASE_URL_PLATFORM = 'http://localhost:8000';
export const WS_URL = 'ws://localhost:3001/ws/chat';

// Common thresholds applied across scenarios unless overridden
export const defaultThresholds = {
  http_req_failed: ['rate<0.01'],        // <1% error rate
  http_req_duration: ['p(95)<500'],      // p95 under 500ms (default)
};

// Thresholds for REST API scenario (tighter)
export const restApiThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<200'],      // p95 under 200ms
  http_reqs: ['rate>200'],               // sustain 200 rps
};

// Thresholds for WebSocket scenario
export const wsThresholds = {
  ws_connecting: ['p(95)<500'],
  ws_msgs_sent: ['count>0'],
  ws_msgs_received: ['count>0'],
};

// Common headers
export const jsonHeaders = {
  'Content-Type': 'application/json',
};

export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Test user credentials (adjust to match your test environment)
export const TEST_USER = {
  email: 'loadtest@aivalink.dev',
  password: 'LoadTest@123',
};
