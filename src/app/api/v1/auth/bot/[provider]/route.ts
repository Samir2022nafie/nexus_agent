// src/app/api/v1/auth/bot/[provider]/route.ts
// POST /api/v1/auth/bot/:provider
// provider = 'telegram' | 'whatsapp'
//
// DORMANT IN V1 — reserved for the v1.2 bot feature.
// Gated by x-bot-webhook-secret header. Do not extend in v1.
// Leave in place as tested, dormant code.

import type { NextRequest } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!['telegram', 'whatsapp'].includes(provider)) {
    return Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Unknown bot provider' } },
      { status: 404 }
    );
  }

  // Auth gate: x-bot-webhook-secret header must match BOT_WEBHOOK_SECRET env var
  const secret = req.headers.get('x-bot-webhook-secret');
  const expectedSecret = process.env.BOT_WEBHOOK_SECRET;

  if (!expectedSecret || !secret || secret !== expectedSecret) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } },
      { status: 401 }
    );
  }

  // -------------------------------------------------------------------------
  // V1.2 PLACEHOLDER — bot conversation logic goes here when implemented.
  // -------------------------------------------------------------------------
  return Response.json(
    {
      success: true,
      data: {
        message: `Bot webhook received for provider: ${provider}. This endpoint is dormant in v1.`,
      },
    },
    { status: 200 }
  );
}
