'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Clock, Camera, UserPlus, Fingerprint, ShieldCheck } from 'lucide-react';

const STEPS = [
  {
    icon: Lock,
    title: 'Tus mensajes son tuyos',
    body: 'Todo lo que escribís se cifra en este dispositivo antes de enviarse. Ni nosotros podemos leerlo.',
  },
  {
    icon: Clock,
    title: 'Los mensajes desaparecen',
    body: 'Por defecto se borran a las 24 horas. Podés cambiarlo por conversación. Lo leído y entregado se borra antes.',
  },
  {
    icon: UserPlus,
    title: 'Agregás contactos solo por elección',
    body: 'Solo por username exacto, QR en persona, o link de invitación. No hay agenda, no hay buscador.',
  },
  {
    icon: Camera,
    title: 'Cuidado con las pantallas',
    body: 'En web no se puede impedir capturas. Quien lee también puede sacar foto. Usalo con cabeza.',
  },
  {
    icon: Fingerprint,
    title: 'Activá un passkey',
    body: 'Si tu device soporta huella o FaceID, registralo. Es una segunda barrera además del PIN.',
  },
  {
    icon: ShieldCheck,
    title: 'Verificá tu safety number',
    body: 'Cada chat tiene una huella corta. Verificala con tu contacto por otro canal antes de mandar lo crítico.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const step = STEPS[idx]!;
  const isLast = idx === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Icon className="h-12 w-12 text-primary mb-3" />
          <CardTitle>{step.title}</CardTitle>
          <CardDescription>{step.body}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-1 justify-center">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={
                  'h-1.5 w-6 rounded-full ' + (i <= idx ? 'bg-primary' : 'bg-muted')
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            {idx > 0 && (
              <Button variant="outline" onClick={() => setIdx(idx - 1)} className="flex-1">
                Atrás
              </Button>
            )}
            <Button
              onClick={() => (isLast ? router.replace('/home') : setIdx(idx + 1))}
              className="flex-1"
            >
              {isLast ? 'Entendido' : 'Siguiente'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
