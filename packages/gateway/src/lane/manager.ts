/**
 * Lane Manager
 * Session-level queue isolation
 * maxConcurrentPerSession: 1 (character is a single entity)
 * Multi-device: same userId → shared Lane
 */

import type { TaskEnvelope } from "@aivalink/shared";

export interface LaneTask {
  envelope: TaskEnvelope;
  requestId: string;
  startedAtMs?: number;
  costUnits?: number;
}

export class LaneManager {
  private lanes = new Map<string, LaneTask[]>();
  private processing = new Set<string>();

  enqueue(
    laneId: string,
    envelope: TaskEnvelope,
    requestId: string,
    meta?: { startedAtMs?: number; costUnits?: number },
  ): void {
    if (!this.lanes.has(laneId)) {
      this.lanes.set(laneId, []);
    }
    this.lanes.get(laneId)!.push({
      envelope,
      requestId,
      startedAtMs: meta?.startedAtMs,
      costUnits: meta?.costUnits,
    });
  }

  dequeue(laneId: string): LaneTask | undefined {
    if (this.processing.has(laneId)) return undefined; // max 1 concurrent
    const queue = this.lanes.get(laneId);
    if (!queue || queue.length === 0) return undefined;
    this.processing.add(laneId);
    return queue.shift();
  }

  complete(laneId: string): void {
    this.processing.delete(laneId);
    const queue = this.lanes.get(laneId);
    if (!queue || queue.length === 0) {
      this.lanes.delete(laneId);
    }
  }

  clearQueue(laneId: string): void {
    if (this.processing.has(laneId)) {
      this.lanes.set(laneId, []);
      return;
    }
    this.lanes.delete(laneId);
  }

  isProcessing(laneId: string): boolean {
    return this.processing.has(laneId);
  }
}

/**
 * Build a deterministic lane ID from userId + characterId.
 * Single source of truth for the key format used by LaneManager.
 */
export function buildLaneId(userId: string, characterId: string): string {
  if (!userId || !characterId) {
    throw new Error("buildLaneId requires non-empty userId and characterId");
  }
  return `${userId}:${characterId}`;
}
