#!/usr/bin/env node
import { Stagehand } from '@browserbasehq/stagehand';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findLocalChrome, prepareChromeProfile, takeScreenshot } from './browser-utils.js';
import { FileContextResolver } from './context-resolver/index.js';
import { z } from 'zod';
import dotenv from 'dotenv';

// Validate ES module environment
if (!import.meta.url) {
  console.error('Error: This script must be run as an ES module');
  console.error('Ensure your package.json has "type": "module" and Node.js version is 14+');
  process.exit(1);
}

// Resolve plugin root directory from script location
// Handles both: src/cli.ts (dev) and dist/src/cli.js (prod)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDevMode = __dirname.endsWith('/src') && !__dirname.includes('/dist/');
const PLUGIN_ROOT = isDevMode
  ? resolve(__dirname, '..')      // src/cli.ts -> src -> plugin-root
  : resolve(__dirname, '..', '..'); // dist/src/cli.js -> dist/src -> dist -> plugin-root

// Project directory for per-project browser isolation
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Load .env from plugin root directory
dotenv.config({ path: join(PLUGIN_ROOT, '.env'), quiet: true });

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not found.');
  console.error('\nTo set up your API key, choose one option:');
  console.error('  1. (RECOMMENDED) Export in terminal: export ANTHROPIC_API_KEY="your-api-key"');
  console.error('  2. Create a .env file: cp .env.example .env');
  console.error('     Then edit .env and add your API key');
  process.exit(1);
}

// Persistent browser state
let stagehandInstance: Stagehand | null = null;
let currentPage: any = null;
let chromeProcess: ChildProcess | null = null;
let weStartedChrome = false; // Track if we launched Chrome vs. reused existing

// Profile configuration (set in main, used by initBrowser)
let profileConfig: {
  userDataDir: string;
  profileDirectory?: string;
  isCustomProfile: boolean;
} | null = null;

// Context resolver for domain-specific instructions
const contextResolver = new FileContextResolver(PLUGIN_ROOT);
const CONTEXT_INJECTION_ENABLED = process.env.BROWSER_CONTEXT_INJECTION !== 'false';

// Original custom profile path (for port calculation)
let customProfileSource: string | null = null;

// Session port (loaded from file or calculated)
let cachedSessionPort: number | null = null;

// Port file path for session persistence
const PORT_FILE_PATH = join(PROJECT_DIR, '.browser-port');

// Generate deterministic port from project + profile for concurrent session support
function calculateSessionPort(): number {
  // Combine project dir and original profile path for unique port per profile
  const uniqueKey = [
    PROJECT_DIR,
    customProfileSource || ''
  ].join('|');

  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) {
    hash = ((hash << 5) - hash) + uniqueKey.charCodeAt(i);
    hash = hash & hash;
  }
  return 9222 + (Math.abs(hash) % 10000);
}

// Get session port - reads from file if exists, otherwise calculates
function getSessionPort(): number {
  // Return cached port if already loaded
  if (cachedSessionPort !== null) {
    return cachedSessionPort;
  }

  // Try to read port from file (for subsequent commands in same session)
  if (existsSync(PORT_FILE_PATH)) {
    try {
      const portData = JSON.parse(readFileSync(PORT_FILE_PATH, 'utf8'));
      if (portData.port && typeof portData.port === 'number') {
        cachedSessionPort = portData.port;
        return portData.port;
      }
    } catch {
      // Ignore read errors, will calculate new port
    }
  }

  // Calculate new port
  cachedSessionPort = calculateSessionPort();
  return cachedSessionPort;
}

// Save session port to file for subsequent commands
function saveSessionPort(port: number): void {
  writeFileSync(PORT_FILE_PATH, JSON.stringify({
    port,
    profile: customProfileSource || null,
    timestamp: Date.now()
  }));
}

