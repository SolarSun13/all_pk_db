// embed.js — shared embed styling

import { EmbedBuilder } from "discord.js";

export const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";

export function createEmbed(title, description = "") {
  return new EmbedBuilder()
    .setColor(0x000000) // black theme
    .setTitle(title)
    .setDescription(description);
}