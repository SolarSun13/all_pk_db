// commands/admin/prefix.js

import { PermissionFlagsBits } from "discord.js";
import { getPrefix, setPrefix, resetPrefix } from "../../core/prefixes.js";
import { createEmbed, DIVIDER } from "../../embed.js";

export const data = {
  name: "prefix",
  description: "View or set the server prefix",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [
    {
      type: 3,
      name: "value",
      description: "New prefix (leave empty to show current, 'reset' to reset)",
      required: false,
    },
  ],
};

export async function execute(interaction) {
  const guild = interaction.guild;
  const value = interaction.options.getString("value");

  // No value → show current prefix
  if (!value) {
    const current = getPrefix(guild.id, guild.name);

    const embed = createEmbed(
      "Server Prefix",
      `${DIVIDER}\n` +
      "**Current Prefix**\n" +
      `\`${current}\``
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // Reset prefix
  if (value.toLowerCase() === "reset") {
    const reset = resetPrefix(guild.id);

    if (!reset) {
      const embed = createEmbed(
        "Server Prefix",
        `${DIVIDER}\n` +
        "This server is not registered in config yet."
      );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    const embed = createEmbed(
      "Server Prefix",
      `${DIVIDER}\n` +
      "**Prefix Reset To**\n" +
      `\`${reset}\``
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // Set new prefix
  const updated = setPrefix(guild.id, value);

  if (!updated) {
    const embed = createEmbed(
      "Server Prefix",
      `${DIVIDER}\n` +
      "Could not set prefix. Make sure this server is linked first."
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  const embed = createEmbed(
    "Server Prefix",
    `${DIVIDER}\n` +
    "**Prefix Updated To**\n" +
    `\`${updated}\``
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}