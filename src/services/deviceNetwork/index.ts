import { app, safeStorage } from 'electron';
import settings from 'electron-settings';
import { inject, injectable } from 'inversify';

import crypto from 'node:crypto';

import { type Device, type DeviceCapabilities, type LocalDeviceIdentity, type MemeLoopProtocol, MemoryDeviceNetworkService, type PairingSession, type SyncResult } from 'memeloop';

import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { isWikiWorkspace, type IWorkspaceService } from '@services/workspaces/interface';

import type { IDeviceNetworkService } from './interface';

const DEVICE_IDENTITY_KEY = 'deviceNetwork.identity.v1';

interface EncryptedIdentityRecord {
  peerId: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  deviceName: string;
  platform: 'desktop';
  createdAt: number;
}

interface DesktopLocalDeviceIdentity extends LocalDeviceIdentity {
  privateKeyPkcs8Base64Url: string;
}

const emptyCapabilities: DeviceCapabilities = {
  tools: [],
  mcpServers: [],
  hasWiki: false,
  imChannels: [],
  wikis: [],
};

@injectable()
export class DeviceNetworkService implements IDeviceNetworkService {
  private core?: MemoryDeviceNetworkService;
  private identity?: DesktopLocalDeviceIdentity;
  private started = false;

  constructor(
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
  ) {}

  public async getLocalIdentity(): Promise<LocalDeviceIdentity> {
    await this.ensureIdentity();
    return this.identity!;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    await this.ensureIdentity();
    this.core = new MemoryDeviceNetworkService({
      identity: this.identity!,
      capabilities: await this.buildCapabilities(),
    });
    await this.core.start();
    this.started = true;
    logger.info('DeviceNetworkService started', { peerId: this.identity!.peerId });
  }

  public async stop(): Promise<void> {
    if (!this.started) return;
    await this.core?.stop();
    this.core = undefined;
    this.started = false;
    logger.info('DeviceNetworkService stopped');
  }

  public async getLocalDevice(): Promise<Device> {
    return this.core!.getLocalDevice();
  }

  public async listDevices(): Promise<Device[]> {
    return this.core!.listDevices();
  }

  public observeDevices(listener: (devices: Device[]) => void): () => void {
    return this.core!.observeDevices(listener);
  }

  public async requestLocalPairing(peerId: string): Promise<PairingSession> {
    return this.core!.requestLocalPairing(peerId);
  }

  public async acceptPairing(sessionId: string): Promise<void> {
    return this.core!.acceptPairing(sessionId);
  }

  public async rejectPairing(sessionId: string): Promise<void> {
    return this.core!.rejectPairing(sessionId);
  }

  public async removeTrustedDevice(peerId: string): Promise<void> {
    return this.core!.removeTrustedDevice(peerId);
  }

  public async openStream(peerId: string, protocol: MemeLoopProtocol): Promise<{
    source: AsyncIterable<Uint8Array>;
    sink(source: AsyncIterable<Uint8Array>): Promise<void>;
    close(): Promise<void>;
  }> {
    return this.core!.openStream(peerId, protocol);
  }

  public async sendRpc<T>(peerId: string, method: string, parameters: unknown): Promise<T> {
    return this.core!.sendRpc(peerId, method, parameters);
  }

  public async syncWithDevice(peerId: string): Promise<SyncResult> {
    return this.core!.syncWithDevice(peerId);
  }

  private async ensureIdentity(): Promise<void> {
    if (this.identity) return;
    const stored = settings.getSync(DEVICE_IDENTITY_KEY) as unknown as EncryptedIdentityRecord | undefined;
    if (stored?.peerId && stored?.publicKeyMultibase && stored?.encryptedPrivateKey) {
      const encrypted = Buffer.from(stored.encryptedPrivateKey, 'base64');
      const privateKeyPkcs8Base64Url = safeStorage.decryptString(encrypted);
      this.identity = {
        peerId: stored.peerId,
        publicKeyMultibase: stored.publicKeyMultibase,
        privateKeyRef: 'local-pkcs8',
        createdAt: stored.createdAt,
        deviceName: stored.deviceName,
        platform: 'desktop',
        privateKeyPkcs8Base64Url,
      };
      return;
    }
    const identity = this.createIdentity();
    await this.saveIdentity(identity);
    this.identity = identity;
  }

  private createIdentity(): DesktopLocalDeviceIdentity {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
    const publicKeyMultibase = `spki:${publicKeyDer.toString('base64url')}`;
    const peerId = `peer:${crypto.createHash('sha256').update(publicKeyDer).digest('base64url')}`;
    return {
      peerId,
      publicKeyMultibase,
      privateKeyRef: 'local-pkcs8',
      createdAt: Date.now(),
      deviceName: app.getName(),
      platform: 'desktop',
      privateKeyPkcs8Base64Url: privateKeyDer.toString('base64url'),
    };
  }

  private async saveIdentity(identity: DesktopLocalDeviceIdentity): Promise<void> {
    const encrypted = safeStorage.encryptString(identity.privateKeyPkcs8Base64Url);
    const record: EncryptedIdentityRecord = {
      peerId: identity.peerId,
      publicKeyMultibase: identity.publicKeyMultibase,
      encryptedPrivateKey: encrypted.toString('base64'),
      deviceName: identity.deviceName,
      platform: 'desktop',
      createdAt: identity.createdAt,
    };
    settings.setSync(DEVICE_IDENTITY_KEY, record as unknown as Parameters<typeof settings.setSync>[1]);
  }

  private async buildCapabilities(): Promise<DeviceCapabilities> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiPaths: Array<{ wikiId: string; title?: string; pathHint?: string }> = [];
    try {
      const workspaces = await workspaceService.getWorkspacesAsList();
      for (const workspace of workspaces) {
        if (isWikiWorkspace(workspace)) {
          wikiPaths.push({
            wikiId: workspace.id ?? workspace.name ?? 'default',
            title: workspace.name,
            pathHint: workspace.wikiFolderLocation,
          });
        }
      }
    } catch (error) {
      logger.warn('DeviceNetworkService failed to collect wiki capabilities', { error });
    }
    return {
      ...emptyCapabilities,
      hasWiki: wikiPaths.length > 0,
      wikis: wikiPaths,
    };
  }
}
