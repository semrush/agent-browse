/**
 * Interface for context resolvers.
 * Implementations can resolve URL-specific context/instructions from various sources.
 */
export interface IContextResolver {
  /**
   * Resolve context/instructions for a given URL.
   * @param url - The URL to resolve context for
   * @returns Context string or null if no context found
   */
  resolve(url: string): Promise<string | null>;
}
