import { Page } from '@browserbasehq/stagehand';
import { existsSync, cpSync, mkdirSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';

/**
 * Finds the local Chrome installation path based on the operating system
 * @returns The path to the Chrome executable, or undefined if not found
 */
export function findLocalChrome(): string | undefined {
  const systemPlatform = platform();
  const chromePaths: string[] = [];

  if (systemPlatform === 'darwin') {
    // macOS paths
    chromePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      `${process.env.HOME}/Applications/Chromium.app/Contents/MacOS/Chromium`
    );
  } else if (systemPlatform === 'win32') {
    // Windows paths
    chromePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe'
    );
  } else {
    // Linux paths
    chromePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/local/bin/google-chrome',
      '/usr/local/bin/chromium',
      '/opt/google/chrome/chrome',
      '/opt/google/chrome/google-chrome'
    );
  }

  // Find the first existing Chrome installation
  for (const path of chromePaths) {
    if (path && existsSync(path)) {
      return path;
    }
  }

  return undefined;
}

/**
 * Gets the Chrome user data directory path based on the operating system
 * @returns The path to Chrome's user data directory, or undefined if not found
 */
export function getChromeUserDataDir(): string | undefined {
  const systemPlatform = platform();

  if (systemPlatform === 'darwin') {
    return `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  } else if (systemPlatform === 'win32') {
    return `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
  } else {
    // Linux
    return `${process.env.HOME}/.config/google-chrome`;
  }
}

/**
 * Parses a Chrome profile path into user-data-dir and profile-directory components
 * @param profilePath Full path to a Chrome profile (e.g., ~/Library/Application Support/Google/Chrome/Profile 2)
 * @returns Object with userDataDir and profileDirectory, or null if invalid
 */
export function parseProfilePath(profilePath: string): { userDataDir: string; profileDirectory: string } | null {
  const expanded = profilePath.replace(/^~/, process.env.HOME || '');

  // Profile path should be: <user-data-dir>/<profile-directory>
  // e.g., /Users/x/Library/Application Support/Google/Chrome/Profile 2
  const lastSlash = expanded.lastIndexOf('/');
  if (lastSlash === -1) return null;

  const userDataDir = expanded.substring(0, lastSlash);
  const profileDirectory = expanded.substring(lastSlash + 1);

  if (!profileDirectory || !userDataDir) return null;

  return { userDataDir, profileDirectory };
}

/**
 * Prepares the Chrome profile directory for browser launch
 * Always copies profile to isolated location for parallel session support
 * @param projectDir The project directory where .chrome-profile will be created
 * @param customProfilePath Optional path to a custom Chrome profile to copy from
 * @returns Object with profile configuration for Chrome launch
 */
export function prepareChromeProfile(projectDir: string, customProfilePath?: string): {
  userDataDir: string;
  profileDirectory?: string;
  isCustomProfile: boolean;
} {
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';

  // Determine source profile to copy
  let sourceProfile: string | null = null;
  let profileName = 'Default';

  if (customProfilePath) {
    const parsed = parseProfilePath(customProfilePath);
    if (parsed) {
      const fullPath = customProfilePath.replace(/^~/, process.env.HOME || '');
      if (existsSync(fullPath)) {
        sourceProfile = fullPath;
        profileName = parsed.profileDirectory;
      } else {
        console.log(`${dim}Custom profile not found at ${fullPath}, using fresh profile${reset}\n`);
      }
    }
  } else {
    // Use system default profile
    const sourceUserDataDir = getChromeUserDataDir();
    const defaultProfile = join(sourceUserDataDir!, 'Default');
    if (existsSync(defaultProfile)) {
      sourceProfile = defaultProfile;
    }
  }

  // Create isolated user-data-dir in project directory
  const tempUserDataDir = join(projectDir, '.chrome-profile');
  const destProfile = join(tempUserDataDir, 'Default');

  if (!existsSync(destProfile)) {
    mkdirSync(tempUserDataDir, { recursive: true });

    if (sourceProfile) {
      console.log(`${dim}Copying ${profileName} profile to .chrome-profile/ (this may take a minute)...${reset}`);
      cpSync(sourceProfile, destProfile, { recursive: true });
      console.log(`${dim}✓ Profile copied successfully${reset}\n`);
    } else {
      console.log(`${dim}Creating fresh Chrome profile in .chrome-profile/${reset}\n`);
      mkdirSync(destProfile, { recursive: true });
    }
  } else {
    console.log(`${dim}Using existing .chrome-profile/${reset}\n`);
  }

  return {
    userDataDir: tempUserDataDir,
    isCustomProfile: !!customProfilePath
  };
}

 // Use CDP to take screenshot directly
export async function takeScreenshot(page: Page, projectDir: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = join(projectDir, '.browser-screenshots');
  const screenshotPath = join(screenshotDir, `screenshot-${timestamp}.png`);

  // Create directory if it doesn't exist
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

 const context = page.context();
 const client = await context.newCDPSession(page);
 const screenshotResult = await client.send('Page.captureScreenshot', {
   format: 'png',
   quality: 100,
   fromSurface: false
 });

 // Save the base64 screenshot data to file with resizing if needed
 const fs = await import('fs');
 const sharp = (await import('sharp')).default;
 const buffer = Buffer.from(screenshotResult.data, 'base64');

 // Check image dimensions
 const image = sharp(buffer);
 const metadata = await image.metadata();
 const { width, height } = metadata;

 let finalBuffer: Buffer = buffer;

 // Only resize if image exceeds 2000x2000
 if (width && height && (width > 2000 || height > 2000)) {
   finalBuffer = await sharp(buffer)
     .resize(2000, 2000, {
       fit: 'inside',
       withoutEnlargement: true
     })
     .png()
     .toBuffer();
 }

 fs.writeFileSync(screenshotPath, finalBuffer);
 return screenshotPath;
}
