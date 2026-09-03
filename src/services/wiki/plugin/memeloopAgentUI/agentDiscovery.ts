interface AgentIdentity {
  id: string;
}

export interface WikiAgentDiscoveryService {
  getAgents(page: number, pageSize: number, filters: { closed: false }): Promise<readonly AgentIdentity[]>;
  createAgent(definitionId: string): Promise<AgentIdentity>;
}

const pendingResolution = new WeakMap<object, Promise<string>>();

/**
 * Resolve the example's default conversation without letting simultaneously
 * mounted full/sidebar widgets create duplicate agents.
 */
export async function resolveWikiAgentId(
  requestedAgentId: string | undefined,
  service: WikiAgentDiscoveryService,
): Promise<string> {
  if (requestedAgentId) return requestedAgentId;
  const inFlight = pendingResolution.get(service);
  if (inFlight) return inFlight;

  const resolution = (async () => {
    const existing = await service.getAgents(1, 1, { closed: false });
    if (existing[0]) return existing[0].id;
    return service.createAgent('memeloop:general-assistant').then(agent => agent.id);
  })();
  pendingResolution.set(service, resolution);
  // Attach both settlement handlers to the derived cleanup promise so a
  // rejected resolution cannot become an unhandled rejection. The original
  // `resolution` is returned unchanged and remains observable to its caller.
  void resolution.then(
    () => {
      if (pendingResolution.get(service) === resolution) pendingResolution.delete(service);
    },
    () => {
      if (pendingResolution.get(service) === resolution) pendingResolution.delete(service);
    },
  );
  return resolution;
}
