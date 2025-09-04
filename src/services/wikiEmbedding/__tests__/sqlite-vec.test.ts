import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { describe, expect, it } from 'vitest';

/**
 * Tests for sqlite-vec integration
 */
describe('sqlite-vec Integration Tests', () => {
  describe('Basic sqlite-vec functionality', () => {
    it('should load sqlite-vec extension', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // Test that the extension loaded by checking vec_version
        const result = db.prepare('SELECT vec_version() as version').get() as { version: string };
        expect(result.version).toBeDefined();
        expect(typeof result.version).toBe('string');
      } finally {
        db.close();
      }
    });

    it('should perform basic vector operations', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // According to the docs, use Float32Array directly with better-sqlite3
        const vector = new Float32Array([1, 2, 3]);
        const result = db.prepare('SELECT vec_length(?) as length').get(vector) as { length: number };

        expect(result.length).toBe(3);
      } finally {
        db.close();
      }
    });

    it('should handle vector distance calculations', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        const vecA = new Float32Array([1, 0, 0]);
        const vecB = new Float32Array([0, 1, 0]);

        const result = db.prepare('SELECT vec_distance_L2(?, ?) as distance').get(vecA, vecB) as { distance: number };

        // Distance between [1,0,0] and [0,1,0] should be sqrt(2) ≈ 1.414
        expect(result.distance).toBeCloseTo(1.414, 3);
      } finally {
        db.close();
      }
    });

    it('should create and use virtual vec tables', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // Create a virtual table for 3-dimensional vectors
        db.exec('CREATE VIRTUAL TABLE test_embeddings USING vec0(embedding float[3])');

        // Insert some test vectors
        const vector1 = new Float32Array([1, 0, 0]);
        const vector2 = new Float32Array([0, 1, 0]);
        const vector3 = new Float32Array([0.707, 0.707, 0]);

        db.prepare('INSERT INTO test_embeddings(embedding) VALUES (?)').run(vector1);
        db.prepare('INSERT INTO test_embeddings(embedding) VALUES (?)').run(vector2);
        db.prepare('INSERT INTO test_embeddings(embedding) VALUES (?)').run(vector3);

        // Verify vectors were inserted
        const count = db.prepare('SELECT COUNT(*) as count FROM test_embeddings').get() as { count: number };
        expect(count.count).toBe(3);

        // Test similarity search
        const queryVector = new Float32Array([0.8, 0.6, 0]);
        const results = db.prepare(`
          SELECT rowid, distance 
          FROM test_embeddings 
          WHERE embedding MATCH ? 
          ORDER BY distance 
          LIMIT 3
        `).all(queryVector) as Array<{ rowid: number; distance: number }>;

        expect(results).toHaveLength(3);
        expect(results[0].distance).toBeLessThan(results[1].distance); // Results ordered by similarity
        expect(typeof results[0].rowid).toBe('number'); // rowid should be a number
      } finally {
        db.close();
      }
    });

    it('should handle different vector dimensions', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // Test with 384-dimensional vectors (common embedding size)
        db.exec('CREATE VIRTUAL TABLE embeddings_384 USING vec0(embedding float[384])');

        // Create a 384-dimensional vector
        const vector384 = new Float32Array(384);
        for (let i = 0; i < 384; i++) {
          vector384[i] = Math.random();
        }

        db.prepare('INSERT INTO embeddings_384(embedding) VALUES (?)').run(vector384);

        // Verify it was inserted
        const result = db.prepare('SELECT COUNT(*) as count FROM embeddings_384').get() as { count: number };
        expect(result.count).toBe(1);

        // Test with 1536-dimensional vectors (OpenAI embedding size)
        db.exec('CREATE VIRTUAL TABLE embeddings_1536 USING vec0(embedding float[1536])');

        const vector1536 = new Float32Array(1536);
        for (let i = 0; i < 1536; i++) {
          vector1536[i] = Math.random();
        }

        db.prepare('INSERT INTO embeddings_1536(embedding) VALUES (?)').run(vector1536);

        const result1536 = db.prepare('SELECT COUNT(*) as count FROM embeddings_1536').get() as { count: number };
        expect(result1536.count).toBe(1);
      } finally {
        db.close();
      }
    });

    it('should demonstrate hybrid storage pattern used by WikiEmbeddingService', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // Create a traditional metadata table (like WikiEmbeddingEntity)
        db.exec(`
          CREATE TABLE wiki_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspaceId TEXT NOT NULL,
            tiddlerTitle TEXT NOT NULL,
            content TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            model TEXT NOT NULL,
            provider TEXT NOT NULL,
            created DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create a virtual table for the actual vectors
        db.exec('CREATE VIRTUAL TABLE wiki_embeddings_vec_384 USING vec0(embedding float[384])');

        // Insert metadata
        const insertMetadata = db.prepare(`
          INSERT INTO wiki_embeddings (workspaceId, tiddlerTitle, content, dimensions, model, provider)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const metadataResult = insertMetadata.run('test-workspace', 'Test Document', 'This is test content', 384, 'text-embedding-ada-002', 'openai');
        const embeddingId = Number(metadataResult.lastInsertRowid); // Ensure it's a number, not bigint

        // Insert the actual vector using auto-assignment then verification
        const vector = new Float32Array(384);
        for (let i = 0; i < 384; i++) {
          vector[i] = Math.random();
        }

        // Insert vector and let sqlite-vec auto-assign rowid
        const vectorInsert = db.prepare('INSERT INTO wiki_embeddings_vec_384(embedding) VALUES (?)');
        const vectorResult = vectorInsert.run(vector);
        const assignedRowid = Number(vectorResult.lastInsertRowid);

        // Verify the hybrid storage works
        const metadataQuery = db.prepare('SELECT * FROM wiki_embeddings WHERE id = ?').get(embeddingId) as {
          id: number;
          tiddlerTitle: string;
          content: string;
          dimensions: number;
          model: string;
          provider: string;
        };
        expect(metadataQuery).toBeDefined();
        expect(metadataQuery.tiddlerTitle).toBe('Test Document');

        const vectorQuery = db.prepare('SELECT rowid FROM wiki_embeddings_vec_384 WHERE rowid = ?').get(assignedRowid) as {
          rowid: number;
        };
        expect(vectorQuery).toBeDefined();
        expect(vectorQuery.rowid).toBe(assignedRowid);

        // Demonstrate how WikiEmbeddingService actually works (no JOIN, two separate queries)
        const queryVector = new Float32Array(384);
        for (let i = 0; i < 384; i++) {
          queryVector[i] = Math.random();
        }

        // Step 1: Query vector similarity (like WikiEmbeddingService does)
        const vectorOnlyResults = db.prepare(`
          SELECT rowid, distance
          FROM wiki_embeddings_vec_384
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 10
        `).all(queryVector) as Array<{
          rowid: number;
          distance: number;
        }>;

        // Step 2: Query metadata separately (like WikiEmbeddingService does)
        const metadataResults = db.prepare('SELECT * FROM wiki_embeddings WHERE id = ?').all(embeddingId) as Array<{
          id: number;
          tiddlerTitle: string;
          content: string;
          dimensions: number;
          model: string;
          provider: string;
        }>;

        // Step 3: Combine results in application layer (like WikiEmbeddingService does)
        expect(vectorOnlyResults.length).toBeGreaterThanOrEqual(1);
        expect(metadataResults.length).toBe(1);
        expect(metadataResults[0].tiddlerTitle).toBe('Test Document');
      } finally {
        db.close();
      }
    });

    it('should perform comprehensive vector storage and retrieval operations', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // Create vector table for testing
        db.exec('CREATE VIRTUAL TABLE test_vectors USING vec0(embedding float[4])');

        // Test data: 4-dimensional vectors with known relationships
        const vectors = [
          { id: 'vec1', data: new Float32Array([1, 0, 0, 0]), label: 'X-axis' },
          { id: 'vec2', data: new Float32Array([0, 1, 0, 0]), label: 'Y-axis' },
          { id: 'vec3', data: new Float32Array([0, 0, 1, 0]), label: 'Z-axis' },
          { id: 'vec4', data: new Float32Array([0.707, 0.707, 0, 0]), label: 'XY-diagonal' }, // 45 degrees between X and Y
          { id: 'vec5', data: new Float32Array([0.5, 0.5, 0.5, 0.5]), label: 'All-equal' }, // Equal components
        ];

        // Insert all vectors
        const insertStmt = db.prepare('INSERT INTO test_vectors(embedding) VALUES (?)');
        const insertedRowids: number[] = [];

        for (const vector of vectors) {
          const result = insertStmt.run(vector.data);
          insertedRowids.push(Number(result.lastInsertRowid));
        }

        // Verify all vectors were stored
        const count = db.prepare('SELECT COUNT(*) as count FROM test_vectors').get() as { count: number };
        expect(count.count).toBe(5);

        // Test 1: Find vector most similar to X-axis vector [1, 0, 0, 0]
        const queryXAxis = new Float32Array([1, 0, 0, 0]);
        const xAxisResults = db.prepare(`
          SELECT rowid, distance
          FROM test_vectors
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 3
        `).all(queryXAxis) as Array<{ rowid: number; distance: number }>;

        expect(xAxisResults).toHaveLength(3);
        // First result should be the exact match (distance ≈ 0)
        expect(xAxisResults[0].distance).toBeCloseTo(0, 6);
        // Second result should be XY-diagonal (distance should be calculated)
        expect(xAxisResults[1].distance).toBeGreaterThan(0);

        // Test 2: Find vector most similar to a query between X and Y [0.6, 0.8, 0, 0]
        const queryMixed = new Float32Array([0.6, 0.8, 0, 0]);
        const mixedResults = db.prepare(`
          SELECT rowid, distance
          FROM test_vectors
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 3
        `).all(queryMixed) as Array<{ rowid: number; distance: number }>;

        expect(mixedResults).toHaveLength(3);
        // Results should be ordered by similarity (ascending distance)
        expect(mixedResults[0].distance).toBeLessThan(mixedResults[1].distance);
        expect(mixedResults[1].distance).toBeLessThan(mixedResults[2].distance);

        // Test 3: Test vector distance functions
        const vec1 = new Float32Array([1, 0, 0, 0]);
        const vec2 = new Float32Array([0, 1, 0, 0]);

        // L2 distance between orthogonal unit vectors should be sqrt(2)
        const l2Distance = db.prepare('SELECT vec_distance_L2(?, ?) as distance').get(vec1, vec2) as { distance: number };
        expect(l2Distance.distance).toBeCloseTo(Math.sqrt(2), 6);

        // Cosine distance between orthogonal vectors should be 1 (no similarity)
        const cosineDistance = db.prepare('SELECT vec_distance_cosine(?, ?) as distance').get(vec1, vec2) as { distance: number };
        expect(cosineDistance.distance).toBeCloseTo(1, 6);

        // Test 4: Test vector operations
        const vectorLength = db.prepare('SELECT vec_length(?) as length').get(vec1) as { length: number };
        expect(vectorLength.length).toBe(4);

        // Test 5: Range queries with distance threshold
        const thresholdQuery = new Float32Array([1, 0, 0, 0]);

        // First get similarity results, then filter by distance in application code
        const allResults = db.prepare(`
          SELECT rowid, distance
          FROM test_vectors
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 10
        `).all(thresholdQuery) as Array<{ rowid: number; distance: number }>;

        // Filter by distance threshold in application code (like WikiEmbeddingService does)
        const thresholdResults = allResults.filter(result => result.distance < 1.0);

        // Should find vectors within threshold distance
        expect(thresholdResults.length).toBeGreaterThan(0);
        for (const result of thresholdResults) {
          expect(result.distance).toBeLessThan(1.0);
        }
      } finally {
        db.close();
      }
    });

    it('should handle high-dimensional vectors for real-world embedding scenarios', () => {
      const db = new Database(':memory:');

      try {
        sqliteVec.load(db);

        // Test with 1536-dimensional vectors (OpenAI text-embedding-ada-002 size)
        db.exec('CREATE VIRTUAL TABLE embeddings_1536 USING vec0(embedding float[1536])');

        // Generate realistic test embeddings
        const documents = [
          { title: 'AI Research', content: 'artificial intelligence machine learning neural networks' },
          { title: 'Cooking Recipe', content: 'recipe cooking food ingredients kitchen preparation' },
          { title: 'Travel Guide', content: 'travel tourism destination vacation journey adventure' },
          { title: 'Programming Tutorial', content: 'programming code software development algorithm' },
          { title: 'Machine Learning', content: 'machine learning artificial intelligence data science' }, // Similar to AI Research
        ];

        // Generate pseudo-embeddings (in real scenario, these would come from an API)
        const embeddings: Array<{ title: string; vector: Float32Array; rowid: number }> = [];

        for (let i = 0; i < documents.length; i++) {
          const vector = new Float32Array(1536);

          // Create deterministic but realistic vectors based on content
          const seed = i + 1; // Simple seed based on index

          // Generate normalized vector with deterministic values
          for (let j = 0; j < 1536; j++) {
            vector[j] = Math.sin(seed * (j + 1) * 0.01) * 0.1; // Small random-like values
          }

          // Make AI and ML vectors more similar by giving them similar patterns
          if (documents[i].title.includes('AI') || documents[i].title.includes('Machine Learning')) {
            for (let j = 0; j < 100; j++) {
              vector[j] = 0.1 + j * 0.001; // Similar pattern for AI-related content
            }
            // Normalize the modified vector
            let magnitude = 0;
            for (let j = 0; j < 1536; j++) {
              magnitude += vector[j] * vector[j];
            }
            magnitude = Math.sqrt(magnitude);
            for (let j = 0; j < 1536; j++) {
              vector[j] /= magnitude;
            }
          }

          const result = db.prepare('INSERT INTO embeddings_1536(embedding) VALUES (?)').run(vector);
          embeddings.push({
            title: documents[i].title,
            vector,
            rowid: Number(result.lastInsertRowid),
          });
        }

        // Verify all embeddings stored
        const count = db.prepare('SELECT COUNT(*) as count FROM embeddings_1536').get() as { count: number };
        expect(count.count).toBe(5);

        // Test semantic search: find documents similar to "AI and machine learning"
        const aiQuery = embeddings.find(e => e.title === 'AI Research');
        expect(aiQuery).toBeDefined();

        const semanticResults = db.prepare(`
          SELECT rowid, distance
          FROM embeddings_1536
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 3
        `).all(aiQuery!.vector) as Array<{ rowid: number; distance: number }>;

        expect(semanticResults).toHaveLength(3);

        // First result should be the query itself (distance ≈ 0)
        expect(semanticResults[0].rowid).toBe(aiQuery!.rowid);
        expect(semanticResults[0].distance).toBeCloseTo(0, 10);

        // Second result should be Machine Learning (similar semantic content)
        const mlEmbedding = embeddings.find(e => e.title === 'Machine Learning');
        expect(mlEmbedding).toBeDefined();
        expect(semanticResults[1].rowid).toBe(mlEmbedding!.rowid);

        // Distance between AI and ML should be smaller than AI and Cooking
        const cookingEmbedding = embeddings.find(e => e.title === 'Cooking Recipe');

        // Get similarity to cooking embedding (using the actual WikiEmbeddingService pattern)
        const cookingResults = db.prepare(`
          SELECT rowid, distance
          FROM embeddings_1536
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 5
        `).all(aiQuery!.vector) as Array<{ rowid: number; distance: number }>;

        // Find the cooking embedding result
        const cookingResult = cookingResults.find(result => result.rowid === cookingEmbedding!.rowid);
        expect(cookingResult).toBeDefined();

        expect(semanticResults[1].distance).toBeLessThan(cookingResult!.distance);

        // Test batch similarity search
        const batchQuery = db.prepare(`
          SELECT rowid, distance
          FROM embeddings_1536
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT 5
        `);

        for (const embedding of embeddings) {
          const results = batchQuery.all(embedding.vector) as Array<{ rowid: number; distance: number }>;
          expect(results.length).toBeGreaterThan(0);
          expect(results[0].rowid).toBe(embedding.rowid); // Self should be most similar
          expect(results[0].distance).toBeCloseTo(0, 10);
        }
      } finally {
        db.close();
      }
    });
  });
});
