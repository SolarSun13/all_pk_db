// deploy-commands.js
// Registers all slash commands globally with Discord

import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadAllCommands, getCommandDataArray } from "./commands/commands.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("Missing BOT_TOKEN or CLIENT_ID in environment variables.");
  process.exit(1);
}

async function deploy() {
  try {
    console.log("Loading commands...");
    await loadAllCommands();
    const commands = getCommandDataArray();

    console.log(`Preparing... ${commands.length} commands for registration...`);

    const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

    console.log("Registering global slash commands with Discord...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });

    console.log("Successfully registered global commands!");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
}

deploy();