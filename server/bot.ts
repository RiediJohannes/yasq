import dotenv from 'dotenv';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChatInputCommandInteraction,
  Client,
  Collection,
  EmbedBuilder,
  GatewayIntentBits,
  GuildMember,
  MessageComponentInteraction,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
} from 'discord.js';
import type { AudioPlayer } from '@discordjs/voice';
import path from 'path';
import fs from 'fs';

import { capitalize, GAME_COVERS_DIR, getDisplayName, TRACK_AUDIO_DIR, type Playlist, type Track } from '@yasq/shared';

import { getTopLifetimePlayers, getPlayerRank, initDatabase } from './src/db.js';
import { isAllowed } from './src/access_control.js';
import { getAudioDuration, getFilePath } from './src/helper.js';

dotenv.config({ path: '../.env' });

const activeAudioPlayers = new Map<string, { player: AudioPlayer; voiceChannelId: string; skipFn: () => void }>();

export async function startDiscordBot() {
  await initDatabase().catch(err => console.error('Database init error:', err));

  if (!process.env.DISCORD_BOT_TOKEN) {
    console.warn('DISCORD_BOT_TOKEN is not set. Starting with no bot functionality.');
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.once('clientReady', () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case 'test':
        await handleTestCommand(interaction);
        break;
      case 'top':
        await handleTopCommand(interaction);
        break;
      case 'rank':
        await handleRankCommand(interaction);
        break;
      case 'play':
        await handlePlayCommand(interaction);
        break;
      case 'playlist':
        await handlePlaylistCommand(interaction);
        break;
      case 'skip':
        await handleSkipCommand(interaction);
        break;
      case 'leave':
        await handleLeaveCommand(interaction);
        break;
      default:
        console.warn(`Unknown command: ${interaction.commandName}`);
    }
  });

  client.login(process.env.DISCORD_BOT_TOKEN);
}

async function handleTestCommand(interaction: ChatInputCommandInteraction) {
  try {
    const username = interaction.user.username;
    await interaction.reply(`hallo, ${username}!`);
  } catch (error) {
    console.error('Failed to reply:', error);
  }
}

