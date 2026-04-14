import type { KnownNodeEntry, NodeStatus, WikiInfo } from '@memeloop/protocol';
import type { AgentInstanceService } from '@services/agentInstance/index';
import { container } from '@services/container';
import type { IGitServerService } from '@services/gitServer/interface';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { inject, injectable } from 'inversify';
import { CloudClient, getDefaultKeypairPath, loadOrCreateNodeKeypair } from 'memeloop-node';
import type { NodeGitHandler, NodeKeypair } from 'memeloop-node';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { firstValueFrom, toArray } from 'rxjs';
import type { CloudNodeWsUrlSource, ICloudDiscoveredNode, ICloudNodeCapabilities, IConnectedPeer, IMemeloopNodeService, IRemoteWiki, NodeIdentityStatus } from './interface';

/** Persisted cloud auth state: JWT tokens + email. */
interface CloudAuthState {
  cloudUrl: string;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Cloud-assigned nodeId after registration (may differ from keypair-derived nodeId). */
  cloudNodeId: string | null;
  /** Secret for nodeId/nodeSecret auth path. */
  nodeSecret: string | null;
}

interface CloudNodeApiCapabilities {
  listenPort?: unknown;
}

interface CloudNodeApiRecord {
  nodeId?: unknown;
  name?: unknown;
  capabilities?: CloudNodeApiCapabilities | null;
  frpAddress?: unknown;
  publicIP?: unknown;
  lastSeen?: unknown;
  status?: unknown;
  x25519PublicKey?: unknown;
  ed25519PublicKey?: unknown;
}

type CloudNodesApiResponse =
  | CloudNodeApiRecord[]
  | { nodes?: CloudNodeApiRecord[] };

