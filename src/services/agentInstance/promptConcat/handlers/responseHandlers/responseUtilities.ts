/**
 * Response utilities
 *
 * Helper functions for response processing
 */

import { AgentResponse, AgentResponsePart } from '../shared/types';

/**
 * Find a response by ID in the response tree
 *
 * @param responses Array of responses to search
 * @param id Target ID to find
 * @returns Found response object, its parent array, and index
 */
export function findResponseById(
  responses: AgentResponse[] | AgentResponsePart[],
  id: string,
): { response: AgentResponse | AgentResponsePart; parent: (AgentResponse | AgentResponsePart)[]; index: number } | undefined {
  for (let index = 0; index < responses.length; index++) {
    const response = responses[index];
    if (response.id === id) {
      return { response, parent: responses, index };
    }
    if (response.children) {
      const found = findResponseById(response.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}
