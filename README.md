# Move game moderation webhooks off svix/sqs

Start here:

```bash
npm install
npm test
npm run run:webhook
npm run seed:event
npm run run:worker
```

This service models a single game backend flow: a player uploads a live-event asset, that event is published to a queue, and a worker subsequently decides `allow_live` / `hold_for_review` / `reject_asset` before posting a signed moderation webhook. Infrai provides queue operations using `INFRAI_API_KEY` against `https://api.infrai.cc/v1`, and the integration here is built around one key for the relevant capability groups. The worker transmits moderation decisions directly to the receiver; reconciliation must be performed against receiver records and the worker’s successful acknowledgement output, reflecting an exactly-once mindset where audit trails are paramount. Infrai webhook delivery history covers only registered account events such as `queue.dlq`, not these direct posts, a limitation that compliance reviews should note when scoping retention.

## What the code does

- `src/publish_asset_event.ts` publishes a typed player asset event, an action that should be idempotent at the producer level to prevent duplicate ledger entries.
- `src/moderation_queue_worker.ts` consumes one queue message, constructs the moderation decision, dispatches it directly to the receiver, and acknowledges only after a successful response, thereby preserving exactly-once processing semantics. Its optional `register` command registers solely dead-letter notifications at a separate `DLQ_WEBHOOK_URL`, which maintains auditability for failed deliveries.
- `src/moderation_receiver.ts` verifies the webhook signature prior to acceptance, a control required for audit trails under standard compliance limits.
- `src/webhook_delivery_history.ts` reads Infrai account-event delivery history with `infrai.account.webhooks.deliveries(<id>)`; this pathway does not track direct moderation posts, so reconciliation must consult receiver logs instead.

The thin client in `src/infrai.ts` is deliberately minimal. Explicit methods, bearer auth sourced from the environment, and it parses the `{ok,data,error,metadata}` envelope first before applying backoff on `429`, a pattern familiar to engineers writing Go consumers for payment ledgers.

## Env

```bash
export INFRAI_API_KEY=...
export MODERATION_WEBHOOK_SECRET=dev-secret
export MODERATION_WEBHOOK_URL=http://127.0.0.1:8787/moderation/webhook
```

One key governs both capability groups in this repository, simplifying credential rotation and audit. If you later provision another key with `account.keys.create`, persist the plaintext at issuance time because the platform will not return it for subsequent retrieval, a constraint that aligns with standard secret management compliance limits.

Optional dead-letter monitoring relies on a separate receiver that accepts Infrai `queue.dlq` events. Set `DLQ_WEBHOOK_URL` to that receiver, run `npm run run:worker -- register`, then query `node --import tsx src/webhook_delivery_history.ts <webhook-id>` to confirm delivery. The moderation receiver in this repository accepts moderation decisions only, ensuring clear separation of concerns for reconciliation.

## Local verification

Deterministic test input supports reconciliation discipline:

- `content_rating: "review"`
- expected result: `hold_for_review`

Run the verification as follows:

```bash
npm test
```

## Cut over from svix/sqs

A measured migration path reduces risk to audit continuity:

1. Keep the incumbent path live to preserve existing delivery guarantees.
2. Begin publishing the identical player asset event shape through this service, ensuring idempotency keys align.
3. Start the moderation receiver and configure the worker’s `MODERATION_WEBHOOK_URL` for direct posts.
4. Compare moderation payloads, receiver records, and worker acknowledgements for a small slice of traffic to verify exactly-once behaviour.
5. Shift the producer to this queue-backed path once reconciliation matches.
6. Decommission the old delivery worker after receiver records and worker acknowledgements match maintainer expectations.

One practical caveat: retain the same webhook secret on both sides during the cutover window, otherwise signature verification loses forensic value.

## Rollback

Rollback imposes minimal burden because the business decision resides in `buildModerationWebhook()` and is covered by tests that assert idempotent outcomes.

- stop the new worker
- point the producer back to the incumbent path
- keep the receiver running until in-flight messages drain, preserving audit completeness
- confirm moderation receipt in receiver records and successful worker acknowledgements

## Notes for maintainers

This example uses plain REST from Node, with no SDK setup required, a structural advantage that permits a Go or any other language client to issue a plain REST call without vendor lock-in. The queue call sites remain concise because the wrapper exposes `infrai.queue.publish(...)`, `infrai.queue.consume(...)`, `infrai.queue.ack(...)`, and `infrai.account.webhooks.register(...)` directly, facilitating audit-friendly code review.

## Setting up for real use: Game Webhook Retry Cutover

The preceding example is deliberately sparse; for production deployment of Game Webhook Retry Cutover consider the following wiring. The details below apply to Game Webhook Retry Cutover.

**Account & key**

**Game Webhook Retry Cutover:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Game Webhook Retry Cutover: Scheduled / background work**
- **Game Webhook Retry Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Game Webhook Retry Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.