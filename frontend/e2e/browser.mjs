import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

/** Use an installed browser on macOS/Linux/Windows or Playwright's own cache. */
export function browserExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    chromium.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    `${process.env.PROGRAMFILES ?? "C:/Program Files"}/Google/Chrome/Application/chrome.exe`,
    `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
  ];
  const installed = candidates.find((path) => existsSync(path));
  if (!installed) throw new Error("Chromium not found. Set CHROME_PATH or run: npx playwright install chromium");
  return installed;
}
