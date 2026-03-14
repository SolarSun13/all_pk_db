// ======================================================
// relay.js — Shared Relay Queue + Webhook Retry Logic
// ======================================================

import fetch from "node-fetch";

const MAX_QUEUE_SIZE = 5000;       // Hard safety cap
const RETRY_BACKOFF_MS = 300;      // Lightweight retry delay
const TASK_DELAY_MS = 30;          // Delay between tasks

const relayQueue = [];
let processing = false;


// ------------------------------------------------------
// Queue Management
// ------------------------------------------------------

export function enqueue(task) {
  if (relayQueue.length >= MAX_QUEUE_SIZE) {
    relayQueue.shift(); // Drop oldest task
  }
  relayQueue.push(task);
}

export async function processQueue() {
  if (processing) return;
  processing = true;

  while (relayQueue.length > 0) {
    const task = relayQueue.shift();

    try {
      await task();
    } catch (err) {
      console.error("Relay task error:", err.message);
    }

    await new Promise(res => setTimeout(res, TASK_DELAY_MS));
  }

  processing = false;
}


// ------------------------------------------------------
// Webhook Helpers (POST / PATCH / DELETE)
// ------------------------------------------------------

async function retryableFetch(url, options) {
  try {
    const res = await fetch(url, options);

    // Success
    if (res.ok) return res;

    // Retry only on safe conditions
    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
      return await fetch(url, options);
    }

    return res;
  } catch (err) {
    console.error("Webhook fetch error:", err.message);
    return null;
  }
}


// ------------------------------------------------------
// Public Webhook API
// ------------------------------------------------------

export async function postWebhook(url, payload) {
  return retryableFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function patchWebhook(url, payload) {
  return retryableFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteWebhook(url) {
  return retryableFetch(url, {
    method: "DELETE"
  });
}