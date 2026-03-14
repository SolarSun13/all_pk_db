// ======================================================
// pools/roundtable.js — Round Table Pool Handler
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

import { getConfig } from "../core/storage.js";
import { getPrefix } from "../core/prefixes.js";


// ------------------------------------------------------
// Helpers
// ------------------------------------------------------

function isRoundTableLinked(msg) {
  const cfg = getConfig().guilds[msg.guild?.id];
  if (!cfg) return false;
  return cfg.roundtable?.channel === msg.channel.id;
}

function getRoundTableWebhook(guildId) {
  const cfg = getConfig().guilds[guildId];
  return cfg?.roundtable?.webhook || null;
}

function getRoundTableChannel(guildId) {
  const cfg = getConfig().guilds[guildId];
  return cfg?.roundtable?.channel || null;
}


// ------------------------------------------------------
// Main Export
// ------------------------------------------------------

export function registerRoundTableHandlers(client) {

  // ======================================================
  // MESSAGE CREATE
  // ======================================================
  client.on("messageCreate", async (msg) => {
    if (!msg.guild) return;
    if (msg.author.bot) return;
    if (!isRoundTableLinked(msg)) return;

    const pool = "roundtable";
    const originGuild = msg.guild;

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
            const ch = getRoundTableChannel(targetGuildId);
            return `-# ↪️ Replying to ${namePart}. https://discord.com/channels/${targetGuildId}/${ch}/${replyInfo.originId}`;
          }

          const relay = replyInfo.relays.find(r => r.guild_id === targetGuildId);
          if (relay?.webhook_message_id) {
            const ch = getRoundTableChannel(targetGuildId);
            return `-# ↪️ Replying to ${namePart}. https://discord.com/channels/${targetGuildId}/${ch}/${relay.webhook_message_id}`;
          }

          return `-# ↪️ Replying to ${namePart}`;
        }
      : null;

    // Relay to all other Round Table servers
    const relays = [];
    const config = getConfig();

    for (const [guildId, data] of Object.entries(config.guilds)) {
      if (guildId === originGuild.id) continue;
      if (!data.roundtable?.webhook) continue;

      enqueue(async () => {
        const contentParts = [];

        if (replyHeader) contentParts.push(replyHeader(guildId));
        if (body.trim().length > 0) contentParts.push(body.trim());

        const payload = {
          username,
          avatar_url: avatar,
          content: contentParts.join("\n")
        };

        const response = await postWebhook(`${data.roundtable.webhook}?wait=true`, payload);
        let webhookMessageId = null;

        try {
          if (response && response.ok) {
            const text = await response.text();
            if (text) webhookMessageId = JSON.parse(text)?.id || null;
          }
        } catch {}

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
    if (!isRoundTableLinked(newMsg)) return;

    const pool = "roundtable";
    const entry = getEntry(pool, newMsg.id);
    if (!entry || entry.type !== "origin") return;

    const prefix = getPrefix(newMsg.guild.id, newMsg.guild.name);

    for (const relay of entry.relays) {
      const webhook = getRoundTableWebhook(relay.guild_id);
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
    if (!isRoundTableLinked(msg)) return;

    const pool = "roundtable";
    const entry = getEntry(pool, msg.id);
    if (!entry || entry.type !== "origin") {
      prunePool(pool);
      return;
    }

    for (const relay of entry.relays) {
      const webhook = getRoundTableWebhook(relay.guild_id);
      if (!webhook || !relay.webhook_message_id) continue;

      enqueue(async () => {
        await deleteWebhook(`${webhook}/messages/${relay.webhook_message_id}`);
      });
    }

    prunePool(pool);
    processQueue();
  });



  // ======================================================
  // REACTIONS — FIXED (NO WEBHOOKS)
// ======================================================
  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (reaction.partial) await reaction.fetch();
      if (user.bot) return;
      if (!isRoundTableLinked(reaction.message)) return;
      if (!reaction.emoji || reaction.emoji.id) return; // unicode only

      const pool = "roundtable";
      const targets = getOriginAndRelays(pool, reaction.message.id);
      if (!targets) return;

      const emoji = reaction.emoji.name;

      for (const relay of targets.relays) {
        const channelId = getRoundTableChannel(relay.guild_id);
        if (!channelId || !relay.webhook_message_id) continue;

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
      if (!isRoundTableLinked(reaction.message)) return;
      if (!reaction.emoji || reaction.emoji.id) return;

      const pool = "roundtable";
      const targets = getOriginAndRelays(pool, reaction.message.id);
      if (!targets) return;

      const emoji = reaction.emoji.name;

      for (const relay of targets.relays) {
        const channelId = getRoundTableChannel(relay.guild_id);
        if (!channelId || !relay.webhook_message_id) continue;

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