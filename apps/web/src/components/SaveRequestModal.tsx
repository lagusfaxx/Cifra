'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveSaveRequest } from '@/lib/attachment-flow';

export interface PendingSaveRequest {
  requestId: string;
  requesterDisplayName: string;
  attachmentMime?: string;
}

export function SaveRequestModal({
  request,
  onResolved,
}: {
  request: PendingSaveRequest;
  onResolved: (approved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function resolve(approve: boolean) {
    setBusy(true);
    try {
      await resolveSaveRequest(request.requestId, approve);
      onResolved(approve);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Solicitud para guardar adjunto</CardTitle>
          <CardDescription>
            <strong>{request.requesterDisplayName}</strong> quiere guardar uno de los archivos que le enviaste.
            Si aprobás, va a poder descargarlo a su dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Esta acción no se puede revocar. Una vez aprobado, el receptor puede guardar el archivo.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" disabled={busy} onClick={() => resolve(false)} className="flex-1">
              Denegar
            </Button>
            <Button disabled={busy} onClick={() => resolve(true)} className="flex-1">
              Aprobar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
