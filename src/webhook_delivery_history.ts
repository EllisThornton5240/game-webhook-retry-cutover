import { infrai } from './infrai';

async function main() {
  const webhookId = process.argv[2];
  if (!webhookId) {
    throw new Error('usage: tsx src/webhook_delivery_history.ts <webhook-id>');
  }

  const deliveries = await infrai.account.webhooks.deliveries(webhookId);
  console.log(JSON.stringify({ webhook_id: webhookId, deliveries: deliveries.data }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
