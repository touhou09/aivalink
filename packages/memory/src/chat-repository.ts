import type { Pool } from "pg";

export interface Character {
  id: string;
  userId: string;
  name: string;
  personaPrompt: string;
  live2dModel: string | null;
  ttsEngine: string;
  ttsConfig: string;
  emotionMap: string;
  heartbeat: string;
  agentConfig: string;
  isActive: boolean;
}

export interface Session {
  id: string;
  userId: string;
  characterId: string;
  deviceId: string | null;
  endedAt: string | null;
  isActive: boolean;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  sessionId: string;
  userId: string;
  characterId: string;
  role: MessageRole;
  content: string;
  emotion: string | null;
  modelUsed: string | null;
}

function toCharacter(row: Record<string, unknown>): Character {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    personaPrompt: row.persona_prompt as string,
    live2dModel: row.live2d_model as string | null,
    ttsEngine: row.tts_engine as string,
    ttsConfig: row.tts_config as string,
    emotionMap: row.emotion_map as string,
    heartbeat: row.heartbeat as string,
    agentConfig: row.agent_config as string,
    isActive: Boolean(row.is_active),
  };
}

function toSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    characterId: row.character_id as string,
    deviceId: row.device_id as string | null,
    endedAt: row.ended_at as string | null,
    isActive: Boolean(row.is_active),
  };
}

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    userId: row.user_id as string,
    characterId: row.character_id as string,
    role: row.role as MessageRole,
    content: row.content as string,
    emotion: row.emotion as string | null,
    modelUsed: row.model_used as string | null,
  };
}

export class CharacterRepository {
  constructor(private db: Pool) {}

  async create(input: Character): Promise<void> {
    await this.db.query(
      `INSERT INTO characters
        (id, user_id, name, persona_prompt, live2d_model, tts_engine, tts_config, emotion_map, heartbeat, agent_config, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.id,
        input.userId,
        input.name,
        input.personaPrompt,
        input.live2dModel,
        input.ttsEngine,
        input.ttsConfig,
        input.emotionMap,
        input.heartbeat,
        input.agentConfig,
        input.isActive,
      ],
    );
  }

  async findById(id: string): Promise<Character | undefined> {
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM characters WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? toCharacter(row) : undefined;
  }

  async update(id: string, patch: Partial<Omit<Character, "id" | "userId">>): Promise<Character | undefined> {
    const current = await this.findById(id);
    if (!current) return undefined;
    const next: Character = { ...current, ...patch, id, userId: current.userId };
    await this.db.query(
      `UPDATE characters
       SET name = $1, persona_prompt = $2, live2d_model = $3, tts_engine = $4, tts_config = $5, emotion_map = $6, heartbeat = $7, agent_config = $8, is_active = $9
       WHERE id = $10`,
      [
        next.name,
        next.personaPrompt,
        next.live2dModel,
        next.ttsEngine,
        next.ttsConfig,
        next.emotionMap,
        next.heartbeat,
        next.agentConfig,
        next.isActive,
        id,
      ],
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM characters WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class SessionRepository {
  constructor(private db: Pool) {}

  async create(input: Session): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions
        (id, user_id, character_id, device_id, ended_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.id, input.userId, input.characterId, input.deviceId, input.endedAt, input.isActive],
    );
  }

  async findById(id: string): Promise<Session | undefined> {
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM sessions WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? toSession(row) : undefined;
  }

  async update(id: string, patch: Partial<Omit<Session, "id" | "userId" | "characterId">>): Promise<Session | undefined> {
    const current = await this.findById(id);
    if (!current) return undefined;
    const next: Session = {
      ...current,
      ...patch,
      id,
      userId: current.userId,
      characterId: current.characterId,
    };
    await this.db.query(
      "UPDATE sessions SET device_id = $1, ended_at = $2, is_active = $3 WHERE id = $4",
      [next.deviceId, next.endedAt, next.isActive, id],
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM sessions WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class MessageRepository {
  constructor(private db: Pool) {}

  async create(input: Message): Promise<void> {
    await this.db.query(
      `INSERT INTO messages
        (id, session_id, user_id, character_id, role, content, emotion, model_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.sessionId,
        input.userId,
        input.characterId,
        input.role,
        input.content,
        input.emotion,
        input.modelUsed,
      ],
    );
  }

  async findById(id: string): Promise<Message | undefined> {
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM messages WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? toMessage(row) : undefined;
  }

  async listBySession(sessionId: string): Promise<Message[]> {
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId],
    );
    return result.rows.map(toMessage);
  }

  async update(id: string, patch: Partial<Omit<Message, "id" | "sessionId" | "userId" | "characterId" | "role">>): Promise<Message | undefined> {
    const current = await this.findById(id);
    if (!current) return undefined;
    const next: Message = {
      ...current,
      ...patch,
      id,
      sessionId: current.sessionId,
      userId: current.userId,
      characterId: current.characterId,
      role: current.role,
    };
    await this.db.query(
      "UPDATE messages SET content = $1, emotion = $2, model_used = $3 WHERE id = $4",
      [next.content, next.emotion, next.modelUsed, id],
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM messages WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
