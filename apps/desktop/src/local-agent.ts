export type LocalAgentStatus = {
  healthy: boolean;
  status: string;
  version?: string;
  error?: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export class LocalAgentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: FetchLike = fetch as never,
  ) {}

  async getStatus(): Promise<LocalAgentStatus> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/health`);
      if (!response.ok) {
        return {
          healthy: false,
          status: 'down',
          error: `healthcheck failed`,
        };
      }

      const body = (await response.json()) as { status?: string; version?: string };
      return {
        healthy: true,
        status: body.status ?? 'ok',
        version: body.version,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'down',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendCommand(command: string): Promise<{ accepted: boolean; id: string }> {
    const response = await this.fetcher(`${this.baseUrl}/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command }),
    });

    if (!response.ok) {
      throw new Error('command rejected by local agent');
    }

    return (await response.json()) as { accepted: boolean; id: string };
  }
}
