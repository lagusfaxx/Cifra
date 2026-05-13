'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Copy, Check } from 'lucide-react';

export function RecoveryPhraseDisplay({
  phrase,
  onConfirm,
}: {
  phrase: string;
  onConfirm: () => void;
}) {
  const words = phrase.split(' ');
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const onLeave = () => setRevealed(false);
    document.addEventListener('visibilitychange', onLeave);
    return () => document.removeEventListener('visibilitychange', onLeave);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
        <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm space-y-2">
          <p className="font-medium text-foreground">
            Esta es tu frase de recuperación. Es la única forma de recuperar tu cuenta si perdés tu PIN.
          </p>
          <ul className="text-muted-foreground list-disc pl-5 space-y-1">
            <li>Escribila en papel y guardala en un lugar seguro.</li>
            <li>Nunca la compartas. Nadie te la va a pedir, ni el equipo de Cifra.</li>
            <li>Si la perdés y olvidás el PIN, no podemos ayudarte: tu cuenta queda inaccesible.</li>
          </ul>
        </div>
      </div>

      <div
        className={
          'rounded-md border bg-muted/30 p-4 select-none ' +
          (revealed ? '' : 'cursor-pointer')
        }
        onClick={() => !revealed && setRevealed(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !revealed && setRevealed(true)}
      >
        {!revealed ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Toca para revelar tu frase
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 secure-view">
            {words.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-sm bg-background border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground tabular-nums text-xs w-5 text-right">
                  {i + 1}.
                </span>
                <span className="font-mono">{word}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {revealed && (
        <Button variant="outline" size="sm" onClick={copy} className="w-full">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar al portapapeles'}
        </Button>
      )}

      <label className="flex gap-3 items-start text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>
          Entiendo que esta frase es la <strong>única forma</strong> de recuperar mi cuenta y la guardé
          en un lugar seguro fuera de este dispositivo.
        </span>
      </label>

      <Button onClick={onConfirm} disabled={!acknowledged || !revealed} className="w-full">
        Continuar
      </Button>
    </div>
  );
}
