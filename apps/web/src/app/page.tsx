'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';

export default function HomePage() {
  const router = useRouter();
  const isAuth = useAppStore((s) => s.accessToken !== null && s.identityKeys !== null);
  useEffect(() => {
    if (isAuth) router.replace('/home');
  }, [isAuth, router]);

  return (
    <main className="min-h-screen flex flex-col">
      <div className="container flex flex-col gap-12 py-16 max-w-2xl">
        <header className="flex flex-col gap-3">
          <h1 className="text-5xl font-semibold tracking-tight">Cifra</h1>
          <p className="text-lg text-muted-foreground">
            Canal seguro para conversaciones que no pueden filtrarse.
            Sin teléfono, sin nombre real, sin rastro.
          </p>
        </header>

        <section className="grid gap-4 text-sm leading-relaxed">
          <p>
            Cifra es una mensajería cifrada de extremo a extremo, pensada para alcaldes,
            asesores, ejecutivos y profesionales que manejan información sensible.
          </p>
          <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
            <li>Tus mensajes nunca tocan el servidor en claro.</li>
            <li>No pedimos teléfono, RUT, ni nombre real.</li>
            <li>Los mensajes se autodestruyen según el tiempo que vos elijas.</li>
            <li>El servidor solo guarda lo mínimo: usernames hasheados y claves públicas.</li>
          </ul>
        </section>

        <div className="flex gap-3 flex-wrap">
          <Link href="/signup">
            <Button size="lg">Crear cuenta</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">Iniciar sesión</Button>
          </Link>
          <Link href="/recover">
            <Button size="lg" variant="ghost">Recuperar con frase</Button>
          </Link>
        </div>

        <footer className="text-xs text-muted-foreground pt-12 border-t">
          Cifra es un canal paralelo para conversaciones críticas, no un reemplazo de WhatsApp.
          Web no puede prevenir capturas de pantalla — usalo en dispositivos confiables.
        </footer>
      </div>
    </main>
  );
}
