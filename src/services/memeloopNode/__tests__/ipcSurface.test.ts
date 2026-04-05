/**
 * Tests that verify the MemeloopNode service IPC descriptor and mock surface
 * are consistent with the interface definition. This ensures the IPC proxy
 * will correctly forward all methods from the renderer to the main process.
 */
import { describe, expect, it } from 'vitest';
import { MemeloopNodeServiceIPCDescriptor } from '@/services/memeloopNode/interface';
import { serviceInstances } from '@/__tests__/__mocks__/services-container';

describe('MemeloopNode IPC surface', () => {
  const descriptorProps = Object.keys(MemeloopNodeServiceIPCDescriptor.properties);
  const mockService = serviceInstances.memeloopNode;

  it('IPC descriptor declares all expected methods', () => {
    const expectedMethods = [
      'startServer',
      'stopServer',
      'getServerStatus',
      'registerWikiGitEndpoint',
      'unregisterWikiGitEndpoint',
      'getRegisteredWikis',
      'getConnectedPeers',
      'listRemoteWikis',
      'listAllRemoteWikis',
      'addPeer',
      'removePeer',
      'syncNow',
      'antiEntropy',
      'getSyncStatus',
      'getIdentityStatus',
      'regenerateKeypair',
      'cloudLogin',
      'cloudLogout',
      'setCloudUrl',
      'getCloudUrl',
      'requestNodeOtp',
      'registerNodeWithOtp',
      'getKnownNodes',
      'removeKnownNode',
      'getLocalPinCode',
      'confirmPeerPin',
      'getSubscriptionStatus',
      'openBillingPage',
    ];

    for (const method of expectedMethods) {
      expect(descriptorProps).toContain(method);
    }
  });

  it('mock service covers all IPC descriptor properties', () => {
    for (const prop of descriptorProps) {
      expect(mockService).toHaveProperty(prop);
    }
  });

  it('getServerStatus mock returns correct shape', async () => {
    const status = await mockService.getServerStatus!();
    expect(status).toHaveProperty('running');
    expect(typeof status.running).toBe('boolean');
  });

  it('getIdentityStatus mock returns correct shape', async () => {
    const identity = await mockService.getIdentityStatus!();
    expect(identity).toHaveProperty('nodeId');
    expect(identity).toHaveProperty('hasKeypair');
    expect(identity).toHaveProperty('cloudUrl');
    expect(identity).toHaveProperty('cloudLoggedIn');
    expect(identity).toHaveProperty('cloudEmail');
    expect(identity).toHaveProperty('cloudNodeRegistered');
    expect(identity).toHaveProperty('knownNodeCount');
  });

  it('getSubscriptionStatus mock returns correct shape', async () => {
    const sub = await mockService.getSubscriptionStatus!();
    expect(sub).toHaveProperty('plan');
    expect(sub).toHaveProperty('status');
    expect(sub).toHaveProperty('tokenUsed');
    expect(sub).toHaveProperty('tokenTotal');
    expect(sub).toHaveProperty('billingHistory');
    expect(Array.isArray(sub.billingHistory)).toBe(true);
  });

  it('getConnectedPeers returns empty array', async () => {
    const peers = await mockService.getConnectedPeers!();
    expect(Array.isArray(peers)).toBe(true);
    expect(peers).toHaveLength(0);
  });

  it('cloudLogin returns ok shape', async () => {
    const result = await mockService.cloudLogin!('test@example.com', 'password');
    expect(result).toHaveProperty('ok');
    expect(result.ok).toBe(true);
  });
});
