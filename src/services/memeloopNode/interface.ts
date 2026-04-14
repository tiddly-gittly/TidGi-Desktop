import { MemeloopNodeChannel } from '@/constants/channels';
import type { KnownNodeEntry } from '@memeloop/protocol';
import { ProxyPropertyType } from 'electron-ipc-cat/common';

/** Minimal peer info surfaced to UI. */
export interface IConnectedPeer {
  nodeId: string;
  name: string;
  type: 'desktop' | 'node' | 'mobile';
  status: 'online' | 'offline' | 'unknown';
}

/** A wiki available on a remote node. */
export interface IRemoteWiki {
  nodeId: string;
  nodeName: string;
  wikiId: string;
  title?: string;
}

/** Identity state exposed to UI. */
export interface NodeIdentityStatus {
  nodeId: string;
  hasKeypair: boolean;
  cloudUrl: string | null;
  cloudLoggedIn: boolean;
  cloudEmail: string | null;
  /** Whether the node is registered with the cloud registry. */
  cloudNodeRegistered: boolean;
  knownNodeCount: number;
}

export type CloudNodeWsUrlSource = 'public-ip' | 'frp-address' | 'none';

export interface ICloudNodeCapabilities {
  listenPort: number | null;
}

export interface ICloudDiscoveredNode {
  nodeId: string;
  name: string;
  capabilities: ICloudNodeCapabilities | null;
  frpAddress: string | null;
  publicIP: string | null;
  lastSeen: string | number | null;
  status: string | null;
  x25519PublicKey: string | null;
  ed25519PublicKey: string | null;
  wsUrl: string | null;
  connectable: boolean;
  wsUrlSource: CloudNodeWsUrlSource;
}

export interface IMemeloopNodeService {
  /**
   * Start the memeloop node server with unified HTTP+WS on a single port.
   * Git endpoints at /git/{wikiId}/* are handled directly via IGitServerService.
   */
  startServer(port: number): Promise<void>;

  /**
   * Stop the memeloop node server
   */
  stopServer(): Promise<void>;

  /**
   * Get the current server status
   */
  getServerStatus(): Promise<{
    running: boolean;
    port?: number;
    nodeId?: string;
  }>;

  /**
   * Register a wiki's Git endpoint — marks wikiId as available for /git/{wikiId}/*
   */
  registerWikiGitEndpoint(wikiId: string): Promise<void>;

  /**
   * Unregister a wiki's Git endpoint
   */
  unregisterWikiGitEndpoint(wikiId: string): Promise<void>;

  /**
   * Get all registered wiki IDs
   */
  getRegisteredWikis(): Promise<string[]>;

  /**
   * Get list of connected peers (nodes discovered via mDNS or connected via frp/cloud).
   * Returns empty array until PeerConnectionManager is fully wired.
   */
  getConnectedPeers(): Promise<IConnectedPeer[]>;

  /**
   * Query a remote node for its available wikis via memeloop.wiki.listWikis RPC.
   * Returns empty array if the node is unreachable or RPC not supported.
   */
  listRemoteWikis(nodeId: string): Promise<IRemoteWiki[]>;

  /**
   * List wikis from ALL connected peers in a single call.
   */
  listAllRemoteWikis(): Promise<IRemoteWiki[]>;

  /**
   * List cloud-discovered nodes with a resolved websocket target when available.
   */
  listCloudNodes(): Promise<ICloudDiscoveredNode[]>;

  // ── Peer connection management (delegates to worker's PeerConnectionManager) ──

  /**
   * Connect to a remote memeloop node by WebSocket URL.
   * Returns the nodeId once connected and handshake completes.
   */
  addPeer(wsUrl: string): Promise<{ nodeId: string }>;

  /**
   * Disconnect from a peer node.
   */
  removePeer(nodeId: string): Promise<void>;

  // ── Chat sync controls (delegates to worker's ChatSyncEngine) ──

  /**
   * Trigger an immediate metadata-gossip + message sync with all connected peers.
   */
  syncNow(): Promise<{ synced: boolean; reason?: string }>;

  /**
   * Full anti-entropy sync: reconcile all conversations with all peers.
   */
  antiEntropy(): Promise<{ synced: boolean; reason?: string }>;

  /**
   * Get current sync status: version vector, peer count, whether periodic sync is running.
   */
  getSyncStatus(): Promise<{
    versionVector: Record<string, number>;
    peerCount: number;
    syncRunning: boolean;
  }>;

