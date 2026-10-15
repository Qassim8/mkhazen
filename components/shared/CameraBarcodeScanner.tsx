"use client";

/**
 * مسح الباركود بكاميرا الموبايل.
 * • BarcodeDetector (Chrome/Android) لو متاح.
 * • غير كده: @zxing/browser (بيتحمّل عند الحاجة بس).
 * الكاميرا تحتاج HTTPS (أو localhost).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { LuCamera, LuX } from "react-icons/lu";

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "qr_code",
];

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type DetectorCtor = {
  new (options?: { formats?: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

interface Props {
  /** يتنادى مرة واحدة بالقيمة الممسوحة ثم تُقفل الكاميرا */
  onDetected: (code: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export default function CameraBarcodeScanner({
  onDetected,
  disabled = false,
  className,
  label = "مسح بالكاميرا",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={label}
        aria-label={label}
        className={
          className ??
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        }
      >
        <LuCamera className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <ScannerModal
          onClose={() => setOpen(false)}
          onDetected={(code) => {
            setOpen(false);
            onDetected(code);
          }}
        />
      )}
    </>
  );
}

function ScannerModal({
  onClose,
  onDetected,
}: {
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);

  const finish = useCallback(
    (code: string) => {
      const value = code.trim();
      if (!value || doneRef.current) return;
      doneRef.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(80);
      onDetected(value);
    },
    [onDetected],
  );

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopZxing: (() => void) | null = null;

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("الكاميرا تحتاج اتصال آمن HTTPS. افتح النظام برابط https.");
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      let detector: DetectorLike | null = null;
      if (Native) {
        try {
          const supported = (await Native.getSupportedFormats?.()) ?? FORMATS;
          const formats = FORMATS.filter((format) => supported.includes(format));
          if (formats.length) detector = new Native({ formats });
        } catch {
          detector = null;
        }
      }

      try {
        if (detector) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (cancelled) return;
          video.srcObject = stream;
          await video.play();

          const scan = async () => {
            if (cancelled || doneRef.current) return;
            try {
              if (video.readyState >= 2) {
                const codes = await detector!.detect(video);
                if (codes[0]?.rawValue) {
                  finish(codes[0].rawValue);
                  return;
                }
              }
            } catch {
              // إطار غير صالح — نكمل
            }
            frame = window.setTimeout(() => requestAnimationFrame(scan), 120) as unknown as number;
          };
          scan();
          return;
        }

        // بديل: zxing (Safari/iOS والمتصفحات اللي ما فيها BarcodeDetector)
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (result) => {
            if (result) finish(result.getText());
          },
        );
        stopZxing = () => controls.stop();
        if (cancelled) stopZxing();
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "تم رفض إذن الكاميرا. اسمح بالوصول للكاميرا من إعدادات المتصفح."
            : name === "NotFoundError"
              ? "لا توجد كاميرا متاحة على هذا الجهاز."
              : "تعذر تشغيل الكاميرا.",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(frame);
      stopZxing?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [finish]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" dir="rtl">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-black">وجّه الكاميرا نحو الباركود</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="إغلاق"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        </div>
        {error && <p className="px-4 py-3 text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </div>
  );
}
