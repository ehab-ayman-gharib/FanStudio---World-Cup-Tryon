import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const isLocal = process.env.NODE_ENV === 'development' || req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');
  const targetBackendUrl = isLocal 
    ? 'http://127.0.0.1:5000' 
    : (process.env.MODAL_API_URL || 'https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run');
  try {
    const resp = await fetch(`${targetBackendUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    const connected = resp.ok;
    return NextResponse.json({
      status: connected ? 'healthy' : 'degraded',
      mode: isLocal ? 'local' : 'modal',
      backend_url: targetBackendUrl,
      connected: connected
    });
  } catch (e) {
    return NextResponse.json({
      status: 'degraded',
      mode: isLocal ? 'local' : 'modal',
      backend_url: targetBackendUrl,
      connected: false
    });
  }
}