  // ── Node identity & keypair ──

  /**
   * Get the current node identity status (keypair, cloud registration, known nodes).
   */
  getIdentityStatus(): Promise<NodeIdentityStatus>;

  /**
   * Regenerate the node keypair (X25519 + Ed25519). Dangerous — invalidates all existing peer trust.
   */
  regenerateKeypair(): Promise<{ nodeId: string }>;

  // ── Cloud auth (optional) ──

  /**
   * Login to memeloop cloud with email+password. Stores JWT tokens.
   */
  cloudLogin(
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Logout from memeloop cloud. Clears stored tokens.
   */
  cloudLogout(): Promise<void>;

  /**
   * Set the cloud URL (e.g. https://api.memeloop.dev).
   */
  setCloudUrl(url: string): Promise<void>;

  /**
   * Get the configured cloud URL, or null if not configured.
   */
  getCloudUrl(): Promise<string | null>;

  // ── Node registration (cloud) ──

  /**
   * Request an OTP from the cloud to register this node.
   * Requires the user to be logged in (cloud JWT).
   */
  requestNodeOtp(): Promise<{ otp: string; expiresIn: number }>;

  /**
   * Register this node with cloud using an OTP. Uploads public keys.
   * Returns the cloud-assigned nodeId and nodeSecret.
   */
  registerNodeWithOtp(otp: string): Promise<{ nodeId: string; error?: string }>;

  // ── Known nodes (trust store) ──

  /**
   * Get the list of known (trusted) nodes.
   */
  getKnownNodes(): Promise<KnownNodeEntry[]>;

  /**
   * Remove a trusted node by nodeId. Does not disconnect — only removes trust.
   */
  removeKnownNode(nodeId: string): Promise<void>;

  // ── PIN pairing ──

  /**
   * Get the local PIN confirmation code (derived from this node's public key fingerprint).
   * The remote peer should display the same code for mutual verification.
   */
  getLocalPinCode(): Promise<string>;

  /**
   * Confirm a remote node's PIN code. If it matches, add to known_nodes.
   */
  confirmPeerPin(
    remoteNodeId: string,
    confirmCode: string,
  ): Promise<{ ok: boolean; error?: string }>;

  // ── Subscription management ──

  /**
   * Get subscription status from cloud (plan, token usage, renewal date, billing history).
   */
  getSubscriptionStatus(): Promise<{
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
  }>;

  /**
   * Open billing page in WebView with authentication token.
   */
  openBillingPage(): Promise<void>;
}

export const MemeloopNodeServiceIPCDescriptor = {
  channel: MemeloopNodeChannel.name,
  properties: {
    startServer: ProxyPropertyType.Function,
    stopServer: ProxyPropertyType.Function,
    getServerStatus: ProxyPropertyType.Function,
    registerWikiGitEndpoint: ProxyPropertyType.Function,
    unregisterWikiGitEndpoint: ProxyPropertyType.Function,
    getRegisteredWikis: ProxyPropertyType.Function,
    getConnectedPeers: ProxyPropertyType.Function,
    listRemoteWikis: ProxyPropertyType.Function,
    listAllRemoteWikis: ProxyPropertyType.Function,
    listCloudNodes: ProxyPropertyType.Function,
    addPeer: ProxyPropertyType.Function,
    removePeer: ProxyPropertyType.Function,
    syncNow: ProxyPropertyType.Function,
    antiEntropy: ProxyPropertyType.Function,
    getSyncStatus: ProxyPropertyType.Function,
    getIdentityStatus: ProxyPropertyType.Function,
    regenerateKeypair: ProxyPropertyType.Function,
    cloudLogin: ProxyPropertyType.Function,
    cloudLogout: ProxyPropertyType.Function,
    setCloudUrl: ProxyPropertyType.Function,
    getCloudUrl: ProxyPropertyType.Function,
    requestNodeOtp: ProxyPropertyType.Function,
    registerNodeWithOtp: ProxyPropertyType.Function,
    getKnownNodes: ProxyPropertyType.Function,
    removeKnownNode: ProxyPropertyType.Function,
    getLocalPinCode: ProxyPropertyType.Function,
    confirmPeerPin: ProxyPropertyType.Function,
    getSubscriptionStatus: ProxyPropertyType.Function,
    openBillingPage: ProxyPropertyType.Function,
  },
};
