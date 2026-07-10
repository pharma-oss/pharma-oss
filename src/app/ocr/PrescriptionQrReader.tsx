'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import encoding from 'encoding-japanese';
import { Camera, ImageIcon, Keyboard, Loader2, QrCode, RotateCcw, StopCircle } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';

type QrSource = 'camera' | 'image' | 'manual';

type QrSegment = {
  id: string;
  text: string;
  source: QrSource;
};

type PrescriptionQrReaderProps = {
  disabled?: boolean;
  onApplyQrData: (qrData: string, source: QrSource, segmentCount: number) => void | Promise<void>;
};

const sourceLabel: Record<QrSource, string> = {
  camera: 'カメラ',
  image: '画像',
  manual: 'スキャナー'
};
const ZXING_BYTE_SEGMENTS_METADATA_KEY = 2;

function createSegmentId() {
  return `qr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function looksLikeJahisPayload(text: string) {
  return /JAHIS|(?:^|\n)(?:1|5|51|55|201|301),/.test(text);
}

async function getReadableQrText(result: any): Promise<string> {
  const fallbackText = typeof result?.getText === 'function' ? result.getText() : String(result || '');

  try {
    const metadata = typeof result?.getResultMetadata === 'function' ? result.getResultMetadata() : undefined;
    const byteSegments = metadata?.get?.(ZXING_BYTE_SEGMENTS_METADATA_KEY) as ArrayLike<ArrayLike<number>> | undefined;
    if (byteSegments && Number(byteSegments.length) > 0) {
      const bytes: number[] = [];
      for (let i = 0; i < byteSegments.length; i++) {
        const segment = byteSegments[i];
        for (let j = 0; j < segment.length; j++) {
          bytes.push(Number(segment[j]));
        }
      }
      const shiftJisText = encoding.convert(bytes, {
        from: 'SJIS',
        to: 'UNICODE',
        type: 'string'
      }) as string;
      if (looksLikeJahisPayload(shiftJisText)) return shiftJisText;
    }
  } catch {
    // ZXing already gives us decoded text; byte segments are a best-effort path for Shift-JIS QR.
  }

  return fallbackText;
}

export default function PrescriptionQrReader({ disabled = false, onApplyQrData }: PrescriptionQrReaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const isResolvingCameraScanRef = useRef(false);
  const [segments, setSegments] = useState<QrSegment[]>([]);
  const [manualText, setManualText] = useState('');
  const [message, setMessage] = useState('QRコードを追加してください。');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const appendSegment = useCallback((text: string, source: QrSource) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      setMessage('QRコードの文字列を読み取れませんでした。');
      return;
    }
    if (normalizedText.length > 10000) {
      setMessage('QRコードの文字列が長すぎるため追加できません。');
      return;
    }

    setSegments((current) => {
      if (current.some((segment) => segment.text === normalizedText)) {
        setMessage('同じQRコードはすでに追加済みです。');
        return current;
      }
      const next = [...current, { id: createSegmentId(), text: normalizedText, source }];
      setMessage(`${sourceLabel[source]}からQRコードを追加しました（${next.length}件）。`);
      return next;
    });
  }, []);

  const stopCamera = useCallback((nextMessage = 'カメラを停止しました。') => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    isResolvingCameraScanRef.current = false;
    setIsCameraActive(false);
    setIsStartingCamera(false);
    setMessage(nextMessage);
  }, []);

  useEffect(() => () => {
    controlsRef.current?.stop();
  }, []);

  const startCamera = useCallback(async () => {
    if (disabled || isCameraActive || isStartingCamera) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('このブラウザではカメラ読取を利用できません。');
      return;
    }

    setIsStartingCamera(true);
    setMessage('カメラを起動しています。');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 350,
        delayBetweenScanSuccess: 800
      });
      const controls = await reader.decodeFromConstraints({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }, videoRef.current || undefined, (result, error, controlsInCallback) => {
        if (!result || isResolvingCameraScanRef.current) return;
        isResolvingCameraScanRef.current = true;
        void (async () => {
          const text = await getReadableQrText(result);
          appendSegment(text, 'camera');
          controlsInCallback.stop();
          controlsRef.current = null;
          setIsCameraActive(false);
          setIsStartingCamera(false);
          isResolvingCameraScanRef.current = false;
        })();
      });

      controlsRef.current = controls;
      setIsCameraActive(true);
      setIsStartingCamera(false);
      setMessage('QRコードをカメラに向けてください。');
    } catch (error) {
      console.error('Failed to start QR camera scanner:', error);
      stopCamera('カメラを起動できませんでした。権限と接続を確認してください。');
    }
  }, [appendSegment, disabled, isCameraActive, isStartingCamera, stopCamera]);

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('QR読取には画像ファイルを選択してください。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage('画像サイズは10MB以下にしてください。');
      return;
    }

    setIsDecodingImage(true);
    setMessage('画像内のQRコードを読み取っています。');
    const objectUrl = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      appendSegment(await getReadableQrText(result), 'image');
    } catch (error) {
      console.error('Failed to decode prescription QR image:', error);
      setMessage('画像からQRコードを読み取れませんでした。');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsDecodingImage(false);
    }
  }, [appendSegment]);

  const handleAddManual = useCallback(() => {
    appendSegment(manualText, 'manual');
    setManualText('');
  }, [appendSegment, manualText]);

  const handleApply = useCallback(async () => {
    if (segments.length === 0 || isApplying || disabled) return;
    setIsApplying(true);
    try {
      const source = segments[segments.length - 1].source;
      await onApplyQrData(segments.map((segment) => segment.text).join('\n'), source, segments.length);
      setMessage(`QRコード${segments.length}件を処方入力へ反映しました。`);
    } finally {
      setIsApplying(false);
    }
  }, [disabled, isApplying, onApplyQrData, segments]);

  return (
    <section className="prescription-qr-panel" data-testid="prescription-qr-reader" aria-label="処方箋QRコード読取">
      <div className="prescription-qr-header">
        <div>
          <span className="section-kicker">QRコード</span>
          <strong>処方箋QRを取り込み</strong>
        </div>
        <span className={`status-chip compact ${segments.length > 0 ? 'confirmed' : 'warning'}`}>
          読取済み {segments.length}
        </span>
      </div>

      <div className="prescription-qr-actions">
        <label className="qr-action-button" aria-disabled={disabled || isDecodingImage}>
          {isDecodingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          画像
          <input
            type="file"
            accept="image/*"
            className="hidden-input"
            onChange={handleImageUpload}
            disabled={disabled || isDecodingImage}
          />
        </label>
        <button
          type="button"
          className="qr-action-button"
          onClick={startCamera}
          disabled={disabled || isCameraActive || isStartingCamera}
        >
          {isStartingCamera ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          カメラ
        </button>
        <button
          type="button"
          className="qr-icon-button"
          onClick={() => stopCamera()}
          disabled={!isCameraActive && !isStartingCamera}
          title="カメラ停止"
          aria-label="カメラ停止"
        >
          <StopCircle size={16} />
        </button>
      </div>

      {(isCameraActive || isStartingCamera) && (
        <div className="qr-camera-preview">
          <video ref={videoRef} muted playsInline />
          <QrCode size={42} className="qr-camera-reticle" aria-hidden="true" />
        </div>
      )}

      <div className="qr-manual-entry">
        <label htmlFor="prescriptionQrManual">
          <Keyboard size={14} aria-hidden="true" />
          ハンディスキャナー入力
        </label>
        <textarea
          id="prescriptionQrManual"
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              handleAddManual();
            }
          }}
          maxLength={10000}
          placeholder="読み取ったQR文字列"
          disabled={disabled}
        />
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          onClick={handleAddManual}
          disabled={disabled || !manualText.trim()}
        >
          <QrCode size={16} />
          QRを追加
        </button>
      </div>

      {segments.length > 0 && (
        <div className="qr-segment-list" aria-label="読取済みQRコード">
          {segments.map((segment, index) => (
            <span key={segment.id}>
              {index + 1}. {sourceLabel[segment.source]} / {segment.text.split(/\r?\n/).filter(Boolean).length}行
            </span>
          ))}
        </div>
      )}

      <div className="prescription-qr-footer">
        <span className="prescription-qr-message" role="status">{message}</span>
        <div className="prescription-qr-footer-actions">
          <button
            type="button"
            className="qr-icon-button"
            onClick={() => {
              setSegments([]);
              setMessage('QRコードを追加してください。');
            }}
            disabled={disabled || segments.length === 0}
            title="読取済みQRをクリア"
            aria-label="読取済みQRをクリア"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className="btn-primary flex-center gap-2"
            onClick={handleApply}
            disabled={disabled || segments.length === 0 || isApplying}
            data-testid="prescription-qr-apply"
          >
            {isApplying ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
            {isApplying ? '反映中...' : '処方入力へ反映'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .prescription-qr-panel {
          display: grid;
          gap: 0.65rem;
          border: 1px solid #a7f3d0;
          border-radius: var(--radius-md);
          background: #ecfdf5;
          padding: 0.8rem;
        }

        .prescription-qr-header,
        .prescription-qr-actions,
        .prescription-qr-footer,
        .prescription-qr-footer-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .prescription-qr-header,
        .prescription-qr-footer {
          justify-content: space-between;
        }

        .prescription-qr-header strong {
          display: block;
          color: var(--text-main);
          font-size: 0.92rem;
        }

        .qr-action-button,
        .qr-icon-button {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.42rem;
          border: 1px solid #86efac;
          border-radius: 6px;
          background: #ffffff;
          color: #166534;
          font-size: 0.78rem;
          font-weight: 900;
          cursor: pointer;
        }

        .qr-action-button {
          padding: 0.35rem 0.65rem;
        }

        .qr-icon-button {
          width: 34px;
          padding: 0;
        }

        .qr-action-button:hover,
        .qr-icon-button:hover {
          border-color: #16a34a;
          background: #f0fdf4;
        }

        .qr-action-button:disabled,
        .qr-action-button[aria-disabled="true"],
        .qr-icon-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .qr-camera-preview {
          position: relative;
          min-height: 220px;
          overflow: hidden;
          border: 1px solid #86efac;
          border-radius: 8px;
          background: #022c22;
        }

        .qr-camera-preview video {
          width: 100%;
          height: 260px;
          display: block;
          object-fit: cover;
        }

        .qr-camera-reticle {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          color: #ffffff;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.48));
          pointer-events: none;
        }

        .qr-manual-entry {
          display: grid;
          grid-template-columns: minmax(150px, 0.32fr) minmax(0, 1fr) auto;
          gap: 0.55rem;
          align-items: start;
        }

        .qr-manual-entry label {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: #166534;
          font-size: 0.78rem;
          font-weight: 900;
          padding-top: 0.6rem;
        }

        .qr-manual-entry textarea {
          min-height: 42px;
          max-height: 96px;
          resize: vertical;
          min-width: 0;
          border: 1px solid #86efac;
          border-radius: 6px;
          background: #ffffff;
          padding: 0.55rem 0.65rem;
          font-family: inherit;
          font-size: 0.84rem;
          line-height: 1.35;
        }

        .qr-manual-entry textarea:focus {
          outline: 2px solid #16a34a;
          outline-offset: 1px;
        }

        .qr-segment-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .qr-segment-list span {
          min-height: 24px;
          display: inline-flex;
          align-items: center;
          border: 1px solid #86efac;
          border-radius: 6px;
          background: #ffffff;
          color: #166534;
          padding: 0.08rem 0.42rem;
          font-size: 0.72rem;
          font-weight: 850;
        }

        .prescription-qr-message {
          min-width: 0;
          overflow-wrap: anywhere;
          color: #166534;
          font-size: 0.76rem;
          font-weight: 760;
          line-height: 1.45;
        }

        @media (max-width: 900px) {
          .qr-manual-entry {
            grid-template-columns: 1fr;
          }

          .prescription-qr-footer {
            align-items: stretch;
          }
        }
      `}</style>
    </section>
  );
}
