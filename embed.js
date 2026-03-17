// embed.js — shared embed styling

import { EmbedBuilder } from "discord.js";

export function createEmbed(title, description = "") {
  return new EmbedBuilder()
    .setColor(0xffffff) // white theme
    .setTitle(title)
    .setDescription(description);
}