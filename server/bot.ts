import dotenv from 'dotenv';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';

import { getTopLifetimePlayers, getPlayerRank, initDatabase } from './db.js';
import { getDisplayName, type Track } from '@yasq/shared';
import path from 'path';
import fs from 'fs';
import { isAllowed } from './src/access_control.js';

dotenv.config({ path: '../.env' });

export async function startDiscordBot() {
  await initDatabase().catch(err => console.error('Database init error:', err));

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
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

    if (interaction.commandName === 'play') {
      await interaction.deferReply();

      // Dynamically load voice library *only* when the command is run,
      // preventing any startup lockup or compilation freeze.
      const voice = await import('@discordjs/voice');

      const member = interaction.guild?.members.cache.get(interaction.user.id);
      const voiceChannel = member?.voice.channel;

      if (!voiceChannel) {
        await interaction.editReply('❌ You need to be in a voice channel first!');
        return;
      }

      const searchQuery = interaction.options.getString('track', true).toLowerCase();
      const dataDir = process.env.DATA_SOURCE || 'sample';
      const tracksFilePath = path.join(process.cwd(), 'data', dataDir, 'tracks.json');

      let tracks: Track[];
      try {
        const fileContent = fs.readFileSync(tracksFilePath, 'utf8');
        tracks = JSON.parse(fileContent);
      } catch (error) {
        console.error('Failed to read tracks.json:', error);
        await interaction.editReply('❌ Could not load the track database.');
        return;
      }

      // Split the search query into individual words for a smarter multi-keyword search
      const searchTerms = searchQuery.split(/\s+/).filter(Boolean);

      // Filter tracks by query string and user permission
      const matches = tracks
        .filter(t => {
          const combinedText = `${t.title} ${t.game}`.toLowerCase();
          const matchesQuery = searchTerms.every(term => combinedText.includes(term));
          const allowed = isAllowed(interaction.user.id, t.audio);
          return matchesQuery && allowed;
        })
        .slice(0, 25);

      if (matches.length === 0) {
        await interaction.editReply(`❌ No tracks found matching "${searchQuery}".`);
        return;
      }

      // Shared playback logic used for both direct single-match execution and menu selection
      const handlePlayback = async (targetInteraction: any, chosenTrack: Track) => {
        if (!isAllowed(interaction.user.id, chosenTrack.audio)) {
          await targetInteraction.editReply('❌ You do not have permission to play this track.');
          return;
        }

        const audioFilePath = path.join(process.cwd(), 'data', dataDir, 'music', chosenTrack.audio);

        if (!fs.existsSync(audioFilePath)) {
          await targetInteraction.editReply(`❌ Audio file \`${chosenTrack.audio}\` could not be found on disk.`);
          return;
        }

        try {
          // Ensure the member and their voice state are fully fetched (fixes cache misses)
          const targetMember = await targetInteraction.guild?.members.fetch(interaction.user.id);
          const targetVoiceChannel = targetMember?.voice.channel;

          if (!targetVoiceChannel) {
            await targetInteraction.editReply('❌ You must be in a voice channel!');
            return;
          }

          const connection = voice.joinVoiceChannel({
            channelId: targetVoiceChannel.id,
            guildId: targetVoiceChannel.guild.id,
            adapterCreator: targetVoiceChannel.guild.voiceAdapterCreator,
          });

          // Wait up to 10 seconds for the connection to establish, or throw an error
          await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 10_000);

          const player = voice.createAudioPlayer();
          const resource = voice.createAudioResource(audioFilePath, { inlineVolume: true });

          connection.subscribe(player);
          player.play(resource);

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎶 Now Playing')
            .setDescription(`**${chosenTrack.title}**`)
            .addFields({ name: 'Game', value: chosenTrack.game, inline: true })
            .setTimestamp();

          if (Array.isArray(chosenTrack.tags)) {
            for (const tag of chosenTrack.tags) {
              const fieldName = tag.type.charAt(0).toUpperCase() + tag.type.slice(1);
              embed.addFields({
                name: fieldName,
                value: tag.value,
                inline: true,
              });
            }
          }

          const files: AttachmentBuilder[] = [];

          if (chosenTrack.cover) {
            const coverPath = path.join(process.cwd(), 'data', dataDir, 'game_covers', chosenTrack.cover);

            if (fs.existsSync(coverPath)) {
              const ext = path.extname(chosenTrack.cover) || '.jpg';
              const attachmentName = `cover${ext}`;

              const attachment = new AttachmentBuilder(coverPath, { name: attachmentName });
              embed.setThumbnail(`attachment://${attachmentName}`);
              files.push(attachment);
            }
          }

          await interaction.editReply({
            content: '',
            embeds: [embed],
            files: files,
          });
        } catch (error) {
          console.error('Voice connection/playback error:', error);
          await targetInteraction.editReply('❌ Failed to connect to the voice channel or start playback.');
        }
      };

      // If there is only one match, skip the selection menu entirely and play it directly
      if (matches.length === 1) {
        const singleTrack = matches[0];
        if (!singleTrack) {
          await interaction.editReply('❌ Track could not be found.');
          return;
        }
        await interaction.editReply('Connecting and starting playback...');
        await handlePlayback(interaction, singleTrack);
        return;
      }

      // Otherwise, present the select menu for multiple matches via an ephemeral follow-up
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('track_select')
        .setPlaceholder('Select a track to play...')
        .addOptions(
          matches.map((track, index) => ({
            label: track.title.substring(0, 100),
            description: track.game.substring(0, 100),
            value: String(index),
          }))
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.editReply('Awaiting track selection...');

      const followUpResponse = await interaction.followUp({
        content: `🔍 Found **${matches.length}** track(s) for "${searchQuery}":`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });

      const collector = followUpResponse.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 30000,
      });

      collector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
        await selectInteraction.update({ content: 'Connecting and starting playback...', components: [] });

        const selectedValue = selectInteraction.values[0];
        if (!selectedValue) {
          await selectInteraction.editReply({ content: '❌ No selection was received.', components: [] });
          return;
        }

        const selectedIndex = parseInt(selectedValue, 10);
        const chosenTrack = matches[selectedIndex];
        if (!chosenTrack) {
          await selectInteraction.editReply({ content: '❌ Selected track could not be found.', components: [] });
          return;
        }

        await handlePlayback(selectInteraction, chosenTrack);

        await interaction.deleteReply(followUpResponse.id).catch(() => {});
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({ content: `⌛ Selection timed out for "${searchQuery}".` }).catch(() => {});
          await interaction.deleteReply(followUpResponse.id).catch(() => {});
        }
      });
    }

    if (interaction.commandName === 'leave') {
      const voice = await import('@discordjs/voice');
      const connection = voice.getVoiceConnection(interaction.guildId!);

      if (!connection) {
        await interaction.reply({ content: '❌ I am not in a voice channel at the moment!', ephemeral: true });
        return;
      }

      connection.destroy();
      await interaction.reply('👋 Bye!');
    }
  });

  client.login(process.env.DISCORD_BOT_TOKEN);
}
