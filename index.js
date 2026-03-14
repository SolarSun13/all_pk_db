// ======================================================
// 1. Imports & Setup
// ======================================================

import { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } from "discord.js";
import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();


// ======================================================
// 2. Constants
// ======================================================

const MESSAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_MAP_SIZE_BYTES = 50 * 1024;
const PREFIX_MAX_LEN = 14;

const WRITE_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000;

const ENTRY_TYPE_ORIGIN = "origin";
const ENTRY_TYPE_MIRROR = "mirror";


// ======================================================
// 3. Client Initialization
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"]
});


// ======================================================
// 4. Config + Message Map Loading + Debounced Writes
// ======================================================

let config;
let messageMap;

try {
  config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
} catch {
  config = { guilds: {} };
}

if (!config.guilds) config.guilds = {};

try {
  messageMap = JSON.parse(fs.readFileSync("./messageMap.json", "utf8"));
} catch {
  messageMap = {};
}

let pendingConfigWrite = false;
let pendingMapWrite = false;
let writeTimer = null;

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (pendingConfigWrite) {
      fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
      pendingConfigWrite = false;
    }
    if (pendingMapWrite) {
      fs.writeFileSync("./messageMap.json", JSON.stringify(messageMap, null, 2));
      pendingMapWrite = false;
    }
  }, WRITE_DEBOUNCE_MS);
}

function saveConfig() {
  pendingConfigWrite = true;
  scheduleWrite();
}

function saveMessageMap() {
  pendingMapWrite = true;
  scheduleWrite();
}

function nowMs() {
  return Date.now();
}


// ======================================================
// 5. Caches
// ======================================================

const guildCache = new Map();
const channelCache = new Map();

function getCachedGuild(guildId) {
  const entry = guildCache.get(guildId);
  if (entry && entry.expires > nowMs()) return entry.guild;
  guildCache.delete(guildId);
  return null;
}

function setCachedGuild(guild) {
  guildCache.set(guild.id, { guild, expires: nowMs() + CACHE_TTL_MS });
}

function getCachedChannel(channelId) {
  const entry = channelCache.get(channelId);
  if (entry && entry.expires > nowMs()) return entry.channel;
  channelCache.delete(channelId);
  return null;
}

function setCachedChannel(channel) {
  channelCache.set(channel.id, { channel, expires: nowMs() + CACHE_TTL_MS });
}


// ======================================================
// 6. Utility Helpers
// ======================================================

function isLinkedGuild(guildId) {
  return !!config.guilds[guildId];
}

function getGuildConfig(guildId) {
  return config.guilds[guildId] || null;
}

function isLinkedChannel(msg) {
  if (!msg.guild) return false;
  const g = getGuildConfig(msg.guild.id);
  if (!g) return false;
  return msg.channel.id === g.channel;
}

function isWebhookMessage(msg) {
  return !!msg.webhookId;
}


// ======================================================
// 7. Prefix Helpers
// ======================================================

function makeDefaultPrefix(name) {
  const trimmed = name.length > PREFIX_MAX_LEN ? name.slice(0, PREFIX_MAX_LEN) + "…" : name;
  return `[${trimmed}]`;
}

function normalizeCustomPrefix(raw) {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > PREFIX_MAX_LEN) trimmed = trimmed.slice(0, PREFIX_MAX_LEN) + "…";
  trimmed = trimmed.replace(/^\[/, "").replace(/\]$/, "");
  return `[${trimmed}]`;
}

function getGuildPrefix(guildId, fallbackName) {
  const g = getGuildConfig(guildId);
  if (!g) return makeDefaultPrefix(fallbackName);
  if (g.prefix) return g.prefix;
  const prefix = makeDefaultPrefix(g.name || fallbackName);
  g.prefix = prefix;
  saveConfig();
  return prefix;
}


// ======================================================
// 8. Message Map Schema Helpers
// ======================================================

function makeOriginEntry(originId, originGuildId, relays) {
  return {
    type: ENTRY_TYPE_ORIGIN,
    originId,
    originGuildId,
    relays: relays || [],
    timestamp: nowMs()
  };
}

function makeMirrorEntry(originId, guildId, webhookMessageId) {
  return {
    type: ENTRY_TYPE_MIRROR,
    originId,
    guildId,
    webhookMessageId,
    timestamp: nowMs()
  };
}

