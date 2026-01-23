import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * External API call result type - streaming or immediate response
 */
export type ExternalAPICallType = 'streaming' | 'embedding' | 'immediate';

/**
 * External API call status
 */
export type ExternalAPICallStatus = 'start' | 'update' | 'done' | 'error' | 'cancel';

/**
 * Minimal request metadata for logging purposes
 */
export interface RequestMetadata {
  /** Provider used for the request (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Model used (e.g., 'gpt-4', 'claude-3') */
  model: string;
  /** Message count for chat requests */
  messageCount?: number;
  /** Input count for embedding requests */
  inputCount?: number;
  /** Whether the request contains image content */
  hasImageContent?: boolean;
  /** Request configuration summary */
  configSummary?: Record<string, unknown>;
}

/**
 * Response metadata for completed requests
 */
export interface ResponseMetadata {
  /** Total response length/tokens */
  responseLength?: number;
  /** Request duration in milliseconds */
  duration?: number;
  /** Usage information if provided by API */
  usage?: Record<string, unknown>;
}

/**
 * Database entity for logging external API calls for debugging purposes
 * This stores request/response details when externalAPIDebug preference is enabled
 */
@Entity('external_api_logs')
export class ExternalAPILogEntity {
  /** Unique request identifier */
  @PrimaryColumn()
  id!: string;

  /** Associated agent instance ID (optional) */
  @Column({ nullable: true })
  @Index()
  agentInstanceId?: string;

  /** Type of API call made */
  @Column({
    type: 'varchar',
    enum: ['streaming', 'embedding', 'immediate'],
  })
  @Index()
  callType!: ExternalAPICallType;

  /** Current status of the API call */
  @Column({
    type: 'varchar',
    enum: ['start', 'update', 'done', 'error', 'cancel'],
  })
  @Index()
  status!: ExternalAPICallStatus;

  /** Request metadata (provider, model, etc.) stored as JSON */
  @Column({ type: 'simple-json' })
  requestMetadata!: RequestMetadata;

  /** Complete request payload (messages, inputs, etc.) stored as JSON */
  @Column({ type: 'simple-json', nullable: true })
  requestPayload?: Record<string, unknown>;

  /** Response content (final for immediate calls, latest for streaming) */
  @Column({ type: 'text', nullable: true })
  responseContent?: string;

  /** Response metadata (duration, usage, etc.) stored as JSON */
  @Column({ type: 'simple-json', nullable: true })
  responseMetadata?: ResponseMetadata;

  /** Error details if status is 'error' */
  @Column({ type: 'simple-json', nullable: true })
  errorDetail?: {
    name: string;
    code: string;
    provider: string;
    message?: string;
  };

  /** Request start timestamp */
  @CreateDateColumn()
  createdAt!: Date;

  /** Last update timestamp (for streaming calls) */
  @UpdateDateColumn()
  updatedAt!: Date;
}
