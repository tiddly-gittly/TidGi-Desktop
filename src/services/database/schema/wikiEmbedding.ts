import type { EmbeddingRecord, EmbeddingStatus } from '@services/wikiEmbedding/interface';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Database entity: Stores metadata for embedding vectors
 * The actual vectors are stored in sqlite-vec virtual tables
 *
 * IMPORTANT: Uses integer primary key to match sqlite-vec rowid requirements
 */
@Entity('wiki_embeddings')
@Index(['workspaceId', 'model', 'provider'])
export class WikiEmbeddingEntity implements EmbeddingRecord {
  @PrimaryGeneratedColumn()
  id!: number; // number for sqlite-vec compatibility

  @Column()
  @Index()
  workspaceId!: string;

  @Column()
  @Index()
  tiddlerTitle!: string;

  @Column({ type: 'integer', nullable: true })
  chunkIndex?: number;

  @Column({ type: 'integer', nullable: true })
  totalChunks?: number;

  @CreateDateColumn()
  created!: Date;

  @UpdateDateColumn()
  modified!: Date;

  @Column()
  model!: string;

  @Column()
  provider!: string;

  @Column({ type: 'integer' })
  dimensions!: number;
}

/**
 * Database entity: Tracks embedding generation status for workspaces
 */
@Entity('wiki_embedding_status')
export class WikiEmbeddingStatusEntity implements EmbeddingStatus {
  @PrimaryColumn()
  workspaceId!: string;

  @Column({
    type: 'varchar',
    enum: ['idle', 'generating', 'completed', 'error'],
    default: 'idle',
  })
  status!: 'idle' | 'generating' | 'completed' | 'error';

  /** Store progress as JSON object */
  @Column({ type: 'simple-json', nullable: true })
  progress?: {
    total: number;
    completed: number;
    current?: string;
  };

  @Column({ type: 'text', nullable: true })
  error?: string;

  @UpdateDateColumn()
  lastUpdated!: Date;

  @Column({ type: 'datetime', nullable: true })
  lastCompleted?: Date;
}
