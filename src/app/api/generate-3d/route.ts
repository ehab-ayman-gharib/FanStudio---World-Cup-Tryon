import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Set max duration to 60s for Vercel Hobby plan

export async function POST(req: NextRequest) {
  const modalUrl = process.env.MODAL_API_URL || 'https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run';
  try {
    const body = await req.json();
    const { image } = body;
    
    if (!image) {
      return NextResponse.json({ detail: "Missing image parameter" }, { status: 400 });
    }
    
    const resp = await fetch(`${modalUrl}/api/generate-3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image })
    });
    
    if (!resp.ok) {
      const errorJson = await resp.json().catch(() => ({ detail: 'Modal internal error' }));
      return NextResponse.json({ detail: errorJson.detail || 'Modal internal error' }, { status: resp.status });
    }
    
    const data = await resp.json();
    const filename = data.filename;
    return NextResponse.json({
      plyUrl: `${modalUrl}/api/download-3d/${filename}`,
      filename: filename
    });
  } catch (e: any) {
    return NextResponse.json({ detail: `Gateway error: ${e.message}` }, { status: 500 });
  }
}