function normalizeEntry(id, entry) {
  if (!entry) return null;

  if (!entry.type && entry.relays) {
    return {
      type: ENTRY_TYPE_ORIGIN,
      originId: id,
      originGuildId: entry.guild_id,
      relays: entry.relays || [],
      timestamp: entry.timestamp || nowMs()
    };
  }

  if (!entry.type && entry.original_id) {
    return {
      type: ENTRY_TYPE_MIRROR,
      originId: entry.original_id,
      guildId: entry.guild_id,
      webhookMessageId: id,
      timestamp: entry.timestamp || nowMs()
    };
  }

  if (entry.type === ENTRY_TYPE_ORIGIN) {
    if (!entry.originId) entry.originId = id;
    if (!Array.isArray(entry.relays)) entry.relays = [];
    if (!entry.timestamp) entry.timestamp = nowMs();
    return entry;
  }

  if (entry.type === ENTRY_TYPE_MIRROR) {
    if (!entry.webhookMessageId) entry.webhookMessageId = id;
    if (!entry.timestamp) entry.timestamp = nowMs();
    return entry;
  }

  return null;
}

function getEntry(id) {
  const raw = messageMap[id];
  if (!raw) return null;
  const normalized = normalizeEntry(id, raw);
  if (!normalized) {
    delete messageMap[id];
    saveMessageMap();
    return null;
  }
  messageMap[id] = normalized;
  return normalized;
}

function setOriginEntry(originId, originGuildId, relays) {
  const existing = getEntry(originId);
  if (existing && existing.type === ENTRY_TYPE_ORIGIN && existing.relays?.length) {
    return existing;
  }
  const entry = makeOriginEntry(originId, originGuildId, relays);
  messageMap[originId] = entry;
  saveMessageMap();
  return entry;
}

function addMirrorEntry(originId, guildId, webhookMessageId) {
  if (!webhookMessageId) return;
  const entry = makeMirrorEntry(originId, guildId, webhookMessageId);
  messageMap[webhookMessageId] = entry;
  saveMessageMap();
}


// ======================================================
// 9. Pruning
// ======================================================

function pruneMessageMap() {
  const cutoff = nowMs() - MESSAGE_TTL_MS;

  for (const [id, entry] of Object.entries(messageMap)) {
    const normalized = normalizeEntry(id, entry);
    if (!normalized) {
      delete messageMap[id];
      continue;
    }
    if ((normalized.timestamp || 0) < cutoff) delete messageMap[id];
  }

  saveMessageMap();

  const stats = fs.statSync("./messageMap.json");
  if (stats.size <= MAX_MAP_SIZE_BYTES) return;

  const sorted = Object.entries(messageMap)
    .map(([id, entry]) => ({ id, ts: (entry.timestamp || 0) }))
    .sort((a, b) => a.ts - b.ts);

  for (const { id } of sorted) {
    delete messageMap[id];
    const tmp = JSON.stringify(messageMap);
    if (Buffer.byteLength(tmp, "utf8") <= MAX_MAP_SIZE_BYTES) break;
  }

  saveMessageMap();
}

setInterval(pruneMessageMap, 60 * 60 * 1000);


// ======================================================
// 10. Reply + Mapping Helpers
// ======================================================

