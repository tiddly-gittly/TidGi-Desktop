import { z } from 'zod';

/** Valid TCP port range for locally bound services such as the MCP server. */
export const tcpPortSchema = z.number().int().min(1).max(65535);

export const mcpServerPortSchema = tcpPortSchema;

export const proxyUrlSchema = z.string().refine(
  value => value === '' || /^(?:https?|socks4|socks5):\/\/[^ ]+$/i.test(value),
  'Proxy URL must be empty or use http, https, socks4, or socks5',
);

const inheritedProxySchema = z.object({
  useDefault: z.boolean(),
  url: proxyUrlSchema,
});

export const networkProxiesSchema = z.object({
  default: z.object({ url: proxyUrlSchema }),
  wikiBackend: inheritedProxySchema,
  wikiFrontend: inheritedProxySchema,
  git: inheritedProxySchema,
});
