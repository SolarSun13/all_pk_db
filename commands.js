// ======================================================
// commands.js — All Slash Commands
// ======================================================

import {
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";

import { getConfig, saveConfig } from "./core/storage.js";
import { getPrefix, setPrefix, resetPrefix } from "./core/prefixes.js";
import { getEntry, getOriginAndRelays, prunePool } from "./core/mapping.js";


// ------------------------------------------------------
// Slash Command Definitions
// ------------------------------------------------------

const commandsData = [
  {
    name: "link-channel",
    description: "Link this channel to a pool",
    options: [
      {
        type: 3,
        name: "pool",
        description: "Which pool to link",
        required: true,
        choices: [
          { name: "Alliance", value: "alliance" },
          { name: "Round Table", value: "roundtable" },
        ],
      },
    ],
    dm_permission: false,
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  },
  {
    name: "unlink-channel",
    description: "Unlink this channel from a pool",
    options: [
      {
        type: 3,
        name: "pool",
        description: "Which pool to unlink",
        required: true,
        choices: [
          { name: "Alliance", value: "alliance" },
          { name: "Round Table", value: "roundtable" },
        ],
      },
    ],
    dm_permission: false,
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  },
  {
    name: "status",
    description: "Show link status for this server",
    dm_permission: false,
  },
  {
    name: "prefix",
    description: "View or set the server prefix",
    options: [
      {
        type: 3,
        name: "value",
        description: "New prefix (leave empty to show current, 'reset' to reset)",
        required: false,
      },
    ],
    dm_permission: false,
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  },
  {
    name: "servers",
    description: "List servers connected to the Alliance pool",
    dm_permission: false,
  },
  {
    name: "debug",
    description: "Debug message mapping",
    options: [
      {
        type: 3,
        name: "pool",
        description: "Pool to inspect",
        required: true,
        choices: [
          { name: "Alliance", value: "alliance" },
          { name: "Round Table", value: "roundtable" },
        ],
      },
      {
        type: 3,
        name: "id",
        description: "Message ID to inspect",
        required: true,
      },
    ],
    dm_permission: false,
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  },
  {
    name: "repair",
    description: "Prune and normalize message maps",
    dm_permission: false,
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  },
];


// ------------------------------------------------------
// Registration
// ------------------------------------------------------

export async function registerSlashCommands(client, token, clientId) {
  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commandsData },
  );

  console.log("Slash commands registered.");
}


// ------------------------------------------------------
// Interaction Handler
// ------------------------------------------------------

export function registerCommandHandler(client) {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (!interaction.guild || !interaction.channel) {
      return interaction.reply({ content: "Guild-only command.", ephemeral: true });
    }

    try {
      if (commandName === "link-channel") {
        await handleLink(interaction);
      } else if (commandName === "unlink-channel") {
        await handleUnlink(interaction);
      } else if (commandName === "status") {
        await handleStatus(interaction);
      } else if (commandName === "prefix") {
        await handlePrefix(interaction);
      } else if (commandName === "servers") {
        await handleServers(interaction);
      } else if (commandName === "debug") {
        await handleDebug(interaction);
      } else if (commandName === "repair") {
        await handleRepair(interaction);
      }
    } catch (err) {
      console.error("Command error:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "An error occurred.", ephemeral: true });
      }
    }
  });
}


// ------------------------------------------------------
// Handlers
// ------------------------------------------------------

async function handleLink(interaction) {
  const pool = interaction.options.getString("pool");
  const guild = interaction.guild;
  const channel = interaction.channel;

  if (channel.type !== ChannelType.GuildText) {
    return interaction.reply({ content: "You can only link text channels.", ephemeral: true });
  }

  const config = getConfig();
  if (!config.guilds[guild.id]) {
    config.guilds[guild.id] = { name: guild.name };
  }

  const entry = config.guilds[guild.id];

  const webhook = await channel.createWebhook({
    name: pool === "alliance" ? "Alliance Relay" : "Round Table Relay",
  });

  entry[pool] = {
    channel: channel.id,
    webhook: webhook.url,
  };

  saveConfig();

  await interaction.reply({
    content: `Linked <#${channel.id}> to **${pool === "alliance" ? "Alliance" : "Round Table"}** pool.`,
    ephemeral: true,
  });
}


async function handleUnlink(interaction) {
  const pool = interaction.options.getString("pool");
  const guild = interaction.guild;
  const channel = interaction.channel;

  const config = getConfig();
  const entry = config.guilds[guild.id];

  if (!entry || !entry[pool] || entry[pool].channel !== channel.id) {
    return interaction.reply({
      content: `This channel is not linked to the **${pool}** pool.`,
      ephemeral: true,
    });
  }

  delete entry[pool];
  saveConfig();

  await interaction.reply({
    content: `Unlinked <#${channel.id}> from **${pool === "alliance" ? "Alliance" : "Round Table"}** pool.`,
    ephemeral: true,
  });
}


async function handleStatus(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const config = getConfig();
  const entry = config.guilds[guild.id];

  if (!entry) {
    return interaction.reply({
      content: "This server has no linked pools.",
      ephemeral: true,
    });
  }

  const alliance = entry.alliance?.channel
    ? `<#${entry.alliance.channel}>`
    : "_Not linked_";

  let roundtable = "_Hidden_";

  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    roundtable = entry.roundtable?.channel
      ? `<#${entry.roundtable.channel}>`
      : "_Not linked_";
  }

  await interaction.reply({
    content:
      `**Alliance:** ${alliance}\n` +
      `**Round Table:** ${roundtable}`,
    ephemeral: true,
  });
}


async function handlePrefix(interaction) {
  const guild = interaction.guild;
  const value = interaction.options.getString("value");

  if (!value) {
    const current = getPrefix(guild.id, guild.name);
    return interaction.reply({
      content: `Current prefix: \`${current}\``,
      ephemeral: true,
    });
  }

  if (value.toLowerCase() === "reset") {
    const reset = resetPrefix(guild.id);
    if (!reset) {
      return interaction.reply({
        content: "This server is not registered in config yet.",
        ephemeral: true,
      });
    }
    return interaction.reply({
      content: `Prefix reset to: \`${reset}\``,
      ephemeral: true,
    });
  }

  const updated = setPrefix(guild.id, value);
  if (!updated) {
    return interaction.reply({
      content: "Could not set prefix. Make sure this server is linked first.",
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: `Prefix updated to: \`${updated}\``,
    ephemeral: true,
  });
}


async function handleServers(interaction) {
  const config = getConfig();
  const list = [];

  for (const [guildId, entry] of Object.entries(config.guilds)) {
    if (!entry.alliance?.channel) continue;
    list.push(entry.name || guildId);
  }

  if (list.length === 0) {
    return interaction.reply({
      content: "No servers are currently linked to the Alliance pool.",
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: "**Alliance Servers:**\n" + list.map(n => `• ${n}`).join("\n"),
    ephemeral: true,
  });
}


async function handleDebug(interaction) {
  const pool = interaction.options.getString("pool");
  const id = interaction.options.getString("id");

  const entry = getEntry(pool, id);
  const origin = getOriginAndRelays(pool, id);

  await interaction.reply({
    content:
      "```json\n" +
      JSON.stringify({ entry, origin }, null, 2) +
      "\n```",
    ephemeral: true,
  });
}


async function handleRepair(interaction) {
  prunePool("alliance");
  prunePool("roundtable");

  await interaction.reply({
    content: "Pruned and normalized message maps for both pools.",
    ephemeral: true,
  });
}