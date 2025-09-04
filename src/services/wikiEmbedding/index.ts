import { inject, injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import { WikiChannel } from '@/constants/channels';
import type { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { IDatabaseService } from '@services/database/interface';
import { WikiEmbeddingEntity, WikiEmbeddingStatusEntity } from '@services/database/schema/wikiEmbedding';
import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';

import type { ITiddlerFields } from 'tiddlywiki';
import type { EmbeddingRecord, EmbeddingStatus, IWikiEmbeddingService, SearchResult } from './interface';

// Type definitions for database queries
interface TableExistsResult {
  name: string;
}

interface VectorSearchResult {
  rowid: string;
  distance: number;
}

// Type definitions for database queries
interface TableExistsResult {
  name: string;
}

interface VectorSearchResult {
  rowid: string;
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
      // Initialize database for wiki embeddings
      await this.databaseService.initializeDatabase('wikiEmbedding');
      this.dataSource = await this.databaseService.getDatabase('wikiEmbedding');
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
      const queryRunner = this.dataSource.createQueryRunner();
      try {
        await queryRunner.query('SELECT vec_version() as version');
      } catch (error) {
        logger.warn('sqlite-vec extension not available, skipping vector table creation', { error });
        await queryRunner.release();
        return;
      }

      // Common embedding dimensions used by popular models
      // We create tables for different dimensions to optimize performance
      const commonDimensions = [384, 512, 768, 1024, 1536, 3072];

      for (const dim of commonDimensions) {
        const tableName = `wiki_embeddings_vec_${dim}`;

        // Check if table already exists
        const tableExists = await queryRunner.query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [tableName],
        ) as TableExistsResult[];

        if (tableExists.length === 0) {
          // Create vec0 virtual table for this dimension
          await queryRunner.query(
            `CREATE VIRTUAL TABLE ${tableName} USING vec0(embedding float[${dim}])`,
          );
          logger.debug(`Created sqlite-vec table: ${tableName}`);
        }
      }

      await queryRunner.release();
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
      logger.error(`Failed to get total notes count: ${error instanceof Error ? error.message : String(error)}`);
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
        const modifiedTime = String(note.modified || '');

        try {
          // Re-ensure repositories before each note processing
          this.ensureRepositories();

          await this.updateEmbeddingStatus(workspaceId, {
            status: 'generating',
            progress: { total: totalCount, completed, current: noteTitle },
          });

          // Generate content signature for change detection
          const contentHash = this.generateContentSignature(noteContent, modifiedTime);

          // Check if embedding already exists and is up-to-date
          if (!forceUpdate) {
            const existingEmbedding = await this.embeddingRepository!.findOne({
              where: {
                workspaceId,
                tiddlerTitle: noteTitle,
                contentHash,
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

          for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];

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

            // Create embedding record
            const embeddingRecord: EmbeddingRecord = {
              id: nanoid(),
              workspaceId,
              tiddlerTitle: noteTitle,
              content: chunk,
              contentHash,
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

              // Save metadata to database
              const entity = this.embeddingRepository!.create(embeddingRecord);
              await this.embeddingRepository!.save(entity);

              // Store vector in sqlite-vec table
              await this.storeEmbeddingVector(embeddingRecord.id, embeddingArray, dimensions);
            } catch (databaseError) {
              const databaseErrorMessage = databaseError instanceof Error ? databaseError.message : String(databaseError);
              logger.error(`Database error while saving embedding for "${noteTitle}": ${databaseErrorMessage}`);

              // Try to reinitialize database connection
              try {
                logger.info('Attempting to reinitialize database connection...');
                await this.initializeDatabase();

                // Retry saving after reinitialization
                const entity = this.embeddingRepository!.create(embeddingRecord);
                await this.embeddingRepository!.save(entity);
                await this.storeEmbeddingVector(embeddingRecord.id, embeddingArray, dimensions);

                logger.info(`Successfully saved embedding for "${noteTitle}" after database reinitialization`);
              } catch (retryError) {
                const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError);
                logger.error(`Failed to save embedding for "${noteTitle}" even after database reinitialization: ${retryErrorMessage}`);
                throw retryError; // Re-throw to be caught by outer try-catch
              }
            }
          }

          completed++;
          logger.debug(`Generated embeddings for: ${noteTitle} (${chunks.length} chunks)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to generate embedding for note "${noteTitle}": ${errorMessage}`);
          // Continue with other notes instead of stopping
        }
      }

      // Update status to completed
      await this.updateEmbeddingStatus(workspaceId, {
        status: 'completed',
        progress: { total: totalCount, completed },
        lastCompleted: new Date(),
      });

      logger.info(`Completed embedding generation for workspace: ${workspaceId} (${completed}/${totalCount})`);
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
   */
  private async storeEmbeddingVector(
    embeddingId: string,
    embedding: number[],
    dimensions: number,
  ): Promise<void> {
    if (!this.dataSource) {
      throw new Error('DataSource not initialized');
    }

    const tableName = this.getVectorTableName(dimensions);

    // Ensure the table exists for this dimension
    await this.ensureVectorTableExists(dimensions);

    const embeddingJson = JSON.stringify(embedding);

    // Insert or replace the vector in sqlite-vec table
    await this.dataSource.query(
      `INSERT OR REPLACE INTO ${tableName}(rowid, embedding) VALUES (?, vec_f32(?))`,
      [embeddingId, embeddingJson],
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
      const queryEmbeddingJson = JSON.stringify(queryEmbedding);

      const vectorResults = await this.dataSource!.query<VectorSearchResult[]>(
        `
        SELECT rowid, distance 
        FROM ${tableName} 
        WHERE rowid IN (${placeholders})
          AND embedding MATCH vec_f32(?)
        ORDER BY distance 
        LIMIT ?
        `,
        [...embeddingIds, queryEmbeddingJson, limit],
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
                content: metadataRecord.content,
                contentHash: metadataRecord.contentHash,
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
          logger.debug(`Could not save default embedding status: ${error instanceof Error ? error.message : String(error)}`);
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
        logger.error(`Failed to initialize embedding status subscription: ${String(error)}`);
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

      // Group embeddings by dimensions
      const embeddingsByDimension = new Map<number, string[]>();
      for (const embedding of embeddings) {
        if (!embeddingsByDimension.has(embedding.dimensions)) {
          embeddingsByDimension.set(embedding.dimensions, []);
        }
        embeddingsByDimension.get(embedding.dimensions)!.push(embedding.id);
      }

      // Delete vectors from sqlite-vec tables
      for (const [dimensions, embeddingIds] of embeddingsByDimension) {
        if (embeddingIds.length > 0) {
          const tableName = this.getVectorTableName(dimensions);
          const placeholders = embeddingIds.map(() => '?').join(',');

          await this.dataSource!.query(
            `DELETE FROM ${tableName} WHERE rowid IN (${placeholders})`,
            embeddingIds,
          );
        }
      }

      // Delete metadata from regular table
      await this.embeddingRepository!.delete({ workspaceId });

      // Delete status record
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
