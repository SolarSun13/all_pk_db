// commands/info/servers.js

import { PermissionFlagsBits } from "discord.js";
import { getConfig } from "../../core/storage.js";
import { getPrefix } from "../../core/prefixes.js";
import { createEmbed } from "../../embed.js";

export const data = {
  name: "servers",
  description: "List servers connected to the Alliance Chat pool",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
};

export async function execute(interaction) {
  const config = getConfig();
  const list = [];

  for (const [guildId, entry] of Object.entries(config.guilds)) {
    if (!entry.alliance?.channel) continue;

    const prefix = getPrefix(guildId, entry.name);
    const formatted = `${entry.name} - \`${prefix}\``;

    list.push(formatted);
  }

  list.sort((a, b) => a.localeCompare(b));

  if (list.length === 0) {
    const embed = createEmbed(
      "Alliance Servers",
      "No servers are currently linked to the Alliance Chat pool."
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  const embed = createEmbed(
    "Alliance Servers",
    list.map(n => `• ${n}`).join("\n"),
    "✅ connected to the alliance chat pool"
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}