async function initBrowser() {
  if (stagehandInstance) {
    return { stagehand: stagehandInstance, page: currentPage };
  }

  if (!profileConfig) {
    throw new Error('Profile config not initialized. Call prepareChromeProfile first.');
  }

  const chromePath = findLocalChrome();
  if (!chromePath) {
    throw new Error('Could not find Chrome installation');
  }

  const cdpPort = getSessionPort();

  // Check if Chrome is already running on the CDP port
  let chromeReady = false;
  try {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (response.ok) {
      chromeReady = true;
      console.error('Reusing existing Chrome instance on port', cdpPort);
    }
  } catch (error) {
    // Chrome not running, need to launch it
  }

  // Launch Chrome if not already running
  if (!chromeReady) {
    const chromeArgs = [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileConfig.userDataDir}`,
      '--window-position=-9999,-9999', // Launch minimized off-screen
      '--window-size=1250,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-infobars',
      '--disable-sync',
    ];

    // Add profile-directory flag if using a custom profile
    if (profileConfig.profileDirectory) {
      chromeArgs.push(`--profile-directory=${profileConfig.profileDirectory}`);
    }

    // Only disable extensions for isolated profiles (not custom user profiles)
    if (!profileConfig.isCustomProfile) {
      chromeArgs.push('--disable-extensions');
    }

    chromeProcess = spawn(chromePath, chromeArgs, {
      stdio: 'ignore', // Ignore stdio to prevent pipe buffer blocking
      detached: false,
    });

    // Store PID for safe cleanup later
    if (chromeProcess.pid) {
      const pidFilePath = join(PROJECT_DIR, '.chrome-pid');
      writeFileSync(pidFilePath, JSON.stringify({
        pid: chromeProcess.pid,
        startTime: Date.now()
      }));
    }

    // Wait for Chrome to be ready (up to 30 seconds for first launch with large profiles)
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (response.ok) {
          chromeReady = true;
          weStartedChrome = true; // Mark that we started this Chrome instance
          break;
        }
      } catch (error) {
        // Still waiting
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!chromeReady) {
      throw new Error('Chrome failed to start');
    }

    // Save port to file for subsequent commands
    saveSessionPort(cdpPort);
  }

  // Initialize Stagehand
  const rawVerbose = parseInt(process.env.STAGEHAND_VERBOSE || '0', 10);
  const verboseLevel = Math.min(2, Math.max(0, rawVerbose)) as 0 | 1 | 2;
  stagehandInstance = new Stagehand({
    env: "LOCAL",
    verbose: verboseLevel,
    modelName: "anthropic/claude-haiku-4-5-20251001",
    localBrowserLaunchOptions: {
      cdpUrl: `http://localhost:${cdpPort}`,
    },
  });

  await stagehandInstance.init();
  currentPage = stagehandInstance.page;

  // Wait for page to be ready
  let retries = 0;
  while (retries < 30) {
    try {
      await currentPage.evaluate('document.readyState');
      break;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }
  }

  // Configure downloads to project directory
  const downloadsPath = join(PROJECT_DIR, '.browser-downloads');
  if (!existsSync(downloadsPath)) {
    mkdirSync(downloadsPath, { recursive: true });
  }

  const context = currentPage.context();
  const client = await context.newCDPSession(currentPage);
  await client.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadsPath,
    eventsEnabled: true,
  });

  return { stagehand: stagehandInstance, page: currentPage };
}

