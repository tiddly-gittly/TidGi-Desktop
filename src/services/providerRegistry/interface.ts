import { ExternalAPIServiceIPCDescriptor } from '@services/externalAPI/interface';
import type {
  AIEmbeddingResponse,
  AIErrorDetail,
  AIGlobalSettings,
  AIImageGenerationResponse,
  AIProvider,
  AIProviderConfig,
  AISpeechResponse,
  AIStreamResponse,
  AITranscriptionResponse,
  IExternalAPIService,
  ModelFeature,
  ModelInfo,
} from '@services/externalAPI/interface';

export type {
  AIEmbeddingResponse,
  AIErrorDetail,
  AIGlobalSettings,
  AIImageGenerationResponse,
  AIProvider,
  AIProviderConfig,
  AISpeechResponse,
  AIStreamResponse,
  AITranscriptionResponse,
  ModelFeature,
  ModelInfo,
};

export type IProviderRegistryService = IExternalAPIService;

export const ProviderRegistryServiceIPCDescriptor = ExternalAPIServiceIPCDescriptor;
