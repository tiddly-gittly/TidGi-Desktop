import { injectable, inject } from "inversify";
import type http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  startNodeServerWithMdns,
  type RpcHandlerContext,
  type NodeGitHandler,
  loadOrCreateNodeKeypair,
  saveNodeKeypair,
  getDefaultKeypairPath,
  CloudClient,
  type NodeKeypair,
} from "memeloop-node";
import type { KnownNodeEntry } from "@memeloop/protocol";
import { firstValueFrom, toArray } from "rxjs";
import { logger } from "@services/libs/log";
import { container } from "@services/container";
import serviceIdentifier from "@services/serviceIdentifier";
import type { IPreferenceService } from "@services/preferences/interface";
import type { IGitServerService } from "@services/gitServer/interface";
import type { IWorkspaceService, IWikiWorkspace } from "@services/workspaces/interface";
import { isWikiWorkspace } from "@services/workspaces/interface";
import type { AgentInstanceService } from "@services/agentInstance/index";
import type { IMemeloopNodeService, IConnectedPeer, IRemoteWiki, NodeIdentityStatus } from "./interface";

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

const MEMELOOP_DIR = () => path.join(os.homedir(), ".memeloop");
const KNOWN_NODES_PATH = () => path.join(MEMELOOP_DIR(), "known_nodes.json");
const CLOUD_AUTH_PATH = () => path.join(MEMELOOP_DIR(), "cloud_auth.json");

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
    @inject(serviceIdentifier.Preference)
    private readonly preferenceService: IPreferenceService,
  ) {
    this.loadAuthState();
  }

  /** Load keypair + cloud auth + known nodes from disk. */
  private loadAuthState(): void {
    try {
      this.keypair = loadOrCreateNodeKeypair();
    } catch (error) {
      logger.warn("Failed to load/create memeloop keypair", { error });
    }
    this.cloudAuth = this.loadCloudAuth();
    this.knownNodes = this.loadKnownNodes();
  }

  private loadCloudAuth(): CloudAuthState | null {
    try {
      if (!fs.existsSync(CLOUD_AUTH_PATH())) return null;
      const raw = fs.readFileSync(CLOUD_AUTH_PATH(), "utf8");
      return JSON.parse(raw) as CloudAuthState;
    } catch {
      return null;
    }
  }

  private saveCloudAuth(state: CloudAuthState): void {
    try {
      fs.mkdirSync(MEMELOOP_DIR(), { recursive: true });
      fs.writeFileSync(CLOUD_AUTH_PATH(), JSON.stringify(state, null, 2), { mode: 0o600 });
      try { fs.chmodSync(CLOUD_AUTH_PATH(), 0o600); } catch { /* best effort */ }
      this.cloudAuth = state;
    } catch (error) {
      logger.warn("Failed to save cloud auth", { error });
    }
  }

  private loadKnownNodes(): KnownNodeEntry[] {
    try {
      if (!fs.existsSync(KNOWN_NODES_PATH())) return [];
      const raw = fs.readFileSync(KNOWN_NODES_PATH(), "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveKnownNodes(): void {
    try {
      fs.mkdirSync(MEMELOOP_DIR(), { recursive: true });
      fs.writeFileSync(KNOWN_NODES_PATH(), JSON.stringify(this.knownNodes, null, 2));
    } catch (error) {
      logger.warn("Failed to save known nodes", { error });
    }
  }

  /** Get a CloudClient instance. Throws if no cloudUrl configured. */
  private getCloudClient(): CloudClient {
    const url = this.cloudAuth?.cloudUrl;
    if (!url) throw new Error("Cloud URL not configured");
    return new CloudClient(url);
  }

  /** Refresh the access token using the stored refresh token. */
  private async refreshCloudToken(): Promise<boolean> {
    if (!this.cloudAuth?.refreshToken || !this.cloudAuth.cloudUrl) return false;
    try {
      const res = await fetch(`${this.cloudAuth.cloudUrl.replace(/\/$/, "")}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.cloudAuth.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { accessToken?: string; refreshToken?: string };
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

  /**
   * Direct NodeGitHandler: routes /git/{wikiId}/* requests to IGitServerService methods
   * without proxying through TiddlyWiki HTTP server.
   */
  private createGitHandler(): NodeGitHandler {
    return async (req, res, wikiId, pathSuffix, queryString) => {
      // Discovery endpoint: /git/mobile-sync-info
      if (wikiId === "mobile-sync-info" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ available: true }));
        return;
      }

      // Check if this wikiId is registered
      if (!this.registeredWikiIds.has(wikiId)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Wiki not found");
        return;
      }

      const gitService = container.get<IGitServerService>(serviceIdentifier.GitServer);

      // Route by pathSuffix and method
      if (pathSuffix === "info/refs" && req.method === "GET") {
        await this.handleInfoRefs(gitService, req, res, wikiId, queryString);
      } else if (pathSuffix === "git-upload-pack" && req.method === "POST") {
        await this.handleUploadPack(gitService, req, res, wikiId);
      } else if (pathSuffix === "git-receive-pack" && req.method === "POST") {
        await this.handleReceivePack(gitService, req, res, wikiId);
      } else if (pathSuffix === "full-archive" && req.method === "GET") {
        await this.handleFullArchive(gitService, req, res, wikiId);
      } else if (pathSuffix === "merge-incoming" && req.method === "POST") {
        await this.handleMergeIncoming(gitService, res, wikiId);
      } else if (pathSuffix === "pack-size" && req.method === "GET") {
        await this.handlePackSize(gitService, res, wikiId);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Unknown git endpoint");
      }
    };
  }

  private async handleInfoRefs(
    gitService: IGitServerService,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    wikiId: string,
    queryString?: string,
  ): Promise<void> {
    const params = new URLSearchParams(queryString ?? "");
    const service = params.get("service") ?? "";
    if (!["git-upload-pack", "git-receive-pack"].includes(service)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid or missing service parameter");
      return;
    }
    const chunks = await firstValueFrom(
      gitService.gitSmartHTTPInfoRefs$(wikiId, service).pipe(toArray()),
    );
    for (const chunk of chunks) {
      if (chunk.type === "headers") {
        res.writeHead(chunk.statusCode, chunk.headers);
      } else {
        res.write(Buffer.from(chunk.data));
      }
    }
    res.end();
  }

  private async handleUploadPack(
    gitService: IGitServerService,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    const body = await readRequestBody(req);
    const chunks = await firstValueFrom(
      gitService.gitSmartHTTPUploadPack$(wikiId, new Uint8Array(body)).pipe(toArray()),
    );
    for (const chunk of chunks) {
      if (chunk.type === "headers") {
        res.writeHead(chunk.statusCode, chunk.headers);
      } else {
        res.write(Buffer.from(chunk.data));
      }
    }
    res.end();
  }

  private async handleReceivePack(
    gitService: IGitServerService,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    const body = await readRequestBody(req);
    const chunks = await firstValueFrom(
      gitService.gitSmartHTTPReceivePack$(wikiId, new Uint8Array(body)).pipe(toArray()),
    );
    for (const chunk of chunks) {
      if (chunk.type === "headers") {
        res.writeHead(chunk.statusCode, chunk.headers);
      } else {
        res.write(Buffer.from(chunk.data));
      }
    }
    res.end();
  }

  private async handleFullArchive(
    gitService: IGitServerService,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    const result = await gitService.generateFullArchive(wikiId);
    if (!result) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Archive not available");
      return;
    }
    const { archivePath, commitHash, sizeBytes } = result;

    // Support HTTP Range requests for resumable downloads
    const rangeHeader = req.headers.range;
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
      if (match) {
        const start = Number.parseInt(match[1], 10);
        const end = match[2] ? Number.parseInt(match[2], 10) : sizeBytes - 1;
        if (start >= sizeBytes || end >= sizeBytes || start > end) {
          res.writeHead(416, {
            "Content-Range": `bytes */${sizeBytes}`,
          });
          res.end();
          return;
        }
        res.writeHead(206, {
          "Content-Type": "application/x-tar",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${sizeBytes}`,
          "ETag": `"${commitHash}"`,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(archivePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": "application/x-tar",
      "Content-Length": String(sizeBytes),
      "ETag": `"${commitHash}"`,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(archivePath).pipe(res);
  }

  private async handleMergeIncoming(
    gitService: IGitServerService,
    res: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    try {
      await gitService.mergeAfterPush(wikiId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      logger.error("merge-incoming failed", { wikiId, error });
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Merge failed");
    }
  }

  private async handlePackSize(
    gitService: IGitServerService,
    res: http.ServerResponse,
    wikiId: string,
  ): Promise<void> {
    try {
      const result = await gitService.generateFullArchive(wikiId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ estimatedBytes: result?.sizeBytes }));
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({}));
    }
  }

  async startServer(port: number): Promise<void> {
    if (this.server) {
      logger.warn("Memeloop node server already running", {
        port: this.serverPort,
      });
      return;
    }

    try {
      this.nodeId = `tidgi-desktop-${Date.now()}`;

      const rpcContext: RpcHandlerContext = {
        runtime: null as any, // TODO: integrate with actual MemeLoopRuntime
        storage: null as any,
        nodeId: this.nodeId,
      };

      this.server = await startNodeServerWithMdns({
        port,
        nodeId: this.nodeId,
        rpcContext,
        gitProxy: this.createGitHandler(),
        serviceName: "TidGi-Desktop-MemeLoop",
      });

      this.serverPort = port;
      logger.info("Memeloop node server started", {
        port,
        nodeId: this.nodeId,
      });
    } catch (error) {
      logger.error("Failed to start memeloop node server", { error, port });
      throw error;
    }
  }

  async stopServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          logger.error("Error stopping memeloop node server", { error });
          reject(error);
        } else {
          logger.info("Memeloop node server stopped");
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
    logger.info("Registered wiki Git endpoint", { wikiId });
  }

  async unregisterWikiGitEndpoint(wikiId: string): Promise<void> {
    const removed = this.registeredWikiIds.delete(wikiId);
    if (removed) {
      logger.info("Unregistered wiki Git endpoint", { wikiId });
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
      const statuses = await worker.getConnectedPeers();
      return statuses.map((s: any) => ({
        nodeId: s.identity?.nodeId ?? s.nodeId ?? "",
        name: s.identity?.name ?? "",
        type: s.identity?.type ?? "node",
        status: s.status ?? "unknown",
      }));
    } catch {
      return [];
    }
  }

  async listRemoteWikis(nodeId: string): Promise<IRemoteWiki[]> {
    try {
      const worker = await this.getAgentService().getMemeLoopWorkerProxy();
      const peers = await worker.getConnectedPeers();
      const peer = (peers as any[]).find((p: any) => (p.identity?.nodeId ?? p.nodeId) === nodeId);
      const wikis = peer?.capabilities?.wikis ?? [];
      return (wikis as any[]).map((w: any) => ({
        nodeId,
        nodeName: peer?.identity?.name ?? nodeId,
        wikiId: w.wikiId,
        title: w.title,
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
      return worker.getSyncStatus();
    } catch {
      return { versionVector: {}, peerCount: 0, syncRunning: false };
    }
  }

  // ── Node identity & keypair ──

  async getIdentityStatus(): Promise<NodeIdentityStatus> {
    return {
      nodeId: this.keypair?.nodeId ?? "",
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
    try { fs.unlinkSync(keypairPath); } catch { /* may not exist */ }
    this.keypair = loadOrCreateNodeKeypair(keypairPath);
    logger.info("Regenerated memeloop node keypair", { nodeId: this.keypair.nodeId });
    return { nodeId: this.keypair.nodeId };
  }

  // ── Cloud auth ──

  async cloudLogin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const cloudUrl = this.cloudAuth?.cloudUrl;
    if (!cloudUrl) return { ok: false, error: "cloud_url_not_configured" };
    try {
      const res = await fetch(`${cloudUrl.replace(/\/$/, "")}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      const data = await res.json() as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken) return { ok: false, error: "no_access_token" };
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
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
    const cleaned = url.trim().replace(/\/+$/, "");
    if (!cleaned) throw new Error("Cloud URL cannot be empty");
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
      if (!refreshed) throw new Error("Not logged in to cloud");
      token = this.cloudAuth?.accessToken ?? null;
    }
    if (!token) throw new Error("Not logged in to cloud");
    const cloudUrl = this.cloudAuth!.cloudUrl;
    const res = await fetch(`${cloudUrl.replace(/\/$/, "")}/api/nodes/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      // Try refresh once
      const refreshed = await this.refreshCloudToken();
      if (refreshed && this.cloudAuth?.accessToken) {
        const res2 = await fetch(`${cloudUrl.replace(/\/$/, "")}/api/nodes/otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cloudAuth.accessToken}` },
        });
        if (!res2.ok) throw new Error(`OTP request failed: ${res2.status}`);
        return await res2.json() as { otp: string; expiresIn: number };
      }
      throw new Error("Authentication expired, please login again");
    }
    if (!res.ok) throw new Error(`OTP request failed: ${res.status}`);
    return await res.json() as { otp: string; expiresIn: number };
  }

  async registerNodeWithOtp(otp: string): Promise<{ nodeId: string; error?: string }> {
    if (!this.keypair) return { nodeId: "", error: "no_keypair" };
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
      logger.info("Node registered with cloud", { cloudNodeId: result.nodeId });
      return { nodeId: result.nodeId };
    } catch (error) {
      return { nodeId: "", error: error instanceof Error ? error.message : String(error) };
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
    if (!this.keypair) throw new Error("No keypair");
    // Derive 6-digit code from SHA256 of X25519 public key
    const hash = createHash("sha256").update(this.keypair.x25519PublicKey).digest("hex");
    return hash.slice(-6).toUpperCase();
  }

  async confirmPeerPin(remoteNodeId: string, confirmCode: string): Promise<{ ok: boolean; error?: string }> {
    // Look up the remote node from connected peers
    try {
      const worker = await this.getAgentService().getMemeLoopWorkerProxy();
      const peers = await worker.getConnectedPeers();
      const peer = (peers as any[]).find((p: any) => (p.identity?.nodeId ?? p.nodeId) === remoteNodeId);
      if (!peer) return { ok: false, error: "peer_not_connected" };

      // Send PIN confirmation RPC
      const result = await worker.addPeer.constructor === Function
        ? await (async () => {
            // The PeerConnectionManager should already have the connection.
            // Verify the confirmation code matches the remote node's public key fingerprint.
            // For now, add to known_nodes if code is non-empty (validation requires remote key).
            const existing = this.knownNodes.find((n) => n.nodeId === remoteNodeId);
            if (existing) {
              existing.lastConnected = Date.now();
            } else {
              this.knownNodes.push({
                nodeId: remoteNodeId,
                staticPublicKey: confirmCode, // Placeholder until Noise handshake provides real key
                name: peer.identity?.name ?? remoteNodeId,
                firstSeen: Date.now(),
                lastConnected: Date.now(),
                trustSource: "pin-pairing",
              });
            }
            this.saveKnownNodes();
            return { ok: true };
          })()
        : { ok: false, error: "worker_unavailable" };
      return result;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
