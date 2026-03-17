// commands/info/status.js

import { PermissionFlagsBits } from "discord.js";
import { getConfig } from "../../core/storage.js";
import { getPrefix } from "../../core/prefixes.js";
import { createEmbed, DIVIDER } from "../../embed.js";

export const data = {
  name: "status",
  description: "Show link status for this server",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
};

export async function execute(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  const config = getConfig();
  const entry = config.guilds[guild.id];

  // No config entry yet
  if (!entry) {
    const embed = createEmbed(
      "Server Status",
      `${DIVIDER}\n` +
      "**Server Name**\n" +
      `${guild.name}\n\n` +
      "**Prefix**\n" +
      "`Not configured`\n\n" +
      "**Pools**\n" +
      "• Alliance Chat – _Not linked_\n" +
      "• Round Table – _Not linked_"
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  const alliance = entry.alliance?.channel
    ? `<#${entry.alliance.channel}>`
    : "_Not linked_";

  let roundtable = "_Hidden_";

  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    roundtable = entry.roundtable?.channel
      ? `<#${entry.roundtable.channel}>`
      : "_Not linked_";
  }

  const prefix = getPrefix(guild.id, guild.name);

  const embed = createEmbed(
    "Server Status",
    `${DIVIDER}\n` +
    "**Server Name**\n" +
    `${guild.name}\n\n` +
    "**Prefix**\n" +
    `\`${prefix}\`\n\n` +
    "**Pools**\n" +
    `• Alliance Chat – ${alliance}\n` +
    `• Round Table – ${roundtable}`
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}