async function handleTopCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const topPlayers = await getTopLifetimePlayers(5);
    if (!topPlayers) {
      await interaction.editReply('❌ Could not retrieve the lifetime leaderboard. Please try again later.');
      return;
    }

    if (topPlayers.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🏆 Top YASQ Players')
        .setDescription('No game history found yet!');

      await interaction.editReply({ embeds: [emptyEmbed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f) // Gold
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

async function handleRankCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('player') || interaction.user;

  try {
    const stats = await getPlayerRank(targetUser.id);

    if (!stats) {
      await interaction.editReply(`❌ ${targetUser} hasn't played any recorded games yet!`);
      return;
    }

    const rankNumber = Number(stats.rank);

    const rankColor =
      rankNumber === 1
        ? 0xf1c40f // Gold
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

async function handlePlayCommand(interaction: ChatInputCommandInteraction) {
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
  const tracksFilePath = getFilePath('tracks.json');

  let tracks: Track[];
  try {
    tracks = JSON.parse(fs.readFileSync(tracksFilePath, 'utf8'));
  } catch (error) {
    console.error('Failed to read tracks.json:', error);
    await interaction.editReply('❌ Could not load the track list.');
    return;
  }

  // Split the search query into individual words for a smarter multi-keyword search
  const searchTerms = searchQuery.split(/\s+/).filter(Boolean);

  // Filter tracks by query string and user permission
  const matches = tracks
    .filter(t => {
      const combinedText = `${t.title} ${t.game}`.toLowerCase();
      const matchesQuery = searchTerms.every((term: string) => combinedText.includes(term));
      const allowed = isAllowed(interaction.user.id, t.audio);
      return matchesQuery && allowed;
    })
    .slice(0, 25);

  if (matches.length === 0) {
    await interaction.editReply(`❌ No tracks found matching "${searchQuery}".`);
    return;
  }

  // Shared playback logic used for both direct single-match execution and menu selection
  const handlePlayback = async (
    targetInteraction: ChatInputCommandInteraction | StringSelectMenuInteraction,
    chosenTrack: Track
  ) => {
    if (!isAllowed(interaction.user.id, chosenTrack.audio)) {
      await targetInteraction.editReply('❌ You do not have permission to play this track.');
      return;
    }

    const audioFilePath = path.join(getFilePath(TRACK_AUDIO_DIR), chosenTrack.audio);

    if (!fs.existsSync(audioFilePath)) {
      await targetInteraction.editReply(`❌ Audio file \`${chosenTrack.audio}\` could not be found on disk.`);
      return;
    }

    // Clean up audio player from playlist command if it exists
    if (activeAudioPlayers.has(interaction.guildId!)) {
      activeAudioPlayers.delete(interaction.guildId!);
    }

    try {
      const voiceSession = await connectToVoiceChannel(targetInteraction, voice);
      if (!voiceSession) {
        await targetInteraction.editReply(
          '❌ Failed to connect to the voice channel. Make sure you are in a voice channel!'
        );
        return;
      }

      const resource = voice.createAudioResource(audioFilePath, { inlineVolume: true });
      voiceSession.player.play(resource);

      const payload = buildTrackEmbedPayload(chosenTrack);
      await interaction.editReply({ content: '', ...payload });
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
    filter: (i: MessageComponentInteraction) => i.user.id === interaction.user.id,
    time: 30000,
  });

  collector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
    await selectInteraction.update({ content: 'Connecting and starting playback...', components: [] });

    const selectedValue = selectInteraction.values[0];
    if (!selectedValue) {
      await selectInteraction.editReply({ content: '❌ No selection was received.', components: [] });
      return;
    }

    const chosenTrack = matches[parseInt(selectedValue, 10)];
    if (!chosenTrack) {
      await selectInteraction.editReply({ content: '❌ Selected track could not be found.', components: [] });
      return;
    }

    await handlePlayback(selectInteraction, chosenTrack);

    if (followUpResponse) {
      await interaction.deleteReply(followUpResponse.id).catch(() => {});
    }
  });

  collector.on('end', async (collected: Collection<string, StringSelectMenuInteraction>) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: `⌛ Selection timed out for "${searchQuery}".` }).catch(() => {});
      await interaction.deleteReply(followUpResponse.id).catch(() => {});
    }
  });
}

