// commands.js
// Dynamically loads all commands from /commands/**

import { readdir, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const commandMap = new Map();

/**
 * Recursively load all command files from the /commands directory.
 */
async function loadCommandsFrom(dir) {
  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const fileStat = await stat(fullPath);

    if (fileStat.isDirectory()) {
      await loadCommandsFrom(fullPath);
      continue;
    }

    // Only load .js files
    if (!entry.endsWith(".js")) continue;

    import { pathToFileURL } from "url";

    const commandModule = await import(pathToFileURL(fullPath).href);

    if (!commandModule.data || !commandModule.execute) {
      console.warn(`⚠️ Skipped invalid command file: ${fullPath}`);
      continue;
    }

    const name = commandModule.data.name;
    commandMap.set(name, {
      data: commandModule.data,
      execute: commandModule.execute,
    });
  }
}

/**
 * Initialize command loading.
 */
export async function loadAllCommands() {
  const commandsDir = __dirname;
  await loadCommandsFrom(commandsDir);

  console.log(`Loaded ${commandMap.size} commands.`);
  return commandMap;
}

/**
 * Export array of command JSON for registration.
 */
export function getCommandDataArray() {
  return [...commandMap.values()].map(cmd => cmd.data);
}