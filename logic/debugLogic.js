// logic/debugLogic.js

import { getConfig } from "../core/storage.js";
import { getEntry, getOriginAndRelays } from "../core/mapping.js";
import { createEmbed } from "../embed.js";

/**
 * Extract a message ID from:
 * - raw ID
 * - message link
 * - Message object (context menu)
 */
export function extractMessageId(input) {
  if (!input) return null;

  // If it's a Discord message object
  if (typeof input === "object" && input.id) {
    return input.id;
  }

  let id = String(input).trim();

  // If it's a link
  if (id.includes("discord.com/channels/")) {
    const parts = id.split("/");
    id = parts[parts.length - 1];
  }

  return id;
}

/**
 * Determine which pool the message belongs to.
 * Priority:
 * 1. If command is run inside a pool channel, check that pool first
 * 2. Otherwise, check both pools
 */
export function detectPool(guildConfig, channelId, messageId) {
  if (!guildConfig) return { pool: null, entry: null };

  // 1. If run in Round Table channel → try Round Table first
  if (guildConfig.roundtable?.channel === channelId) {
    const entry = getEntry("roundtable", messageId);
    if (entry) return { pool: "roundtable", entry };

    const fallback = getEntry("alliance", messageId);
    if (fallback) return { pool: "alliance", entry: fallback };
  }

  // 2. If run in Alliance Chat channel → try Alliance first
  if (guildConfig.alliance?.channel === channelId) {
    const entry = getEntry("alliance", messageId);
    if (entry) return { pool: "alliance", entry };

    const fallback = getEntry("roundtable", messageId);
    if (fallback) return { pool: "roundtable", entry: fallback };
  }

  // 3. If run elsewhere → try both
  const alliance = getEntry("alliance", messageId);
  if (alliance) return { pool: "alliance", entry: alliance };

  const roundtable = getEntry("roundtable", messageId);
  if (roundtable) return { pool: "roundtable", entry: roundtable };

  return { pool: null, entry: null };
}

/**
 * Build the final debug embed
 */
export function buildDebugEmbed(pool, messageId, entry, origin) {
  return createEmbed(
    "Debug Result",
    "**Pool** - " + `${pool}\n\n` +
    "**Message ID - **" + `${messageId}\n\n` +
    "**Mapping Data**\n" +
    "```json\n" +
    JSON.stringify({ entry, origin }, null, 2) +
    "\n```"
  );
}

/**
 * Main exported function used by both commands
 */
export async function debugLookup(interaction, rawInput) {
  const messageId = extractMessageId(rawInput);
  const guildId = interaction.guild.id;
  const channelId = interaction.channel.id;

  const guildConfig = getConfig().guilds[guildId];

  const { pool, entry } = detectPool(guildConfig, channelId, messageId);

  if (!pool || !entry) {
    return createEmbed(
      "Debug Result",
      "Message not found in relay system."
    );
  }

  const origin = getOriginAndRelays(pool, messageId);

  return buildDebugEmbed(pool, messageId, entry, origin);
}