async function fetchNewestMessageId(channelId) {
  try {
    const token =
      process.env.TOKEN ||
      process.env.BOT_TOKEN ||
      process.env.DISCORD_TOKEN;

    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=1`,
      { headers: { "Authorization": `Bot ${token}` } }
    );

    const json = await res.json();
    if (Array.isArray(json) && json.length > 0) return json[0].id;
  } catch {}
  return null;
}

function getOriginAndRelays(messageId) {
  const entry = getEntry(messageId);
  if (!entry) return null;

  if (entry.type === ENTRY_TYPE_ORIGIN) {
    return {
      originId: entry.originId,
      originGuildId: entry.originGuildId,
      relays: entry.relays || []
    };
  }

  if (entry.type === ENTRY_TYPE_MIRROR) {
    const origin = getEntry(entry.originId);
    if (!origin || origin.type !== ENTRY_TYPE_ORIGIN) return null;
    return {
      originId: origin.originId,
      originGuildId: origin.originGuildId,
      relays: origin.relays || []
    };
  }

  return null;
}

function getReactionTargetsForMessage(msg) {
  if (!msg.guild) return [];

  const info = getOriginAndRelays(msg.id);
  if (!info) return [];

  const targets = [];

  const originCfg = getGuildConfig(info.originGuildId);
  if (originCfg) {
    targets.push({
      guildId: info.originGuildId,
      channelId: originCfg.channel,
      messageId: info.originId
    });
  }

  for (const relay of info.relays) {
    const g = getGuildConfig(relay.guild_id);
    if (!g || !relay.webhook_message_id) continue;
    targets.push({
      guildId: relay.guild_id,
      channelId: g.channel,
      messageId: relay.webhook_message_id
    });
  }

  return targets;
}


// ======================================================
// 11. Reaction Helpers
// ======================================================

function isUnicodeEmoji(reaction) {
  return !reaction.emoji.id;
}

async function applyReactionToTargets(action, emoji, targets, sourceMessage) {
  for (const t of targets) {
    if (
      sourceMessage.guild?.id === t.guildId &&
      sourceMessage.channel.id === t.channelId &&
      sourceMessage.id === t.messageId
    ) continue;

    try {
      let guild = getCachedGuild(t.guildId);
      if (!guild) {
        guild = await client.guilds.fetch(t.guildId);
        setCachedGuild(guild);
      }

      let channel = getCachedChannel(t.channelId);
      if (!channel) {
        channel = await guild.channels.fetch(t.channelId);
        if (channel) setCachedChannel(channel);
      }

      if (!channel?.isTextBased()) continue;

      const targetMsg = await channel.messages.fetch(t.messageId).catch(() => null);
      if (!targetMsg) continue;

      if (action === "add") {
        await targetMsg.react(emoji).catch(() => {});
      } else {
        const r = targetMsg.reactions.cache.find(x => x.emoji.name === emoji);
        if (r) await r.users.remove(client.user.id).catch(() => {});
      }
    } catch (err) {
      console.error("Relay error:", err.message);
    }
  }
}


// ======================================================
// 12. Slash Command Registration
// ======================================================

const commands = [
  { name: "link-channel", description: "Link this channel as the alliance chat channel." },
  { name: "unlink-channel", description: "Unlink this server from alliance chat." },
  { name: "status", description: "Show alliance chat status for this server." },
  {
    name: "prefix",
    description: "View or set this server's alliance prefix.",
    options: [
      {
        type: 3,
        name: "value",
        description: "New prefix (max 14 chars) or 'reset' to restore default.",
        required: false
      }
    ]
  },
  { name: "servers", description: "List all servers currently linked to the alliance." },
  {
    name: "debug",
    description: "Inspect mapping info for a given message ID.",
    options: [
      {
        type: 3,
        name: "message_id",
        description: "Message ID to inspect.",
        required: true
      }
    ]
  },
  {
    name: "repair",
    description: "Scan and repair the message mapping table."
  },
  { name: "ping", description: "Check bot status." }
];

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(
    process.env.TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.DISCORD_TOKEN
  );

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash commands registered.");

  pruneMessageMap();

  // ------------------------------
  // Start rotating status *after* login
  // ------------------------------
  rotateStatus();
  setInterval(rotateStatus, 20 * 60 * 1000);
});

// ======================================================
// 13. Slash Command Handler
// ======================================================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "This command can only be used in a server.", flags: 64 });
  }

  const guildId = guild.id;
  const memberPerms = interaction.memberPermissions;

  const requireManageServer = async () => {
    if (!memberPerms?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You must have **Manage Server** permission to use this command.",
        flags: 64
      });
      return false;
    }
    return true;
  };

  // ------------------------------
  // /ping
  // ------------------------------
  if (interaction.commandName === "ping") {
    return interaction.reply({ content: "Pong!", flags: 64 });
  }

  // ------------------------------
  // /link-channel
  // ------------------------------
  if (interaction.commandName === "link-channel") {
    if (!(await requireManageServer())) return;

    const channel = interaction.channel;
    const webhook = await channel.createWebhook({
      name: "Alliance Relay",
      avatar: client.user.displayAvatarURL()
    });

    const defaultPrefix = makeDefaultPrefix(guild.name);

    config.guilds[guildId] = {
      name: guild.name,
      prefix: defaultPrefix,
      channel: channel.id,
      webhook: webhook.url
    };

    saveConfig();

    return interaction.reply({
      content:
        `**Channel Linked**\n` +
        `>>> • Channel: <#${channel.id}>\n` +
        `• Prefix: \`${defaultPrefix}\``,
      flags: 64
    });
  }

  // ------------------------------
  // /unlink-channel
  // ------------------------------
  if (interaction.commandName === "unlink-channel") {
    if (!(await requireManageServer())) return;

    delete config.guilds[guildId];
    saveConfig();

    return interaction.reply({
      content:
        `**Channel Unlinked**\n` +
        `>>> • This server is no longer part of the alliance chat.`,
      flags: 64
    });
  }

  // ------------------------------
  // /status
  // ------------------------------
  if (interaction.commandName === "status") {
    const data = getGuildConfig(guildId);

    if (!data) {
      return interaction.reply({
        content:
          `**Alliance Status**\n` +
          `>>> • This server is **not linked** to alliance chat.`,
        flags: 64
      });
    }

    return interaction.reply({
      content:
        `**Alliance Status**\n` +
        `>>> • Server: **${data.name}**\n` +
        `• Prefix: \`${data.prefix}\`\n` +
        `• Channel: <#${data.channel}>`,
      flags: 64
    });
  }

  // ------------------------------
  // /prefix
  // ------------------------------
  if (interaction.commandName === "prefix") {
    if (!(await requireManageServer())) return;

    const value = interaction.options.getString("value");
    const entry = getGuildConfig(guildId);

    if (!entry) {
      return interaction.reply({
        content:
          `**Prefix**\n` +
          `>>> • This server is not linked to alliance chat. Use \`/link-channel\` first.`,
        flags: 64
      });
    }

    if (!value) {
      return interaction.reply({
        content:
          `**Prefix**\n` +
          `>>> • Current prefix: \`${entry.prefix}\``,
        flags: 64
      });
    }

    if (value.toLowerCase() === "reset") {
      entry.prefix = makeDefaultPrefix(entry.name);
      saveConfig();
      return interaction.reply({
        content:
          `**Prefix Reset**\n` +
          `>>> • Prefix reset to: \`${entry.prefix}\``,
        flags: 64
      });
    }

    const normalized = normalizeCustomPrefix(value);
    if (!normalized) {
      return interaction.reply({
        content:
          `**Prefix Error**\n` +
          `>>> • Invalid prefix. Provide a non-empty value (max ${PREFIX_MAX_LEN} chars before brackets).`,
        flags: 64
      });
    }

    entry.prefix = normalized;
    saveConfig();

    return interaction.reply({
      content:
        `**Prefix Updated**\n` +
        `>>> • New prefix: \`${normalized}\``,
      flags: 64
    });
  }

  // ------------------------------
  // /servers
  // ------------------------------
  if (interaction.commandName === "servers") {
    if (!getGuildConfig(guildId)) {
      return interaction.reply({
        content:
          `**Alliance Servers**\n` +
          `>>> • This server is not linked to alliance chat.`,
        flags: 64
      });
    }

    const entries = Object.entries(config.guilds);
    const lines = entries.map(([id, data]) => `• ${data.name} — ${data.prefix}`);

    return interaction.reply({
      content:
        `**Alliance Servers (${entries.length})**\n` +
        `>>> ${lines.join("\n")}`,
      flags: 64
    });
  }

  // ------------------------------
  // /debug
  // ------------------------------
  if (interaction.commandName === "debug") {
    const id = interaction.options.getString("message_id");
    const entry = getEntry(id);

    if (!entry) {
      return interaction.reply({
        content:
          `**Message Mapping**\n` +
          `>>> • No mapping found for: \`${id}\``,
        flags: 64
      });
    }

    // Resolve guild name
    const originGuild = client.guilds.cache.get(entry.originGuildId || entry.guildId);
    const originName = originGuild?.name || "Unknown";

    // Timestamp formatting
    const ts = Math.floor((entry.timestamp || nowMs()) / 1000);

    return interaction.reply({
      content:
        `**Message Mapping**\n` +
        `>>> • Type: ${entry.type}\n` +
        `• Origin ID: \`${entry.originId}\`\n` +
        `• Origin Guild: **${originName}** (\`${entry.originGuildId || entry.guildId}\`)\n` +
        (entry.relays ? `• Relays: ${entry.relays.length}\n` : "") +
        `• Timestamp: <t:${ts}:f>`,
      flags: 64
    });
  }

  // ------------------------------
  // /repair
  // ------------------------------
  if (interaction.commandName === "repair") {
    if (!(await requireManageServer())) return;

    let repaired = 0;

    for (const [id, entry] of Object.entries(messageMap)) {
      const normalized = normalizeEntry(id, entry);
      if (!normalized) {
        delete messageMap[id];
        repaired++;
        continue;
      }
      messageMap[id] = normalized;
    }

    saveMessageMap();

    return interaction.reply({
      content:
        `**Repair Complete**\n` +
        `>>> • Fixed or removed: ${repaired} entries`,
      flags: 64
    });
  }
});


