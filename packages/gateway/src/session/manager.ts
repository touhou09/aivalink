/**
 * Session Manager
 * Maps sessionId → { userId, characterId, wsConnection, lane }
 */

export interface GatewaySocket {
  readyState: number;
  send(data: string): void;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  characterId: string;
  deviceId?: string;
  laneId: string;
  socket: GatewaySocket;
  connectedAt: Date;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();

  create(state: SessionState): void {
    this.sessions.set(state.sessionId, state);
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getByUserId(userId: string): SessionState[] {
    return Array.from(this.sessions.values()).filter((s) => s.userId === userId);
  }

  getByLaneId(laneId: string): SessionState[] {
    return Array.from(this.sessions.values()).filter((s) => s.laneId === laneId);
  }

  remove(sessionId: string): SessionState | undefined {
    const removed = this.sessions.get(sessionId);
    if (!removed) return undefined;
    this.sessions.delete(sessionId);
    return removed;
  }

  get count(): number {
    return this.sessions.size;
  }
}
