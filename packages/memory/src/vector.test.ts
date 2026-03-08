import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChromaVectorStore, HttpEmbeddingProvider } from "./vector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// ChromaVectorStore
// ---------------------------------------------------------------------------

describe("ChromaVectorStore", () => {
  const BASE = "http://localhost:8000";
  const COLLECTION = "test_memories";
  let fetchMock: ReturnType<typeof vi.fn>;
  let store: ChromaVectorStore;

  beforeEach(() => {
    fetchMock = vi.fn();
    store = new ChromaVectorStore(
      { baseUrl: BASE, collectionName: COLLECTION },
      fetchMock as unknown as typeof fetch,
    );
  });

  // -- ensureCollection --------------------------------------------------

  describe("ensureCollection", () => {
    it("creates a new collection when none exists", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse([])) // GET collections → empty
        .mockResolvedValueOnce(
          jsonResponse({ id: "col-1", name: COLLECTION }),
        ); // POST create

      await store.ensureCollection();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        `${BASE}/api/v1/collections`,
        { method: "GET" },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        `${BASE}/api/v1/collections`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: COLLECTION }),
        }),
      );
    });

    it("reuses an existing collection", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: "col-1", name: COLLECTION }]),
      );

      await store.ensureCollection();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("is idempotent after first call", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: "col-1", name: COLLECTION }]),
      );

      await store.ensureCollection();
      await store.ensureCollection();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // -- deleteCollection --------------------------------------------------

  describe("deleteCollection", () => {
    it("deletes the collection by id", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse([{ id: "col-1", name: COLLECTION }]),
        ) // ensureCollection
        .mockResolvedValueOnce(jsonResponse(null)); // DELETE

      await store.deleteCollection();

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        `${BASE}/api/v1/collections/col-1`,
        { method: "DELETE" },
      );
    });

    it("throws on HTTP error", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse([{ id: "col-1", name: COLLECTION }]),
        )
        .mockResolvedValueOnce(jsonResponse(null, 500));

      await expect(store.deleteCollection()).rejects.toThrow(
        "Failed to delete collection",
      );
    });
  });

  // -- upsert / upsertBatch ----------------------------------------------

  describe("upsert", () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: "col-1", name: COLLECTION }]),
      );
      await store.ensureCollection();
      fetchMock.mockClear();
    });

    it("upserts a single vector via upsertBatch", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null));

      await store.upsert({
        id: "mem-1",
        embedding: [0.1, 0.2],
        document: "likes jazz",
        metadata: { userId: "u1" },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/v1/collections/col-1/upsert`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            ids: ["mem-1"],
            embeddings: [[0.1, 0.2]],
            documents: ["likes jazz"],
            metadatas: [{ userId: "u1" }],
          }),
        }),
      );
    });
  });

  describe("upsertBatch", () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: "col-1", name: COLLECTION }]),
      );
      await store.ensureCollection();
      fetchMock.mockClear();
    });

    it("sends batch upsert request", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null));

      await store.upsertBatch({
        ids: ["m1", "m2"],
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        documents: ["doc1", "doc2"],
        metadatas: [{ type: "a" }, { type: "b" }],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.ids).toEqual(["m1", "m2"]);
      expect(body.embeddings).toHaveLength(2);
    });

    it("throws on HTTP error", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null, 500));

      await expect(
        store.upsertBatch({
          ids: ["m1"],
          embeddings: [[0.1]],
          documents: ["doc"],
          metadatas: [{}],
        }),
      ).rejects.toThrow("Failed to upsert vectors");
    });
  });

  // -- remove -------------------------------------------------------------

  describe("remove", () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: "col-1", name: COLLECTION }]),
      );
      await store.ensureCollection();
      fetchMock.mockClear();
    });

    it("sends delete request with the memory id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null));

      await store.remove("mem-1");

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/v1/collections/col-1/delete`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ids: ["mem-1"] }),
        }),
      );
    });

    it("throws on HTTP error", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null, 404));

      await expect(store.remove("mem-1")).rejects.toThrow(
        "Failed to delete vector",
      );
    });
  });

  // -- query --------------------------------------------------------------

  describe("query", () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: "col-1", name: COLLECTION }]),
      );
      await store.ensureCollection();
      fetchMock.mockClear();
    });

    it("returns results with similarity scores", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          ids: [["m1", "m2"]],
          distances: [[0.2, 0.8]],
          documents: [["fact one", "fact two"]],
          metadatas: [[{ importance: 9 }, { importance: 5 }]],
        }),
      );

      const results = await store.query({
        embedding: [0.1, 0.2],
        topK: 5,
      });

      expect(results).toHaveLength(2);
      // score = 1 / (1 + distance)
      expect(results[0].id).toBe("m1");
      expect(results[0].score).toBeCloseTo(1 / (1 + 0.2), 4);
      expect(results[0].document).toBe("fact one");
      expect(results[1].id).toBe("m2");
      expect(results[1].score).toBeCloseTo(1 / (1 + 0.8), 4);
    });

    it("sends where filter when provided", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ ids: [[]], distances: [[]], documents: [[]], metadatas: [[]] }),
      );

      await store.query({
        embedding: [0.1],
        topK: 3,
        where: { userId: "u1", characterId: "c1" },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.where).toEqual({ userId: "u1", characterId: "c1" });
      expect(body.n_results).toBe(3);
    });

    it("handles empty results", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ ids: [[]], distances: [[]], documents: [[]], metadatas: [[]] }),
      );

      const results = await store.query({ embedding: [0.1], topK: 5 });
      expect(results).toEqual([]);
    });

    it("handles missing optional fields gracefully", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ ids: [["m1"]] }),
      );

      const results = await store.query({ embedding: [0.1], topK: 5 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("m1");
      expect(results[0].score).toBeCloseTo(1 / (1 + 1), 4); // distance defaults to 1
    });
  });
});