type TokenResponse = {
  accessToken: string | null;
  refreshToken: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function isKnownNodeEntry(value: unknown): value is KnownNodeEntry {
  if (!isRecord(value)) return false;

  return (
    typeof value.nodeId === 'string' &&
    typeof value.staticPublicKey === 'string' &&
    isOptionalString(value.name) &&
    typeof value.firstSeen === 'number' &&
    typeof value.lastConnected === 'number' &&
    (value.trustSource === 'pin-pairing' ||
      value.trustSource === 'cloud-registry')
  );
}

function isCloudAuthState(value: unknown): value is CloudAuthState {
  if (!isRecord(value)) return false;

  return (
    typeof value.cloudUrl === 'string' &&
    isOptionalString(value.email) &&
    isOptionalString(value.accessToken) &&
    isOptionalString(value.refreshToken) &&
    isOptionalString(value.cloudNodeId) &&
    isOptionalString(value.nodeSecret)
  );
}

function readTokenResponse(value: unknown): TokenResponse {
  if (!isRecord(value)) {
    return { accessToken: null, refreshToken: null };
  }

  return {
    accessToken: typeof value.accessToken === 'string' ? value.accessToken : null,
    refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : null,
  };
}

const MEMELOOP_DIR = () => path.join(os.homedir(), '.memeloop');
const KNOWN_NODES_PATH = () => path.join(MEMELOOP_DIR(), 'known_nodes.json');
const CLOUD_AUTH_PATH = () => path.join(MEMELOOP_DIR(), 'cloud_auth.json');

/**
 * Memeloop node service that runs unified HTTP+WS server with Git handler.
 * Handles /git/{wikiId}/* by directly calling IGitServerService methods,
 * instead of reverse-proxying to TiddlyWiki HTTP server.
 */
@injectable()
export class MemeloopNode implements IMemeloopNodeService {
  private server: http.Server | null = null;
  private serverPort: number | null = null;
  private nodeId: string | null = null;

  // Set of wikiIds whose git endpoints are currently active
  private registeredWikiIds: Set<string> = new Set();

  // Auth state
  private keypair: NodeKeypair | null = null;
  private cloudAuth: CloudAuthState | null = null;
  private knownNodes: KnownNodeEntry[] = [];

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    this.loadAuthState();
  }

  /** Load keypair + cloud auth + known nodes from disk. */
  private loadAuthState(): void {
    try {
      this.keypair = loadOrCreateNodeKeypair();
    } catch (error) {
      logger.warn('Failed to load/create memeloop keypair', { error });
    }
    this.cloudAuth = this.loadCloudAuth();
    this.knownNodes = this.loadKnownNodes();
  }

  private loadCloudAuth(): CloudAuthState | null {
    try {
      if (!fs.existsSync(CLOUD_AUTH_PATH())) return null;
      const raw = fs.readFileSync(CLOUD_AUTH_PATH(), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isCloudAuthState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private saveCloudAuth(state: CloudAuthState): void {
    try {
      fs.mkdirSync(MEMELOOP_DIR(), { recursive: true });
      fs.writeFileSync(CLOUD_AUTH_PATH(), JSON.stringify(state, null, 2), {
        mode: 0o600,
      });
      try {
        fs.chmodSync(CLOUD_AUTH_PATH(), 0o600);
      } catch {
        /* best effort */
      }
      this.cloudAuth = state;
    } catch (error) {
      logger.warn('Failed to save cloud auth', { error });
    }
  }

  private loadKnownNodes(): KnownNodeEntry[] {
    try {
      if (!fs.existsSync(KNOWN_NODES_PATH())) return [];
      const raw = fs.readFileSync(KNOWN_NODES_PATH(), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isKnownNodeEntry) : [];
    } catch {
      return [];
    }
  }

  private saveKnownNodes(): void {
    try {
      fs.mkdirSync(MEMELOOP_DIR(), { recursive: true });
      fs.writeFileSync(
        KNOWN_NODES_PATH(),
        JSON.stringify(this.knownNodes, null, 2),
      );
    } catch (error) {
      logger.warn('Failed to save known nodes', { error });
    }
  }

  /** Get a CloudClient instance. Throws if no cloudUrl configured. */
  private getCloudClient(): CloudClient {
    const url = this.cloudAuth?.cloudUrl;
    if (!url) throw new Error('Cloud URL not configured');
    return new CloudClient(url);
  }

  /** Refresh the access token using the stored refresh token. */
  private async refreshCloudToken(): Promise<boolean> {
    if (!this.cloudAuth?.refreshToken || !this.cloudAuth.cloudUrl) return false;
    try {
      const response = await fetch(
        `${this.cloudAuth.cloudUrl.replace(/\/$/, '')}/api/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.cloudAuth.refreshToken }),
        },
      );
      if (!response.ok) return false;
      const data = readTokenResponse((await response.json()) as unknown);
      if (!data.accessToken) return false;
      this.saveCloudAuth({
        ...this.cloudAuth,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? this.cloudAuth.refreshToken,
      });
      return true;
    } catch {
      return false;
    }
  }

  private buildCloudApiUrl(apiPath: string): string {
    const cloudUrl = this.cloudAuth?.cloudUrl;
    if (!cloudUrl) throw new Error('Cloud URL not configured');
    return `${cloudUrl.replace(/\/$/, '')}${apiPath}`;
  }

  private async getCloudAccessToken(): Promise<string> {
    let token = this.cloudAuth?.accessToken;
    if (!token) {
      const refreshed = await this.refreshCloudToken();
      if (!refreshed) throw new Error('Not logged in to cloud');
      token = this.cloudAuth?.accessToken ?? null;
    }
    if (!token) throw new Error('Not logged in to cloud');
    return token;
  }

  private async fetchCloudWithRefresh(
    apiPath: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = this.buildCloudApiUrl(apiPath);
    const send = async (token: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(url, {
        ...init,
        headers,
      });
    };

    const token = await this.getCloudAccessToken();
    let response = await send(token);

    if (response.status !== 401) return response;

    const refreshed = await this.refreshCloudToken();
    if (!refreshed || !this.cloudAuth?.accessToken) {
      throw new Error('Authentication expired, please login again');
    }

    response = await send(this.cloudAuth.accessToken);
    if (response.status === 401) {
      throw new Error('Authentication expired, please login again');
    }

    return response;
  }

  private async readCloudError(
    response: Response,
    prefix: string,
  ): Promise<Error> {
    const payload = (await response.json().catch(() => null)) as {
      error?: unknown;
      message?: unknown;
    } | null;
    const details = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.message === 'string'
      ? payload.message
      : `HTTP ${response.status}`;
    return new Error(`${prefix}: ${details}`);
  }

  private asOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private asOptionalNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private normalizeCloudNodeCapabilities(
    capabilities: CloudNodeApiCapabilities | null | undefined,
  ): ICloudNodeCapabilities | null {
    if (!capabilities) return null;
    return {
      listenPort: this.asOptionalNumber(capabilities.listenPort),
    };
  }

  private normalizeFrpWsUrl(frpAddress: string): string | null {
    const trimmed = frpAddress.trim();
    if (!trimmed) return null;

    const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);

    try {
      const parsed = new URL(hasScheme ? trimmed : `ws://${trimmed}`);
      if (!parsed.host) return null;
      const basePath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      const pathWithWs = basePath.endsWith('/ws') ? basePath : `${basePath}/ws`;
      return `ws://${parsed.host}${pathWithWs || '/ws'}`;
    } catch {
      return null;
    }
  }

  private resolveCloudNodeConnection(node: CloudNodeApiRecord): {
    wsUrl: string | null;
    connectable: boolean;
    wsUrlSource: CloudNodeWsUrlSource;
  } {
    const publicIP = this.asOptionalString(node.publicIP);
    const listenPort = this.asOptionalNumber(node.capabilities?.listenPort);
    if (publicIP && listenPort !== null) {
      return {
        wsUrl: `ws://${publicIP}:${listenPort}/ws`,
        connectable: true,
        wsUrlSource: 'public-ip',
      };
    }

    const frpAddress = this.asOptionalString(node.frpAddress);
    if (frpAddress) {
      const wsUrl = this.normalizeFrpWsUrl(frpAddress);
      if (wsUrl) {
        return {
          wsUrl,
          connectable: true,
          wsUrlSource: 'frp-address',
        };
      }
    }

    return {
      wsUrl: null,
      connectable: false,
      wsUrlSource: 'none',
    };
  }

  private mapCloudNode(node: CloudNodeApiRecord): ICloudDiscoveredNode {
    const capabilities = this.normalizeCloudNodeCapabilities(node.capabilities);
    const connection = this.resolveCloudNodeConnection(node);

    return {
      nodeId: this.asOptionalString(node.nodeId) ?? '',
      name: this.asOptionalString(node.name) ?? '',
      capabilities,
      frpAddress: this.asOptionalString(node.frpAddress),
      publicIP: this.asOptionalString(node.publicIP),
      lastSeen: typeof node.lastSeen === 'string' || typeof node.lastSeen === 'number'
        ? node.lastSeen
        : null,
      status: this.asOptionalString(node.status),
      x25519PublicKey: this.asOptionalString(node.x25519PublicKey),
      ed25519PublicKey: this.asOptionalString(node.ed25519PublicKey),
      wsUrl: connection.wsUrl,
      connectable: connection.connectable,
      wsUrlSource: connection.wsUrlSource,
    };
  }

  /**
   * Direct NodeGitHandler: routes /git/{wikiId}/* requests to IGitServerService methods
   * without proxying through TiddlyWiki HTTP server.
   */
  private createGitHandler(): NodeGitHandler {
    return async (request, response, wikiId, pathSuffix, queryString) => {
      // Discovery endpoint: /git/mobile-sync-info
      if (wikiId === 'mobile-sync-info' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ available: true }));
        return;
      }

      // Check if this wikiId is registered
      if (!this.registeredWikiIds.has(wikiId)) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Wiki not found');
        return;
      }

      const gitService = container.get<IGitServerService>(
        serviceIdentifier.GitServer,
      );

      // Route by pathSuffix and method
      if (pathSuffix === 'info/refs' && request.method === 'GET') {
        await this.handleInfoRefs(
          gitService,
          request,
          response,
          wikiId,
          queryString,
        );
      } else if (
        pathSuffix === 'git-upload-pack' &&
        request.method === 'POST'
      ) {
        await this.handleUploadPack(gitService, request, response, wikiId);
      } else if (
        pathSuffix === 'git-receive-pack' &&
        request.method === 'POST'
      ) {
        await this.handleReceivePack(gitService, request, response, wikiId);
      } else if (pathSuffix === 'full-archive' && request.method === 'GET') {
        await this.handleFullArchive(gitService, request, response, wikiId);
      } else if (pathSuffix === 'merge-incoming' && request.method === 'POST') {
        await this.handleMergeIncoming(gitService, response, wikiId);
      } else if (pathSuffix === 'pack-size' && request.method === 'GET') {
        await this.handlePackSize(gitService, response, wikiId);
      } else {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Unknown git endpoint');
      }
    };
  }

  private async handleInfoRefs(
    gitService: IGitServerService,
    _request: http.IncomingMessage,
    response: http.ServerResponse,
    wikiId: string,
    queryString?: string,
  ): Promise<void> {
    const parameters = new URLSearchParams(queryString ?? '');
    const service = parameters.get('service') ?? '';
    if (!['git-upload-pack', 'git-receive-pack'].includes(service)) {
      response.writeHead(400, { 'Content-Type': 'text/plain' });
      response.end('Invalid or missing service parameter');
      return;
    }
    const chunks = await firstValueFrom(
      gitService.gitSmartHTTPInfoRefs$(wikiId, service).pipe(toArray()),
    );
    for (const chunk of chunks) {
      if (chunk.type === 'headers') {
        response.writeHead(chunk.statusCode, chunk.headers);
      } else {
        response.write(Buffer.from(chunk.data));
      }
    }
    response.end();
  }

  private async handleUploadPack(
    gitService: IGitServerService,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    const body = await readRequestBody(request);
    const chunks = await firstValueFrom(
      gitService
        .gitSmartHTTPUploadPack$(wikiId, new Uint8Array(body))
        .pipe(toArray()),
    );
    for (const chunk of chunks) {
      if (chunk.type === 'headers') {
        response.writeHead(chunk.statusCode, chunk.headers);
      } else {
        response.write(Buffer.from(chunk.data));
      }
    }
    response.end();
  }

  private async handleReceivePack(
    gitService: IGitServerService,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    const body = await readRequestBody(request);
    const chunks = await firstValueFrom(
      gitService
        .gitSmartHTTPReceivePack$(wikiId, new Uint8Array(body))
        .pipe(toArray()),
    );
    for (const chunk of chunks) {
      if (chunk.type === 'headers') {
        response.writeHead(chunk.statusCode, chunk.headers);
      } else {
        response.write(Buffer.from(chunk.data));
      }
    }
    response.end();
  }

  private async handleFullArchive(
    gitService: IGitServerService,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    const result = await gitService.generateFullArchive(wikiId);
    if (!result) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Archive not available');
      return;
    }
    const { archivePath, commitHash, sizeBytes } = result;

    // Support HTTP Range requests for resumable downloads
    const rangeHeader = request.headers.range;
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
      if (match) {
        const start = Number.parseInt(match[1], 10);
        const end = match[2] ? Number.parseInt(match[2], 10) : sizeBytes - 1;
        if (start >= sizeBytes || end >= sizeBytes || start > end) {
          response.writeHead(416, {
            'Content-Range': `bytes */${sizeBytes}`,
          });
          response.end();
          return;
        }
        response.writeHead(206, {
          'Content-Type': 'application/x-tar',
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${sizeBytes}`,
          ETag: `"${commitHash}"`,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(archivePath, { start, end }).pipe(response);
        return;
      }
    }

    response.writeHead(200, {
      'Content-Type': 'application/x-tar',
      'Content-Length': String(sizeBytes),
      ETag: `"${commitHash}"`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(archivePath).pipe(response);
  }

  private async handleMergeIncoming(
    gitService: IGitServerService,
    response: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    try {
      await gitService.mergeAfterPush(wikiId);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      logger.error('merge-incoming failed', { wikiId, error });
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Merge failed');
    }
  }

  private async handlePackSize(
    gitService: IGitServerService,
    response: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    try {
      const result = await gitService.generateFullArchive(wikiId);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ estimatedBytes: result?.sizeBytes }));
    } catch {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({}));
    }
  }

  async startServer(port: number): Promise<void> {
    if (this.server) {
      logger.warn('Memeloop node server already running', {
        port: this.serverPort,
      });
      return;
    }

    throw new Error(
      `Desktop memeloop node server startup is not wired to the shared runtime yet (requested port: ${port}).`,
    );
  }

  async stopServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          logger.error('Error stopping memeloop node server', { error });
          reject(error);
        } else {
          logger.info('Memeloop node server stopped');
          this.server = null;
          this.serverPort = null;
          this.nodeId = null;
          resolve();
        }
      });
    });
  }

  async getServerStatus(): Promise<{
    running: boolean;
    port?: number;
    nodeId?: string;
  }> {
    return {
      running: this.server !== null,
      port: this.serverPort ?? undefined,
      nodeId: this.nodeId ?? undefined,
    };
  }

  async registerWikiGitEndpoint(wikiId: string): Promise<void> {
    this.registeredWikiIds.add(wikiId);
    logger.info('Registered wiki Git endpoint', { wikiId });
  }

  async unregisterWikiGitEndpoint(wikiId: string): Promise<void> {
    const removed = this.registeredWikiIds.delete(wikiId);
    if (removed) {
      logger.info('Unregistered wiki Git endpoint', { wikiId });
    }
  }

  async getRegisteredWikis(): Promise<string[]> {
    return [...this.registeredWikiIds];
  }

  private getAgentService(): AgentInstanceService {
    return container.get<AgentInstanceService>(serviceIdentifier.AgentInstance);
  }

  async getConnectedPeers(): Promise<IConnectedPeer[]> {
    try {
      const worker = await this.getAgentService().getMemeLoopWorkerProxy();
      const statuses: NodeStatus[] = await worker.getConnectedPeers();
      return statuses.map((status) => ({
        nodeId: status.identity.nodeId,
        name: status.identity.name,
        type: status.identity.type,
        status: status.status,
      }));
    } catch {
      return [];
    }
  }

  async listRemoteWikis(nodeId: string): Promise<IRemoteWiki[]> {
    try {
      const worker = await this.getAgentService().getMemeLoopWorkerProxy();
      const peers: NodeStatus[] = await worker.getConnectedPeers();
      const peer = peers.find(
        (candidate) => candidate.identity.nodeId === nodeId,
      );
      const wikis: WikiInfo[] = peer?.capabilities.wikis ?? [];
      return wikis.map((wiki) => ({
        nodeId,
        nodeName: peer?.identity.name ?? nodeId,
        wikiId: wiki.wikiId,
        title: wiki.title,
      }));
    } catch {
      return [];
    }
  }

  async listAllRemoteWikis(): Promise<IRemoteWiki[]> {
    const peers = await this.getConnectedPeers();
    const results: IRemoteWiki[] = [];
    for (const peer of peers) {
      try {
        const wikis = await this.listRemoteWikis(peer.nodeId);
        results.push(...wikis);
      } catch {
        // Skip unreachable peers
      }
    }
    return results;
  }

  async listCloudNodes(): Promise<ICloudDiscoveredNode[]> {
    const response = await this.fetchCloudWithRefresh('/api/nodes');
    if (!response.ok) {
      throw await this.readCloudError(response, 'Failed to list cloud nodes');
    }

    const payload = (await response.json()) as CloudNodesApiResponse;
    const nodes = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.nodes)
      ? payload.nodes
      : null;

    if (!nodes) {
      throw new Error('Failed to list cloud nodes: response was not an array');
    }

    return nodes.map((node) => this.mapCloudNode(node));
  }

  async addPeer(wsUrl: string): Promise<{ nodeId: string }> {
    const worker = await this.getAgentService().getMemeLoopWorkerProxy();
    return worker.addPeer(wsUrl);
  }

  async removePeer(nodeId: string): Promise<void> {
    const worker = await this.getAgentService().getMemeLoopWorkerProxy();
    await worker.removePeer(nodeId);
  }

  async syncNow(): Promise<{ synced: boolean; reason?: string }> {
    const worker = await this.getAgentService().getMemeLoopWorkerProxy();
    return worker.syncNow();
  }

  async antiEntropy(): Promise<{ synced: boolean; reason?: string }> {
    const worker = await this.getAgentService().getMemeLoopWorkerProxy();
    return worker.antiEntropy();
  }

  async getSyncStatus(): Promise<{
    versionVector: Record<string, number>;
    peerCount: number;
    syncRunning: boolean;
  }> {
    try {
      const worker = await this.getAgentService().getMemeLoopWorkerProxy();
      return await worker.getSyncStatus();
    } catch {
      return { versionVector: {}, peerCount: 0, syncRunning: false };
    }
  }

  // ── Node identity & keypair ──

  async getIdentityStatus(): Promise<NodeIdentityStatus> {
    return {
      nodeId: this.keypair?.nodeId ?? '',
      hasKeypair: this.keypair !== null,
      cloudUrl: this.cloudAuth?.cloudUrl ?? null,
      cloudLoggedIn: !!this.cloudAuth?.accessToken,
      cloudEmail: this.cloudAuth?.email ?? null,
      cloudNodeRegistered: !!this.cloudAuth?.cloudNodeId,
      knownNodeCount: this.knownNodes.length,
    };
  }

  async regenerateKeypair(): Promise<{ nodeId: string }> {
    const keypairPath = getDefaultKeypairPath();
    // Remove old keypair file to force regeneration
    try {
      fs.unlinkSync(keypairPath);
    } catch {
      /* may not exist */
    }
    this.keypair = loadOrCreateNodeKeypair(keypairPath);
    logger.info('Regenerated memeloop node keypair', {
      nodeId: this.keypair.nodeId,
    });
    return { nodeId: this.keypair.nodeId };
  }

  // ── Cloud auth ──

  async cloudLogin(
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const cloudUrl = this.cloudAuth?.cloudUrl;
    if (!cloudUrl) return { ok: false, error: 'cloud_url_not_configured' };
    try {
      const response = await fetch(
        `${cloudUrl.replace(/\/$/, '')}/api/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        return {
          ok: false,
          error: typeof payload?.error === 'string'
            ? payload.error
            : `HTTP ${response.status}`,
        };
      }
      const data = readTokenResponse((await response.json()) as unknown);
      if (!data.accessToken) return { ok: false, error: 'no_access_token' };
      this.saveCloudAuth({
        cloudUrl,
        email,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        cloudNodeId: this.cloudAuth?.cloudNodeId ?? null,
        nodeSecret: this.cloudAuth?.nodeSecret ?? null,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cloudLogout(): Promise<void> {
    if (!this.cloudAuth) return;
    this.saveCloudAuth({
      ...this.cloudAuth,
      accessToken: null,
      refreshToken: null,
      email: null,
    });
  }

  async setCloudUrl(url: string): Promise<void> {
    const cleaned = url.trim().replace(/\/+$/, '');
    if (!cleaned) throw new Error('Cloud URL cannot be empty');
    this.saveCloudAuth({
      cloudUrl: cleaned,
      email: this.cloudAuth?.email ?? null,
      accessToken: null,
      refreshToken: null,
      cloudNodeId: this.cloudAuth?.cloudNodeId ?? null,
      nodeSecret: this.cloudAuth?.nodeSecret ?? null,
    });
  }

  async getCloudUrl(): Promise<string | null> {
    return this.cloudAuth?.cloudUrl ?? null;
  }

  // ── Node OTP registration ──

  async requestNodeOtp(): Promise<{ otp: string; expiresIn: number }> {
    let token = this.cloudAuth?.accessToken;
    if (!token) {
      const refreshed = await this.refreshCloudToken();
      if (!refreshed) throw new Error('Not logged in to cloud');
      token = this.cloudAuth?.accessToken ?? null;
    }
    if (!token) throw new Error('Not logged in to cloud');
    const cloudUrl = this.cloudAuth!.cloudUrl;
    const response = await fetch(
      `${cloudUrl.replace(/\/$/, '')}/api/nodes/otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.status === 401) {
      // Try refresh once
      const refreshed = await this.refreshCloudToken();
      if (refreshed && this.cloudAuth?.accessToken) {
        const refreshedResponse = await fetch(
          `${cloudUrl.replace(/\/$/, '')}/api/nodes/otp`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.cloudAuth.accessToken}`,
            },
          },
        );
        if (!refreshedResponse.ok) {
          throw new Error(`OTP request failed: ${refreshedResponse.status}`);
        }
        return (await refreshedResponse.json()) as {
          otp: string;
          expiresIn: number;
        };
      }
      throw new Error('Authentication expired, please login again');
    }
    if (!response.ok) throw new Error(`OTP request failed: ${response.status}`);
    return (await response.json()) as { otp: string; expiresIn: number };
  }

  async registerNodeWithOtp(
    otp: string,
  ): Promise<{ nodeId: string; error?: string }> {
    if (!this.keypair) return { nodeId: '', error: 'no_keypair' };
    try {
      const client = this.getCloudClient();
      const result = await client.registerWithOtp(otp, {
        x25519PublicKey: this.keypair.x25519PublicKey,
        ed25519PublicKey: this.keypair.ed25519PublicKey,
      });
      // Persist the cloud-assigned nodeId and secret
      if (this.cloudAuth) {
        this.saveCloudAuth({
          ...this.cloudAuth,
          cloudNodeId: result.nodeId,
          nodeSecret: result.nodeSecret ?? null,
        });
      }
      logger.info('Node registered with cloud', { cloudNodeId: result.nodeId });
      return { nodeId: result.nodeId };
    } catch (error) {
      return {
        nodeId: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Known nodes ──

  async getKnownNodes(): Promise<KnownNodeEntry[]> {
    return [...this.knownNodes];
  }

  async removeKnownNode(nodeId: string): Promise<void> {
    this.knownNodes = this.knownNodes.filter((n) => n.nodeId !== nodeId);
    this.saveKnownNodes();
  }

  // ── PIN pairing ──

  async getLocalPinCode(): Promise<string> {
    if (!this.keypair) throw new Error('No keypair');
    // Derive 6-digit code from SHA256 of X25519 public key
    const hash = createHash('sha256')
      .update(this.keypair.x25519PublicKey)
      .digest('hex');
    return hash.slice(-6).toUpperCase();
  }

  async confirmPeerPin(
    remoteNodeId: string,
    confirmCode: string,
  ): Promise<{ ok: boolean; error?: string }> {
    // Look up the remote node from connected peers
    try {
      const worker = await this.getAgentService().getMemeLoopWorkerProxy();
      const peers: NodeStatus[] = await worker.getConnectedPeers();
      const peer = peers.find(
        (candidate) => candidate.identity.nodeId === remoteNodeId,
      );
      if (!peer) return { ok: false, error: 'peer_not_connected' };

      const existing = this.knownNodes.find(
        (node) => node.nodeId === remoteNodeId,
      );
      const now = Date.now();
      if (existing) {
        existing.lastConnected = now;
      } else {
        this.knownNodes.push({
          nodeId: remoteNodeId,
          staticPublicKey: confirmCode,
          name: peer.identity.name || remoteNodeId,
          firstSeen: now,
          lastConnected: now,
          trustSource: 'pin-pairing',
        });
      }

      this.saveKnownNodes();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Subscription management ──

  async getSubscriptionStatus(): Promise<{
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'expired' | 'cancelled';
    tokenUsed: number;
    tokenTotal: number;
    renewalDate?: string;
    billingHistory: Array<{
      id: string;
      date: string;
      amount: number;
      status: 'paid' | 'pending' | 'failed';
    }>;
  }> {
    let token = this.cloudAuth?.accessToken;
    if (!token) {
      const refreshed = await this.refreshCloudToken();
      if (!refreshed) throw new Error('Not logged in to cloud');
      token = this.cloudAuth?.accessToken ?? null;
    }
    if (!token) throw new Error('Not logged in to cloud');
    const cloudUrl = this.cloudAuth!.cloudUrl;
    const url = `${cloudUrl.replace(/\/$/, '')}/api/subscription/status`;

    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      const refreshed = await this.refreshCloudToken();
      if (refreshed && this.cloudAuth?.accessToken) {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.cloudAuth.accessToken}` },
        });
      } else {
        throw new Error('Authentication expired, please login again');
      }
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch subscription status: ${response.status}`,
      );
    }
    return (await response.json()) as Awaited<
      ReturnType<IMemeloopNodeService['getSubscriptionStatus']>
    >;
  }

  async openBillingPage(): Promise<void> {
    let token = this.cloudAuth?.accessToken;
    if (!token) {
      const refreshed = await this.refreshCloudToken();
      if (!refreshed) throw new Error('Not logged in to cloud');
      token = this.cloudAuth?.accessToken ?? null;
    }
    if (!token) throw new Error('Not logged in to cloud');
    const cloudUrl = this.cloudAuth!.cloudUrl;
    // Request a short-lived billing session URL from the cloud API
    // to avoid leaking the JWT in browser history / URL bar.
    const response = await fetch(
      `${cloudUrl.replace(/\/$/, '')}/api/subscription/billing-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!response.ok) {
      // Fallback: open the billing page without auth (user will need to login in browser)
      const { shell } = await import('electron');
      await shell.openExternal(`${cloudUrl.replace(/\/$/, '')}/billing`);
      return;
    }
    const data = (await response.json()) as { url?: string };
    const billingUrl = data.url ?? `${cloudUrl.replace(/\/$/, '')}/billing`;
    const { shell } = await import('electron');
    await shell.openExternal(billingUrl);
  }
}

function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}
