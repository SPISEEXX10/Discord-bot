const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const config = {
  token: process.env.DISCORD_TOKEN,

  logChannelId: '1514652466807963669',

  mutedRoleName: 'Muted',
  muteDurationMinutes: 10,

  spam: {
    maxMessages: 5,
    windowSeconds: 5,
  },

  maxMentions: 4,

  ignoredRoles: [
    'OWNER', 'CO.OWNER', 'CCG', 'ADMINISTRATOR', 'ML.ADMINISTRATOR',
    'FAME', 'PRIME ARCHANGEL', 'TEX.ADMIN', 'CURATOR',
    'SUPPORT', 'MEDIA', 'MODERATOR', 'ML.MODERATOR', 'HELPER',
  ],

  tickets: {
    modRoleName: 'MODERATOR',
    categoryId: '1514652390283018311',
    channelPrefix: 'ticket-',
    panelTitle: '🎫 Поддержка',
    panelDescription: 'Нажми кнопку ниже чтобы открыть тикет.\nМодераторы ответят как можно скорее.',
  },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

const messageHistory = new Map();

function cleanHistory(userId) {
  const now = Date.now();
  const window = config.spam.windowSeconds * 1000;
  const history = messageHistory.get(userId) || [];
  const fresh = history.filter(t => now - t < window);
  messageHistory.set(userId, fresh);
  return fresh;
}

async function sendLog(guild, embed) {
  console.log(`[MOD] ${embed.data.title} — ${embed.data.description}`);
  if (!config.logChannelId) return;
  try {
    const ch = guild.channels.cache.get(config.logChannelId);
    if (ch && ch.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error('Не смог отправить лог:', e.message);
  }
}

async function muteMember(member, reason, durationMs) {
  try {
    if (member.moderatable) {
      await member.timeout(durationMs, reason);
      return 'timeout';
    }
    const role = member.guild.roles.cache.find(r => r.name === config.mutedRoleName);
    if (role) {
      await member.roles.add(role, reason);
      setTimeout(() => member.roles.remove(role).catch(() => {}), durationMs);
      return 'role';
    }
    return null;
  } catch (e) {
    console.error('Ошибка мута:', e.message);
    return null;
  }
}

function makeLogEmbed(color, title, description, fields = []) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .addFields(fields);
}

function hasLinks(content) {
  return /https?:\/\//i.test(content) || /discord\.gg\//i.test(content);
}

function hasInvite(content) {
  return /discord\.gg\/[a-z0-9]+/i.test(content);
}

function countMentions(message) {
  return message.mentions.users.size + message.mentions.roles.size;
}

function isIgnored(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return config.ignoredRoles.some(name =>
    member.roles.cache.some(r => r.name.toUpperCase() === name.toUpperCase())
  );
}

// ============================================================
// ТИКЕТЫ
// ============================================================

async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(config.tickets.panelTitle)
    .setDescription(config.tickets.panelDescription)
    .setFooter({ text: 'Один открытый тикет на пользователя' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_create')
      .setLabel('📩 Открыть тикет')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

async function createTicketChannel(guild, user) {
  const ticketConf = config.tickets;
  const modRole = guild.roles.cache.find(r => r.name.toUpperCase() === ticketConf.modRoleName.toUpperCase());

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (modRole) {
    permissionOverwrites.push({
      id: modRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const channelOptions = {
    name: `${ticketConf.channelPrefix}${user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites,
    topic: `Тикет пользователя ${user.tag} | ID: ${user.id}`,
  };

  if (ticketConf.categoryId) {
    channelOptions.parent = ticketConf.categoryId;
  }

  const ticketChannel = await guild.channels.create(channelOptions);

  const welcomeEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Тикет открыт')
    .setDescription(`Привет, <@${user.id}>! Опиши свою проблему, модератор ответит как можно скорее.`)
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('🔒 Закрыть тикет')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: modRole ? `<@${user.id}> | <@&${modRole.id}>` : `<@${user.id}>`,
    embeds: [welcomeEmbed],
    components: [closeRow],
  });

  return ticketChannel;
}

async function closeTicket(channel, closedBy) {
  const closeEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔒 Тикет закрывается')
    .setDescription(`Закрыто модератором <@${closedBy.id}>. Канал удалится через 5 секунд.`)
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] });
  await sendLog(channel.guild, makeLogEmbed(
    0xed4245,
    '🎫 Тикет закрыт',
    `Канал \`${channel.name}\` закрыт`,
    [{ name: 'Закрыл', value: `<@${closedBy.id}>`, inline: true }]
  ));

  setTimeout(() => channel.delete('Тикет закрыт').catch(() => {}), 5000);
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === 'ticket_create') {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const user = interaction.user;

      const existing = guild.channels.cache.find(
        ch => ch.name === `${config.tickets.channelPrefix}${user.username}` && ch.type === ChannelType.GuildText
      );

      if (existing) {
        return interaction.editReply({ content: `У тебя уже есть открытый тикет: <#${existing.id}>` });
      }

      try {
        const ticketCh = await createTicketChannel(guild, user);
        await interaction.editReply({ content: `Тикет создан: <#${ticketCh.id}>` });
        await sendLog(guild, makeLogEmbed(
          0x57f287,
          '🎫 Новый тикет',
          `<@${user.id}> открыл тикет`,
          [{ name: 'Канал', value: `<#${ticketCh.id}>`, inline: true }]
        ));
      } catch (e) {
        console.error('Ошибка создания тикета:', e);
        await interaction.editReply({ content: 'Не удалось создать тикет. Проверь права бота.' });
      }
      return;
    }

    if (interaction.customId === 'ticket_close') {
      const member = interaction.member;
      const isMod =
        member.permissions.has(PermissionFlagsBits.ManageMessages) ||
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.some(r => r.name.toUpperCase() === config.tickets.modRoleName.toUpperCase());

      if (!isMod) {
        return interaction.reply({ content: '❌ Только модераторы могут закрывать тикеты.', ephemeral: true });
      }

      await interaction.reply({ content: 'Закрываю тикет...', ephemeral: true });
      await closeTicket(interaction.channel, interaction.user);
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'ticket-panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Только для администраторов.', ephemeral: true });
    }
    await sendTicketPanel(interaction.channel);
    await interaction.reply({ content: '✅ Панель тикетов отправлена!', ephemeral: true });
  }
});

