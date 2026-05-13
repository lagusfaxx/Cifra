'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Eye } from 'lucide-react';
import { fetchAndDecryptAttachment, requestSaveAttachment } from '@/lib/attachment-flow';
import type { UserPublic } from '@cifra/shared';

export function AttachmentViewer({
  attachmentId,
  sender,
  saveAllowed,
  onClose,
}: {
  attachmentId: string;
  sender: UserPublic;
  saveAllowed: boolean;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let revoke: (() => void) | null = null;
    void (async () => {
      try {
        const { blobUrl: url, mimeType: mt, revoke: r } = await fetchAndDecryptAttachment(
          attachmentId,
          sender
        );
        setBlobUrl(url);
        setMimeType(mt);
        revoke = r;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al descifrar');
      }
    })();
    return () => {
      if (revoke) revoke();
    };
  }, [attachmentId, sender]);

  async function onSaveRequest() {
    setRequesting(true);
    try {
      await requestSaveAttachment(attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 secure-view"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute top-3 right-3 flex gap-2">
        {saveAllowed && blobUrl ? (
          <a href={blobUrl} download className="inline-flex">
            <Button size="icon" variant="secondary" aria-label="Descargar">
              <Download className="h-4 w-4" />
            </Button>
          </a>
        ) : !saveAllowed ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onSaveRequest}
            disabled={requesting}
          >
            <Eye className="h-4 w-4" />
            Solicitar guardar
          </Button>
        ) : null}
        <Button size="icon" variant="secondary" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-white">
          {error}
        </div>
      )}

      {blobUrl && mimeType.startsWith('image/') && (
        <img
          src={blobUrl}
          alt="adjunto cifrado"
          draggable={false}
          className="max-h-[85vh] max-w-[95vw] object-contain select-none pointer-events-auto"
        />
      )}

      {blobUrl && mimeType.startsWith('video/') && (
        <video
          src={blobUrl}
          controls
          controlsList="nodownload"
          className="max-h-[85vh] max-w-[95vw]"
        />
      )}

      {blobUrl && !mimeType.startsWith('image/') && !mimeType.startsWith('video/') && (
        <div className="text-white text-sm bg-black/50 p-4 rounded">
          Adjunto cifrado tipo {mimeType}. Sin previsualización inline.
        </div>
      )}

      {!blobUrl && !error && <div className="text-white text-sm">Descifrando…</div>}
    </div>
  );
}
