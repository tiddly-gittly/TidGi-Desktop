import fs from 'fs-extra';
import { generateX25519KeyPairForNoise } from 'memeloop';
import { createNodeRuntime, startNodeServerWithMdns } from 'memeloop-node';
import path from 'path';
import type { ApplicationWorld } from '../stepDefinitions/application';
import { getTestArtifactsPath } from './paths';

type RemoteNodeConfig = {
  providers?: Array<{
    name: string;
    baseUrl: string;
    apiKey?: string;
  }>;
  tools?: {
    allowlist?: string[];
    blocklist?: string[];
  };
};

export interface RemoteMemeloopTestNodeHandle {
  nodeId: string;
  wsUrl: string;
  dataDir: string;
  workspaceDir: string;
  registerTool: (
    id: string,
    impl: (arguments_: Record<string, unknown>) => Promise<unknown>,
  ) => void;
  stop: () => Promise<void>;
}

function buildNodeId(
  world: ApplicationWorld,
  preferredNodeId?: string,
): string {
  if (preferredNodeId && preferredNodeId.trim().length > 0) {
    return preferredNodeId.trim();
  }
  return `remote-node-${world.scenarioSlug}`;
}

export async function startRemoteMemeloopTestNode(
  world: ApplicationWorld,
  options?: {
    nodeId?: string;
    config?: RemoteNodeConfig;
  },
): Promise<RemoteMemeloopTestNodeHandle> {
  const scenarioRoot = getTestArtifactsPath(world);
  const dataDirectory = path.resolve(scenarioRoot, 'remote-node-data');
  const workspaceDirectory = path.resolve(
    scenarioRoot,
    'remote-node-workspace',
  );

  await fs.ensureDir(dataDirectory);
  await fs.ensureDir(workspaceDirectory);

  const nodeId = buildNodeId(world, options?.nodeId);
  const runtimeResult = createNodeRuntime({
    config: {
      name: nodeId,
      providers: options?.config?.providers,
      tools: options?.config?.tools,
    },
    dataDir: dataDirectory,
    fileBaseDir: workspaceDirectory,
  });
  const noiseStaticKeyPair = await generateX25519KeyPairForNoise();
  const server = await startNodeServerWithMdns({
    port: 0,
    nodeId,
    rpcContext: {
      runtime: runtimeResult.runtime,
      storage: runtimeResult.storage,
      wikiManager: runtimeResult.wikiManager,
      toolRegistry: runtimeResult.toolRegistry,
      nodeId,
      mcpServers: [],
      agentDefinitions: runtimeResult.agentDefinitions,
      fileBaseDir: runtimeResult.fileBaseDirResolved,
    },
    serviceName: nodeId,
    noise: { staticKeyPair: noiseStaticKeyPair },
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine remote memeloop test node address.');
  }

  return {
    nodeId,
    wsUrl: `ws://127.0.0.1:${address.port}`,
    dataDir: dataDirectory,
    workspaceDir: workspaceDirectory,
    registerTool: (id, impl) => {
      runtimeResult.toolRegistry.registerTool(id, impl);
    },
    stop: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}