// ============================================================
// АВТОМОДЕРАЦИЯ
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;
  if (isIgnored(member)) return;

  const content = message.content;
  const durationMs = config.muteDurationMinutes * 60 * 1000;
  const tag = `<@${message.author.id}>`;

  if (hasInvite(content)) {
    try { await message.delete(); } catch {}
    const muteResult = await muteMember(member, 'Реклама другого сервера', durationMs);
    if (muteResult) {
      await sendLog(message.guild, makeLogEmbed(
        0xe74c3c, '🔗 Инвайт на другой сервер',
        `${tag} получил мут на ${config.muteDurationMinutes} мин.`,
        [{ name: 'Канал', value: `<#${message.channelId}>`, inline: true }]
      ));
    }
    return;
  }

  if (hasLinks(content)) {
    try { await message.delete(); } catch {}
    const muteResult = await muteMember(member, 'Отправка ссылок', durationMs);
    if (muteResult) {
      await sendLog(message.guild, makeLogEmbed(
        0xe67e22, '🔗 Ссылка в чате',
        `${tag} получил мут на ${config.muteDurationMinutes} мин.`,
        [{ name: 'Канал', value: `<#${message.channelId}>`, inline: true }]
      ));
    }
    return;
  }

  const mentionCount = countMentions(message);
  if (mentionCount > config.maxMentions) {
    try { await message.delete(); } catch {}
    const muteResult = await muteMember(member, `Спам тегами (${mentionCount})`, durationMs);
    if (muteResult) {
      await sendLog(message.guild, makeLogEmbed(
        0x9b59b6, '📣 Спам тегами',
        `${tag} получил мут на ${config.muteDurationMinutes} мин.`,
        [{ name: 'Тегов', value: `${mentionCount}`, inline: true }, { name: 'Канал', value: `<#${message.channelId}>`, inline: true }]
      ));
    }
    return;
  }

  const history = cleanHistory(message.author.id);
  history.push(Date.now());
  messageHistory.set(message.author.id, history);

  if (history.length >= config.spam.maxMessages) {
    try {
      const msgs = await message.channel.messages.fetch({ limit: 20 });
      const toDelete = msgs.filter(m =>
        m.author.id === message.author.id &&
        Date.now() - m.createdTimestamp < config.spam.windowSeconds * 1000
      );
      await message.channel.bulkDelete(toDelete).catch(() => {});
    } catch {}

    messageHistory.set(message.author.id, []);

    const muteResult = await muteMember(member, 'Спам сообщениями', durationMs);
    if (muteResult) {
      await sendLog(message.guild, makeLogEmbed(
        0x3498db, '🚨 Спам сообщениями',
        `${tag} получил мут на ${config.muteDurationMinutes} мин.`,
        [{ name: 'Сообщений', value: `${history.length} за ${config.spam.windowSeconds} сек.`, inline: true }]
      ));
    }
  }
});

// ============================================================
// СТАРТ
// ============================================================

client.once('ready', async () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  try {
    await client.guilds.cache.get('1514647929732988948')?.commands.create({
      name: 'ticket-panel',
      description: 'Отправить панель создания тикетов (только для админов)',
    });
    console.log('✅ Команда /ticket-panel зарегистрирована');
  } catch (e) {
    console.error('Ошибка регистрации команды:', e.message);
  }
});

client.login(config.token);
