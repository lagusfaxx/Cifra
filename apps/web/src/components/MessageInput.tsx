'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSend(text);
      setValue('');
      textareaRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(e);
    }
  }

  return (
    <form onSubmit={submit} className="border-t p-3 flex gap-2 items-end">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled || busy}
        placeholder="Escribí un mensaje cifrado…"
        rows={1}
        className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-32"
        maxLength={4000}
      />
      <Button type="submit" size="icon" disabled={disabled || busy || !value.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
