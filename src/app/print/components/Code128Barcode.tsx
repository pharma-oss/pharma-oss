import React from 'react';
import { CODE128_QUIET_ZONE_MODULES, layoutCode128B } from '@/lib/code128';

// 1モジュール(最も細いバー)の印刷幅。148mm幅の領収証に、最長の符号化文字列(32文字)でも収まる幅。
export const CODE128_MODULE_MM = 0.28;
export const CODE128_BAR_HEIGHT_MM = 10;

export interface Code128BarcodeProps {
  /** バーコードにする文字列 (ASCII 32〜126) */
  payload: string;
  /** バーコードの下に人が読める形で印字する文字列 */
  caption?: string;
  testId?: string;
}

/**
 * Code128 のバーコードを SVG で描く。外部ライブラリは使わない。
 * 余白と文字の見た目はこのファイルの styled-jsx (この1コンポーネントだけを包む)。
 */
export const Code128Barcode = React.memo(function Code128Barcode({
  payload,
  caption,
  testId = 'code128-barcode'
}: Code128BarcodeProps) {
  const { bars, modules } = layoutCode128B(payload);
  const totalModules = modules + CODE128_QUIET_ZONE_MODULES * 2;
  const widthMm = totalModules * CODE128_MODULE_MM;

  return (
    <figure className="code128-barcode" data-testid={testId} data-barcode-payload={payload}>
      <svg
        role="img"
        aria-label={`照合バーコード ${caption ?? payload}`}
        xmlns="http://www.w3.org/2000/svg"
        width={`${widthMm}mm`}
        height={`${CODE128_BAR_HEIGHT_MM}mm`}
        viewBox={`0 0 ${totalModules} 1`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="code128-bars"
      >
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x + CODE128_QUIET_ZONE_MODULES}
            y={0}
            width={bar.width}
            height={1}
            fill="#000"
          />
        ))}
      </svg>
      {caption ? (
        <figcaption className="code128-caption">{caption}</figcaption>
      ) : null}

      <style jsx>{`
        .code128-barcode {
          margin: 0;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
        }

        .code128-bars {
          display: block;
          background: #fff;
        }

        .code128-caption {
          font-family: monospace;
          font-size: 0.68rem;
          color: #111827;
          letter-spacing: 0.02em;
        }
      `}</style>
    </figure>
  );
});
