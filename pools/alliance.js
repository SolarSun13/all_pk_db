// ======================================================
// pools/alliance.js — Alliance Pool Handler
// ======================================================

import {
  enqueue,
  processQueue,
  postWebhook,
  patchWebhook,
  deleteWebhook
} from "../core/relay.js";

import {
  getEntry,
  setOrigin,
  addMirror,
  getOriginAndRelays,
  prunePool
} from "../core/mapping.js";

import { getConfig, saveConfig } from "../core/storage.js";
import { getPrefix } from "../core/prefixes.js";


// ------------------------------------------------------
// Helpers
// ------------------------------------------------------

function isAllianceLinked(msg) {
  const cfg = getConfig().guilds[msg.guild?.id];
  if (!cfg) return false;
  return cfg.alliance?.channel === msg.channel.id;
}

function getAllianceWebhook(guildId) {
  const cfg = getConfig().guilds[guildId];
  return cfg?.alliance?.webhook || null;
}

function getAllianceChannel(guildId) {
  const cfg = getConfig().guilds[guildId];
  return cfg?.alliance?.channel || null;
}


// ------------------------------------------------------
// Main Export
// ------------------------------------------------------

export function registerAllianceHandlers(client) {

  // ======================================================
  // MESSAGE CREATE
  // ======================================================
  client.on("messageCreate", async (msg) => {
    if (!msg.guild) return;
    if (msg.author.bot) return;

    // Ignore system pin messages
    if (msg.type === 6) return;

    if (!isAllianceLinked(msg)) return;

    const pool = "alliance";
    const originGuild = msg.guild;

    // ------------------------------------------------------
    // Track last-seen for Alliance pool
    // ------------------------------------------------------
    const config = getConfig();
    if (!config.lastSeen) config.lastSeen = { alliance: {}, roundtable: {} };
    config.lastSeen.alliance[msg.author.id] = msg.guild.id;
    saveConfig();

    const prefix = getPrefix(originGuild.id, originGuild.name);
    const username = `${prefix} ${msg.author.username}`;
    const avatar = msg.author.displayAvatarURL();

    let body = msg.content || "";

    // Attachments
    if (msg.attachments.size > 0) {
      const urls = [...msg.attachments.values()].map(a => a.url);
      body = (body + "\n" + urls.join("\n")).trim();
    }

    // Tenor embeds
    if (msg.embeds.length > 0) {
      for (const e of msg.embeds) {
        const isTenor = (e.provider?.name === "Tenor") || (e.url?.includes("tenor.com"));
        if (isTenor && e.url && !body.includes(e.url)) {
          body = (body + "\n" + e.url).trim();
        }
      }
    }

    // Reply linking
    const repliedToId = msg.reference?.messageId || null;
    const replyInfo = repliedToId ? getOriginAndRelays(pool, repliedToId) : null;

    const replyHeader = replyInfo
      ? (targetGuildId) => {
          const originPrefix = getPrefix(replyInfo.originGuildId, "Server");
          const repliedUser = msg.mentions?.repliedUser;
let repliedName = repliedUser ? repliedUser.username : "original message";
repliedName = repliedName.replace(/^\[[^\]]+\]\s*/, "");

          const namePart = `${originPrefix} ${repliedName}`;

          if (targetGuildId === replyInfo.originGuildId) {
            const ch = getAllianceChannel(targetGuildId);
            return `-# ↪️ Replying to ${namePart}. https://discord.com/channels/${targetGuildId}/${ch}/${replyInfo.originId}`;
          }

          const relay = replyInfo.relays.find(r => r.guild_id === targetGuildId);
          if (relay?.webhook_message_id) {
            const ch = getAllianceChannel(targetGuildId);
            return `-# ↪️ Replying to ${namePart}. https://discord.com/channels/${targetGuildId}/${ch}/${relay.webhook_message_id}`;
          }

          return `-# ↪️ Replying to ${namePart}`;
        }
      : null;

    // ------------------------------------------------------
    // Determine ping guild for mentions (first mentioned user only)
    // ------------------------------------------------------
    let pingGuildId = originGuild.id;

    if (msg.mentions.users.size > 0) {
      const firstMentioned = [...msg.mentions.users.values()][0];
      const lastSeen = config.lastSeen?.alliance?.[firstMentioned.id];
      if (lastSeen) pingGuildId = lastSeen;
    }

    // ------------------------------------------------------
    // Relay to all other Alliance-linked servers
    // ------------------------------------------------------
    const relays = [];

    for (const [guildId, data] of Object.entries(config.guilds)) {
      if (guildId === originGuild.id) continue;
      if (!data.alliance?.webhook) continue;

      enqueue(async () => {
        const contentParts = [];

        if (replyHeader) contentParts.push(replyHeader(guildId));
        if (body.trim().length > 0) contentParts.push(body.trim());

        const payload = {
          username,
          avatar_url: avatar,
          content: contentParts.join("\n")
        };

        let webhookMessageId = null;

        // ------------------------------------------------------
        // Ping guild → real ping
        // ------------------------------------------------------
        if (guildId === pingGuildId) {
          const response = await postWebhook(`${data.alliance.webhook}?wait=true`, payload);
          try {
            if (response && response.ok) {
              const text = await response.text();
              if (text) webhookMessageId = JSON.parse(text)?.id || null;
            }
          } catch {}
        }

        // ------------------------------------------------------
        // Other guilds → silent mention (send "-" then edit)
        // ------------------------------------------------------
        else {
          const placeholder = await postWebhook(`${data.alliance.webhook}?wait=true`, {
            username,
            avatar_url: avatar,
            content: "-"
          });

          let placeholderId = null;
          try {
            if (placeholder && placeholder.ok) {
              const text = await placeholder.text();
              if (text) placeholderId = JSON.parse(text)?.id || null;
            }
          } catch {}

          if (placeholderId) {
            await patchWebhook(
              `${data.alliance.webhook}/messages/${placeholderId}`,
              payload
            );
            webhookMessageId = placeholderId;
          }
        }

        if (webhookMessageId) {
          addMirror(pool, msg.id, guildId, webhookMessageId);
        }

        relays.push({
          guild_id: guildId,
          webhook_message_id: webhookMessageId
        });
      });
    }

    processQueue();
    setOrigin(pool, msg.id, originGuild.id, relays);
  });



  // ======================================================
  // MESSAGE UPDATE
  // ======================================================
  client.on("messageUpdate", async (oldMsg, newMsg) => {
    if (!newMsg.guild) return;
    if (newMsg.author?.bot) return;
    if (!isAllianceLinked(newMsg)) return;

    const pool = "alliance";
    const entry = getEntry(pool, newMsg.id);
    if (!entry || entry.type !== "origin") return;

    const prefix = getPrefix(newMsg.guild.id, newMsg.guild.name);

    for (const relay of entry.relays) {
      const webhook = getAllianceWebhook(relay.guild_id);
      if (!webhook || !relay.webhook_message_id) continue;

      enqueue(async () => {
        await patchWebhook(`${webhook}/messages/${relay.webhook_message_id}`, {
          content: newMsg.content || "",
          username: `${prefix} ${newMsg.author.username}`,
          avatar_url: newMsg.author.displayAvatarURL()
        });
      });
    }

    processQueue();
  });



  // ======================================================
  // MESSAGE DELETE
  // ======================================================
  client.on("messageDelete", async (msg) => {
    if (!msg.guild) return;
    if (!isAllianceLinked(msg)) return;

    const pool = "alliance";
    const entry = getEntry(pool, msg.id);
    if (!entry || entry.type !== "origin") {
      prunePool(pool);
      return;
    }

    for (const relay of entry.relays) {
      const webhook = getAllianceWebhook(relay.guild_id);
      if (!webhook || !relay.webhook_message_id) continue;

      enqueue(async () => {
        await deleteWebhook(`${webhook}/messages/${relay.webhook_message_id}`);
      });
    }

    prunePool(pool);
    processQueue();
  });



  // ======================================================
  // REACTIONS — TWO-WAY, NO DUPLICATES
  // ======================================================
  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (reaction.partial) await reaction.fetch();
      if (user.bot) return;
      if (!isAllianceLinked(reaction.message)) return;
      if (!reaction.emoji || reaction.emoji.id) return; // unicode only

      const pool = "alliance";

      let targets = getOriginAndRelays(pool, reaction.message.id);
      if (!targets) {
        const mirrorEntry = getEntry(pool, reaction.message.id);
        if (mirrorEntry && mirrorEntry.type === "mirror") {
          targets = getOriginAndRelays(pool, mirrorEntry.originId);
        }
      }
      if (!targets) return;

      const emoji = reaction.emoji.name;
      const sourceGuildId = reaction.message.guild.id;
      const sourceMessageId = reaction.message.id;

      const isFromOrigin =
        sourceGuildId === targets.originGuildId &&
        sourceMessageId === targets.originId;

      if (!isFromOrigin) {
        const originChannelId = getAllianceChannel(targets.originGuildId);
        if (originChannelId) {
          const originChannel = await client.channels.fetch(originChannelId).catch(() => null);
          if (originChannel) {
            const originMsg = await originChannel.messages.fetch(targets.originId).catch(() => null);
            if (originMsg) {
              await originMsg.react(emoji).catch(() => {});
            }
          }
        }
      }

      for (const relay of targets.relays) {
        if (!relay.webhook_message_id) continue;
        if (relay.guild_id === sourceGuildId && relay.webhook_message_id === sourceMessageId) continue;

        const channelId = getAllianceChannel(relay.guild_id);
        if (!channelId) continue;

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;

        const msg = await channel.messages.fetch(relay.webhook_message_id).catch(() => null);
        if (!msg) continue;

        await msg.react(emoji).catch(() => {});
      }
    } catch {}
  });


  client.on("messageReactionRemove", async (reaction, user) => {
    try {
      if (reaction.partial) await reaction.fetch();
      if (user.bot) return;
      if (!isAllianceLinked(reaction.message)) return;
      if (!reaction.emoji || reaction.emoji.id) return;

      const pool = "alliance";

      let targets = getOriginAndRelays(pool, reaction.message.id);
      if (!targets) {
        const mirrorEntry = getEntry(pool, reaction.message.id);
        if (mirrorEntry && mirrorEntry.type === "mirror") {
          targets = getOriginAndRelays(pool, mirrorEntry.originId);
        }
      }
      if (!targets) return;

      const emoji = reaction.emoji.name;
      const sourceGuildId = reaction.message.guild.id;
      const sourceMessageId = reaction.message.id;

      const isFromOrigin =
        sourceGuildId === targets.originGuildId &&
        sourceMessageId === targets.originId;

      if (!isFromOrigin) {
        const originChannelId = getAllianceChannel(targets.originGuildId);
        if (originChannelId) {
          const originChannel = await client.channels.fetch(originChannelId).catch(() => null);
          if (originChannel) {
            const originMsg = await originChannel.messages.fetch(targets.originId).catch(() => null);
            if (originMsg) {
              const reactionObj = originMsg.reactions.cache.get(emoji);
              if (reactionObj) {
                await reactionObj.users.remove(client.user.id).catch(() => {});
              }
            }
          }
        }
      }

      for (const relay of targets.relays) {
        if (!relay.webhook_message_id) continue;
        if (relay.guild_id === sourceGuildId && relay.webhook_message_id === sourceMessageId) continue;

        const channelId = getAllianceChannel(relay.guild_id);
        if (!channelId) continue;

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;

        const msg = await channel.messages.fetch(relay.webhook_message_id).catch(() => null);
        if (!msg) continue;

        const reactionObj = msg.reactions.cache.get(emoji);
        if (!reactionObj) continue;

        await reactionObj.users.remove(client.user.id).catch(() => {});
      }
    } catch {}
  });
}