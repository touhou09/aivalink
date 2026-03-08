/**
 * REST API Load Test
 *
 * Target: 200 rps sustained, p95 < 200ms
 * Covers: auth endpoints, agent CRUD, persona list
 * Base: http://localhost:8000/api/v1/
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import {
  BASE_URL_PLATFORM,
  restApiThresholds,
  jsonHeaders,
  authHeaders,
  TEST_USER,
} from '../k6-config.js';

const API = `${BASE_URL_PLATFORM}/api/v1`;

export const options = {
  scenarios: {
    rest_api: {
      executor: 'constant-arrival-rate',
      rate: 200,           // 200 iterations per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: restApiThresholds,
};

// Shared token store — populated in setup(), read by VUs
let sharedToken = '';

export function setup() {
  // Authenticate once and share the token across all VUs
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    { headers: jsonHeaders }
  );

  const ok = check(res, {
    'setup: login 200': (r) => r.status === 200,
    'setup: token present': (r) => {
      try {
        return !!JSON.parse(r.body).access_token;
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok) {
    console.error(`Login failed during setup: ${res.status} ${res.body}`);
    return { token: '' };
  }

  return { token: JSON.parse(res.body).access_token };
}

export default function (data) {
  const token = data.token;
  const headers = authHeaders(token);

  // --- Auth: token refresh / profile ---
  const profileRes = http.get(`${API}/auth/me`, { headers });
  check(profileRes, {
    'GET /auth/me 200': (r) => r.status === 200,
  });

  // --- Agent CRUD ---
  // List agents
  const listRes = http.get(`${API}/agents`, { headers });
  check(listRes, {
    'GET /agents 200': (r) => r.status === 200,
  });

  // Create agent
  const newAgent = {
    name: `LoadTest Agent ${__VU}-${__ITER}`,
    description: 'k6 load test agent',
    persona_id: null,
  };
  const createRes = http.post(`${API}/agents`, JSON.stringify(newAgent), { headers });
  const agentCreated = check(createRes, {
    'POST /agents 201': (r) => r.status === 201,
  });

  let agentId = null;
  if (agentCreated) {
    try {
      agentId = JSON.parse(createRes.body).id;
    } catch (_) {}
  }

  // Get agent by ID
  if (agentId) {
    const getRes = http.get(`${API}/agents/${agentId}`, { headers });
    check(getRes, {
      'GET /agents/:id 200': (r) => r.status === 200,
    });

    // Update agent
    const updateRes = http.put(
      `${API}/agents/${agentId}`,
      JSON.stringify({ name: `Updated ${__VU}-${__ITER}` }),
      { headers }
    );
    check(updateRes, {
      'PUT /agents/:id 200': (r) => r.status === 200,
    });

    // Delete agent
    const deleteRes = http.del(`${API}/agents/${agentId}`, null, { headers });
    check(deleteRes, {
      'DELETE /agents/:id 204': (r) => r.status === 204,
    });
  }

  // --- Persona list ---
  const personaRes = http.get(`${API}/personas`, { headers });
  check(personaRes, {
    'GET /personas 200': (r) => r.status === 200,
  });

  sleep(0.1);
}
