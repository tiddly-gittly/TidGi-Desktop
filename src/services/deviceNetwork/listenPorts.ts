/** Per-profile ports keep locally paired browser clients reachable after restart. */
export interface DeviceNetworkListenPorts {
  tcpPort: number;
  webSocketPort: number;
}

export function readListenPorts(value: unknown): DeviceNetworkListenPorts | undefined {
  if (value === undefined) return undefined;
  const valid = (port: unknown): port is number => Number.isInteger(port) && Number(port) > 0 && Number(port) <= 65_535;
  if (
    !value || typeof value !== 'object' || !('tcpPort' in value) || !('webSocketPort' in value) ||
    !valid(value.tcpPort) || !valid(value.webSocketPort) || value.tcpPort === value.webSocketPort
  ) {
    throw new Error('Invalid saved device-network listen ports');
  }
  return { tcpPort: value.tcpPort, webSocketPort: value.webSocketPort };
}

export function listenAddresses(ports?: DeviceNetworkListenPorts): string[] {
  return [
    `/ip4/0.0.0.0/tcp/${ports?.tcpPort ?? 0}`,
    `/ip4/0.0.0.0/tcp/${ports?.webSocketPort ?? 0}/ws`,
  ];
}

export function boundListenPorts(addresses: readonly string[]): DeviceNetworkListenPorts {
  const ports: Partial<DeviceNetworkListenPorts> = {};
  for (const address of addresses) {
    const match = /^\/ip4\/[^/]+\/tcp\/(\d+)(\/ws)?(?:\/p2p\/[^/]+)?$/u.exec(address);
    if (match) ports[match[2] ? 'webSocketPort' : 'tcpPort'] = Number(match[1]);
  }
  return readListenPorts(ports)!;
}
