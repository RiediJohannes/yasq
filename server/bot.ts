import dotenv from 'dotenv';
import { Client, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import { getTopLifetimePlayers, getPlayerRank, initDatabase } from './db.js';
import { getDisplayName } from '@yasq/shared';

dotenv.config({ path: '../.env' });

export async function startDiscordBot() {
  await initDatabase().catch(err => console.error('Database init error:', err));

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once('clientReady', () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'test') {
      try {
        const username = interaction.user.username;
        await interaction.reply(`hallo, ${username}!`);
      } catch (error) {
        console.error('Failed to reply:', error);
      }
    }

    if (interaction.commandName === 'top') {
      await interaction.deferReply();

      try {
        const topPlayers = await getTopLifetimePlayers(5);

        if (topPlayers.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🏆 Top YASQ Players')
            .setDescription('No game history found yet!');

          await interaction.editReply({ embeds: [emptyEmbed] });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0xffd700) // Gold color
          .setTitle('🏆 Top YASQ Players');

        for (const p of topPlayers) {
          embed.addFields({
            name: `#${p.rank} — ${p.lifetime_points} pts`,
            value: `<@${p.user_id}> • *${p.games_played} game(s) played*`,
            inline: false,
          });
        }

        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Failed to fetch top lifetime players:', error);
        await interaction.editReply('An error occurred while fetching the lifetime leaderboard.');
      }
    }

    if (interaction.commandName === 'rank') {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser('user') || interaction.user;

      try {
        const stats = await getPlayerRank(targetUser.id);

        if (!stats) {
          const notFoundEmbed = new EmbedBuilder()
            .setColor(0xed4245) // Red
            .setDescription(`${targetUser} hasn't played any recorded games yet!`);

          await interaction.editReply({ embeds: [notFoundEmbed] });
          return;
        }

        const rankNumber = Number(stats.rank);

        const rankColor =
          rankNumber === 1
            ? 0xffd700 // Gold
            : rankNumber === 2
              ? 0xc0c0c0 // Silver
              : rankNumber === 3
                ? 0xcd7f32 // Bronze
                : 0x5865f2; // Default Blurple

        const rankDisplay =
          rankNumber === 1 ? '🥇 #1' : rankNumber === 2 ? '🥈 #2' : rankNumber === 3 ? '🥉 #3' : `#${rankNumber}`;

        const embed = new EmbedBuilder()
          .setColor(rankColor)
          .setAuthor({
            name: getDisplayName({
              ...targetUser,
              avatar: targetUser.avatar ?? '',
              global_name: targetUser.globalName!,
            }),
            iconURL: targetUser.displayAvatarURL(),
          })
          .addFields(
            { name: 'Global Rank', value: rankDisplay, inline: true },
            { name: 'Lifetime Points', value: `${stats.lifetime_points}`, inline: true },
            { name: 'Games Played', value: `${stats.games_played}`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Failed to fetch user lifetime stats:', error);
        await interaction.editReply('An error occurred while fetching your stats.');
      }
    }
  });

  client.login(process.env.DISCORD_BOT_TOKEN);
}
