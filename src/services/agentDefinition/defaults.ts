/**
 * Default agent definition helpers.
 *
 * This file MUST NOT import runtime values from 'memeloop' — renderer code
 * imports from it via the @services alias, and a value import would pull the
 * entire memeloop package (libp2p, crypto, Node.js APIs) into the Vite renderer
 * bundle.
 */

/** ID of the built-in agent definition to use as the default when creating a new agent. */
export function getDefaultAgentDefinitionId(): string {
  return 'memeloop:general-assistant';
}
