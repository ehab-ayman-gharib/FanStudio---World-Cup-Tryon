import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const modalUrl = process.env.MODAL_API_URL || 'https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run';
  try {
    const resp = await fetch(`${modalUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    const modalConnected = resp.ok;
    return NextResponse.json({
      status: modalConnected ? 'healthy' : 'degraded',
      mode: 'modal',
      modal_url: modalUrl,
      modal_connected: modalConnected
    });
  } catch (e) {
    return NextResponse.json({
      status: 'degraded',
      mode: 'modal',
      modal_url: modalUrl,
      modal_connected: false
    });
  }
}
