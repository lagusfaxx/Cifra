'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatList } from '@/components/ChatList';
import { ChatView } from '@/components/ChatView';
import { MessageInput } from '@/components/MessageInput';
import { useContactsStore } from '@/lib/contacts-store';
import { sendEncryptedMessage } from '@/lib/message-flow';
import { TTL_DEFAULT } from '@cifra/shared';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function ChatPage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const contact = useContactsStore((s) => s.byUsername.get(params.username));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contact) {
      router.replace('/contacts/add');
    }
  }, [contact, router]);

  if (!contact) return null;

  async function send(text: string) {
    setError(null);
    try {
      await sendEncryptedMessage(contact!, text, TTL_DEFAULT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    }
  }

  return (
    <div className="flex h-screen">
      <div className="hidden sm:block">
        <ChatList />
      </div>
      <div className="flex flex-col flex-1">
        <div className="sm:hidden border-b p-2">
          <Button variant="ghost" size="sm" onClick={() => router.push('/home')}>
            <ChevronLeft className="h-4 w-4" /> Volver
          </Button>
        </div>
        <ChatView contact={contact} />
        {error && (
          <div className="px-4 py-2 text-xs text-destructive border-t border-destructive/30">
            {error}
          </div>
        )}
        <MessageInput onSend={send} />
      </div>
    </div>
  );
}
