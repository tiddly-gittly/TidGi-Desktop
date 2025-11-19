import { t } from "@services/libs/i18n/placeholder";

export default {
  providers: [
    {
      provider: 'openai',
      providerClass: 'openai',
      isPreset: true,
      enabled: false,
      models: [
        {
          name: 'gpt-4o',
          caption: 'GPT-4o',
          features: ['language', 'reasoning', 'toolCalling', 'vision'],
        },
        {
          name: 'gpt-4-turbo',
          caption: 'GPT-4 Turbo',
          features: ['language', 'reasoning', 'toolCalling'],
        },
        {
          name: 'gpt-3.5-turbo',
          caption: 'GPT-3.5 Turbo',
          features: ['language'],
        },
        {
          name: 'text-embedding-3-small',
          caption: 'Text Embedding 3 Small',
          features: ['embedding'],
        },
      ],
    },
    {
      provider: 'siliconflow',
      providerClass: 'openAICompatible',
      isPreset: true,
      enabled: true,
      baseURL: 'https://api.siliconflow.cn/v1',
      models: [
        {
          name: 'Qwen/Qwen2.5-7B-Instruct',
          caption: '通义千问 2.5 7B',
          features: ['language', 'reasoning', 'free'],
        },
        {
          name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
          caption: 'DeepSeek-R1',
          features: ['language', 'reasoning'],
        },
        {
          name: 'BAAI/bge-m3',
          caption: 'bge-m3',
          features: ['embedding'],
        },
        {
          name: 'IndexTeam/IndexTTS-2',
          caption: 'IndexTTS-2',
          features: ['speech'],
        },
        {
          name: 'TeleAI/TeleSpeechASR',
          caption: 'TeleSpeechASR',
          features: ['transcriptions'],
        },
      ],
    },
    {
      provider: 'ollama',
      providerClass: 'ollama',
      isPreset: true,
      showBaseURLField: true,
      enabled: false,
      baseURL: 'http://localhost:11434',
      models: [
        {
          name: 'llama3',
          caption: 'Llama 3',
          features: ['language'],
        },
        {
          name: 'phi3',
          caption: 'Phi-3',
          features: ['language'],
        },
        {
          name: 'mistral',
          caption: 'Mistral',
          features: ['language'],
        },
        {
          name: 'gemma',
          caption: 'Gemma',
          features: ['language'],
        },
      ],
    },
    {
      provider: 'deepseek',
      providerClass: 'deepseek',
      isPreset: true,
      enabled: false,
      models: [
        {
          name: 'deepseek-chat',
          caption: 'DeepSeek Chat',
          features: ['language', 'reasoning'],
        },
        {
          name: 'deepseek-coder',
          caption: 'DeepSeek Coder',
          features: ['language', 'reasoning'],
        },
      ],
    },
    {
      provider: 'anthropic',
      providerClass: 'anthropic',
      isPreset: true,
      enabled: false,
      models: [
        {
          name: 'claude-3-opus-20240229',
          caption: 'Claude 3 Opus',
          features: ['language', 'reasoning', 'vision', 'toolCalling'],
        },
        {
          name: 'claude-3-sonnet-20240229',
          caption: 'Claude 3 Sonnet',
          features: ['language', 'reasoning', 'vision'],
        },
        {
          name: 'claude-3-haiku-20240307',
          caption: 'Claude 3 Haiku',
          features: ['language', 'reasoning', 'vision'],
        },
      ],
    },
    {
      provider: 'comfyui',
      providerClass: 'comfyui',
      isPreset: true,
      enabled: false,
      baseURL: 'http://localhost:8188',
      models: [
        {
          name: 'flux',
          caption: 'Flux',
          features: ['imageGeneration'],
        },
      ],
    },
  ],
  defaultConfig: {
    api: {
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-7B-Instruct',
    },
    modelParameters: {
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant.',
      topP: 0.95,
    },
  },
  modelFeatures: [
    {
      value: 'language',
      label: 'Language',
      i18nKey: t('ModelFeature.Language'),
    },
    {
      value: 'reasoning',
      label: 'Reasoning',
      i18nKey: t('ModelFeature.Reasoning'),
    },
    {
      value: 'toolCalling',
      label: 'Tool Calling',
      i18nKey: t('ModelFeature.ToolCalling'),
    },
    {
      value: 'vision',
      label: 'Vision',
      i18nKey: t('ModelFeature.Vision'),
    },
    {
      value: 'imageGeneration',
      label: 'Image Generation',
      i18nKey: t('ModelFeature.ImageGeneration'),
    },
    {
      value: 'embedding',
      label: 'Embedding',
      i18nKey: t('ModelFeature.Embedding'),
    },
    {
      value: 'speech',
      label: 'Speech',
      i18nKey: t('ModelFeature.Speech'),
    },
    {
      value: 'transcriptions',
      label: 'Transcriptions',
      i18nKey: t('ModelFeature.Transcriptions'),
    },
    {
      value: 'free',
      label: 'Free',
      i18nKey: t('ModelFeature.Free'),
    },
  ],
};
