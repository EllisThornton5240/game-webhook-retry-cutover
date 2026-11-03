import { infrai } from './infrai';
import { buildModerationWebhook, playerAssetEventSchema, signPayload } from './game_events';

const MODERATION_WEBHOOK_URL = process.env.MODERATION_WEBHOOK_URL ?? 'http://127.0.0.1:8787/moderation/webhook';
const MODERATION_WEBHOOK_SECRET = process.env.MODERATION_WEBHOOK_SECRET ?? 'dev-secret';

export async function registerDlqWebhook() {
  const url = process.env.DLQ_WEBHOOK_URL;
  if (!url) throw new Error('DLQ_WEBHOOK_URL is required for queue.dlq notifications');
  const result = await infrai.account.webhooks.register({
    url,
    events: ['queue.dlq'],
    description: 'asset moderation queue dead-letter notifications',
    secret: MODERATION_WEBHOOK_SECRET,
    retry_policy: { max_attempts: 5 },
    headers: { 'x-game-product': 'live-events' }
  });
  return result.data;
}

export async function processOnce() {
  const consumed = await infrai.queue.consume({
    queue: 'asset-moderation',
    max_messages: 1,
    visibility_timeout: 30
  });

  const messages = consumed.data.messages ?? [];
  if (messages.length === 0) {
    console.log(JSON.stringify({ processed: 0 }, null, 2));
    return;
  }

  const message = messages[0];
  const event = playerAssetEventSchema.parse(message.payload);
  const outbound = buildModerationWebhook(event, message.message_id);
  const body = JSON.stringify(outbound);
  const signature = signPayload(body, MODERATION_WEBHOOK_SECRET);

  const response = await fetch(MODERATION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-infrai-signature': signature
    },
    body
  });

  if (response.ok) {
    await infrai.queue.ack('asset-moderation', message.message_id);
    console.log(JSON.stringify({ processed: 1, action: outbound.action, queue_message_id: message.message_id }, null, 2));
    return;
  }

  await infrai.queue.nack('asset-moderation', message.message_id);
  throw new Error(`moderation receiver returned ${response.status}`);
}

async function main() {
  const command = process.argv[2] ?? 'process';
  if (command === 'register') {
    const webhook = await registerDlqWebhook();
    console.log(JSON.stringify({ webhook }, null, 2));
    return;
  }
  await processOnce();
}

if (process.argv[1]) {
  const current = new URL(`file://${process.argv[1]}`).href;
  if (import.meta.url === current) {
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}

