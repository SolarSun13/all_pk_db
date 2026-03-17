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

  // Create webhook for relaying
  const webhook = await channel.createWebhook({
    name: pool === "alliance" ? "Alliance Relay" : "Round Table Relay",
  });

  entry[pool] = {
    channel: channel.id,
    webhook: webhook.url,
  };

  saveConfig();

  const embed = createEmbed(
    "Link Channel",
    "\\✅ " + `**${pool === "alliance" ? "Alliance Chat" : "Round Table"}**` + " pool successfully linked to " + `<#${channel.id}>`
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}