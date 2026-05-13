export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(JSON.stringify({ ok: true, service: 'cifra-web' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
