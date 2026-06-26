import { describe, expect, it } from "vitest";
import {
  assertCompatibleEmbeddingIndex,
  readEmbeddingConfig,
  selectRelevantKnowledge,
  type KnowledgeIndex,
} from "./rag";

function createKnowledgeIndex(overrides: Partial<KnowledgeIndex> = {}): KnowledgeIndex {
  return {
    model: "company-embedding-model",
    dimension: 3,
    chunks: [
      {
        id: "chunk-1",
        source: "manual",
        heading: "Service handover",
        content: "Confirm facts before making a promise.",
        vector: [0.1, 0.2, 0.3],
      },
    ],
    ...overrides,
  };
}

describe("hermit rag embedding compatibility", () => {
  it("reads embedding config from dedicated embedding env first", () => {
    expect(
      readEmbeddingConfig({
        OPENAI_API_KEY: "openai-key",
        EMBEDDING_API_KEY: "embedding-key",
        EMBEDDING_BASE_URL: "https://embedding.example/v1",
        EMBEDDING_MODEL: "company-embedding-model",
      }).apiKey,
    ).toBe("embedding-key");
  });

  it("rejects a runtime embedding model that differs from the vector index model", () => {
    expect(() =>
      assertCompatibleEmbeddingIndex(createKnowledgeIndex(), [0.1, 0.2, 0.3], "other-embedding-model"),
    ).toThrow(/Embedding model mismatch/);
  });

  it("rejects runtime embedding dimensions that differ from the vector index", () => {
    expect(() =>
      assertCompatibleEmbeddingIndex(createKnowledgeIndex(), [0.1, 0.2], "company-embedding-model"),
    ).toThrow(/Embedding dimension mismatch/);
  });

  it("rejects malformed chunk vectors inside the index", () => {
    expect(() =>
      assertCompatibleEmbeddingIndex(
        createKnowledgeIndex({
          chunks: [
            {
              id: "chunk-bad",
              source: "manual",
              heading: "Bad vector",
              content: "Malformed vector.",
              vector: [0.1, 0.2],
            },
          ],
        }),
        [0.1, 0.2, 0.3],
        "company-embedding-model",
      ),
    ).toThrow(/chunk-bad/);
  });
});

describe("hermit rag retrieval convergence", () => {
  it("does not return nearest chunks for an unrelated out-of-domain query", () => {
    const result = selectRelevantKnowledge(
      createKnowledgeIndex({
        chunks: [
          {
            id: "heart#1",
            source: "heart-values",
            sourceType: "heart",
            evidenceTier: "analogous",
            heading: "Service values",
            content: "Respect facts and customer context.",
            vector: [0, 1, 0],
          },
        ],
      }),
      [1, 0, 0],
      "How do I bake sourdough bread?",
      { topK: 3, minScore: 0.55, strongScore: 0.75, outOfDomainScore: 0.8 },
    );

    expect(result.decision.status).toBe("out_of_domain");
    expect(result.chunks).toEqual([]);
  });

  it("marks in-domain questions as insufficient when similarity is below the minimum score", () => {
    const result = selectRelevantKnowledge(
      createKnowledgeIndex({
        chunks: [
          {
            id: "guide#1",
            source: "Workshop guide",
            sourceType: "workshop_guide",
            evidenceTier: "exact",
            heading: "Delivery delay",
            content: "Acknowledge waiting time before explaining.",
            vector: [0.2, 0.8, 0],
          },
        ],
      }),
      [1, 0, 0],
      "客户交车等待超时，服务顾问怎么安抚？",
      { topK: 3, minScore: 0.55, strongScore: 0.75, outOfDomainScore: 0.8 },
    );

    expect(result.decision.status).toBe("insufficient");
    expect(result.decision.domainMatched).toBe(true);
    expect(result.chunks).toEqual([]);
  });

  it("returns strong published practice evidence above threshold", () => {
    const result = selectRelevantKnowledge(
      createKnowledgeIndex({
        chunks: [
          {
            id: "guide#1",
            source: "Workshop guide",
            sourceType: "workshop_guide",
            evidenceTier: "exact",
            heading: "Delivery delay",
            content: "Acknowledge waiting time before explaining.",
            vector: [0.98, 0.02, 0],
          },
        ],
      }),
      [1, 0, 0],
      "客户交车等待超时，服务顾问怎么安抚？",
      { topK: 3, minScore: 0.55, strongScore: 0.75, outOfDomainScore: 0.8 },
    );

    expect(result.decision.status).toBe("accepted");
    expect(result.decision.evidenceTier).toBe("exact");
    expect(result.chunks).toEqual([
      expect.objectContaining({
        chunk: expect.objectContaining({ id: "guide#1" }),
        evidenceTier: "exact",
      }),
    ]);
  });
});