// ======================================================
// 14. Rotating Status (Sequential, Every 20 Minutes)
// ======================================================

function getCustomPrefixes() {
  const prefixes = [];

  for (const g of Object.values(config.guilds)) {
    if (!g.prefix) continue;

    const defaultPrefix = makeDefaultPrefix(g.name);

    if (g.prefix !== defaultPrefix) {
prefixes.push(g.prefix.replace(/^\[|\]$/g, ""));
    }
  }

  return prefixes;
}

let statusIndex = 0;

function rotateStatus() {
  const list = getCustomPrefixes();
  if (list.length === 0) return;

  if (statusIndex >= list.length) statusIndex = 0;

  const choice = list[statusIndex++];
  client.user.setPresence({
    activities: [{ name: choice }],
    status: "online"
  });

  console.log(`Status updated → ${choice}`);
}

// ======================================================
// 15. Relay Queue
// ======================================================

const relayQueue = [];
let relayProcessing = false;

async function processRelayQueue() {
  if (relayProcessing) return;
  relayProcessing = true;

  while (relayQueue.length > 0) {
    const task = relayQueue.shift();
    try {
      await task();
    } catch (err) {
      console.error("Relay error:", err.message);
    }
    await new Promise(res => setTimeout(res, 30));
  }

  relayProcessing = false;
}


