'use client';

/*
 * Die Nachrichten als eigene Seite.
 *
 * Dasselbe Fenster wie am Bildschirmrand, nur gross und ohne Schwebendes:
 * "einen Chatbalken, wo ich alle meine Chats noch mal angucken kann, so wie
 * ein Archiv" - und ohne jedesmal ueber das Symbol gehen zu muessen.
 *
 * Bewusst kein zweites Bauteil, sondern dasselbe in anderer Erscheinung. Zwei
 * Fassungen waeren zwei Stellen, an denen jede kuenftige Aenderung geschehen
 * muesste; eine davon waere irgendwann vergessen worden.
 */

import ChatFenster from '@/app/components/ChatFenster';
import T from '@/app/components/T';

export default function NachrichtenSeite() {
  return (
    <main className="flex-1 bg-zinc-950">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8">
        <h1 className="text-2xl font-bold text-slate-50"><T>Nachrichten</T></h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Alle Gespräche mit dem Betreiber — auch die älteren.</T>
        </p>
      </div>
      <ChatFenster alsSeite />
    </main>
  );
}
