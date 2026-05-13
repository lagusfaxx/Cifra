'use client';

import { ChatList } from '@/components/ChatList';

export default function HomeAppPage() {
  return (
    <div className="flex h-screen">
      <ChatList />
      <main className="hidden sm:flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Seleccioná un contacto o agregá uno nuevo.
      </main>
    </div>
  );
}
