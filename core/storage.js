// ======================================================
// storage.js — Config + MessageMap + Atomic Writes
// ======================================================

import fs from "fs";

const CONFIG_PATH = "./config.json";
const MAP_PATH = "./messageMap.json";

const WRITE_DEBOUNCE_MS = 300;

let config = null;
let messageMap = null;

let pendingConfigWrite = false;
let pendingMapWrite = false;
let writeTimer = null;


// ------------------------------------------------------
// Atomic Write Helper
// ------------------------------------------------------

function atomicWrite(path, data) {
  try {
    fs.writeFileSync(path + ".tmp", data);
    fs.renameSync(path + ".tmp", path);
  } catch (err) {
    console.error("Write error:", err.message);
  }
}


// ------------------------------------------------------
// Debounced Write Scheduler
// ------------------------------------------------------

function scheduleWrite() {
  if (writeTimer) return;

  writeTimer = setTimeout(() => {
    writeTimer = null;

    if (pendingConfigWrite) {
      atomicWrite(CONFIG_PATH, JSON.stringify(config, null, 2));
      pendingConfigWrite = false;
    }

    if (pendingMapWrite) {
      atomicWrite(MAP_PATH, JSON.stringify(messageMap, null, 2));
      pendingMapWrite = false;
    }

  }, WRITE_DEBOUNCE_MS);
}


// ------------------------------------------------------
// Load Config
// ------------------------------------------------------

function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    config = { guilds: {} };
  }

  // Ensure structure
  if (!config.guilds) config.guilds = {};

  // ------------------------------------------------------
  // NEW: Ensure lastSeen structure exists
  // ------------------------------------------------------
  if (!config.lastSeen) {
    config.lastSeen = { alliance: {}, roundtable: {} };
  }

  return config;
}


// ------------------------------------------------------
// Load Message Map (Pool-Aware)
// ------------------------------------------------------

function loadMessageMap() {
  try {
    messageMap = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  } catch {
    messageMap = {};
  }

  // Ensure pools exist
  if (!messageMap.alliance) messageMap.alliance = {};
  if (!messageMap.roundtable) messageMap.roundtable = {};

  return messageMap;
}


// ------------------------------------------------------
// Public API
// ------------------------------------------------------

export function getConfig() {
  if (!config) loadConfig();
  return config;
}

export function saveConfig() {
  pendingConfigWrite = true;
  scheduleWrite();
}

export function getMessageMap(pool) {
  if (!messageMap) loadMessageMap();
  return messageMap[pool];
}

export function saveMessageMap() {
  pendingMapWrite = true;
  scheduleWrite();
}

export function getAllMessageMaps() {
  if (!messageMap) loadMessageMap();
  return messageMap;
}


// ------------------------------------------------------
// Initialization on Import
// ------------------------------------------------------

loadConfig();
loadMessageMap();