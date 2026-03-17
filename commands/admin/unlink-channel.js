// commands/admin/unlink-channel.js

import { PermissionFlagsBits } from "discord.js";
import { getConfig, saveConfig } from "../../core/storage.js";
import { createEmbed } from "../../embed.js";

export const data = {
  name: "unlink-channel",
  description: "Unlink this channel from a chat pool",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [
    {
      type: 3,
      name: "pool",
      description: "Which pool to unlink",
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

  const config = getConfig();
  const entry = config.guilds[guild.id];

  // Not linked or wrong channel
  if (!entry || !entry[pool] || entry[pool].channel !== channel.id) {
    const embed = createEmbed(
      "Unlink Channel",
      `This channel is not linked to the **${
        pool === "alliance" ? "Alliance Chat" : "Round Table"
      }** pool.`
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // ------------------------------------------------------
  // Delete the webhook associated with this pool
  // ------------------------------------------------------

  const webhookUrl = entry[pool].webhook;

  if (webhookUrl) {
    const parts = webhookUrl.split("/");
    const webhookId = parts[parts.length - 2];
    const webhookToken = parts[parts.length - 1];

    try {
      const webhook = await interaction.client.fetchWebhook(
        webhookId,
        webhookToken
      );
      await webhook.delete("Unlinking channel from pool");
    } catch {
      // Webhook already deleted or invalid — ignore safely
    }
  }

  // ------------------------------------------------------
  // Remove link from config
  // ------------------------------------------------------

  delete entry[pool];
  saveConfig();

  const embed = createEmbed(
    "Unlink Channel",
    "\\⚠️ " +
      `**${pool === "alliance" ? "Alliance Chat" : "Round Table"}**` +
      " pool unlinked from " +
      `<#${channel.id}>`
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}