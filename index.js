const https = require('https');
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

  ai: {
    channelId: '1514876453848612914',
    allowedRoleIds: [
      '1514652354769715321',
      '1514652351523328080',
      '1514652350122557582',
      '1514652348830584913',
      '1514652347500859545',
      '1514652346360135842',
      '1514652344984404008',
      '1514652343520591893',
      '1514652341926887434',
      '1514652340664406207',
      '1514652339192070234',
      '1514652337891704903',
      '1514652336428023999',
      '1514648192833294449',
      '1514881519733444660',
      '1514652332632309921',
    ],
  },

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
    .setAuthor({ name: 'Набор' })
    .setTitle('Sexy')
    .setDescription('Вступай к нам становись сильнее')
    .setImage('https://cdn.discordapp.com/attachments/1514652482020704506/1514875294375477309/preview.png?ex=6a2cf50f&is=6a2ba38f&hm=6a76851428193255139b4e231db0ee72b162cf7948d51b921c67257351c187d2&');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('app_open')
      .setLabel('Подать заявку')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

const processedInteractions = new Set();
const recentSubmissions = new Map();

client.on('interactionCreate', async (interaction) => {
  if (processedInteractions.has(interaction.id)) return;
  processedInteractions.add(interaction.id);
  setTimeout(() => processedInteractions.delete(interaction.id), 30000);


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
    const userId = interaction.user.id;
    const now = Date.now();
    if (recentSubmissions.has(userId) && now - recentSubmissions.get(userId) < 10000) {
      return interaction.reply({ content: 'Подожди немного перед повторной отправкой.', ephemeral: true });
    }
    recentSubmissions.set(userId, now);
    setTimeout(() => recentSubmissions.delete(userId), 10000);
    const nickname = interaction.fields.getTextInputValue('nickname');
    const age = interaction.fields.getTextInputValue('age');
    const activity = interaction.fields.getTextInputValue('activity');
    const cheat = interaction.fields.getTextInputValue('cheat');
    const source = interaction.fields.getTextInputValue('source');

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

    // Сначала отвечаем Discord чтобы заблокировать повторный вызов
    await interaction.deferReply({ ephemeral: true });

    try {
      const resultChannel = interaction.guild.channels.cache.get(config.application.resultChannelId);
      if (resultChannel) {
        // Проверяем не было ли уже заявки от этого юзера за последние 30 сек
        const recent = await resultChannel.messages.fetch({ limit: 10 });
        const alreadySent = recent.find(m =>
          m.author.id === client.user.id &&
          m.embeds[0]?.description === `Заявка от <@${userId}>` &&
          Date.now() - m.createdTimestamp < 30000
        );
        if (alreadySent) {
          return interaction.editReply({ content: 'Заявка уже отправлена!' });
        }
        await resultChannel.send({ embeds: [embed], components: [row] });
      }
      await interaction.editReply({ content: 'Заявка отправлена! Модераторы рассмотрят её в ближайшее время.' });
    } catch (e) {
      console.error('Ошибка отправки заявки:', e);
      try { await interaction.editReply({ content: 'Не удалось отправить заявку. Попробуй позже.' }); } catch {}
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
// MISTRAL AI
// ============================================================

function callMistralOnce(userMessage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Ты помощник в Discord сервере клана. Отвечай коротко и по делу на русском языке.' },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('Mistral response status:', res.statusCode, JSON.stringify(json).slice(0, 300));
          if (!json.choices || !json.choices[0]) {
            return reject(new Error(json.error?.message || `HTTP ${res.statusCode}: No choices in response`));
          }
          resolve(json.choices[0].message.content.trim());
        } catch (e) {
          console.error('Mistral parse error, raw:', data.slice(0, 300));
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Mistral request error:', e.message);
      reject(e);
    });
    req.write(payload);
    req.end();
  });
}

async function callMistral(userMessage) {
  return callMistralOnce(userMessage);
}

// ============================================================
// АВТОМОДЕРАЦИЯ
// ============================================================

const processedMessages = new Set();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // AI чат
  if (message.channelId === config.ai.channelId) {
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 30000);

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    const hasRole = member && config.ai.allowedRoleIds.some(id =>
      member.roles.cache.has(id)
    );
    if (!hasRole) {
      const reply = await message.reply({ content: 'У вас нет роли чтобы писать боту сообщение.' });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      try { await message.delete(); } catch {}
      return;
    }
    try {
      await message.channel.sendTyping();
      const response = await callMistral(message.content);
      await message.reply({ content: response });
    } catch (e) {
      console.error('Ошибка Mistral:', e.message || e);
      await message.reply({ content: '⚠️ Ошибка AI, попробуй позже.' }).catch(() => {});
    }
    return;
  }

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
      // Сбрасываем ВСЕ команды и регистрируем только одну
      await guild.commands.set([]);
      await client.application.commands.set([]);
      await guild.commands.set([
        {
          name: 'app-panel',
          description: 'Отправить панель заявок в клан (только для админов)',
        }
      ]);
      console.log('Все старые команды удалены, /app-panel зарегистрирована');
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
