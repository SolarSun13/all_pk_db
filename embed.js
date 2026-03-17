// embed.js — shared embed styling

import { EmbedBuilder } from "discord.js";

export function createEmbed(title = null, description = null, footerText = null) {
  const embed = new EmbedBuilder().setColor(0xffffff); // white theme

  if (title) {
    embed.setTitle(title);
  }

  if (description) {
    embed.setDescription(description);
  }

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  return embed;
}