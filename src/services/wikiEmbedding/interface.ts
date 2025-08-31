import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';
import type { ITiddlerFields } from 'tiddlywiki';

import type { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';

/**
 * Embedding record in the database
 */
export interface EmbeddingRecord {
  /** Unique identifier */
  id: string;
  /** Workspace ID that this embedding belongs to */
  workspaceId: string;
  /** Original tiddler title */
  tiddlerTitle: string;
  /** Content that was embedded (may be chunked) */
  content: string;
  /** Content hash for change detection */
  contentHash: string;
  /** Chunk index if content was split */
  chunkIndex?: number;
  /** Total chunks if content was split */
  totalChunks?: number;
  /** Creation time */
  created: Date;
  /** Last update time */
  modified: Date;
  /** Embedding model used */
  model: string;
  /** Provider used for embedding */
  provider: string;
  /** Embedding dimensions */
  dimensions: number;
}

/**
 * Embedding generation status for a workspace
 */
export interface EmbeddingStatus {
  /** Workspace ID */
  workspaceId: string;
  /** Current status */
  status: 'idle' | 'generating' | 'completed' | 'error';
  /** Progress information */
  progress?: {
    /** Total notes to process */
    total: number;
    /** Completed notes */
    completed: number;
    /** Current note being processed */
    current?: string;
  };
  /** Error message if status is 'error' */
  error?: string;
  /** Last update time */
  lastUpdated: Date;
  /** Last successful completion time */
  lastCompleted?: Date;
}

/**
 * Search result from vector similarity search
 */
export interface SearchResult {
  /** Embedding record */
  record: EmbeddingRecord;
  /** Similarity score (0-1, higher is more similar) */
  similarity: number;
}

/**
 * Wiki embedding service interface
 */
export interface IWikiEmbeddingService {
  /**
   * Initialize the service
   */
  initialize(): Promise<void>;

  /**
   * Generate or update embeddings for a specific workspace
   * @param workspaceId Workspace ID
   * @param config AI configuration for embedding generation
   * @param forceUpdate Whether to force update all embeddings even if unchanged
   */
  generateEmbeddings(workspaceId: string, config: AiAPIConfig, forceUpdate?: boolean): Promise<void>;

  /**
   * Search for similar content using vector similarity
   * @param workspaceId Workspace ID
   * @param query Search query text
   * @param config AI configuration for query embedding
   * @param limit Maximum number of results
   * @param threshold Minimum similarity threshold (0-1)
   */
  searchSimilar(
    workspaceId: string,
    query: string,
    config: AiAPIConfig,
    limit?: number,
    threshold?: number,
  ): Promise<SearchResult[]>;

  /**
   * Get embedding generation status for a workspace
   * @param workspaceId Workspace ID
   */
  getEmbeddingStatus(workspaceId: string): Promise<EmbeddingStatus>;

  /**
   * Subscribe to embedding status updates for a workspace
   * @param workspaceId Workspace ID
   */
  subscribeToEmbeddingStatus(workspaceId: string): Observable<EmbeddingStatus>;

  /**
   * Delete all embeddings for a workspace
   * @param workspaceId Workspace ID
   */
  deleteWorkspaceEmbeddings(workspaceId: string): Promise<void>;

  /**
   * Get embedding statistics for a workspace
   * @param workspaceId Workspace ID
   */
  getEmbeddingStats(workspaceId: string): Promise<{
    totalEmbeddings: number;
    totalNotes: number;
    lastUpdated?: Date;
    modelUsed?: string;
    providerUsed?: string;
  }>;

  /**
   * Get all wiki notes from a workspace
   * @param workspaceId Workspace ID
   */
  getWikiNotes(workspaceId: string): Promise<ITiddlerFields[]>;
}

export const WikiEmbeddingServiceIPCDescriptor = {
  channel: 'WikiEmbedding' as const,
  properties: {
    generateEmbeddings: ProxyPropertyType.Function,
    searchSimilar: ProxyPropertyType.Function,
    getEmbeddingStatus: ProxyPropertyType.Function,
    subscribeToEmbeddingStatus: ProxyPropertyType.Function$,
    deleteWorkspaceEmbeddings: ProxyPropertyType.Function,
    getEmbeddingStats: ProxyPropertyType.Function,
    getWikiNotes: ProxyPropertyType.Function,
  },
};
