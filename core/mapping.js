// ======================================================
// mapping.js — Pool-Aware Message Mapping System
// ======================================================

import { getMessageMap, saveMessageMap } from "./storage.js";

const MESSAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_MAP_SIZE_BYTES = 50 * 1024;           // 50 KB cap


// ------------------------------------------------------
// Entry Types
// ------------------------------------------------------

const ENTRY_TYPE_ORIGIN = "origin";
const ENTRY_TYPE_MIRROR = "mirror";


// ------------------------------------------------------
// Normalize Entry (handles legacy or malformed entries)
// ------------------------------------------------------

function normalizeEntry(id, entry) {
  if (!entry) return null;

  // Legacy origin format
  if (!entry.type && entry.relays) {
    return {
      type: ENTRY_TYPE_ORIGIN,
      originId: id,
      originGuildId: entry.guild_id,
      relays: entry.relays || [],
      timestamp: entry.timestamp || Date.now()
    };
  }

  // Legacy mirror format
  if (!entry.type && entry.original_id) {
    return {
      type: ENTRY_TYPE_MIRROR,
      originId: entry.original_id,
      guildId: entry.guild_id,
      webhookMessageId: id,
      timestamp: entry.timestamp || Date.now()
    };
  }

  // Modern origin
  if (entry.type === ENTRY_TYPE_ORIGIN) {
    if (!entry.originId) entry.originId = id;
    if (!Array.isArray(entry.relays)) entry.relays = [];
    if (!entry.timestamp) entry.timestamp = Date.now();
    return entry;
  }

  // Modern mirror
  if (entry.type === ENTRY_TYPE_MIRROR) {
    if (!entry.webhookMessageId) entry.webhookMessageId = id;
    if (!entry.timestamp) entry.timestamp = Date.now();
    return entry;
  }

  return null;
}


// ------------------------------------------------------
// Public API
// ------------------------------------------------------

export function getEntry(pool, id) {
  const map = getMessageMap(pool);
  const raw = map[id];
  if (!raw) return null;

  const normalized = normalizeEntry(id, raw);
  if (!normalized) {
    delete map[id];
    saveMessageMap();
    return null;
  }

  map[id] = normalized;
  return normalized;
}


export function setOrigin(pool, originId, originGuildId, relays) {
  const map = getMessageMap(pool);

  const existing = getEntry(pool, originId);
  if (existing && existing.type === ENTRY_TYPE_ORIGIN && existing.relays?.length) {
    return existing;
  }

  const entry = {
    type: ENTRY_TYPE_ORIGIN,
    originId,
    originGuildId,
    relays: relays || [],
    timestamp: Date.now()
  };

  map[originId] = entry;
  saveMessageMap();
  return entry;
}


export function addMirror(pool, originId, guildId, webhookMessageId) {
  if (!webhookMessageId) return;

  const map = getMessageMap(pool);

  const entry = {
    type: ENTRY_TYPE_MIRROR,
    originId,
    guildId,
    webhookMessageId,
    timestamp: Date.now()
  };

  map[webhookMessageId] = entry;
  saveMessageMap();
}


export function getOriginAndRelays(pool, messageId) {
  const entry = getEntry(pool, messageId);
  if (!entry) return null;

  if (entry.type === ENTRY_TYPE_ORIGIN) {
    return {
      originId: entry.originId,
      originGuildId: entry.originGuildId,
      relays: entry.relays || []
    };
  }

  if (entry.type === ENTRY_TYPE_MIRROR) {
    const origin = getEntry(pool, entry.originId);
    if (!origin || origin.type !== ENTRY_TYPE_ORIGIN) return null;

    return {
      originId: origin.originId,
      originGuildId: origin.originGuildId,
      relays: origin.relays || []
    };
  }

  return null;
}


// ------------------------------------------------------
// Pruning (Pool-Specific)
// ------------------------------------------------------

export function prunePool(pool) {
  const map = getMessageMap(pool);
  const cutoff = Date.now() - MESSAGE_TTL_MS;

  // Remove old entries
  for (const [id, entry] of Object.entries(map)) {
    const normalized = normalizeEntry(id, entry);
    if (!normalized) {
      delete map[id];
      continue;
    }
    if ((normalized.timestamp || 0) < cutoff) {
      delete map[id];
    }
  }

  saveMessageMap();

  // Enforce size cap
  const json = JSON.stringify(map);
  if (Buffer.byteLength(json, "utf8") <= MAX_MAP_SIZE_BYTES) return;

  // Remove oldest entries until under cap
  const sorted = Object.entries(map)
    .map(([id, entry]) => ({ id, ts: entry.timestamp || 0 }))
    .sort((a, b) => a.ts - b.ts);

  for (const { id } of sorted) {
    delete map[id];
    const tmp = JSON.stringify(map);
    if (Buffer.byteLength(tmp, "utf8") <= MAX_MAP_SIZE_BYTES) break;
  }

  saveMessageMap();
}