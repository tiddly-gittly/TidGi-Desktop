import { logger } from '@services/libs/log';
import fs from 'fs-extra';

import { AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from './errors';
import type { AIImageGenerationResponse, AIProviderConfig } from './interface';

interface ImageGenerationOptions {
  /** Number of images to generate */
  numImages?: number;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
}

/**
 * Generate images using an AI provider
 */
export async function generateImageFromProvider(
  prompt: string,
  config: AiAPIConfig,
  signal: AbortSignal,
  providerConfig?: AIProviderConfig,
  options: ImageGenerationOptions = {},
): Promise<AIImageGenerationResponse> {
  const provider = config.api.provider;
  const model = config.api.imageGenerationModel || config.api.model;

  logger.info(`Using AI image generation provider: ${provider}, model: ${model}`);

  try {
    // Check if API key is required (not for local ComfyUI)
    const isLocalComfyUI = providerConfig?.providerClass === 'comfyui' &&
      providerConfig?.baseURL &&
      (providerConfig.baseURL.includes('localhost') || providerConfig.baseURL.includes('127.0.0.1'));

    if (!providerConfig?.apiKey && !isLocalComfyUI) {
      throw new MissingAPIKeyError(provider);
    }

    // Get base URL and prepare headers
    let baseURL = providerConfig?.baseURL || '';
    const headers: Record<string, string> = {};

    // Set up provider-specific configuration
    switch (providerConfig?.providerClass || provider) {
      case 'comfyui':
        return await generateImageFromComfyUI(prompt, config, signal, providerConfig, options, model, baseURL);
      case 'openai':
        baseURL = 'https://api.openai.com/v1';
        headers['Authorization'] = `Bearer ${providerConfig?.apiKey}`;
        headers['Content-Type'] = 'application/json';
        break;
      case 'openAICompatible':
        if (!providerConfig?.baseURL) {
          throw new MissingBaseURLError(provider);
        }
        baseURL = providerConfig.baseURL;
        headers['Content-Type'] = 'application/json';
        if (providerConfig.apiKey) {
          headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
        }
        break;
      default:
        // For other openai-compatible providers
        if (!providerConfig?.baseURL) {
          throw new MissingBaseURLError(provider);
        }
        baseURL = providerConfig.baseURL;
        headers['Content-Type'] = 'application/json';
        if (providerConfig.apiKey) {
          headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
        }
        break;
    }

    // Prepare request body for OpenAI-style APIs
    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      n: options.numImages || 1,
    };

    if (options.width && options.height) {
      requestBody.size = `${options.width}x${options.height}`;
    }

    // Make the API call
    const response = await fetch(`${baseURL}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Image generation API error', {
        function: 'generateImageFromProvider',
        status: response.status,
        errorText,
      });

      if (response.status === 401) {
        throw new AuthenticationError(provider);
      } else if (response.status === 404) {
        throw new Error(`${provider} error: Model "${model}" not found`);
      } else if (response.status === 429) {
        throw new Error(`${provider} too many requests: Reduce request frequency or check API limits`);
      } else {
        throw new Error(`${provider} image generation error: ${errorText}`);
      }
    }

    const data = await response.json() as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    // Transform to standard format
    const images = data.data.map(item => ({
      data: item.b64_json || item.url || '',
      format: 'png',
    }));

    return {
      requestId: crypto.randomUUID(),
      images,
      model,
      status: 'done' as const,
    };
  } catch (error) {
    logger.error(`${provider} image generation error:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    // Return error response for consistency
    return {
      requestId: crypto.randomUUID(),
      images: [],
      model,
      status: 'error' as const,
      errorDetail: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: 'IMAGE_GENERATION_FAILED',
        provider,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Generate images using ComfyUI
 */
async function generateImageFromComfyUI(
  prompt: string,
  _config: AiAPIConfig,
  signal: AbortSignal,
  providerConfig: AIProviderConfig | undefined,
  _options: ImageGenerationOptions,
  model: string,
  baseURL: string,
): Promise<AIImageGenerationResponse> {
  if (!providerConfig?.baseURL) {
    throw new MissingBaseURLError('comfyui');
  }

  // Get the workflow file path from model parameters
  const modelInfo = providerConfig.models.find(m => m.name === model);
  const workflowPath = modelInfo?.parameters?.workflowPath as string | undefined;

  if (!workflowPath) {
    throw new Error(`ComfyUI model "${model}" requires a workflow file path in parameters.workflowPath`);
  }

  // Read the workflow JSON file
  // Note: This is user-provided configuration data (not sensitive system files)
  // The workflow file contains ComfyUI node configurations and is meant to be sent to the API
  let workflow: Record<string, unknown>;
  try {
    const workflowContent = await fs.readFile(workflowPath, 'utf-8');
    workflow = JSON.parse(workflowContent) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to read workflow file at "${workflowPath}": ${error instanceof Error ? error.message : String(error)}`);
  }

  // Inject the prompt into the workflow
  // This is a simplified approach - actual implementation depends on workflow structure
  // Usually, you need to find the text input node and replace its text
  const modifiedWorkflow = injectPromptIntoWorkflow(workflow, prompt);

  // Queue the prompt
  const queueResponse = await fetch(`${baseURL}/prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: modifiedWorkflow,
      client_id: crypto.randomUUID(),
    }),
    signal,
  });

  if (!queueResponse.ok) {
    const errorText = await queueResponse.text();
    throw new Error(`ComfyUI queue error: ${errorText}`);
  }

  const queueData = await queueResponse.json() as { prompt_id: string };
  const promptId = queueData.prompt_id;

  // Poll for completion
  const images = await pollComfyUICompletion(baseURL, promptId, signal);

  return {
    requestId: crypto.randomUUID(),
    images,
    model,
    promptId,
    status: 'done' as const,
  };
}

/**
 * Inject prompt into ComfyUI workflow
 */
function injectPromptIntoWorkflow(
  workflow: Record<string, unknown>,
  prompt: string,
): Record<string, unknown> {
  const modified = JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;

  // Try to find common prompt nodes
  // This is a heuristic approach - users should configure their workflow appropriately
  for (const [_nodeId, nodeData] of Object.entries(modified)) {
    if (typeof nodeData === 'object' && nodeData !== null) {
      const node = nodeData as Record<string, unknown>;
      const inputs = node.inputs as Record<string, unknown> | undefined;

      if (inputs) {
        // Look for text/prompt inputs
        if ('text' in inputs && typeof inputs.text === 'string') {
          inputs.text = prompt;
        }
        if ('positive' in inputs && typeof inputs.positive === 'string') {
          inputs.positive = prompt;
        }
      }
    }
  }

  return modified;
}

/**
 * Poll ComfyUI for completion and retrieve images
 */
async function pollComfyUICompletion(
  baseURL: string,
  promptId: string,
  signal: AbortSignal,
  maxAttempts = 60,
  interval = 2000,
): Promise<Array<{ data: string; format?: string; width?: number; height?: number }>> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.aborted) {
      throw new Error('Request aborted');
    }

    // Check queue status
    const historyResponse = await fetch(`${baseURL}/history/${promptId}`);
    if (historyResponse.ok) {
      const historyData = await historyResponse.json() as Record<string, unknown>;

      if (promptId in historyData) {
        const promptData = historyData[promptId] as Record<string, unknown>;
        const outputs = promptData.outputs as Record<string, unknown> | undefined;

        if (outputs) {
          // Extract images from outputs
          const images: Array<{ data: string; format?: string; width?: number; height?: number }> = [];

          for (const output of Object.values(outputs)) {
            if (typeof output === 'object' && output !== null) {
              const outputData = output as Record<string, unknown>;
              const imagesList = outputData.images as Array<Record<string, unknown>> | undefined;

              if (imagesList) {
                for (const img of imagesList) {
                  const filename = img.filename as string;
                  const subfolder = img.subfolder as string | undefined;
                  const type = img.type as string | undefined;

                  // Download the image
                  const imageUrl = `${baseURL}/view?filename=${encodeURIComponent(filename)}${subfolder ? `&subfolder=${encodeURIComponent(subfolder)}` : ''}${
                    type ? `&type=${encodeURIComponent(type)}` : ''
                  }`;

                  const imageResponse = await fetch(imageUrl);
                  if (imageResponse.ok) {
                    const imageBlob = await imageResponse.blob();
                    const imageBuffer = await imageBlob.arrayBuffer();
                    const base64 = Buffer.from(imageBuffer).toString('base64');

                    images.push({
                      data: base64,
                      format: filename.split('.').pop() || 'png',
                    });
                  }
                }
              }
            }
          }

          if (images.length > 0) {
            return images;
          }
        }
      }
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`ComfyUI generation timed out after ${maxAttempts * interval / 1000} seconds`);
}
