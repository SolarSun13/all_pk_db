// commands/admin/unlink-channel.js

import { PermissionFlagsBits } from "discord.js";
import { getConfig, saveConfig } from "../../core/storage.js";
import { createEmbed, DIVIDER } from "../../embed.js";

export const data = {
  name: "unlink-channel",
  description: "Unlink this channel from a pool",
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
      `${DIVIDER}\n` +
      `This channel is not linked to the **${pool === "alliance" ? "Alliance Chat" : "Round Table"}** pool.`
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // Remove link
  delete entry[pool];
  saveConfig();

  const embed = createEmbed(
    "Unlink Channel",
    `${DIVIDER}\n` +
    "**Unlinked Channel**\n" +
    `<#${channel.id}>\n\n` +
    "**Pool**\n" +
    `${pool === "alliance" ? "Alliance Chat" : "Round Table"}`
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}