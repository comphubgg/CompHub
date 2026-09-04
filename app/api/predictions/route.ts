import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/adminAuth';
import { createPredictionRecord, deletePredictionBySlug, loadAllPredictions, loadPredictionBySlug, updatePredictionRecord } from '@/app/lib/predictions';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (slug) {
    const prediction = await loadPredictionBySlug(slug);
    if (!prediction) {
      return NextResponse.json({ error: 'Prediction not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, prediction });
  }

  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const predictions = await loadAllPredictions();
  return NextResponse.json({ success: true, predictions });
}

export async function POST(request: NextRequest) {
  try {
    requireAdmin(request);
    const body = await request.json();
    const identifier = String(body.identifier || '').trim();
    const tournamentUrl = String(body.tournamentUrl || '').trim();

    if (!identifier || !tournamentUrl) {
      return NextResponse.json({ error: 'Identifier and tournamentUrl are required' }, { status: 400 });
    }

    const prediction = await createPredictionRecord(identifier, tournamentUrl);
    return NextResponse.json({ success: true, prediction });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create prediction' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireAdmin(request);
    const body = await request.json();
    const slug = String(body.slug || '').trim();
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const updates = {
      identifier: body.identifier,
      tournamentUrl: body.tournamentUrl,
      active: body.active,
      title: body.title,
      reload: Boolean(body.reload),
    };

    const prediction = await updatePredictionRecord(slug, updates);
    return NextResponse.json({ success: true, prediction });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update prediction' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireAdmin(request);
    const data = await request.json();
    const slug = String(data.slug || '').trim();
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }
    await deletePredictionBySlug(slug);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete prediction' }, { status: 500 });
  }
}
