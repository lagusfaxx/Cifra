'use client';

import { useEffect, useRef } from 'react';
import QrScanner from 'qr-scanner';

export function QRScanner({
  onDecode,
  onError,
}: {
  onDecode: (text: string) => void;
  onError?: (err: Error) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const scanner = new QrScanner(
      videoRef.current,
      (result) => onDecode(result.data),
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: 'environment',
      }
    );
    scanner.start().catch((err) => {
      if (onError && err instanceof Error) onError(err);
    });
    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [onDecode, onError]);

  return (
    <div className="relative w-full max-w-sm mx-auto rounded-md overflow-hidden border bg-black">
      <video ref={videoRef} className="w-full" muted playsInline />
    </div>
  );
}
