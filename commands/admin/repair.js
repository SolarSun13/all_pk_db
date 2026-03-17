// commands/admin/repair.js

import { PermissionFlagsBits } from "discord.js";
import { prunePool } from "../../core/mapping.js";
import { pruneInvalidPoolEntries } from "../../core/cleanup.js";
import { createEmbed } from "../../embed.js";

export const data = {
  name: "repair",
  description: "Prune message maps and clean up invalid config entries",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
};

export async function execute(interaction) {
  const client = interaction.client;

  // ------------------------------------------------------
  // 1. Prune message maps (existing behavior)
  // ------------------------------------------------------
  prunePool("alliance");
  prunePool("roundtable");

  // ------------------------------------------------------
  // 2. Clean up invalid config entries (new behavior)
  // ------------------------------------------------------
  await pruneInvalidPoolEntries(client);

  // ------------------------------------------------------
  // Reply
  // ------------------------------------------------------
  const embed = createEmbed(
    "Repair Complete",
    [
      "\\✅ Message maps for all pools have been **pruned** and **normalized** + Invalid guild/channel/webhook entries have been **cleaned** from config."
    ].join("\n")
  );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}