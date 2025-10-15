import { inject, injectable } from 'inversify';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import { WikiChannel } from '@/constants/channels';
import type { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { IDatabaseService } from '@services/database/interface';
import { WikiEmbeddingEntity, WikiEmbeddingStatusEntity } from '@services/database/schema/wikiEmbedding';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';

import type { ITiddlerFields } from 'tiddlywiki';
import type { EmbeddingStatus, IWikiEmbeddingService, SearchResult } from './interface';

// Type definitions for database queries
interface TableExistsResult {
  name: string;
}

interface VecVersionResult {
  vec_version: string;
}

interface VectorSearchResult {
  rowid: number; // Changed from string to number for integer rowid compatibility
  distance: number;
}

@injectable()
export class WikiEmbeddingService implements IWikiEmbeddingService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @inject(serviceIdentifier.ExternalAPI)
  private readonly externalAPIService!: IExternalAPIService;

  @inject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @inject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  private dataSource: DataSource | null = null;
  private embeddingRepository: Repository<WikiEmbeddingEntity> | null = null;
  private statusRepository: Repository<WikiEmbeddingStatusEntity> | null = null;

  // Subjects for subscription updates
  private statusSubjects: Map<string, BehaviorSubject<EmbeddingStatus>> = new Map();

  public async initialize(): Promise<void> {
    try {
      await this.initializeDatabase();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize wiki embedding service: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Initialize database repositories and sqlite-vec virtual tables
   */
  private async initializeDatabase(): Promise<void> {
    try {
      // Initialize database for wiki embeddings with vector search enabled
      await this.databaseService.initializeDatabase('wikiEmbedding', { enableVectorSearch: true });
      this.dataSource = await this.databaseService.getDatabase('wikiEmbedding', { enableVectorSearch: true });
      this.embeddingRepository = this.dataSource.getRepository(WikiEmbeddingEntity);
      this.statusRepository = this.dataSource.getRepository(WikiEmbeddingStatusEntity);

      // Create sqlite-vec virtual tables for vector storage
      await this.initializeSqliteVecTables();

      logger.debug('WikiEmbedding repositories and sqlite-vec tables initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize wiki embedding database: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Initialize sqlite-vec virtual tables for different embedding dimensions
   */
  private async initializeSqliteVecTables(): Promise<void> {
    if (!this.dataSource) {
      throw new Error('DataSource not initialized');
    }

    try {
      // Use dataSource directly instead of creating a new queryRunner
      // since sqlite-vec extension is loaded on the main connection
      try {
        // Test sqlite-vec extension availability
        const versionResults = await this.dataSource.query<VecVersionResult[]>(
          'select vec_version() as vec_version;',
        );

        if (!Array.isArray(versionResults) || versionResults.length === 0) {
          throw new Error('No version result returned from vec_version()');
        }

        const { vec_version } = versionResults[0];
        logger.info(`sqlite-vec extension verified with version: ${vec_version}`);
      } catch (error) {
        logger.warn('sqlite-vec extension not available, skipping vector table creation', { error });
        return;
      }

      // Common embedding dimensions used by popular models
      // We create tables for different dimensions to optimize performance
      const commonDimensions = [384, 512, 768, 1024, 1536, 3072];

      for (const dim of commonDimensions) {
        const tableName = `wiki_embeddings_vec_${dim}`;

        // Check if table already exists
        const tableExists = await this.dataSource.query<TableExistsResult[]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [tableName],
        );

        if (tableExists.length === 0) {
          // Create vec0 virtual table for this dimension
          await this.dataSource.query(
            `CREATE VIRTUAL TABLE ${tableName} USING vec0(embedding float[${dim}])`,
          );
          logger.debug(`Created sqlite-vec table: ${tableName}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize sqlite-vec tables: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get the vector table name for a given dimension
   */
  private getVectorTableName(dimensions: number): string {
    return `wiki_embeddings_vec_${dimensions}`;
  }

  /**
   * Ensure repositories are initialized
   */
  private ensureRepositories(): void {
    if (!this.embeddingRepository || !this.statusRepository) {
      throw new Error('Wiki embedding repositories not initialized');
    }
  }

  /**
   * Get wiki notes from a workspace using WikiChannel as async iterator
   * Uses pagination to avoid memory pressure
   */
  private async *getWikiNotesIterator(workspaceId: string): AsyncGenerator<ITiddlerFields, void, unknown> {
    // Get workspace information
    const workspace = await this.workspaceService.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // First, get total count
    const totalCount = await this.getTotalNotesCount(workspaceId);
    if (totalCount === 0) {
      logger.warn(`No tiddlers found for workspace: ${workspaceId}`);
      return;
    }

    logger.info(`Found ${totalCount} notes to process in workspace: ${workspaceId}`);

    // Paginate through tiddlers
    const pageSize = 30;
    let processed = 0;

    while (processed < totalCount) {
      // Build filter with pagination using sort and rest to skip processed items
      const filter = processed > 0
        ? `[!is[system]!is[draft]!is[binary]has[text]sort[title]rest[${processed}]limit[${pageSize}]]`
        : `[!is[system]!is[draft]!is[binary]has[text]sort[title]limit[${pageSize}]]`;

      // First get titles using filter
      const tiddlerTitles = await this.wikiService.wikiOperationInServer(
        WikiChannel.runFilter,
        workspaceId,
        [filter],
      );

      if (!Array.isArray(tiddlerTitles) || tiddlerTitles.length === 0) {
        break;
      }

      // Then get full tiddler data - construct a filter to match these specific titles
      const titleFilter = tiddlerTitles.map(title => `[title[${title}]]`).join(' ');
      const tiddlersData = await this.wikiService.wikiOperationInServer(
        WikiChannel.getTiddlersAsJson,
        workspaceId,
        [titleFilter],
      );

      if (!Array.isArray(tiddlersData) || tiddlersData.length === 0) {
        break;
      }

      // Yield each tiddler
      for (const tiddler of tiddlersData) {
        yield tiddler;
        processed++;
      }

      // If we got fewer than pageSize, we've reached the end
      if (tiddlersData.length < pageSize) {
        break;
      }
    }
  }

  /**
   * Get total count of wiki notes for progress tracking
   */
  private async getTotalNotesCount(workspaceId: string): Promise<number> {
    try {
      const countResult = await this.wikiService.wikiOperationInServer(
        WikiChannel.runFilter,
        workspaceId,
        ['[!is[system]!is[draft]!is[binary]has[text]count[]]'],
      );

      return Array.isArray(countResult) && countResult.length > 0 ? Number(countResult[0]) : 0;
    } catch (error) {
      logger.error('Failed to get total notes count', { function: 'getTotalNotesCount', error });
      return 0;
    }
  }

  /**
   * Get all wiki notes from a workspace (for public interface compatibility)
   */
  public async getWikiNotes(workspaceId: string): Promise<ITiddlerFields[]> {
    const notes: ITiddlerFields[] = [];
    for await (const note of this.getWikiNotesIterator(workspaceId)) {
      notes.push(note);
    }
    return notes;
  }

  /**
   * Generate content signature for change detection using text length and modified time
   */
  private generateContentSignature(content: string, modified?: string): string {
    const modifiedTime = modified ? new Date(modified).getTime() : Date.now();
    const textLength = content.length;
    return `${textLength}-${modifiedTime}`;
  }

  /**
   * Chunk large content into smaller pieces for embedding
   */
  private chunkContent(content: string, maxChunkSize = 8000): string[] {
    if (content.length <= maxChunkSize) {
      return [content];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      let end = Math.min(start + maxChunkSize, content.length);

      // Try to break at a natural boundary (sentence or paragraph)
      if (end < content.length) {
        const lastSentence = content.lastIndexOf('.', end);
        const lastParagraph = content.lastIndexOf('\n', end);
        const lastSpace = content.lastIndexOf(' ', end);

        const breakPoint = Math.max(lastSentence, lastParagraph, lastSpace);
        if (breakPoint > start + maxChunkSize * 0.7) { // Don't break too early
          end = breakPoint + 1;
        }
      }

      chunks.push(content.slice(start, end).trim());
      start = end;
    }

    return chunks;
  }

  /**
   * Update embedding status and notify subscribers
   */
  private async updateEmbeddingStatus(workspaceId: string, status: Partial<EmbeddingStatus>): Promise<void> {
    try {
      this.ensureRepositories();

      let statusEntity = await this.statusRepository!.findOne({
        where: { workspaceId },
      });

      if (!statusEntity) {
        statusEntity = this.statusRepository!.create({
          workspaceId,
          status: 'idle',
          lastUpdated: new Date(),
        });
      }

      // Update fields
      Object.assign(statusEntity, status, { lastUpdated: new Date() });

      await this.statusRepository!.save(statusEntity);

      // Notify subscribers
      const subject = this.statusSubjects.get(workspaceId);
      if (subject) {
        subject.next(statusEntity);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`Failed to update embedding status: ${errorMessage}`);
      // Don't throw error to avoid interrupting embedding process
    }
  }

  public async generateEmbeddings(
    workspaceId: string,
    config: AiAPIConfig,
    forceUpdate = false,
  ): Promise<void> {
    try {
      // Ensure repositories are initialized before starting
      this.ensureRepositories();

      logger.info(`Starting embedding generation for workspace: ${workspaceId}`);

      // Get total count first for progress tracking
      const totalCount = await this.getTotalNotesCount(workspaceId);
      logger.info(`Found ${totalCount} notes to process`);

      // Update status to generating
      await this.updateEmbeddingStatus(workspaceId, {
        status: 'generating',
        progress: { total: totalCount, completed: 0 },
      });

      let completed = 0;

      // Process notes using async iterator to avoid memory pressure
      for await (const note of this.getWikiNotesIterator(workspaceId)) {
        const noteTitle = String(note.title || '');
        const noteContent = String(note.text || '');
        // const modifiedTime = String(note.modified || '');

        // Re-ensure repositories before each note processing
        this.ensureRepositories();

        await this.updateEmbeddingStatus(workspaceId, {
          status: 'generating',
          progress: { total: totalCount, completed, current: noteTitle },
        });

        // Skip empty content
        if (!noteContent.trim()) {
          logger.debug(`Skipping note with empty content: ${noteTitle}`);
          continue;
        }

        // Check if embedding already exists and is up-to-date
        if (!forceUpdate) {
          const existingEmbedding = await this.embeddingRepository!.findOne({
            where: {
              workspaceId,
              tiddlerTitle: noteTitle,
              model: config.api.model,
              provider: config.api.provider,
            },
          });

          if (existingEmbedding) {
            logger.debug(`Embedding up-to-date for: ${noteTitle}`);
            completed++;
            continue;
          }
        }

        // Delete existing embeddings for this note
        await this.embeddingRepository!.delete({
          workspaceId,
          tiddlerTitle: noteTitle,
          model: config.api.model,
          provider: config.api.provider,
        });

        // Chunk content if necessary
        const chunks = this.chunkContent(noteContent);
        let chunkSuccessCount = 0;

        for (let index = 0; index < chunks.length; index++) {
          const chunk = chunks[index];

          try {
            // Generate embeddings using embeddingModel if available, otherwise use regular model
            const embeddingModel = config.api.embeddingModel || config.api.model;
            const embeddingConfig = {
              ...config,
              api: {
                ...config.api,
                model: embeddingModel,
              },
            };

            const embeddingResponse = await this.externalAPIService.generateEmbeddings([chunk], embeddingConfig);

            if (embeddingResponse.status === 'error') {
              throw new Error(`Embedding generation failed: ${embeddingResponse.errorDetail?.message}`);
            }

            if (embeddingResponse.embeddings.length === 0) {
              throw new Error('No embeddings returned from API');
            }

            const embeddingArray = embeddingResponse.embeddings[0];
            const dimensions = embeddingArray.length;

            // Create embedding record - Let database auto-generate integer ID
            const embeddingRecord = {
              // id is now auto-generated by database (PrimaryGeneratedColumn)
              workspaceId,
              tiddlerTitle: noteTitle,
              chunkIndex: chunks.length > 1 ? index : undefined,
              totalChunks: chunks.length > 1 ? chunks.length : undefined,
              created: new Date(),
              modified: new Date(),
              model: config.api.model,
              provider: config.api.provider,
              dimensions,
            };

            try {
              // Re-ensure repositories before saving
              this.ensureRepositories();

              // Save metadata to database and get auto-generated ID
              const entity = this.embeddingRepository!.create(embeddingRecord);
              const savedEntity = await this.embeddingRepository!.save(entity);

              // Store vector in sqlite-vec table using the auto-generated ID
              try {
                await this.storeEmbeddingVector(savedEntity.id, embeddingArray, dimensions);
                chunkSuccessCount++;
              } catch (vectorError) {
                // If vector storage fails, clean up the metadata record to avoid orphans
                await this.embeddingRepository!.delete(savedEntity.id);
                throw vectorError;
              }
            } catch (databaseError) {
              const databaseErrorMessage = databaseError instanceof Error ? databaseError.message : String(databaseError);
              logger.error(`Database error while saving embedding for "${noteTitle}" chunk ${index + 1}: ${databaseErrorMessage}`);

              // Try to reinitialize database connection and retry the entire operation
              try {
                logger.info('Attempting to reinitialize database connection...');
                await this.initializeDatabase();

                // Retry the entire operation (metadata + vector) after reinitialization
                const retryEntity = this.embeddingRepository!.create(embeddingRecord);
                const retrySavedEntity = await this.embeddingRepository!.save(retryEntity);
                await this.storeEmbeddingVector(retrySavedEntity.id, embeddingArray, dimensions);

                logger.info(`Successfully saved embedding for "${noteTitle}" chunk ${index + 1} after database reinitialization`);
                chunkSuccessCount++;
              } catch (retryError) {
                const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError);
                logger.error(`Failed to save embedding for "${noteTitle}" chunk ${index + 1} even after database reinitialization: ${retryErrorMessage}`);
                // Continue with next chunk instead of failing the entire document
              }
            }
          } catch (chunkError) {
            const chunkErrorMessage = chunkError instanceof Error ? chunkError.message : String(chunkError);
            logger.error(`Failed to process chunk ${index + 1} of "${noteTitle}": ${chunkErrorMessage}`);
            // Continue with next chunk instead of failing the entire document
          }
        }

        // Only increment completed count if at least one chunk succeeded
        if (chunkSuccessCount > 0) {
          completed++;
          logger.debug('generated embeddings for note chunk', {
            function: 'generateEmbeddings',
            noteTitle,
            chunkSuccessCount,
            totalChunks: chunks.length,
          });
        } else {
          logger.warn(`Failed to generate any embeddings for: ${noteTitle}`);
        }
      }

      // Update status to completed
      await this.updateEmbeddingStatus(workspaceId, {
        status: 'completed',
        progress: { total: totalCount, completed },
        lastCompleted: new Date(),
      });

      logger.info('completed embedding generation', {
        function: 'generateEmbeddings',
        workspaceId,
        completed,
        totalCount,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to generate embeddings for workspace ${workspaceId}: ${errorMessage}`);

      await this.updateEmbeddingStatus(workspaceId, {
        status: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Store embedding vector in sqlite-vec table
   *
   * According to sqlite-vec documentation (https://alexgarcia.xyz/sqlite-vec/js.html):
   * - Vectors should be passed as Float32Array objects, not JSON strings
   * - better-sqlite3 automatically handles Float32Array conversion
   * - No need to use vec_f32() function when passing Float32Array directly
   * IMPROVED: Now uses integer embeddingId that matches sqlite-vec rowid requirements
   */
  private async storeEmbeddingVector(
    embeddingId: number, // Changed from string to number for direct rowid compatibility
    embedding: number[],
    dimensions: number,
  ): Promise<void> {
    if (!this.dataSource) {
      throw new Error('DataSource not initialized');
    }

    const tableName = this.getVectorTableName(dimensions);

    // Ensure the table exists for this dimension
    await this.ensureVectorTableExists(dimensions);

    // Convert number array to Float32Array as required by sqlite-vec
    const embeddingFloat32 = new Float32Array(embedding);

    // Insert or replace the vector in sqlite-vec table
    // Now embeddingId is integer, directly compatible with sqlite-vec rowid
    await this.dataSource.query(
      `INSERT OR REPLACE INTO ${tableName}(rowid, embedding) VALUES (?, ?)`,
      [embeddingId, embeddingFloat32],
    );
  }

  /**
   * Ensure vector table exists for the given dimensions
   */
  private async ensureVectorTableExists(dimensions: number): Promise<void> {
    if (!this.dataSource) {
      throw new Error('DataSource not initialized');
    }

    const tableName = this.getVectorTableName(dimensions);

    try {
      // Check if table exists
      const tableExists = await this.dataSource.query<TableExistsResult[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
      );

      if (tableExists.length === 0) {
        // Create the table if it doesn't exist
        await this.dataSource.query(
          `CREATE VIRTUAL TABLE ${tableName} USING vec0(embedding float[${dimensions}])`,
        );
        logger.debug(`Created sqlite-vec table: ${tableName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to ensure vector table exists: ${errorMessage}`);
      throw error;
    }
  }

  public async searchSimilar(
    workspaceId: string,
    query: string,
    config: AiAPIConfig,
    limit = 10,
    threshold = 0.7,
  ): Promise<SearchResult[]> {
    this.ensureRepositories();

    try {
      // Generate embedding for the query
      const queryEmbeddingResponse = await this.externalAPIService.generateEmbeddings([query], config);

      if (queryEmbeddingResponse.status === 'error') {
        throw new Error(`Query embedding generation failed: ${queryEmbeddingResponse.errorDetail?.message}`);
      }

      if (queryEmbeddingResponse.embeddings.length === 0) {
        throw new Error('No embedding returned for query');
      }

      const queryEmbedding = queryEmbeddingResponse.embeddings[0];
      const dimensions = queryEmbedding.length;
      const tableName = this.getVectorTableName(dimensions);

      // Check if vector table exists for this dimension
      await this.ensureVectorTableExists(dimensions);

      // Get metadata for embeddings with the same model/provider/workspace
      const metadataRecords = await this.embeddingRepository!.find({
        where: {
          workspaceId,
          model: config.api.model,
          provider: config.api.provider,
          dimensions,
        },
      });

      if (metadataRecords.length === 0) {
        logger.warn(`No embeddings found for workspace: ${workspaceId}`);
        return [];
      }

      // Get embedding IDs for filtering
      const embeddingIds = metadataRecords.map(record => record.id);
      const placeholders = embeddingIds.map(() => '?').join(',');

      // Perform vector similarity search using sqlite-vec
      // Convert query embedding to Float32Array as required by sqlite-vec
      const queryEmbeddingFloat32 = new Float32Array(queryEmbedding);

      const vectorResults = await this.dataSource!.query<VectorSearchResult[]>(
        `
        SELECT rowid, distance
        FROM ${tableName}
        WHERE rowid IN (${placeholders})
          AND embedding MATCH ?
        ORDER BY distance
        LIMIT ?
        `,
        [...embeddingIds, queryEmbeddingFloat32, limit],
      );

      // Convert distance to similarity (sqlite-vec returns distance, we want similarity)
      // For cosine distance: similarity = 1 - distance
      const results: SearchResult[] = [];

      for (const vectorResult of vectorResults) {
        const { rowid, distance } = vectorResult;
        const similarity = Math.max(0, 1 - distance); // Ensure non-negative similarity

        if (similarity >= threshold) {
          const metadataRecord = metadataRecords.find(record => record.id === rowid);
          if (metadataRecord) {
            results.push({
              record: {
                id: metadataRecord.id,
                workspaceId: metadataRecord.workspaceId,
                tiddlerTitle: metadataRecord.tiddlerTitle,
                chunkIndex: metadataRecord.chunkIndex,
                totalChunks: metadataRecord.totalChunks,
                created: metadataRecord.created,
                modified: metadataRecord.modified,
                model: metadataRecord.model,
                provider: metadataRecord.provider,
                dimensions: metadataRecord.dimensions,
              },
              similarity,
            });
          }
        }
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to search similar content: ${errorMessage}`);
      throw error;
    }
  }

  public async getEmbeddingStatus(workspaceId: string): Promise<EmbeddingStatus> {
    try {
      this.ensureRepositories();

      const statusEntity = await this.statusRepository!.findOne({
        where: { workspaceId },
      });

      if (!statusEntity) {
        const defaultStatus: EmbeddingStatus = {
          workspaceId,
          status: 'idle',
          lastUpdated: new Date(),
        };

        try {
          // Try to create default status
          const entity = this.statusRepository!.create(defaultStatus);
          await this.statusRepository!.save(entity);
        } catch (error) {
          // If saving fails, just return the default status
          logger.debug('could not save default embedding status', { function: 'getEmbeddingStatus', error });
        }

        return defaultStatus;
      }

      return {
        workspaceId: statusEntity.workspaceId,
        status: statusEntity.status,
        progress: statusEntity.progress,
        error: statusEntity.error,
        lastUpdated: statusEntity.lastUpdated,
        lastCompleted: statusEntity.lastCompleted || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`Failed to get embedding status: ${errorMessage}`);

      // Return default status instead of throwing error
      return {
        workspaceId,
        status: 'idle',
        lastUpdated: new Date(),
      };
    }
  }

  public subscribeToEmbeddingStatus(workspaceId: string): Observable<EmbeddingStatus> {
    // Create or get existing subject
    if (!this.statusSubjects.has(workspaceId)) {
      this.statusSubjects.set(
        workspaceId,
        new BehaviorSubject<EmbeddingStatus>({
          workspaceId,
          status: 'idle',
          lastUpdated: new Date(),
        }),
      );

      // Initialize with current status
      this.getEmbeddingStatus(workspaceId).then(status => {
        this.statusSubjects.get(workspaceId)?.next(status);
      }).catch((error: unknown) => {
        logger.error('Failed to initialize embedding status subscription', {
          function: 'subscribeToEmbeddingStatus',
          error: error as Error,
        });
      });
    }

    return this.statusSubjects.get(workspaceId)!.asObservable();
  }

  public async deleteWorkspaceEmbeddings(workspaceId: string): Promise<void> {
    this.ensureRepositories();

    try {
      // Get all embeddings for the workspace before deleting
      const embeddings = await this.embeddingRepository!.find({
        where: { workspaceId },
      });

      // Group embeddings by dimensions - Updated for integer IDs
      const embeddingsByDimension = new Map<number, number[]>(); // Changed string[] to number[]
      for (const embedding of embeddings) {
        if (!embeddingsByDimension.has(embedding.dimensions)) {
          embeddingsByDimension.set(embedding.dimensions, []);
        }
        embeddingsByDimension.get(embedding.dimensions)!.push(embedding.id); // Now number type matches
      }

      // Delete vectors from sqlite-vec tables (may fail if tables don't exist)
      for (const [dimensions, embeddingIds] of embeddingsByDimension) {
        if (embeddingIds.length > 0) {
          try {
            const tableName = this.getVectorTableName(dimensions);
            const placeholders = embeddingIds.map(() => '?').join(',');

            await this.dataSource!.query(
              `DELETE FROM ${tableName} WHERE rowid IN (${placeholders})`,
              embeddingIds,
            );
          } catch (vectorDeleteError) {
            const errorMessage = vectorDeleteError instanceof Error ? vectorDeleteError.message : String(vectorDeleteError);
            logger.warn(`Failed to delete vectors from table for dimension ${dimensions}: ${errorMessage}. Continuing with metadata cleanup.`);
            // Continue with metadata deletion even if vector deletion fails
          }
        }
      }

      // Delete metadata from regular table (always attempt this)
      await this.embeddingRepository!.delete({ workspaceId });

      // Delete status record (always attempt this)
      await this.statusRepository!.delete({ workspaceId });

      // Clean up subscription
      const subject = this.statusSubjects.get(workspaceId);
      if (subject) {
        subject.complete();
        this.statusSubjects.delete(workspaceId);
      }

      logger.info(`Deleted all embeddings for workspace: ${workspaceId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete workspace embeddings: ${errorMessage}`);
      throw error;
    }
  }

  public async getEmbeddingStats(workspaceId: string): Promise<{
    totalEmbeddings: number;
    totalNotes: number;
    lastUpdated?: Date;
    modelUsed?: string;
    providerUsed?: string;
  }> {
    try {
      this.ensureRepositories();

      // Get total embeddings count
      const totalEmbeddings = await this.embeddingRepository!.count({
        where: { workspaceId },
      });

      // Get unique tiddler titles (total notes)
      const uniqueNotes = await this.embeddingRepository!
        .createQueryBuilder('embedding')
        .select('DISTINCT embedding.tiddlerTitle')
        .where('embedding.workspaceId = :workspaceId', { workspaceId })
        .getCount();

      // Get latest embedding info
      const latestEmbedding = await this.embeddingRepository!.findOne({
        where: { workspaceId },
        order: { modified: 'DESC' },
      });

      return {
        totalEmbeddings,
        totalNotes: uniqueNotes,
        lastUpdated: latestEmbedding?.modified,
        modelUsed: latestEmbedding?.model,
        providerUsed: latestEmbedding?.provider,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`Failed to get embedding stats: ${errorMessage}`);

      // Return default stats instead of throwing error
      return {
        totalEmbeddings: 0,
        totalNotes: 0,
      };
    }
  }
}
