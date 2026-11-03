import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const playerAssetEventSchema = z.object({
  event_id: z.string().min(1),
  occurred_at: z.string().min(1),
  player_id: z.string().min(1),
  asset_id: z.string().min(1),
  asset_kind: z.enum(['spray', 'banner', 'emote']),
  content_rating: z.enum(['safe', 'review', 'block']),
  live_event_id: z.string().min(1),
  source: z.literal('ugc-studio')
});

export type PlayerAssetEvent = z.infer<typeof playerAssetEventSchema>;

export const moderationWebhookSchema = z.object({
  delivery_id: z.string().min(1),
  queue_message_id: z.string().min(1),
  moderation_queue: z.literal('asset-moderation'),
  player_id: z.string().min(1),
  asset_id: z.string().min(1),
  live_event_id: z.string().min(1),
  action: z.enum(['allow_live', 'hold_for_review', 'reject_asset']),
  reason: z.string().min(1),
  created_at: z.string().min(1)
});

export type ModerationWebhook = z.infer<typeof moderationWebhookSchema>;

export function decideModeration(event: PlayerAssetEvent): ModerationWebhook['action'] {
  if (event.content_rating === 'block') {
    return 'reject_asset';
  }
  if (event.content_rating === 'review') {
    return 'hold_for_review';
  }
  return 'allow_live';
}

export function buildModerationWebhook(event: PlayerAssetEvent, queueMessageId: string): ModerationWebhook {
  const action = decideModeration(event);
  const reason = action === 'allow_live'
    ? 'asset can appear in the live event'
    : action === 'hold_for_review'
      ? 'asset enters the moderation queue before live publication'
      : 'asset is rejected before publication';

  return {
    delivery_id: `${event.event_id}:${action}`,
    queue_message_id: queueMessageId,
    moderation_queue: 'asset-moderation',
    player_id: event.player_id,
    asset_id: event.asset_id,
    live_event_id: event.live_event_id,
    action,
    reason,
    created_at: event.occurred_at
  };
}

export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(payload, secret), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
