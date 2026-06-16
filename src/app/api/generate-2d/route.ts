import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60; // Set max duration to 60s for Vercel Hobby plan

function getKitReferenceFilename(teamName: string): string {
  const garmentsDir = path.join(process.cwd(), 'public', 'garments');
  if (!fs.existsSync(garmentsDir)) {
    throw new Error(`Garments directory not found at: ${garmentsDir}`);
  }
  
  const cleanTeam = teamName.toLowerCase().replace(/\s/g, '').replace(/-/g, '');
  const files = fs.readdirSync(garmentsDir);
  for (const filename of files) {
    const base = path.parse(filename).name;
    const cleanBase = base.toLowerCase().replace(/\s/g, '').replace(/-/g, '');
    if (cleanBase === cleanTeam || cleanBase.startsWith(cleanTeam) || cleanTeam.startsWith(cleanBase)) {
      return filename;
    }
  }
  
  if (files.length > 0) {
    return files[0];
  }
  throw new Error(`No garment preview image found in: ${garmentsDir}`);
}

export async function POST(req: NextRequest) {
  const isLocal = process.env.NODE_ENV === 'development' || req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');
  const targetBackendUrl = isLocal 
    ? 'http://127.0.0.1:5000' 
    : (process.env.MODAL_API_URL || 'https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run');
  try {
    const body = await req.json();
    const { user_image, kit_image, image, team, prompt_override, num_variations } = body;
    
    let finalUserImage = user_image || image;
    let finalKitImage = kit_image;

    if (!finalKitImage && team) {
      // Load and base64-encode the garment image from public files
      try {
        const kitFilename = getKitReferenceFilename(team);
        const kitPath = path.join(process.cwd(), 'public', 'garments', kitFilename);
        const kitBytes = fs.readFileSync(kitPath);
        finalKitImage = `data:image/webp;base64,${kitBytes.toString('base64')}`;
      } catch (e: any) {
        return NextResponse.json({ detail: `Could not load kit reference for ${team}: ${e.message}` }, { status: 400 });
      }
    }

    if (!finalUserImage || !finalKitImage) {
      return NextResponse.json({ detail: "Missing user_image or kit_image parameters" }, { status: 400 });
    }

    const payload = {
      user_image: finalUserImage,
      kit_image: finalKitImage,
      prompt_override: prompt_override || null,
      num_variations: num_variations || 1
    };
    
    const resp = await fetch(`${targetBackendUrl}/api/generate-2d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!resp.ok) {
      const errorJson = await resp.json().catch(() => ({ detail: 'Modal internal error' }));
      return NextResponse.json({ detail: errorJson.detail || 'Modal internal error' }, { status: resp.status });
    }
    
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ detail: `Gateway error: ${e.message}` }, { status: 500 });
  }
}
