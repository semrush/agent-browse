import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface InstructionSetConfig {
  domains: string[];
}

/**
 * Resolves URL paths to matching instruction files.
 * First matches domain to find instruction set, then uses hierarchical lookup.
 */
export class ContextResolver {
  private instructionsDir: string;
  private cache: Map<string, string | null> = new Map();
  private configCache: Map<string, InstructionSetConfig> | null = null;

  constructor(pluginRoot: string) {
    this.instructionsDir = join(pluginRoot, 'instructions');
  }

  /**
   * Load all instruction set configs from subdirectories.
   */
  private loadConfigs(): Map<string, InstructionSetConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    this.configCache = new Map();

    if (!existsSync(this.instructionsDir)) {
      return this.configCache;
    }

    const entries = readdirSync(this.instructionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const configPath = join(this.instructionsDir, entry.name, '_config.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          if (config.domains && Array.isArray(config.domains)) {
            this.configCache.set(entry.name, config);
          }
        } catch {
          // Skip invalid configs
        }
      }
    }

    return this.configCache;
  }

  /**
   * Check if hostname matches a domain pattern.
   * Supports exact match and wildcard prefix (*.example.com).
   */
  private matchDomain(hostname: string, pattern: string): boolean {
    // Exact match
    if (hostname === pattern) {
      return true;
    }

    // Wildcard match (*.example.com)
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // .example.com
      return hostname.endsWith(suffix) || hostname === pattern.slice(2);
    }

    return false;
  }

  /**
   * Find instruction set folder that matches the hostname.
   */
  private findInstructionSet(hostname: string): string | null {
    const configs = this.loadConfigs();

    for (const [folder, config] of configs) {
      for (const domain of config.domains) {
        if (this.matchDomain(hostname, domain)) {
          return folder;
        }
      }
    }

    return null;
  }

  /**
   * Resolve instructions for a given URL.
   * Returns concatenated markdown from all matching instruction files.
   */
  async resolve(url: string): Promise<string | null> {
    // Check cache first
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    // Parse URL to get hostname and path
    let hostname: string;
    let pathname: string;
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      pathname = parsed.pathname;
    } catch {
      // If not a valid URL, no domain matching possible
      this.cache.set(url, null);
      return null;
    }

    // Find matching instruction set by domain
    const instructionSet = this.findInstructionSet(hostname);
    if (!instructionSet) {
      // No matching domain - no context injection
      this.cache.set(url, null);
      return null;
    }

    const instructions: string[] = [];
    const basePath = instructionSet;

    // Normalize: remove trailing slash, split into segments
    const normalizedPath = pathname.replace(/\/$/, '') || '/';
    const segments = normalizedPath.split('/').filter(Boolean);

    // 1. Always load root _base.md from the matched instruction set
    const rootBase = this.loadFile(join(basePath, '_base.md'));
    if (rootBase) instructions.push(rootBase);

    // 2. Walk path segments and collect instructions
    let currentPath = basePath;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLastSegment = i === segments.length - 1;

      // Check if segment looks like a dynamic ID (number, UUID, hash)
      const isDynamicId = this.isDynamicSegment(segment);

      // Try exact folder first, then wildcard
      const foldersToTry = isDynamicId
        ? ['_dynamic', '*']
        : [segment];

      let matchedFolder: string | null = null;
      for (const folder of foldersToTry) {
        const testPath = join(this.instructionsDir, currentPath, folder);
        if (existsSync(testPath)) {
          matchedFolder = folder;
          break;
        }
      }

      if (matchedFolder) {
        currentPath = join(currentPath, matchedFolder);

        // Load _base.md for this directory
        const sectionBase = this.loadFile(join(currentPath, '_base.md'));
        if (sectionBase) instructions.push(sectionBase);
      } else {
        // No matching folder, try as a file (for last segment)
        if (isLastSegment) {
          const pageFile = this.loadFile(join(currentPath, `${segment}.md`));
          if (pageFile) instructions.push(pageFile);
        }
        // Stop traversing if no folder match
        break;
      }

      // For last segment, also try exact page file
      if (isLastSegment && matchedFolder) {
        // Already in the folder, check for index or exact match
        const indexFile = this.loadFile(join(currentPath, 'index.md'));
        if (indexFile) instructions.push(indexFile);
      }
    }

    // 3. Try exact path match (e.g., /projects/overview.md for /projects/overview)
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      const parentPath = join(basePath, ...segments.slice(0, -1));
      const exactFile = this.loadFile(join(parentPath, `${lastSegment}.md`));
      if (exactFile && !instructions.includes(exactFile)) {
        instructions.push(exactFile);
      }
    }

    // Merge all instructions
    const result = instructions.length > 0
      ? instructions.join('\n\n---\n\n')
      : null;

    // Cache result
    this.cache.set(url, result);

    return result;
  }

  /**
   * Load a file from the instructions directory.
   */
  private loadFile(relativePath: string): string | null {
    const fullPath = join(this.instructionsDir, relativePath);
    if (existsSync(fullPath)) {
      try {
        return readFileSync(fullPath, 'utf-8').trim();
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Check if a URL segment looks like a dynamic ID.
   */
  private isDynamicSegment(segment: string): boolean {
    // Numeric IDs
    if (/^\d+$/.test(segment)) return true;
    // UUIDs
    if (/^[a-f0-9-]{36}$/i.test(segment)) return true;
    // Short hashes (8+ hex chars)
    if (/^[a-f0-9]{8,}$/i.test(segment)) return true;
    // MongoDB ObjectIds (24 hex chars)
    if (/^[a-f0-9]{24}$/i.test(segment)) return true;
    return false;
  }

  /**
   * Clear the cache (useful for development/hot-reload).
   */
  clearCache(): void {
    this.cache.clear();
    this.configCache = null;
  }

  /**
   * Format instructions for injection into prompts.
   */
  formatForPrompt(instructions: string, currentUrl: string): string {
    return `## Page Context

**Current URL**: ${currentUrl}

${instructions}

---

## Task`;
  }
}
