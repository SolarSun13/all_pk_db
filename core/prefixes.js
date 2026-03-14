// ======================================================
// prefixes.js — Server-Wide Prefix Management
// ======================================================

import { getConfig, saveConfig } from "./storage.js";

const PREFIX_MAX_LEN = 14;


// ------------------------------------------------------
// Helpers
// ------------------------------------------------------

function makeDefaultPrefix(name) {
  if (!name) return "[Server]";
  const trimmed = name.length > PREFIX_MAX_LEN
    ? name.slice(0, PREFIX_MAX_LEN) + "…"
    : name;
  return `[${trimmed}]`;
}

function normalizeCustomPrefix(raw) {
  if (!raw) return null;

  let trimmed = raw.trim();
  if (!trimmed) return null;

  // Enforce max length before brackets
  if (trimmed.length > PREFIX_MAX_LEN) {
    trimmed = trimmed.slice(0, PREFIX_MAX_LEN) + "…";
  }

// Remove user-provided brackets
trimmed = trimmed.replace(/^\[/, "").replace(/\]$/, "");

  return `[${trimmed}]`;
}


// ------------------------------------------------------
// Public API
// ------------------------------------------------------

export function getPrefix(guildId, guildName) {
  const config = getConfig();
  const entry = config.guilds[guildId];

  if (!entry) {
    // Not linked to any pool yet → generate default
    return makeDefaultPrefix(guildName);
  }

  if (entry.prefix) return entry.prefix;

  // No prefix set → generate and save
  const prefix = makeDefaultPrefix(entry.name || guildName);
  entry.prefix = prefix;
  saveConfig();
  return prefix;
}


export function setPrefix(guildId, value) {
  const config = getConfig();
  const entry = config.guilds[guildId];
  if (!entry) return null;

  const normalized = normalizeCustomPrefix(value);
  if (!normalized) return null;

  entry.prefix = normalized;
  saveConfig();
  return normalized;
}


export function resetPrefix(guildId) {
  const config = getConfig();
  const entry = config.guilds[guildId];
  if (!entry) return null;

  const prefix = makeDefaultPrefix(entry.name);
  entry.prefix = prefix;
  saveConfig();
  return prefix;
}


// ------------------------------------------------------
// Presence Rotation (Alliance Only)
// ------------------------------------------------------

export function getAlliancePrefixesForPresence() {
  const config = getConfig();
  const prefixes = [];

  for (const [guildId, entry] of Object.entries(config.guilds)) {
    // Must be linked to Alliance
    if (!entry.alliance?.channel) continue;

    // Must have a custom prefix
    const defaultPrefix = makeDefaultPrefix(entry.name);
    if (entry.prefix && entry.prefix !== defaultPrefix) {
// Remove brackets for presence display
prefixes.push(entry.prefix.replace(/^\[|\]$/g, ""));
    }
  }

  return prefixes;
}