// ======================================================
// 16. Message Relay Handler (Optimized)
// ======================================================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild) return;
  if (!isLinkedChannel(msg)) return;

  const originGuild = msg.guild;
  const isReply = !!msg.reference?.messageId;
  const repliedToId = msg.reference?.messageId || null;

  const replyInfo = repliedToId ? getOriginAndRelays(repliedToId) : null;

  const prefix = getGuildPrefix(originGuild.id, originGuild.name);
  const baseUsername = `${prefix} ${msg.author.username}`;
  const baseAvatar = msg.author.displayAvatarURL();

  let replyHeader = null;

  if (isReply && replyInfo) {
    replyHeader = (targetGuildId) => {
      const originPrefix = getGuildPrefix(replyInfo.originGuildId, "Server");
      const repliedUser = msg.mentions?.repliedUser;
      let repliedName = repliedUser ? repliedUser.username : "original message";

repliedName = repliedName.replace(/^\[[^\]]+\]\s*/, "");

      const namePart = `${originPrefix} ${repliedName}`;

      if (targetGuildId === replyInfo.originGuildId) {
        const ch = getGuildConfig(targetGuildId).channel;
        return `-# \\↪️ Replying to ${namePart}. https://discord.com/channels/${targetGuildId}/${ch}/${replyInfo.originId}`;
      }

      const relay = replyInfo.relays.find(r => r.guild_id === targetGuildId);
      if (relay?.webhook_message_id) {
        const ch = getGuildConfig(targetGuildId).channel;
        return `-# \\↪️ Replying to ${namePart}. https://discord.com/channels/${targetGuildId}/${ch}/${relay.webhook_message_id}`;
      }

      return `-# \\↪️ Replying to ${namePart}`;
    };
  }

  let body = msg.content || "";

  if (msg.attachments.size > 0) {
    const urls = [...msg.attachments.values()].map(a => a.url);
    body = (body + "\n" + urls.join("\n")).trim();
  }

  if (msg.embeds.length > 0) {
    for (const e of msg.embeds) {
      const isTenor = (e.provider?.name === "Tenor") || (e.url?.includes("tenor.com"));
      if (isTenor && e.url && !body.includes(e.url)) {
        body = (body + "\n" + e.url).trim();
      }
    }
  }

  const relays = [];

  for (const [guildId, data] of Object.entries(config.guilds)) {
    if (guildId === originGuild.id) continue;

    relayQueue.push(async () => {
      if (!data.webhook) {
        console.warn(`Missing webhook for guild ${guildId}`);
        return;
      }

      const contentParts = [];

      if (replyHeader) {
        contentParts.push(replyHeader(guildId));
      }

      if (body.trim().length > 0) contentParts.push(body.trim());

      const content = contentParts.join("\n");
      if (!content) return;

      const payload = {
        username: baseUsername,
        avatar_url: baseAvatar,
        content
      };

      const response = await fetch(data.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      let webhookMessageId = null;

      try {
        const text = await response.text();
        if (text) webhookMessageId = JSON.parse(text)?.id || null;
      } catch {}

      if (!webhookMessageId) {
        webhookMessageId = await fetchNewestMessageId(data.channel);
      }

      if (webhookMessageId) {
        addMirrorEntry(msg.id, guildId, webhookMessageId);
      }

      relays.push({
        guild_id: guildId,
        webhook_message_id: webhookMessageId
      });
    });
  }

  processRelayQueue();

  setOriginEntry(msg.id, originGuild.id, relays);
});

