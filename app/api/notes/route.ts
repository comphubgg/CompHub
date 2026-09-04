import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { t } from "@/app/lib/i18n";
import { DATEN_ORT } from '@/lib/datenOrt';

const notesFile = path.join(DATEN_ORT, 'notes.json');

async function readNotes() {
  try {
    const data = await fs.readFile(notesFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function writeNotes(notes: any[]) {
  await fs.writeFile(notesFile, JSON.stringify(notes, null, 2));
}

export async function GET() {
  try {
    const notes = await readNotes();
    return NextResponse.json(notes);
  } catch (error) {
    return NextResponse.json({ error: t('failed_to_read_notes', 'Failed to read notes') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const note = await request.json();
    const notes = await readNotes();
    notes.push(note);
    await writeNotes(notes);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: t('failed_to_create_note', 'Failed to create note') }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const note = await request.json();
    let notes = await readNotes();
    notes = notes.map((n: any) => (n.id === note.id ? note : n));
    await writeNotes(notes);
    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json({ error: t('failed_to_update_note', 'Failed to update note') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url, 'http://localhost');
    const id = searchParams.get('id');
    let notes = await readNotes();
    notes = notes.filter((n: any) => n.id !== id);
    await writeNotes(notes);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: t('failed_to_delete_note', 'Failed to delete note') }, { status: 500 });
  }
}
