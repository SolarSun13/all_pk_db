// commands/info/debug.js

import { PermissionFlagsBits } from "discord.js";
import { extractMessageId, debugLookup } from "../../logic/debugLogic.js";

export const data = {
  name: "debug",
  description: "Debug message mapping",
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [
    {
      type: 3,
      name: "id",
      description: "Message link or ID",
      required: true,
    },
  ],
};

export async function execute(interaction) {
  const raw = interaction.options.getString("id");

  // Extract ID (works for raw IDs, links, etc.)
  const messageId = extractMessageId(raw);

  // Perform the shared lookup
  const embed = await debugLookup(interaction, messageId);

  return interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}