// ======================================================
// 17. Message Update Handler
// ======================================================

client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (newMsg.author?.bot) return;
  if (!isLinkedChannel(newMsg)) return;

  const entry = getEntry(newMsg.id);
  if (!entry || entry.type !== ENTRY_TYPE_ORIGIN) return;

  const prefix = getGuildPrefix(newMsg.guild.id, newMsg.guild.name);

  for (const relay of entry.relays) {
    const cfg = getGuildConfig(relay.guild_id);
    if (!cfg || !relay.webhook_message_id) continue;

    relayQueue.push(async () => {
      await fetch(`${cfg.webhook}/messages/${relay.webhook_message_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMsg.content || "",
          username: `${prefix} ${newMsg.author.username}`,
          avatar_url: newMsg.author.displayAvatarURL()
        })
      }).catch(() => {});
    });
  }

  processRelayQueue();
});


// ======================================================
// 18. Message Delete Handler
// ======================================================

client.on("messageDelete", async (msg) => {
  if (!isLinkedChannel(msg)) return;

  const entry = getEntry(msg.id);
  if (!entry || entry.type !== ENTRY_TYPE_ORIGIN) {
    pruneMessageMap();
    return;
  }

  for (const relay of entry.relays) {
    const cfg = getGuildConfig(relay.guild_id);
    if (!cfg) continue;

    relayQueue.push(async () => {
      if (relay.webhook_message_id) {
        await fetch(`${cfg.webhook}/messages/${relay.webhook_message_id}`, {
          method: "DELETE"
        }).catch(() => {});
        delete messageMap[relay.webhook_message_id];
      }
    });
  }

  delete messageMap[msg.id];
  saveMessageMap();
  pruneMessageMap();

  processRelayQueue();
});


// ======================================================
// 19. Reaction Handlers (Optimized)
// ======================================================

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (user.bot) return;
    if (!isLinkedChannel(reaction.message)) return;
    if (!isUnicodeEmoji(reaction)) return;

    const emoji = reaction.emoji.name;
    const targets = getReactionTargetsForMessage(reaction.message);
    if (targets.length === 0) return;

    relayQueue.push(() => applyReactionToTargets("add", emoji, targets, reaction.message));
    processRelayQueue();
  } catch {}
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (user.bot) return;
    if (!isLinkedChannel(reaction.message)) return;
    if (!isUnicodeEmoji(reaction)) return;

    const emoji = reaction.emoji.name;
    const targets = getReactionTargetsForMessage(reaction.message);
    if (targets.length === 0) return;

    relayQueue.push(() => applyReactionToTargets("remove", emoji, targets, reaction.message));
    processRelayQueue();
  } catch {}
});


// ======================================================
// 20. Graceful Shutdown (Essential for Mamba)
// ======================================================

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  saveConfig();
  saveMessageMap();
  process.exit(0);
});


// ======================================================
// 21. Login
// ======================================================

client.login(
  process.env.TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.DISCORD_TOKEN
);