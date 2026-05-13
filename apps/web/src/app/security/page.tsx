import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

export const metadata = {
  title: 'Cifra — Seguridad',
};

export default function SecurityPage() {
  return (
    <main className="min-h-screen p-4 flex justify-center">
      <article className="prose prose-sm max-w-2xl py-8 text-foreground">
        <h1>Cómo te protege Cifra</h1>
        <p className="text-muted-foreground">
          Explicación en español simple, sin marketing. Lo que sí podemos garantizar, y lo que no.
        </p>

        <h2 className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" /> Lo que sí
        </h2>
        <ul>
          <li>
            <strong>Tus mensajes nunca llegan en claro al servidor.</strong> Se cifran en tu dispositivo
            antes de enviarse. Nadie en el servidor, ni nosotros, ni un eventual atacante de la base
            de datos, puede leerlos.
          </li>
          <li>
            <strong>No pedimos tu teléfono, RUT, ni nombre real.</strong> Solo un email para verificar
            una vez. Ese email se guarda hasheado, no se usa para nada más.
          </li>
          <li>
            <strong>Tu PIN nunca sale de tu dispositivo.</strong> Lo usamos para cifrar tus claves,
            pero el servidor solo ve un "verificador" que no permite descifrar nada.
          </li>
          <li>
            <strong>Los mensajes se autodestruyen.</strong> Por defecto a las 24h. Vos elegís entre
            5 min, 1 h, 24 h, 7 días o 30 días. Una vez leídos y entregados, se borran inmediatamente.
          </li>
          <li>
            <strong>Una frase de 24 palabras es tu recuperación.</strong> Si perdés el PIN, esa frase
            es la única forma de volver a tu cuenta. Guardala en papel, no digital.
          </li>
          <li>
            <strong>Adjuntos cifrados.</strong> Las fotos y archivos se cifran con una clave propia
            envuelta hacia vos. Sin "guardar" hasta que el remitente autoriza explícitamente.
          </li>
        </ul>

        <h2 className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" /> Lo que conviene saber
        </h2>
        <ul>
          <li>
            <strong>Verificá a tus contactos.</strong> Cifra te muestra un "safety number"
            (una huella corta) en cada chat. Si la podés contrastar en persona o por otro canal
            seguro, sabés que estás hablando con la persona real, no con un imitador.
          </li>
          <li>
            <strong>Tu PIN debería ser de 8+ dígitos.</strong> 6 mínimo, pero más es mejor.
            Si tu PIN es débil y alguien obtiene tus claves cifradas, puede intentar adivinarlo
            (aunque cada intento es muy lento por diseño).
          </li>
          <li>
            <strong>Activá un passkey.</strong> Si tu dispositivo soporta huella o FaceID,
            registralo en Configuración. Es una segunda barrera contra robo de PIN.
          </li>
        </ul>

        <h2 className="flex items-center gap-2">
          <ShieldX className="h-5 w-5 text-destructive" /> Lo que Cifra NO puede impedir
        </h2>
        <ul>
          <li>
            <strong>Capturas de pantalla.</strong> En navegador web es técnicamente imposible
            prevenir que alguien saque un screenshot del chat. La persona del otro lado puede
            siempre hacerlo.
          </li>
          <li>
            <strong>Malware en tu dispositivo.</strong> Si tu PC/teléfono tiene un keylogger o
            spyware, Cifra no te salva. Usalo en dispositivos en los que confíes.
          </li>
          <li>
            <strong>Coerción.</strong> Si alguien te obliga físicamente a mostrar tu chat o entregar
            tu PIN, ninguna criptografía te protege.
          </li>
        </ul>

        <h2>Si perdés el acceso</h2>
        <p>
          Con la frase de 24 palabras podés volver desde cualquier dispositivo. Sin ella, y sin el
          PIN, la cuenta queda inaccesible para siempre. No tenemos forma de recuperarla — esa es
          la garantía: si nosotros pudiéramos, un atacante también podría.
        </p>

        <div className="not-prose pt-6">
          <Link href="/home">
            <Button variant="outline">Volver</Button>
          </Link>
        </div>
      </article>
    </main>
  );
}
