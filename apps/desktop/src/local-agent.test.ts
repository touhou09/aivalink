import { describe, expect, it, vi } from 'vitest';

import { LocalAgentClient } from './local-agent';

describe('LocalAgentClient', () => {
  it('reports healthy when /health endpoint is ok', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
    });

    const client = new LocalAgentClient('http://127.0.0.1:4315', fetcher as never);
    const status = await client.getStatus();

    expect(status).toEqual({ healthy: true, status: 'ok', version: '0.1.0' });
  });

  it('returns unhealthy when health check fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new LocalAgentClient('http://127.0.0.1:4315', fetcher as never);
    const status = await client.getStatus();

    expect(status.healthy).toBe(false);
    expect(status.error).toContain('ECONNREFUSED');
  });

  it('sends command payload to local agent', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ accepted: true, id: 'cmd-1' }),
    });

    const client = new LocalAgentClient('http://127.0.0.1:4315', fetcher as never);
    const result = await client.sendCommand('wake_up');

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:4315/commands', {
      body: JSON.stringify({ command: 'wake_up' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(result).toEqual({ accepted: true, id: 'cmd-1' });
  });
});
