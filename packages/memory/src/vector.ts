import type { Pool } from "pg";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
  document?: string;
}

export interface VectorStore {
  ensureCollection(): Promise<void>;
  deleteCollection(): Promise<void>;
  upsert(params: {
    id: string;
    embedding: number[];
    document: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  upsertBatch(params: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Array<Record<string, unknown>>;
  }): Promise<void>;
  remove(id: string): Promise<void>;
  query(params: {
    embedding: number[];
    topK: number;
    where?: Record<string, unknown>;
  }): Promise<VectorSearchResult[]>;
}

interface ChromaCollection {
  id: string;
  name: string;
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vector/Embedding request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export class ChromaVectorStore implements VectorStore {
  private collectionId?: string;

  constructor(
    private readonly config: { baseUrl: string; collectionName: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async ensureCollection(): Promise<void> {
    if (this.collectionId) return;

    const listRes = await this.fetchImpl(`${this.config.baseUrl}/api/v1/collections`, {
      method: "GET",
    });
    const collections = await readJson<ChromaCollection[]>(listRes);
    const found = collections.find((c) => c.name === this.config.collectionName);

    if (found) {
      this.collectionId = found.id;
      return;
    }

    const createRes = await this.fetchImpl(`${this.config.baseUrl}/api/v1/collections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: this.config.collectionName }),
    });
    const created = await readJson<ChromaCollection>(createRes);
    this.collectionId = created.id;
  }

  async deleteCollection(): Promise<void> {
    await this.ensureCollection();
    const res = await this.fetchImpl(`${this.config.baseUrl}/api/v1/collections/${this.collectionId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete collection: ${res.status}`);
    this.collectionId = undefined;
  }

  async upsert(params: {
    id: string;
    embedding: number[];
    document: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    return this.upsertBatch({
      ids: [params.id],
      embeddings: [params.embedding],
      documents: [params.document],
      metadatas: [params.metadata],
    });
  }

  async upsertBatch(params: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Array<Record<string, unknown>>;
  }): Promise<void> {
    await this.ensureCollection();
    const res = await this.fetchImpl(`${this.config.baseUrl}/api/v1/collections/${this.collectionId}/upsert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to upsert vectors: ${res.status}`);
  }

  async remove(id: string): Promise<void> {
    await this.ensureCollection();
    const res = await this.fetchImpl(`${this.config.baseUrl}/api/v1/collections/${this.collectionId}/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) throw new Error(`Failed to delete vector: ${res.status}`);
  }

  async query(params: {
    embedding: number[];
    topK: number;
    where?: Record<string, unknown>;
  }): Promise<VectorSearchResult[]> {
    await this.ensureCollection();
    const res = await this.fetchImpl(`${this.config.baseUrl}/api/v1/collections/${this.collectionId}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query_embeddings: [params.embedding],
        n_results: params.topK,
        where: params.where,
      }),
    });
    const payload = await readJson<{
      ids: string[][];
      distances?: number[][];
      metadatas?: Array<Array<Record<string, unknown>>>;
      documents?: string[][];
    }>(res);

    const ids = payload.ids?.[0] ?? [];
    const distances = payload.distances?.[0] ?? [];
    const metadatas = payload.metadatas?.[0] ?? [];
    const documents = payload.documents?.[0] ?? [];

    return ids.map((id, idx) => {
      const distance = distances[idx] ?? 1;
      return {
        id,
        score: 1 / (1 + Math.max(0, distance)),
        metadata: metadatas[idx],
        document: documents[idx],
      };
    });
  }
}

export class PgVectorStore implements VectorStore {
  private pool: Pool;
  private tableName: string;
  private dimensions: number;

  constructor(config: {
    pool: Pool;
    tableName?: string;
    dimensions?: number;
  }) {
    this.pool = config.pool;
    this.tableName = config.tableName ?? "memory_embeddings";
    this.dimensions = config.dimensions ?? 1536;
  }

  async ensureCollection(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        embedding vector(${this.dimensions}),
        document TEXT,
        metadata JSONB DEFAULT '{}'
      )
    `);
    // Create HNSW index for fast similarity search
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_embedding_hnsw
      ON ${this.tableName} USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  }

  async deleteCollection(): Promise<void> {
    await this.pool.query(`DROP TABLE IF EXISTS ${this.tableName}`);
  }

  async upsert(params: {
    id: string;
    embedding: number[];
    document: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const embeddingStr = `[${params.embedding.join(",")}]`;
    await this.pool.query(
      `INSERT INTO ${this.tableName} (id, embedding, document, metadata)
       VALUES ($1, $2::vector, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         embedding = EXCLUDED.embedding,
         document = EXCLUDED.document,
         metadata = EXCLUDED.metadata`,
      [params.id, embeddingStr, params.document, JSON.stringify(params.metadata)],
    );
  }

  async upsertBatch(params: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Array<Record<string, unknown>>;
  }): Promise<void> {
    // Use a transaction for batch upserts
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < params.ids.length; i++) {
        const embeddingStr = `[${params.embeddings[i]!.join(",")}]`;
        await client.query(
          `INSERT INTO ${this.tableName} (id, embedding, document, metadata)
           VALUES ($1, $2::vector, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             embedding = EXCLUDED.embedding,
             document = EXCLUDED.document,
             metadata = EXCLUDED.metadata`,
          [params.ids[i], embeddingStr, params.documents[i], JSON.stringify(params.metadatas[i])],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async remove(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
  }

  async query(params: {
    embedding: number[];
    topK: number;
    where?: Record<string, unknown>;
  }): Promise<VectorSearchResult[]> {
    const embeddingStr = `[${params.embedding.join(",")}]`;
    let sql = `
      SELECT id, document, metadata,
             1 - (embedding <=> $1::vector) AS score
      FROM ${this.tableName}
    `;
    const queryParams: unknown[] = [embeddingStr];

    // Build WHERE clause from metadata filters
    const conditions: string[] = [];
    if (params.where) {
      for (const [key, value] of Object.entries(params.where)) {
        queryParams.push(JSON.stringify(value));
        conditions.push(`metadata->>'${key}' = $${queryParams.length}::text`);
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    queryParams.push(params.topK);
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${queryParams.length}`;

    const result = await this.pool.query(sql, queryParams);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      score: row.score as number,
      metadata: row.metadata as Record<string, unknown>,
      document: row.document as string,
    }));
  }
}

export class HttpEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly config: { baseUrl: string; model?: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async embed(text: string): Promise<number[]> {
    const res = await this.fetchImpl(`${this.config.baseUrl}/embedding/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, model: this.config.model }),
    });
    const data = await readJson<{ embedding: number[] }>(res);
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await this.fetchImpl(`${this.config.baseUrl}/embedding/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts, model: this.config.model }),
    });
    const data = await readJson<{ embeddings: number[][] }>(res);
    return data.embeddings;
  }
}
