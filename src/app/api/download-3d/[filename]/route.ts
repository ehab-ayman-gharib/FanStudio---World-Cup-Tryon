import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const modalUrl = process.env.MODAL_API_URL || 'https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run';
  
  const tmpCacheDir = path.join(os.tmpdir(), '.splat_cache');
  const cachePath = path.join(tmpCacheDir, filename);
  
  // 1. Check local cache
  try {
    if (fs.existsSync(cachePath)) {
      const splatBytes = fs.readFileSync(cachePath);
      return new Response(splatBytes, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': splatBytes.length.toString(),
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
  } catch (err) {
    console.error('Failed to read from local cache:', err);
  }
  
  // 2. Fetch from Modal
  try {
    console.log(`Fetching splat from Modal: ${modalUrl}/api/download-3d/${filename}`);
    const resp = await fetch(`${modalUrl}/api/download-3d/${filename}`);
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => 'Unknown error');
      console.error(`Modal download-3d failed: ${resp.status} - ${errorText}`);
      return new Response(JSON.stringify({ detail: `Modal failed to serve 3D splat file: ${filename} (${resp.status})` }), { 
        status: resp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const arrayBuffer = await resp.arrayBuffer();
    const splatBytes = Buffer.from(arrayBuffer);
    console.log(`Downloaded splat: ${splatBytes.length} bytes`);
    
    // Save to local cache
    try {
      if (!fs.existsSync(tmpCacheDir)) {
        fs.mkdirSync(tmpCacheDir, { recursive: true });
      }
      fs.writeFileSync(cachePath, splatBytes);
    } catch (err) {
      console.error('Failed to write to local cache:', err);
    }
    
    return new Response(splatBytes, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': splatBytes.length.toString(),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (e: any) {
    console.error('Download-3d gateway error:', e);
    return new Response(JSON.stringify({ detail: `Failed to download splat: ${e.message}` }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
