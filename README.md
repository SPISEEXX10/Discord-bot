# Discord AutoMod Bot

Бот автоматически мутит за:
- 🔇 **Спам** — 5+ сообщений за 5 секунд
- 🔗 **Ссылки** — любые http:// или https://
- 📨 **Инвайты** — ссылки discord.gg на другой сервак
- 📣 **Спам тегами** — @упоминания 4+ человека/роли в одном сообщении

---

## Быстрый старт

### 1. Создай бота на Discord Developer Portal
1. Зайди на https://discord.com/developers/applications
2. **New Application** → дай имя
3. Перейди в **Bot** → **Add Bot**
4. Скопируй **токен** (нужен ниже)
5. Включи:
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
6. Перейди в **OAuth2 → URL Generator**
   - Scopes: `bot`
   - Bot Permissions: `Manage Roles`, `Moderate Members`, `Manage Messages`, `Read Message History`, `Send Messages`
7. Скопируй ссылку и пригласи бота на сервер

### 2. Настрой config в index.js

```js
const config = {
  token: 'ВАШ_ТОКЕН_СЮДА',
  logChannelId: 'ID_КАНАЛА_ДЛЯ_ЛОГОВ',   // создай канал #mod-logs
  muteDurationMinutes: 10,                 // длина мута
  spam: {
    maxMessages: 5,   // сообщений за...
    windowSeconds: 5, // ...секунд
  },
  maxMentions: 4,     // макс. тегов в одном сообщении
};
```

Или через переменные окружения:
```
DISCORD_TOKEN=токен
LOG_CHANNEL_ID=айди_канала
```

### 3. Создай роль Muted (запасной вариант)
Если у бота нет права `Moderate Members`, он использует роль:
1. Создай роль `Muted`
2. В каждом канале отними у неё право **Отправка сообщений**
3. Роль бота должна стоять **выше** роли Muted в списке

### 4. Запуск

```bash
npm install
node index.js
```

---

## Структура файлов

```
discord-bot/
├── index.js      — весь код бота
├── package.json
└── README.md
```

---

## Кто не трогается

Боты и пользователи с правами:
- `Manage Messages`
- `Administrator`
- Роли: Admin, Moderator, Moder, Модератор, Администратор

Добавь свои в `config.ignoredRoles`.
