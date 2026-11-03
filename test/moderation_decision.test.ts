import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModerationWebhook, decideModeration, verifySignature, signPayload } from '../src/game_events';

test('review-rated asset is held for moderation before live publication', () => {
  const input = {
    event_id: 'evt_asset_1001',
    occurred_at: '2026-10-21T12:00:00.000Z',
    player_id: 'player_42',
    asset_id: 'spray_dragon_gold',
    asset_kind: 'spray' as const,
    content_rating: 'review' as const,
    live_event_id: 'halloween_raid',
    source: 'ugc-studio' as const
  };

  const action = decideModeration(input);
  const webhook = buildModerationWebhook(input, 'msg_9001');

  assert.equal(action, 'hold_for_review');
  assert.equal(webhook.action, 'hold_for_review');
  assert.equal(webhook.reason, 'asset enters the moderation queue before live publication');
  assert.equal(webhook.delivery_id, 'evt_asset_1001:hold_for_review');
});

test('signature check accepts the exact payload bytes', () => {
  const payload = JSON.stringify({ delivery_id: 'evt_asset_1001:hold_for_review' });
  const secret = 'dev-secret';
  const signature = signPayload(payload, secret);

  assert.equal(verifySignature(payload, secret, signature), true);
  assert.equal(verifySignature(payload + 'x', secret, signature), false);
});
