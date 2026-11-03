import { createServer } from 'node:http';
import { moderationWebhookSchema, verifySignature } from './game_events';

const PORT = Number(process.env.PORT ?? 8787);
const MODERATION_WEBHOOK_SECRET = process.env.MODERATION_WEBHOOK_SECRET ?? 'dev-secret';

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/moderation/webhook') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  const raw = await readBody(req);
  const signature = req.headers['x-infrai-signature'];
  const header = Array.isArray(signature) ? signature[0] : signature;

  if (!header || !verifySignature(raw, MODERATION_WEBHOOK_SECRET, header)) {
    res.statusCode = 401;
    res.end('invalid signature');
    return;
  }

  const payload = moderationWebhookSchema.parse(JSON.parse(raw));
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    accepted: true,
    moderation_decision: payload.action,
    asset_id: payload.asset_id,
    live_event_id: payload.live_event_id
  }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`moderation receiver listening on http://127.0.0.1:${PORT}/moderation/webhook`);
});
