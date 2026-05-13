'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function QRDisplay({ data, size = 240 }: { data: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
  }, [data, size]);

  return (
    <div className="inline-block rounded-md border bg-white p-3">
      <canvas ref={canvasRef} />
    </div>
  );
}
