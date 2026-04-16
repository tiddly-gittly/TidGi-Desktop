import fs from 'fs-extra';
import { CloudClient } from 'memeloop-node';
import { spawn } from 'node:child_process';
import path from 'path';
import type { ApplicationWorld } from '../stepDefinitions/application';
import { getTestArtifactsPath } from './paths';

const CLOUD_PORT = 43115;
const CLOUD_SERVER_READY_RETRIES = 60;
const CLOUD_SERVER_READY_DELAY_MS = 250;

export const CLOUD_E2E_USER = {
  email: 'cloud-e2e@example.com',
  password: 'cloud-pass-123',
} as const;

export const CLOUD_E2E_NODE = {
  name: 'remote-e2e-node',
} as const;

export interface MemeloopCloudFixtureHandle {
  baseUrl: string;
  userId: string;
  nodeId: string;
  stop: () => Promise<void>;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Failed to decode cloud access token payload.');
  }

  return readJsonObject(
    JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown,
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function buildCloudServerEnvironment(databasePath: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: `sqlite:${databasePath}`,
    JWT_SECRET: 'memeloop-cloud-e2e-secret-32-characters',
    NODE_ENV: 'test',
    PORT: String(CLOUD_PORT),
    HOST: '127.0.0.1',
  };

  delete environment.MEMELOOP_REQUIRE_JWT_SECRET;
  delete environment.NACOS_SERVER_ADDR;

  return environment;
}

async function waitForCloudServerReady(
  baseUrl: string,
  childProcess: ReturnType<typeof spawn>,
  logs: { stdout: string[]; stderr: string[] },
): Promise<void> {
  for (let attempt = 0; attempt < CLOUD_SERVER_READY_RETRIES; attempt++) {
    if (childProcess.exitCode !== null) {
      throw new Error(
        `memeloop-cloud fixture exited early with code ${childProcess.exitCode}. stderr: ${logs.stderr.join('')}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await wait(CLOUD_SERVER_READY_DELAY_MS);
  }

  throw new Error(
    `Timed out waiting for memeloop-cloud fixture at ${baseUrl}. stdout: ${logs.stdout.join('')} stderr: ${logs.stderr.join('')}`,
  );
}

async function ensureCloudE2EUser(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: CLOUD_E2E_USER.email,
      password: CLOUD_E2E_USER.password,
    }),
  });

  if (response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  const errorMessage = typeof payload?.error === 'string' ? payload.error : null;

  if (response.status === 400 && errorMessage === 'email_already_exists') {
    return;
  }

  throw new Error(
    `Failed to seed cloud e2e user: ${errorMessage ?? `HTTP ${response.status}`}`,
  );
}

async function loginCloudE2EUser(baseUrl: string): Promise<{
  accessToken: string;
  userId: string;
}> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: CLOUD_E2E_USER.email,
      password: CLOUD_E2E_USER.password,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to login cloud e2e user: HTTP ${response.status}`);
  }

  const payload = readJsonObject((await response.json()) as unknown);
  const accessToken = readString(payload.accessToken);
  if (!accessToken) {
    throw new Error('Failed to login cloud e2e user: missing access token.');
  }

  const jwtPayload = decodeJwtPayload(accessToken);
  const userId = readString(jwtPayload.userId);
  if (!userId) {
    throw new Error(
      'Failed to login cloud e2e user: missing userId in access token.',
    );
  }

  return { accessToken, userId };
}

async function requestCloudNodeOtp(
  baseUrl: string,
  accessToken: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/nodes/otp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to request cloud node OTP: HTTP ${response.status}`,
    );
  }

  const payload = readJsonObject((await response.json()) as unknown);
  const otp = readString(payload.otp);
  if (!otp) {
    throw new Error('Failed to request cloud node OTP: missing otp.');
  }

  return otp;
}

async function registerCloudDiscoveredNode(
  baseUrl: string,
  options: { remoteNodePort: number },
): Promise<{ userId: string; nodeId: string }> {
  const { accessToken, userId } = await loginCloudE2EUser(baseUrl);
  const otp = await requestCloudNodeOtp(baseUrl, accessToken);
  const cloudClient = new CloudClient(baseUrl);
  const registration = await cloudClient.registerWithOtp(otp);
  const nodeId = readString(registration.nodeId);
  const nodeSecret = readString(registration.nodeSecret);

  if (!nodeId || !nodeSecret) {
    throw new Error(
      'Failed to register cloud-discovered node: missing node credentials.',
    );
  }

  const jwtResult = await cloudClient.getJwt(nodeId, nodeSecret);
  const nodeAccessToken = readString(jwtResult.accessToken);
  if (!nodeAccessToken) {
    throw new Error('Failed to exchange cloud node JWT: missing access token.');
  }

  await cloudClient.registerNode(
    {
      nodeId,
      name: CLOUD_E2E_NODE.name,
      publicIP: '127.0.0.1',
      port: options.remoteNodePort,
    },
    nodeAccessToken,
  );
  await cloudClient.heartbeat(nodeId, nodeAccessToken);

  return { userId, nodeId };
}

export async function startMemeloopCloudFixture(
  world: ApplicationWorld,
  options: {
    remoteNodePort: number;
  },
): Promise<MemeloopCloudFixtureHandle> {
  const scenarioRoot = getTestArtifactsPath(world);
  const cloudDirectory = path.resolve(scenarioRoot, 'memeloop-cloud');
  const databasePath = path.resolve(cloudDirectory, 'memeloop-cloud.sqlite');
  const baseUrl = `http://127.0.0.1:${CLOUD_PORT}`;
  const logs = { stdout: [] as string[], stderr: [] as string[] };

  await fs.ensureDir(cloudDirectory);
  await fs.remove(databasePath);

  const serverEntryPath = path.resolve(
    __dirname,
    '../../../memeloop-cloud/packages/memeloop-cloud/dist/server.js',
  );
  const childProcess = spawn(process.execPath, [serverEntryPath], {
    env: buildCloudServerEnvironment(databasePath),
    stdio: 'pipe',
  });

  childProcess.stdout.on('data', (chunk: Buffer | string) => {
    logs.stdout.push(String(chunk));
  });
  childProcess.stderr.on('data', (chunk: Buffer | string) => {
    logs.stderr.push(String(chunk));
  });

  try {
    await waitForCloudServerReady(baseUrl, childProcess, logs);
    await ensureCloudE2EUser(baseUrl);
    const registration = await registerCloudDiscoveredNode(baseUrl, options);

    let stopped = false;

    return {
      baseUrl,
      userId: registration.userId,
      nodeId: registration.nodeId,
      stop: async () => {
        if (stopped) return;
        stopped = true;

        if (childProcess.exitCode !== null) {
          return;
        }

        childProcess.kill();
        await Promise.race([
          new Promise<void>((resolve) => {
            childProcess.once('exit', () => {
              resolve();
            });
          }),
          wait(3000),
        ]);
      },
    };
  } catch (error) {
    if (childProcess.exitCode === null) {
      childProcess.kill();
    }
    throw error;
  }
}
