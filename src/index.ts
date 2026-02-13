// discleanse - CLI entrypoint

import { cleanseServer } from "./wipe/server";

function getGuildId(): string {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    throw new Error("DISCORD_GUILD_ID environment variable is required");
  }
  return guildId;
}

async function main() {
  try {
    const guildId = getGuildId();
    await cleanseServer(guildId);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
