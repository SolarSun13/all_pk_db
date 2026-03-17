// ======================================================
// index.js — Main Entry Point (Updated for Modular System)
// ======================================================

import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
} from "discord.js";

import {
  loadAllCommands,
  getCommandDataArray,
  commandMap,
} from "./commands/commands.js";

import { registerAllianceHandlers } from "./pools/alliance.js";
import { registerRoundTableHandlers } from "./pools/roundtable.js";
import { startPresenceRotation } from "./core/presence.js";

// NEW: cleanup helpers
import {
  removeGuildFromConfig,
  pruneInvalidPoolEntries
} from "./core/cleanup.js";


// ------------------------------------------------------
// Environment
// ------------------------------------------------------

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing BOT_TOKEN or CLIENT_ID in environment.");
  process.exit(1);
}


// ------------------------------------------------------
// Client
// ------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});


// ------------------------------------------------------
// Startup
// ------------------------------------------------------

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Load all commands from /commands/**
  await loadAllCommands();

  // Register pool handlers
  registerAllianceHandlers(client);
  registerRoundTableHandlers(client);

  // Start presence rotation (Alliance-only prefixes)
  startPresenceRotation(client);

  // ------------------------------------------------------
  // Periodic Cleanup Job (every 6 hours)
  // ------------------------------------------------------
  setInterval(() => {
    pruneInvalidPoolEntries(client);
  }, 6 * 60 * 60 * 1000);

  console.log("Bot is fully initialized.");
});


// ------------------------------------------------------
// Guild Delete Handler (bot kicked or server deleted)
// ------------------------------------------------------

client.on("guildDelete", (guild) => {
  console.log(`Bot removed from guild: ${guild.id} (${guild.name})`);
  removeGuildFromConfig(guild.id);
});


// ------------------------------------------------------
// Interaction Handler
// ------------------------------------------------------

client.on("interactionCreate", async (interaction) => {
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isMessageContextMenuCommand()
  ) {
    return;
  }

  const cmd = commandMap.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error("Command execution error:", err);

    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: "An error occurred while executing this command.",
        ephemeral: true,
      });
    }
  }
});


// ------------------------------------------------------
// Login
// ------------------------------------------------------

client.login(TOKEN).catch((err) => {
  console.error("Login error:", err);
  process.exit(1);
});