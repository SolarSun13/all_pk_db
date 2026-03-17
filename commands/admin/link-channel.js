// commands/admin/link-channel.js

import { ChannelType, PermissionFlagsBits } from "discord.js";
import { getConfig, saveConfig } from "../../core/storage.js";
import { createEmbed } from "../../embed.js";

export const data = {
  name: "link-channel",
  description: "Link this channel to a chat pool",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [
    {
      type: 3,
      name: "pool",
      description: "Which pool to link",
      required: true,
      choices: [
        { name: "Alliance Chat", value: "alliance" },
        { name: "Round Table", value: "roundtable" },
      ],
    },
  ],
};

export async function execute(interaction) {
  const pool = interaction.options.getString("pool");
  const guild = interaction.guild;
  const channel = interaction.channel;

  // Must be a text channel
  if (channel.type !== ChannelType.GuildText) {
    const embed = createEmbed(
      "Link Channel",
      "You can only link text channels."
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // Ensure guild entry exists
  const config = getConfig();
  if (!config.guilds[guild.id]) {
    config.guilds[guild.id] = { name: guild.name };
  }

  const entry = config.guilds[guild.id];

  // ------------------------------------------------------
  // Webhook Management (Reuse / Cleanup / Create)
  // ------------------------------------------------------

  const desiredName =
    pool === "alliance" ? "Alliance Relay" : "Round Table Relay";

  const hooks = await channel.fetchWebhooks();
  const matching = hooks.filter((h) => h.name === desiredName);

  let webhook;

  if (matching.size > 0) {
    webhook = matching.first();

    if (matching.size > 1) {
      for (const [id, hook] of matching) {
        if (hook.id !== webhook.id) {
          await hook.delete("Cleaning up duplicate relay webhooks");
        }
      }
    }

    await webhook.edit({
      name: desiredName,
      avatar: interaction.client.user.displayAvatarURL(),
    });
  } else {
    webhook = await channel.createWebhook({
      name: desiredName,
      avatar: interaction.client.user.displayAvatarURL(),
    });
  }

  // ------------------------------------------------------
  // Save to config
  // ------------------------------------------------------

  entry[pool] = {
    channel: channel.id,
    webhook: webhook.url,
  };

  saveConfig();

  // ------------------------------------------------------
  // Reply to user
  // ------------------------------------------------------

  const embed = createEmbed(
    "Link Channel",
    "\\✅ " +
      `**${pool === "alliance" ? "Alliance Chat" : "Round Table"}**` +
      " pool successfully linked to " +
      `<#${channel.id}>`
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });

  // ------------------------------------------------------
  // Pool Join Announcement (Per-Server 24h Cooldown)
  // ------------------------------------------------------

  const now = Date.now();
  const cooldownField =
    pool === "alliance"
      ? "allianceJoinCooldown"
      : "roundtableJoinCooldown";

  const last = entry[cooldownField] || 0;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  // If this server announced within the last 24 hours, skip
  if (now - last < ONE_DAY) {
    return;
  }

  // Update this server's cooldown
  entry[cooldownField] = now;
  saveConfig();

  // Build announcement embed
  const announceEmbed = createEmbed(
    pool === "alliance" ? "Alliance Chat" : "Round Table",
    `\\💠 **${guild.name}** has joined the **${
      pool === "alliance" ? "Alliance Chat" : "Round Table"
    }**!`
  );

  // Broadcast to all other servers in the pool (as the bot)
  for (const [guildId, data] of Object.entries(config.guilds)) {
    if (guildId === guild.id) continue;

    const target = data[pool];
    if (!target?.channel) continue;

    try {
      const ch = await interaction.client.channels.fetch(target.channel);
      if (ch) {
        await ch.send({ embeds: [announceEmbed] });
      }
    } catch {
      // Ignore failures — stale channels will be cleaned later
    }
  }
}