import fs from 'node:fs';
import path from 'node:path';

import { EMBEDDED_MODEL_CATALOG, fetchModelCatalog, type ModelCatalog, type ModelCatalogModel, parseModelCatalog } from 'memeloop/model-catalog';

import type { AIProviderConfig, ModelFeature, ModelInfo, ProviderCatalogResult } from './interface';

/**
 * Local protocol adapters implemented by TidGi itself are not hosted model
 * vendors and therefore do not belong in models.dev. Keep them as an explicit
 * Desktop extension to the remotely refreshed vendor catalog.
 */
const DESKTOP_LOCAL_PROVIDER_PRESETS: AIProviderConfig[] = [
  {
    provider: 'ollama',
    providerClass: 'ollama',
    isPreset: true,
    enabled: false,
    showBaseURLField: true,
    baseURL: 'http://localhost:11434',
    models: [],
  },
  {
    provider: 'comfyui',
    providerClass: 'comfyui',
    isPreset: true,
    enabled: false,
    showBaseURLField: true,
    baseURL: 'http://localhost:8188',
    models: [
      {
        name: 'flux',
        caption: 'Flux',
        features: ['imageGeneration'],
      },
    ],
  },
];

function modelFeatures(model: ModelCatalogModel): ModelFeature[] {
  const features = new Set<ModelFeature>();
  const inputs = new Set(model.modalities?.input ?? []);
  const outputs = new Set(model.modalities?.output ?? []);
  if (inputs.has('text') && outputs.has('text')) features.add('language');
  if (model.reasoning) features.add('reasoning');
  if (model.toolCall) features.add('toolCalling');
  if (inputs.has('image')) features.add('vision');
  if (outputs.has('image')) features.add('imageGeneration');
  if (outputs.has('audio')) features.add('speech');
  if (inputs.has('audio') && outputs.has('text')) features.add('transcriptions');
  if (/embed/i.test(model.id) || /embed/i.test(model.name)) features.add('embedding');
  return [...features];
}

function providerClass(npmPackage: string | undefined): string {
  if (npmPackage === '@ai-sdk/anthropic') return 'anthropic';
  if (npmPackage === '@ai-sdk/deepseek') return 'deepseek';
  if (npmPackage === '@ai-sdk/google') return 'google';
  if (npmPackage === '@ai-sdk/openai') return 'openai';
  if (npmPackage?.includes('ollama')) return 'ollama';
  return 'openAICompatible';
}

export function modelCatalogToDesktopProviders(catalog: ModelCatalog): AIProviderConfig[] {
  const providers = catalog.providers.map(provider => ({
    provider: provider.id,
    providerClass: providerClass(provider.npm),
    isPreset: true,
    enabled: false,
    ...(provider.api ? { baseURL: provider.api, showBaseURLField: true } : {}),
    models: provider.models
      .filter(model => model.status !== 'deprecated')
      .map<ModelInfo>(model => ({
        name: model.id,
        caption: model.name,
        features: modelFeatures(model),
        contextWindowSize: model.limit?.context,
        maxOutputTokens: model.limit?.output,
        metadata: {
          releaseDate: model.releaseDate,
          lastUpdated: model.lastUpdated,
          status: model.status,
          structuredOutput: model.structuredOutput,
          temperature: model.temperature,
        },
      })),
  }));
  const catalogProviderIds = new Set(providers.map(provider => provider.provider));
  return [
    ...providers,
    ...DESKTOP_LOCAL_PROVIDER_PRESETS
      .filter(provider => !catalogProviderIds.has(provider.provider))
      .map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model })) })),
  ];
}

function loadCache(cachePath: string): ModelCatalog | undefined {
  try {
    return parseModelCatalog(JSON.parse(fs.readFileSync(cachePath, 'utf8')) as unknown);
  } catch {
    return undefined;
  }
}

function saveCache(cachePath: string, catalog: ModelCatalog): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(catalog)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, cachePath);
}

export async function resolveDesktopProviderCatalog(options: {
  cachePath: string;
  refresh?: boolean;
  fetch?: typeof globalThis.fetch;
}): Promise<ProviderCatalogResult> {
  const cached = loadCache(options.cachePath);
  if (options.refresh !== true) {
    const catalog = cached ?? EMBEDDED_MODEL_CATALOG;
    return {
      providers: modelCatalogToDesktopProviders(catalog),
      status: {
        source: cached ? 'cache' : 'embedded',
        catalogVersion: catalog.catalogVersion,
        fetchedAt: catalog.fetchedAt,
      },
    };
  }
  try {
    const catalog = await fetchModelCatalog({ fetch: options.fetch });
    saveCache(options.cachePath, catalog);
    return {
      providers: modelCatalogToDesktopProviders(catalog),
      status: { source: 'remote', catalogVersion: catalog.catalogVersion, fetchedAt: catalog.fetchedAt },
    };
  } catch (error) {
    const catalog = cached ?? EMBEDDED_MODEL_CATALOG;
    return {
      providers: modelCatalogToDesktopProviders(catalog),
      status: {
        source: cached ? 'cache' : 'embedded',
        catalogVersion: catalog.catalogVersion,
        fetchedAt: catalog.fetchedAt,
        refreshError: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
