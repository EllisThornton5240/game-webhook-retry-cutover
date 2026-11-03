import { infrai } from './infrai';
import { playerAssetEventSchema } from './game_events';

const sample = playerAssetEventSchema.parse({
  event_id: 'evt_asset_1001',
  occurred_at: '2026-10-21T12:00:00.000Z',
  player_id: 'player_42',
  asset_id: 'spray_dragon_gold',
  asset_kind: 'spray',
  content_rating: 'review',
  live_event_id: 'halloween_raid',
  source: 'ugc-studio'
});

async function main() {
  const result = await infrai.queue.publish('asset-moderation', sample);
  console.log(JSON.stringify({ published: true, envelope: result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
