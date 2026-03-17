// ======================================================
// presence.js — Alliance-Only Prefix Cycling
// ======================================================

import { getAlliancePrefixesForPresence } from "./prefixes.js";

const ROTATION_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
let statusIndex = 0;

// ------------------------------------------------------
// Rotate Presence
// ------------------------------------------------------

function rotate(client) {
  try {
    const list = getAlliancePrefixesForPresence();
    if (list.length === 0) return;

    if (statusIndex >= list.length) statusIndex = 0;

    const choice = list[statusIndex++];
    client.user.setPresence({
      activities: [{ name: choice, type: 2 }],
      status: "online"
    });

  } catch (err) {
    console.error("Presence rotation error:", err.message);
  }
}

// ------------------------------------------------------
// Public API
// ------------------------------------------------------

export function startPresenceRotation(client) {
  // Randomize starting index
  const list = getAlliancePrefixesForPresence();
  if (list.length > 0) {
    statusIndex = Math.floor(Math.random() * list.length);
  }

  // Run once on startup
  rotate(client);

  // Then rotate every 20 minutes
  setInterval(() => rotate(client), ROTATION_INTERVAL_MS);
}