// commands/admin/repair.js

import { PermissionFlagsBits } from "discord.js";
import { prunePool } from "../../core/mapping.js";
import { createEmbed } from "../../embed.js";

export const data = {
  name: "repair",
  description: "Prune and normalize message maps",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
};

export async function execute(interaction) {
  prunePool("alliance");
  prunePool("roundtable");

  const embed = createEmbed(
    "Repair Complete",
    "Message maps for all pools have been **pruned** and **normalized**."
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}