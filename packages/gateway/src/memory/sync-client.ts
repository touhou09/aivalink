/**
 * MemorySyncClient
 *
 * Queues high-importance memories and periodically syncs them to the
 * platform service for long-term RAG storage.
 */

export interface MemorySyncOptions {
  platformUrl: string;
  syncIntervalMs?: number;
}

interface PendingMemory {
  id: string;
  content: string;
  type: string;
  importance: number;
  userId: string;
  characterId: string;
}

export class MemorySyncClient {
  private pendingSync: PendingMemory[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly syncIntervalMs: number;

  constructor(private options: MemorySyncOptions) {
    this.syncIntervalMs = options.syncIntervalMs ?? 60_000;
  }

  enqueue(memory: PendingMemory): void {
    if (memory.importance >= 6) {
      this.pendingSync.push(memory);
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.syncIntervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.pendingSync.length === 0) return;
    const batch = this.pendingSync.splice(0, this.pendingSync.length);
    await this.syncBatch(batch);
  }

  private async syncBatch(batch: PendingMemory[]): Promise<void> {
    try {
      const res = await fetch(`${this.options.platformUrl}/api/v1/memories/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memories: batch.map((m) => ({
            id: m.id,
            content: m.content,
            type: m.type,
            importance: m.importance,
            user_id: m.userId,
            character_id: m.characterId,
          })),
        }),
      });
      if (!res.ok) {
        console.error(`[MemorySyncClient] sync failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error("[MemorySyncClient] sync error:", err);
    }
  }
}
