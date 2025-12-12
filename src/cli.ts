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

// Context resolver for domain-specific instructions
const contextResolver = new FileContextResolver(PLUGIN_ROOT);
const CONTEXT_INJECTION_ENABLED = process.env.BROWSER_CONTEXT_INJECTION !== 'false';

async function initBrowser() {
  if (stagehandInstance) {
    return { stagehand: stagehandInstance, page: currentPage };
  }

  const chromePath = findLocalChrome();
  if (!chromePath) {
    throw new Error('Could not find Chrome installation');
  }

  const cdpPort = 9222;
  const tempUserDataDir = join(PLUGIN_ROOT, '.chrome-profile');

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
    chromeProcess = spawn(chromePath, [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${tempUserDataDir}`,
      '--window-position=-9999,-9999', // Launch minimized off-screen
      '--window-size=1250,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-infobars',
      '--disable-sync',
      '--disable-extensions',
    ], {
      stdio: 'ignore', // Ignore stdio to prevent pipe buffer blocking
      detached: false,
    });

    // Store PID for safe cleanup later
    if (chromeProcess.pid) {
      const pidFilePath = join(PLUGIN_ROOT, '.chrome-pid');
      writeFileSync(pidFilePath, JSON.stringify({
        pid: chromeProcess.pid,
        startTime: Date.now()
      }));
    }

    // Wait for Chrome to be ready
    for (let i = 0; i < 50; i++) {
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
  }

  // Initialize Stagehand
  stagehandInstance = new Stagehand({
    env: "LOCAL",
    verbose: 0,
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

  // Configure downloads
  const downloadsPath = join(PLUGIN_ROOT, 'agent', 'downloads');
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
  const cdpPort = 9222;
  const pidFilePath = join(PLUGIN_ROOT, '.chrome-pid');

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
    // Clean up PID file
    if (existsSync(pidFilePath)) {
      try {
        unlinkSync(pidFilePath);
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

// CLI commands
async function navigate(url: string) {
  try {
    const { page } = await initBrowser();
    await page.goto(url);

    // Use final URL after redirects for context resolution
    const finalUrl = page.url();
    const wasRedirected = finalUrl !== url;

    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);

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

    const urlBefore = page.url();
    await page.act(action);
    const urlAfter = page.url();
    const navigated = urlAfter !== urlBefore;

    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);

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

    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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
    const screenshotPath = await takeScreenshot(page, PLUGIN_ROOT);
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

async function listTabs() {
  try {
    const { page } = await initBrowser();
    const context = page.context();
    const pages = context.pages();

    const tabs = await Promise.all(pages.map(async (p: any, index: number) => {
      let title = '';
      let url = '';
      try {
        title = await p.title();
        url = p.url();
      } catch {
        // Page might be closed or navigating
        title = '(loading...)';
        url = p.url() || '(unknown)';
      }
      return {
        index,
        title,
        url,
        active: p === currentPage
      };
    }));

    return {
      success: true,
      message: `Found ${tabs.length} open tab(s)`,
      tabs
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function newTab(url?: string) {
  try {
    const { page } = await initBrowser();
    const context = page.context();

    // Create a new page (tab)
    const newPage = await context.newPage();

    // Update current page reference
    currentPage = newPage;

    // Navigate to URL if provided
    if (url) {
      await newPage.goto(url);
    }

    const screenshotPath = await takeScreenshot(newPage, PLUGIN_ROOT);

    const result: any = {
      success: true,
      message: url ? `Opened new tab and navigated to ${url}` : 'Opened new tab',
      screenshot: screenshotPath
    };

    // Return context for Claude to use when giving browser instructions
    if (url && CONTEXT_INJECTION_ENABLED) {
      const context = await contextResolver.resolve(url);
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

async function closeTab(tabIndex?: number) {
  try {
    const { page } = await initBrowser();
    const context = page.context();
    const pages = context.pages();

    if (pages.length <= 1) {
      return {
        success: false,
        error: 'Cannot close the last tab. Use "close" command to close the browser instead.'
      };
    }

    // Determine which tab to close
    const indexToClose = tabIndex !== undefined ? tabIndex : pages.indexOf(currentPage);

    if (indexToClose < 0 || indexToClose >= pages.length) {
      return {
        success: false,
        error: `Invalid tab index: ${tabIndex}. Valid range is 0-${pages.length - 1}`
      };
    }

    const pageToClose = pages[indexToClose];
    const closedUrl = pageToClose.url();

    // If closing the current tab, switch to another tab first
    if (pageToClose === currentPage) {
      // Switch to the previous tab, or the next one if closing the first tab
      const newIndex = indexToClose > 0 ? indexToClose - 1 : 1;
      currentPage = pages[newIndex];
    }

    await pageToClose.close();

    const screenshotPath = await takeScreenshot(currentPage, PLUGIN_ROOT);

    return {
      success: true,
      message: `Closed tab ${indexToClose} (${closedUrl})`,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function switchTab(tabIndex: number) {
  try {
    const { page } = await initBrowser();
    const context = page.context();
    const pages = context.pages();

    if (tabIndex < 0 || tabIndex >= pages.length) {
      return {
        success: false,
        error: `Invalid tab index: ${tabIndex}. Valid range is 0-${pages.length - 1}`
      };
    }

    currentPage = pages[tabIndex];

    // Bring the tab to focus
    await currentPage.bringToFront();

    const screenshotPath = await takeScreenshot(currentPage, PLUGIN_ROOT);
    const title = await currentPage.title();
    const url = currentPage.url();

    return {
      success: true,
      message: `Switched to tab ${tabIndex}: ${title}`,
      url,
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
  // Prepare Chrome profile on first run
  prepareChromeProfile(PLUGIN_ROOT);

  const args = process.argv.slice(2);
  const command = args[0];

  try {
    let result: { success: boolean; [key: string]: any };

    switch (command) {
      case 'navigate':
        if (args.length < 2) {
          throw new Error('Usage: browser navigate <url>');
        }
        result = await navigate(args[1]);
        break;

      case 'act':
        if (args.length < 2) {
          throw new Error('Usage: browser act "<action>"');
        }
        result = await act(args.slice(1).join(' '));
        break;

      case 'extract':
        if (args.length < 2) {
          throw new Error('Usage: browser extract "<instruction>" [\'{"field": "type"}\']');
        }
        const instruction = args[1];
        const schema = args[2] ? JSON.parse(args[2]) : undefined;
        result = await extract(instruction, schema);
        break;

      case 'observe':
        if (args.length < 2) {
          throw new Error('Usage: browser observe "<query>"');
        }
        result = await observe(args.slice(1).join(' '));
        break;

      case 'screenshot':
        result = await screenshot();
        break;

      case 'tabs':
        result = await listTabs();
        break;

      case 'newtab':
        result = await newTab(args[1]); // URL is optional
        break;

      case 'closetab':
        if (args[1] !== undefined) {
          const tabIndex = parseInt(args[1], 10);
          if (isNaN(tabIndex)) {
            throw new Error('Usage: browser closetab [index] - index must be a number');
          }
          result = await closeTab(tabIndex);
        } else {
          result = await closeTab(); // Close current tab
        }
        break;

      case 'switchtab':
        if (args.length < 2) {
          throw new Error('Usage: browser switchtab <index>');
        }
        const switchIndex = parseInt(args[1], 10);
        if (isNaN(switchIndex)) {
          throw new Error('Usage: browser switchtab <index> - index must be a number');
        }
        result = await switchTab(switchIndex);
        break;

      case 'close':
        await closeBrowser();
        result = { success: true, message: 'Browser closed' };
        break;

      default:
        throw new Error(`Unknown command: ${command}\nAvailable commands: navigate, act, extract, observe, screenshot, tabs, newtab, closetab, switchtab, close`);
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