async function closeBrowser() {
  const cdpPort = getSessionPort();
  const pidFilePath = join(PROJECT_DIR, '.chrome-pid');

  // First, try to close via Stagehand if we have an instance in this process
  if (stagehandInstance) {
    try {
      await stagehandInstance.close();
    } catch (error) {
      console.error('Error closing Stagehand:', error instanceof Error ? error.message : String(error));
    }
    stagehandInstance = null;
    currentPage = null;
  }

  // If we started Chrome in this process, kill it
  if (chromeProcess && weStartedChrome) {
    try {
      chromeProcess.kill('SIGTERM');
      // Wait briefly for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (chromeProcess.exitCode === null) {
        chromeProcess.kill('SIGKILL');
      }
    } catch (error) {
      console.error('Error killing Chrome process:', error instanceof Error ? error.message : String(error));
    }
    chromeProcess = null;
    weStartedChrome = false;
  }

  // For separate CLI invocations, use graceful CDP shutdown + PID file verification
  try {
    // Step 1: Try graceful shutdown via CDP
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, {
      signal: AbortSignal.timeout(2000)
    });

    if (response.ok) {
      // Connect and close gracefully via Stagehand
      const tempStagehand = new Stagehand({
        env: "LOCAL",
        verbose: 0,
        modelName: "anthropic/claude-haiku-4-5-20251001",
        localBrowserLaunchOptions: {
          cdpUrl: `http://localhost:${cdpPort}`,
        },
      });
      await tempStagehand.init();
      await tempStagehand.close();

      // Wait briefly for Chrome to close
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Check if Chrome is still running
      try {
        const checkResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, {
          signal: AbortSignal.timeout(1000)
        });

        // Chrome is still running, need to force close
        if (checkResponse.ok) {
          // Step 3: Use PID file if available for safe termination
          if (existsSync(pidFilePath)) {
            const pidData = JSON.parse(readFileSync(pidFilePath, 'utf8'));
            const { pid } = pidData;

            // Verify the process is actually Chrome before killing
            const isChrome = await verifyIsChromeProcess(pid);
            if (isChrome) {
              if (process.platform === 'win32') {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                await execAsync(`taskkill /PID ${pid} /F`);
              } else {
                process.kill(pid, 'SIGKILL');
              }
            }
          }
        }
      } catch {
        // Chrome successfully closed
      }
    }
  } catch (error) {
    // Chrome not running or already closed
  } finally {
    // Clean up PID file and port file
    if (existsSync(pidFilePath)) {
      try {
        unlinkSync(pidFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (existsSync(PORT_FILE_PATH)) {
      try {
        unlinkSync(PORT_FILE_PATH);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

async function verifyIsChromeProcess(pid: number): Promise<boolean> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
      const processName = stdout.trim().toLowerCase();
      return processName.includes('chrome') || processName.includes('chromium');
    } else if (process.platform === 'win32') {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
      return stdout.toLowerCase().includes('chrome');
    }
    return false;
  } catch {
    return false;
  }
}

function ensureGitignore(projectDir: string) {
  const gitignorePath = join(projectDir, '.gitignore');
  const entries = ['.chrome-profile', '.chrome-pid', '.browser-port', '.browser-screenshots', '.browser-downloads'];

  let content = '';
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }

  const toAdd = entries.filter(e => !content.includes(e));
  if (toAdd.length > 0) {
    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    writeFileSync(gitignorePath, content + prefix + toAdd.join('\n') + '\n');
  }
}

// CLI commands
async function navigate(url: string) {
  try {
    const { page } = await initBrowser();
    await page.goto(url);

    // Wait for network to settle (handles lazy-loaded content)
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // Timeout is acceptable - some pages never reach network idle
    }

    // Use final URL after redirects for context resolution
    const finalUrl = page.url();
    const wasRedirected = finalUrl !== url;

    const screenshotPath = await takeScreenshot(page, PROJECT_DIR);

    const result: any = {
      success: true,
      message: wasRedirected
        ? `Navigated to ${url} → redirected to ${finalUrl}`
        : `Successfully navigated to ${url}`,
      screenshot: screenshotPath
    };

    // Return context for Claude to use when giving browser instructions
    if (CONTEXT_INJECTION_ENABLED) {
      const context = await contextResolver.resolve(finalUrl);
      if (context) {
        result.pageContext = context;
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function act(action: string) {
  try {
    const { page } = await initBrowser();

    // Capture scroll position before action
    const scrollBefore = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY
    }));

    const urlBefore = page.url();
    await page.act(action);
    const urlAfter = page.url();
    const navigated = urlAfter !== urlBefore;

    // Detect scroll and wait for content to settle
    const scrollAfter = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY
    }));
    const scrolled = scrollBefore.x !== scrollAfter.x || scrollBefore.y !== scrollAfter.y;
    if (scrolled) {
      // Wait for lazy-loaded content and animations to settle
      await page.waitForTimeout(500);
    }

    const screenshotPath = await takeScreenshot(page, PROJECT_DIR);

    const result: any = {
      success: true,
      message: navigated
        ? `Performed action: ${action} → navigated to ${urlAfter}`
        : `Successfully performed action: ${action}`,
      screenshot: screenshotPath
    };

    // Inject context if action caused navigation
    if (navigated && CONTEXT_INJECTION_ENABLED) {
      const context = await contextResolver.resolve(urlAfter);
      if (context) {
        result.pageContext = context;
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function extract(instruction: string, schema?: Record<string, string>) {
  try {
    const { page } = await initBrowser();

    let zodSchemaObject;

    // Try to convert schema to Zod if provided
    if (schema) {
      try {
        const zodSchema: Record<string, any> = {};
        let hasValidTypes = true;

        for (const [key, type] of Object.entries(schema)) {
          switch (type) {
            case "string":
              zodSchema[key] = z.string();
              break;
            case "number":
              zodSchema[key] = z.number();
              break;
            case "boolean":
              zodSchema[key] = z.boolean();
              break;
            default:
              console.error(`Warning: Unsupported schema type "${type}" for field "${key}". Proceeding without schema validation.`);
              hasValidTypes = false;
              break;
          }
        }

        if (hasValidTypes && Object.keys(zodSchema).length > 0) {
          zodSchemaObject = z.object(zodSchema);
        }
      } catch (schemaError) {
        console.error('Warning: Failed to convert schema. Proceeding without schema validation:',
          schemaError instanceof Error ? schemaError.message : String(schemaError));
      }
    }

    // Extract with or without schema
    const extractOptions: any = { instruction };
    if (zodSchemaObject) {
      extractOptions.schema = zodSchemaObject;
    }

    const result = await page.extract(extractOptions);

    const screenshotPath = await takeScreenshot(page, PROJECT_DIR);
    return {
      success: true,
      message: `Successfully extracted data: ${JSON.stringify(result)}`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function observe(query: string) {
  try {
    const { page } = await initBrowser();

    const actions = await page.observe(query);
    const screenshotPath = await takeScreenshot(page, PROJECT_DIR);
    return {
      success: true,
      message: `Successfully observed: ${actions}`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function screenshot() {
  try {
    const { page } = await initBrowser();
    const screenshotPath = await takeScreenshot(page, PROJECT_DIR);
    return {
      success: true,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);

  // Extract --profile flag from args
  let customProfilePath: string | undefined;
  const filteredArgs = args.filter(arg => {
    if (arg.startsWith('--profile=')) {
      customProfilePath = arg.split('=')[1];
      customProfileSource = customProfilePath; // Store for port calculation
      return false;
    }
    return true;
  });

  // Prepare Chrome profile and gitignore for project directory
  profileConfig = prepareChromeProfile(PROJECT_DIR, customProfilePath);
  ensureGitignore(PROJECT_DIR);

  const command = filteredArgs[0];

  try {
    let result: { success: boolean; [key: string]: any };

    switch (command) {
      case 'navigate':
        if (filteredArgs.length < 2) {
          throw new Error('Usage: browser navigate <url> [--profile=<path>]');
        }
        result = await navigate(filteredArgs[1]);
        break;

      case 'act':
        if (filteredArgs.length < 2) {
          throw new Error('Usage: browser act "<action>" [--profile=<path>]');
        }
        result = await act(filteredArgs.slice(1).join(' '));
        break;

      case 'extract':
        if (filteredArgs.length < 2) {
          throw new Error('Usage: browser extract "<instruction>" [\'{"field": "type"}\'] [--profile=<path>]');
        }
        const instruction = filteredArgs[1];
        const schema = filteredArgs[2] ? JSON.parse(filteredArgs[2]) : undefined;
        result = await extract(instruction, schema);
        break;

      case 'observe':
        if (filteredArgs.length < 2) {
          throw new Error('Usage: browser observe "<query>" [--profile=<path>]');
        }
        result = await observe(filteredArgs.slice(1).join(' '));
        break;

      case 'screenshot':
        result = await screenshot();
        break;

      case 'close':
        await closeBrowser();
        result = { success: true, message: 'Browser closed' };
        break;

      default:
        throw new Error(`Unknown command: ${command}\nAvailable commands: navigate, act, extract, observe, screenshot, close`);
    }

    console.log(JSON.stringify(result, null, 2));

    // Browser stays open between commands - only closes on explicit 'close' command
    // This allows for faster sequential operations and preserves browser state

    // Exit immediately after printing result
    process.exit(0);
  } catch (error) {
    // Close browser on error too
    await closeBrowser();

    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

main().catch(console.error);