async function handlePlaylistCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const voice = await import('@discordjs/voice');
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply('❌ You need to be in a voice channel first!');
    return;
  }

  const playlistsFilePath = getFilePath('playlists.json');
  const tracksFilePath = getFilePath('tracks.json');

  let playlists: Playlist[];
  let tracks: Track[];

  try {
    playlists = JSON.parse(fs.readFileSync(playlistsFilePath, 'utf8'));
    tracks = JSON.parse(fs.readFileSync(tracksFilePath, 'utf8'));
  } catch (error) {
    console.error('Failed to read playlist or track list:', error);
    await interaction.editReply('❌ Could not load playlist data.');
    return;
  }

  // Shared playlist playback logic
  const handlePlaylistPlayback = async (
    targetInteraction: ChatInputCommandInteraction | StringSelectMenuInteraction,
    selectedPlaylistName: string,
    followUpMessage?: any
  ) => {
    const playlist = playlists.find(p => p.name.toLowerCase() === selectedPlaylistName.toLowerCase());
    if (!playlist) {
      await targetInteraction.editReply('❌ Selected playlist not found.');
      return;
    }

    const playlistTracks = playlist.tracks
      .map(audioFile => tracks.find(t => t.audio === audioFile))
      .filter((t): t is Track => t !== undefined && isAllowed(interaction.user.id, t.audio));

    if (playlistTracks.length === 0) {
      await targetInteraction.editReply(`❌ No authorized tracks found in playlist "${playlist.name}".`);
      return;
    }

    try {
      const voiceSession = await connectToVoiceChannel(targetInteraction, voice);
      if (!voiceSession) {
        await targetInteraction.editReply(
          '❌ Failed to connect to the voice channel. Make sure you are in a voice channel!'
        );
        return;
      }

      let currentIndex = 0;

      const playNextTrack = () => {
        if (currentIndex >= playlistTracks.length) {
          if (interaction.channel instanceof TextChannel || interaction.channel?.isTextBased()) {
            (interaction.channel as TextChannel)
              .send(`✅ Finished playing playlist **${playlist.name}**.`)
              .catch(() => {});
          }
          activeAudioPlayers.delete(interaction.guildId!);
          return;
        }

        const currentTrack = playlistTracks[currentIndex++];
        if (!currentTrack) {
          interaction.editReply('❌ Track could not be found.');
          return;
        }

        if (!isAllowed(interaction.user.id, currentTrack.audio)) {
          interaction.editReply('❌ You do not have permission to play this track.');
          return;
        }

        const audioFilePath = path.join(getFilePath(TRACK_AUDIO_DIR), currentTrack.audio);

        if (!fs.existsSync(audioFilePath)) {
          playNextTrack();
          return;
        }

        const resource = voice.createAudioResource(audioFilePath, { inlineVolume: true });
        voiceSession.player.play(resource);

        const trackPayload = buildTrackEmbedPayload(currentTrack);
        const payload = {
          content: `▶️️ Playing playlist **${playlist.name}** (${currentIndex}/${playlistTracks.length}):`,
          ...trackPayload,
        };

        if (currentIndex === 1) {
          interaction.editReply(payload).catch(() => {});
        } else {
          if (interaction.channel instanceof TextChannel || interaction.channel?.isTextBased()) {
            (interaction.channel as TextChannel).send(payload).catch(() => {});
          }
        }
      };

      activeAudioPlayers.set(interaction.guildId!, {
        player: voiceSession.player,
        voiceChannelId: voiceSession.targetVoiceChannel.id,
        skipFn: () => {
          // Stopping the player triggers the Idle event, which loads the next track
          voiceSession.player.stop();
        },
      });

      voiceSession.player.on(voice.AudioPlayerStatus.Idle, () => {
        playNextTrack();
      });

      playNextTrack();

      // Clean up ephemeral message if it exists
      if (followUpMessage) {
        await interaction.deleteReply(followUpMessage.id).catch(() => {});
      }
    } catch (error) {
      console.error('Playlist playback error:', error);
      await targetInteraction.editReply('❌ Failed to connect or start playlist playback.');
    }
  };

  // Filter playlists based on user input, or get all if no input was provided
  const optionName = interaction.options.getString('name');
  const targetPlaylists = optionName
    ? playlists.filter(p => p.name.toLowerCase().includes(optionName.toLowerCase()))
    : playlists;

  if (targetPlaylists.length === 0) {
    await interaction.editReply(`❌ No playlists found${optionName ? ` matching "${optionName}"` : ''}.`);
    return;
  }

  // If exactly one match, play it directly without showing a dropdown
  if (targetPlaylists.length === 1) {
    await interaction.editReply('Connecting and starting playlist playback...');
    const playlist = targetPlaylists[0];
    if (!playlist) return;
    await handlePlaylistPlayback(interaction, playlist.name);
    return;
  }

  // If multiple matches, present a selection menu via an ephemeral follow-up
  await interaction.editReply({
    content: `🔍 Found **${targetPlaylists.length}** playlist(s)${optionName ? ` matching "${optionName}"` : ''}. Waiting for track selection...`,
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('playlist_select')
    .setPlaceholder('Select a playlist to play...')
    .addOptions(
      targetPlaylists.slice(0, 25).map(playlist => ({
        label: playlist.name.substring(0, 100),
        description: `Tracks: ${playlist.tracks.length}`.substring(0, 100),
        value: playlist.name,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const followUpResponse = await interaction.followUp({
    content: `Please select a playlist:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });

  const collector = followUpResponse.createMessageComponentCollector({
    filter: (i: MessageComponentInteraction) => i.user.id === interaction.user.id,
    time: 30000,
  });

  collector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
    await selectInteraction.update({ content: 'Connecting and starting playlist playback...', components: [] });

    const selectedPlaylistName = selectInteraction.values[0];
    if (!selectedPlaylistName) return;

    await handlePlaylistPlayback(selectInteraction, selectedPlaylistName, followUpResponse);
  });

  collector.on('end', async (collected: Collection<string, StringSelectMenuInteraction>) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: '⌛ Playlist selection timed out.' }).catch(() => {});
      await interaction.deleteReply(followUpResponse.id).catch(() => {});
    }
  });
}

async function handleSkipCommand(interaction: ChatInputCommandInteraction) {
  const activeSession = activeAudioPlayers.get(interaction.guildId!);
  if (!activeSession) {
    await interaction.reply({
      content: '❌ There is no active playlist playing right now.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Ensure the user is in a voice channel
  const member = interaction.member as GuildMember;
  const userChannelId = member.voice?.channelId;

  if (!userChannelId) {
    await interaction.reply({
      content: '❌ You must be in a voice channel to skip tracks.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Ensure the user is in the same voice channel as the bot
  if (userChannelId !== activeSession.voiceChannelId) {
    await interaction.reply({
      content: '❌ You must be in the same voice channel as the bot to skip tracks.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Trigger the skip
  activeSession.skipFn();
  await interaction.reply({
    content: '⏭️ Skipped to the next track!',
  });
}

async function handleLeaveCommand(interaction: ChatInputCommandInteraction) {
  const voice = await import('@discordjs/voice');
  const connection = voice.getVoiceConnection(interaction.guildId!);

  if (!connection) {
    await interaction.reply({
      content: '❌ I am not in a voice channel at the moment!',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member as GuildMember;
  const userChannelId = member.voice?.channelId;

  if (!userChannelId) {
    await interaction.reply({
      content: '❌ You must be in a voice channel to make me leave.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Ensure the user is in the same voice channel as the bot
  const botChannelId = connection.joinConfig.channelId;
  if (botChannelId && userChannelId !== botChannelId) {
    await interaction.reply({
      content: '❌ You must be in the same voice channel as the bot to make me leave.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  connection.destroy();

  if (activeAudioPlayers.has(interaction.guildId!)) {
    activeAudioPlayers.delete(interaction.guildId!);
  }

  await interaction.reply('👋 Bye!');
}

export async function connectToVoiceChannel(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  voice: any
) {
  const targetMember = await interaction.guild?.members.fetch(interaction.user.id);
  const targetVoiceChannel = targetMember?.voice.channel;

  if (!targetVoiceChannel) return null;

  const connection = voice.joinVoiceChannel({
    channelId: targetVoiceChannel.id,
    guildId: targetVoiceChannel.guild.id,
    adapterCreator: targetVoiceChannel.guild.voiceAdapterCreator,
  });

  // Wait up to 10 seconds for the connection to establish, or throw an error
  await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 10_000);
  const player = voice.createAudioPlayer();
  connection.subscribe(player);

  return { connection, player, targetVoiceChannel };
}

export function buildTrackEmbedPayload(track: Track) {
  const audioFilePath = path.join(getFilePath(TRACK_AUDIO_DIR), track.audio);
  const durationStr = fs.existsSync(audioFilePath) ? getAudioDuration(audioFilePath) : 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎶 Now Playing')
    .setDescription(`**${track.title}**`)
    .addFields(
      { name: 'Game', value: track.game, inline: true },
      { name: 'Duration', value: durationStr, inline: true }
    )
    .setTimestamp();

  if (Array.isArray(track.tags)) {
    for (const tag of track.tags) {
      embed.addFields({ name: capitalize(tag.type), value: tag.value, inline: true });
    }
  }

  const files: AttachmentBuilder[] = [];
  if (track.cover) {
    const coverPath = path.join(getFilePath(GAME_COVERS_DIR), track.cover);
    if (fs.existsSync(coverPath)) {
      const ext = path.extname(track.cover) || '.jpg';
      const attachmentName = `cover${ext}`;
      files.push(new AttachmentBuilder(coverPath, { name: attachmentName }));
      embed.setThumbnail(`attachment://${attachmentName}`);
    }
  }

  return { embeds: [embed], files };
}