// ---------------------------------------------------------------------------
// HttpEmbeddingProvider
// ---------------------------------------------------------------------------

describe("HttpEmbeddingProvider", () => {
  const BASE = "http://localhost:9000";
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: HttpEmbeddingProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    provider = new HttpEmbeddingProvider(
      { baseUrl: BASE, model: "text-embedding-3-small" },
      fetchMock as unknown as typeof fetch,
    );
  });

  describe("embed", () => {
    it("sends text and model to the embedding endpoint", async () => {
      const embedding = [0.1, 0.2, 0.3];
      fetchMock.mockResolvedValueOnce(jsonResponse({ embedding }));

      const result = await provider.embed("hello world");

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/embedding/generate`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            text: "hello world",
            model: "text-embedding-3-small",
          }),
        }),
      );
      expect(result).toEqual(embedding);
    });

    it("throws on HTTP error", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse("error", 500));

      await expect(provider.embed("test")).rejects.toThrow(
        "Vector/Embedding request failed (500)",
      );
    });
  });

  describe("embedBatch", () => {
    it("sends texts to the batch endpoint", async () => {
      const embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
      ];
      fetchMock.mockResolvedValueOnce(jsonResponse({ embeddings }));

      const result = await provider.embedBatch(["hello", "world"]);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/embedding/batch`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            texts: ["hello", "world"],
            model: "text-embedding-3-small",
          }),
        }),
      );
      expect(result).toEqual(embeddings);
    });

    it("throws on HTTP error", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse("error", 429));

      await expect(provider.embedBatch(["a", "b"])).rejects.toThrow(
        "Vector/Embedding request failed (429)",
      );
    });
  });

  describe("without explicit model", () => {
    it("sends model as undefined", async () => {
      const noModelProvider = new HttpEmbeddingProvider(
        { baseUrl: BASE },
        fetchMock as unknown as typeof fetch,
      );
      fetchMock.mockResolvedValueOnce(jsonResponse({ embedding: [0.1] }));

      await noModelProvider.embed("test");

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBeUndefined();
    });
  });
});
