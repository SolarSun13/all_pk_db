// core/cleanup.js

import { getConfig, saveConfig } from "./storage.js";

export function removeGuildFromConfig(guildId) {
  const config = getConfig();
  if (config.guilds[guildId]) {
    delete config.guilds[guildId];
    saveConfig();
  }
}

export async function pruneInvalidPoolEntries(client) {
  const config = getConfig();
  let changed = false;

  for (const [guildId, data] of Object.entries(config.guilds)) {
    for (const pool of ["alliance", "roundtable"]) {
      const entry = data[pool];
      if (!entry) continue;

      // Check channel existence
      const channel = await client.channels.fetch(entry.channel).catch(() => null);
      if (!channel) {
        delete data[pool];
        changed = true;
        continue;
      }

      // Check webhook validity
      try {
        const parts = entry.webhook.split("/");
        const webhookId = parts[parts.length - 2];
        const webhookToken = parts[parts.length - 1];

        await client.fetchWebhook(webhookId, webhookToken);
      } catch {
        delete data[pool];
        changed = true;
      }
    }
  }

  if (changed) saveConfig();
}