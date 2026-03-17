// commands/context/debug-message.js

import { PermissionFlagsBits } from "discord.js";
import { extractMessageId, debugLookup } from "../../logic/debugLogic.js";

export const data = {
  name: "Debug Relay Info",
  type: 3, // MESSAGE context menu
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
};

export async function execute(interaction) {
  const target = interaction.targetMessage;

  // Extract ID from the message object
  const messageId = extractMessageId(target);

  // Perform the shared lookup
  const embed = await debugLookup(interaction, messageId);

  return interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}