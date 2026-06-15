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
  const modalUrl = process.env.MODAL_API_URL || 'https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run';
  try {
    const body = await req.json();
    const { image, team, prompt_override, num_variations } = body;
    
    if (!image || !team) {
      return NextResponse.json({ detail: "Missing image or team parameters" }, { status: 400 });
    }
    
    // Load and base64-encode the garment image
    let kitB64 = '';
    try {
      const kitFilename = getKitReferenceFilename(team);
      const kitPath = path.join(process.cwd(), 'public', 'garments', kitFilename);
      const kitBytes = fs.readFileSync(kitPath);
      kitB64 = `data:image/webp;base64,${kitBytes.toString('base64')}`;
    } catch (e: any) {
      return NextResponse.json({ detail: `Could not load kit reference for ${team}: ${e.message}` }, { status: 400 });
    }
    
    const payload = {
      user_image: image,
      kit_image: kitB64,
      prompt_override: prompt_override || null,
      num_variations: num_variations || 1
    };
    
    const resp = await fetch(`${modalUrl}/api/generate-2d`, {
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
