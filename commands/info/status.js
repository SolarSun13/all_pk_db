// commands/info/status.js

import { PermissionFlagsBits } from "discord.js";
import { getConfig } from "../../core/storage.js";
import { getPrefix } from "../../core/prefixes.js";
import { createEmbed } from "../../embed.js";

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
      "",
      "**Server Name**\n" +
      `${guild.name}\n\n` +
      "**Prefix**" + "- Not configured\n\n" +
      "Alliance Chat – not linked \\⚠️\n" +
    `-# *public or general chat pool*\n\n` +
      "Round Table – not linked \\⚠️\n" +
    `-# *private or staff chat pool*`
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // Alliance pool
  const allianceLinked = !!entry.alliance?.channel;
  const allianceChannel = allianceLinked
    ? `<#${entry.alliance.channel}>`
    : "not linked";
  const allianceStatus = allianceLinked ? "✅" : "⚠️";

  // Round Table pool (hidden unless ManageGuild)
  let roundtableChannel = "_Hidden_";
  let roundtableStatus = "";

  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const rtLinked = !!entry.roundtable?.channel;
    roundtableChannel = rtLinked
      ? `<#${entry.roundtable.channel}>`
      : "not linked";
    roundtableStatus = rtLinked ? "✅" : "⚠️";
  }

  const prefix = getPrefix(guild.id, guild.name);

  const embed = createEmbed(
    "",
    "**Server Name**\n" +
    `${guild.name}\n\n` +
    "**Prefix** " + `- \`${prefix}\`\n\n` +
    `Alliance Chat – ${allianceChannel}  \\${allianceStatus}\n` +
    `-# *public or general chat pool*\n\n` +
    `Round Table – ${roundtableChannel}  \\${roundtableStatus}\n` +
    `-# *private or staff chat pool*`
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}