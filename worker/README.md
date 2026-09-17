# Бэкенд приёма платежей (Cloudflare Worker)

Один бесплатный "воркер" в облаке Cloudflare, который:
- по запросу с сайта создаёт ссылку на оплату Robokassa (цену пакета Старс
  берёт из своей же таблицы, а не из запроса — так её нельзя подделать);
- принимает от Robokassa подтверждение оплаты (ResultURL), проверяет подпись
  и начисляет Старс нужному пользователю в Firestore.

## Разово: установка и вход

```bash
cd worker
npm install -g wrangler   # если ещё не установлен
wrangler login            # откроет браузер для входа в Cloudflare (бесплатный аккаунт подходит)
```

## Секреты — задать один раз после установки

Это данные, которые нельзя хранить в репозитории. Для каждого — своя команда,
`wrangler` спросит значение в терминале:

```bash
wrangler secret put ROBOKASSA_PASSWORD1
wrangler secret put ROBOKASSA_PASSWORD2
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY
```

- `ROBOKASSA_PASSWORD1` / `ROBOKASSA_PASSWORD2` — из личного кабинета
  Robokassa (Настройки → Технические настройки).
- `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` — из JSON-файла сервисного
  аккаунта Firebase: Console → Настройки проекта → Сервисные аккаунты →
  "Создать новый закрытый ключ" (скачается .json). Внутри файла — поля
  `client_email` и `private_key` (это длинный текст, начинается с
  `-----BEGIN PRIVATE KEY-----`, вставлять целиком, вместе с переносами строк).

Также поправить `ROBOKASSA_MERCHANT_LOGIN` в `wrangler.toml` (это не секрет,
просто логин магазина) и убрать `ROBOKASSA_TEST_MODE = "1"`, когда будете
готовы принимать настоящие платежи (в тестовом режиме Robokassa не списывает
реальные деньги).

## Деплой

```bash
wrangler deploy
```

Выведет адрес вида `https://vat-payments.<ваш-поддомен>.workers.dev` — его
нужно указать в личном кабинете Robokassa как:
- **ResultURL**: `https://.../robokassa/result`
- **SuccessURL**: `https://.../robokassa/success`
- **FailURL**: `https://.../robokassa/fail`

## Проверка

```bash
wrangler tail
```

покажет логи в реальном времени — удобно смотреть при тестовом платеже,
проходит ли подпись и начисление.
