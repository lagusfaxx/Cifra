'use client';

import Link from 'next/link';
import { useContactsStore } from '@/lib/contacts-store';
import { Button } from '@/components/ui/button';
import { Plus, MessageCircle } from 'lucide-react';

export function ChatList() {
  const contacts = useContactsStore((s) => Array.from(s.byUsername.values()));

  return (
    <aside className="w-full sm:w-80 border-r flex flex-col h-screen">
      <header className="p-4 border-b flex items-center justify-between">
        <h1 className="font-semibold text-lg">Cifra</h1>
        <Link href="/contacts/add">
          <Button size="icon" variant="ghost" aria-label="Agregar contacto">
            <Plus className="h-5 w-5" />
          </Button>
        </Link>
      </header>
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center space-y-3">
            <MessageCircle className="h-8 w-8 mx-auto opacity-30" />
            <p>Aún no tenés contactos.</p>
            <Link href="/contacts/add">
              <Button variant="outline" size="sm">
                Agregar contacto
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y">
            {contacts.map((c) => (
              <li key={c.username}>
                <Link
                  href={`/chat/${c.username}`}
                  className="block px-4 py-3 hover:bg-accent transition-colors"
                >
                  <div className="font-medium text-sm">{c.displayName}</div>
                  <div className="text-xs text-muted-foreground">@{c.username}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="p-3 border-t flex items-center justify-between text-xs text-muted-foreground">
        <Link href="/settings" className="hover:underline">
          Configuración
        </Link>
        <span>v0.1</span>
      </footer>
    </aside>
  );
}
