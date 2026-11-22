import { useMemo } from 'react';
import { makeQrMatrix } from '../lib/upiQr.js';

// Renders a QR code as inline SVG. Dark modules form one path of unit squares;
// the quiet zone is 4 modules on each side.
export default function UpiQr({ value, size = 180, "aria-label": ariaLabel = "UPI payment QR code" }) {
  const qr = useMemo(() => {
    try {
      return makeQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return <span className="text-xs text-gray-500">QR unavailable</span>;

  const quiet = 4;
  const total = qr.size + quiet * 2;
  const d = [];
  qr.modules.forEach((row, r) => {
    row.forEach((on, c) => {
      if (on) d.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    });
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      role="img"
      aria-label={ariaLabel}
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={d.join('')} fill="#000" />
    </svg>
  );
}
