import { ModelFeature, ModelInfo } from '@services/agent/interface';

export interface ModelOption {
  provider: string;
  model: string;
  caption?: string;
  features?: ModelFeature[];
  groupLabel?: string;
}

// 新模型表单状态
export interface NewModelFormState {
  name: string;
  caption: string;
  features: ModelFeature[];
}

export interface ProviderFormState {
  apiKey: string;
  baseURL: string;
  models: ModelInfo[];
  newModel: NewModelFormState;
  enabled?: boolean;
}
