const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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

  application: {
    panelTitle: 'Заявка в клан',
    panelDescription: 'Нажми кнопку ниже чтобы подать заявку.\nМодераторы рассмотрят её как можно скорее.',
    resultChannelId: '1514861190386286622',
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
// ЗАЯВКИ
// ============================================================

async function sendApplicationPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(config.application.panelTitle)
    .setDescription(config.application.panelDescription);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('app_open')
      .setLabel('Подать заявку')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

client.on('interactionCreate', async (interaction) => {

  // Кнопка — открыть модальное окно
  if (interaction.isButton() && interaction.customId === 'app_open') {
    const modal = new ModalBuilder()
      .setCustomId('app_modal')
      .setTitle('Подать заявку');

    const nicknameInput = new TextInputBuilder()
      .setCustomId('nickname')
      .setLabel('Ваш ник в игре')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const ageInput = new TextInputBuilder()
      .setCustomId('age')
      .setLabel('Сколько вам лет?')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const activityInput = new TextInputBuilder()
      .setCustomId('activity')
      .setLabel('Готовы активить от 2 часов в войсках?')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const cheatInput = new TextInputBuilder()
      .setCustomId('cheat')
      .setLabel('Какой у вас чит?')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const sourceInput = new TextInputBuilder()
      .setCustomId('source')
      .setLabel('Откуда узнали о нашем клане?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nicknameInput),
      new ActionRowBuilder().addComponents(ageInput),
      new ActionRowBuilder().addComponents(activityInput),
      new ActionRowBuilder().addComponents(cheatInput),
      new ActionRowBuilder().addComponents(sourceInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // Получение заполненной формы
  if (interaction.isModalSubmit() && interaction.customId === 'app_modal') {
    const nickname = interaction.fields.getTextInputValue('nickname');
    const age = interaction.fields.getTextInputValue('age');
    const activity = interaction.fields.getTextInputValue('activity');
    const cheat = interaction.fields.getTextInputValue('cheat');
    const source = interaction.fields.getTextInputValue('source');

    const userId = interaction.user.id;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Новая заявка в клан')
      .addFields(
        { name: 'Ник в игре', value: nickname },
        { name: 'Возраст', value: age },
        { name: 'Активность (2+ часа в войсках)', value: activity },
        { name: 'Чит', value: cheat },
        { name: 'Откуда узнал о клане', value: source },
      )
      .setDescription(`Заявка от <@${userId}>`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_accept_${userId}`)
        .setLabel('Принять')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`app_deny_${userId}`)
        .setLabel('Отказать')
        .setStyle(ButtonStyle.Danger),
    );

    try {
      const resultChannel = interaction.guild.channels.cache.get(config.application.resultChannelId);
      if (resultChannel) {
        await resultChannel.send({ embeds: [embed], components: [row] });
      }
      await interaction.reply({ content: 'Заявка отправлена! Модераторы рассмотрят её в ближайшее время.', ephemeral: true });
    } catch (e) {
      console.error('Ошибка отправки заявки:', e);
      await interaction.reply({ content: 'Не удалось отправить заявку. Попробуй позже.', ephemeral: true });
    }
    return;
  }

  // Кнопки принять / отказать
  if (interaction.isButton()) {
    const isMod =
      interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
      interaction.member.roles.cache.some(r =>
        config.ignoredRoles.slice(0, 10).some(name => r.name.toUpperCase() === name.toUpperCase())
      );

    if (!isMod) {
      return interaction.reply({ content: 'Только модераторы могут рассматривать заявки.', ephemeral: true });
    }

    if (interaction.customId.startsWith('app_accept_')) {
      const targetUserId = interaction.customId.replace('app_accept_', '');

      // Обновляем embed — убираем кнопки, меняем цвет
      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setColor(0x57f287)
        .setFooter({ text: `Принял: ${interaction.user.username}` });

      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

      // ЛС игроку
      try {
        const targetUser = await client.users.fetch(targetUserId);
        await targetUser.send('Привет! Твоя заявка в клан была **принята**. Добро пожаловать!');
      } catch {
        console.log('Не удалось отправить ЛС пользователю');
      }

      // Лог
      await sendLog(interaction.guild, makeLogEmbed(
        0x57f287,
        'Заявка принята',
        `<@${targetUserId}> был принят в клан`,
        [{ name: 'Модератор', value: `<@${interaction.user.id}>`, inline: true }]
      ));

      await interaction.reply({ content: 'Заявка принята, игрок уведомлён в ЛС.', ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('app_deny_')) {
      const targetUserId = interaction.customId.replace('app_deny_', '');

      // Обновляем embed — убираем кнопки, меняем цвет
      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setColor(0xed4245)
        .setFooter({ text: `Отказал: ${interaction.user.username}` });

      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

      // ЛС игроку
      try {
        const targetUser = await client.users.fetch(targetUserId);
        await targetUser.send('Привет! Твоя заявка в клан была **отклонена**. Удачи в следующий раз!');
      } catch {
        console.log('Не удалось отправить ЛС пользователю');
      }

      // Лог
      await sendLog(interaction.guild, makeLogEmbed(
        0xed4245,
        'Заявка отклонена',
        `<@${targetUserId}> получил отказ`,
        [{ name: 'Модератор', value: `<@${interaction.user.id}>`, inline: true }]
      ));

      await interaction.reply({ content: 'Заявка отклонена, игрок уведомлён в ЛС.', ephemeral: true });
      return;
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'app-panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Только для администраторов.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await sendApplicationPanel(interaction.channel);
    await interaction.editReply({ content: 'Панель заявок отправлена!' });
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
        0xe74c3c, 'Инвайт на другой сервер',
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
        0xe67e22, 'Ссылка в чате',
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
        0x9b59b6, 'Спам тегами',
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
        0x3498db, 'Спам сообщениями',
        `${tag} получил мут на ${config.muteDurationMinutes} мин.`,
        [{ name: 'Сообщений', value: `${history.length} за ${config.spam.windowSeconds} сек.`, inline: true }]
      ));
    }
  }
});

// ============================================================
// СТАРТ
// ============================================================

client.once('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);
  try {
    const guild = client.guilds.cache.get('1514647929732988948');
    if (guild) {
      // Удаляем все старые команды и регистрируем заново — без дублей
      await guild.commands.set([
        {
          name: 'app-panel',
          description: 'Отправить панель заявок в клан (только для админов)',
        }
      ]);
      console.log('Команда /app-panel зарегистрирована');
    }
  } catch (e) {
    console.error('Ошибка регистрации команды:', e.message);
  }
});

client.login(config.token);

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error.message);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
});

client.on('error', (error) => {
  console.error('Client error:', error.message);
});
