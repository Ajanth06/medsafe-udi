"use client";

import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { buildGs1ElementString, buildGs1HumanReadable } from "../../lib/udiCore";

type UdiDataMatrixPanelProps = {
  udiDi: string;
  productionDate?: string;
  serial?: string;
  batch?: string;
  productName?: string;
};

export default function UdiDataMatrixPanel({
  udiDi,
  productionDate,
  serial,
  batch,
  productName,
}: UdiDataMatrixPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gs1Payload = buildGs1ElementString({
    udiDi,
    productionDate,
    serial,
    batch,
  });
  const gs1HumanReadable = buildGs1HumanReadable({
    udiDi,
    productionDate,
    serial,
    batch,
  });

  useEffect(() => {
    if (!visible || !gs1Payload || !canvasRef.current) return;

    let cancelled = false;
    const canvas = canvasRef.current;

    (async () => {
      try {
        const bwipjs = (await import("bwip-js")).default;
        if (cancelled) return;
        await bwipjs.toCanvas(canvas, {
          bcid: "datamatrix",
          text: gs1Payload,
          scale: 4,
          parse: true,
          parsefnc: true,
        });
        if (!cancelled) setError(null);
      } catch (err) {
        console.error("DataMatrix error:", err);
        if (!cancelled) setError("DataMatrix konnte nicht erzeugt werden.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, gs1Payload]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `udi-datamatrix-${batch || serial || "label"}.png`;
    link.click();
  };

  const downloadPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.setFontSize(11);
    pdf.text("GS1 DataMatrix — UDI Label", 14, 14);
    if (productName) pdf.text(`Produkt: ${productName}`, 14, 20);
    pdf.setFontSize(8);
    pdf.text(gs1HumanReadable.split("\n"), 14, 26, { maxWidth: 180 });
    pdf.addImage(img, "PNG", 14, 32, 45, 45);
    pdf.save(`udi-datamatrix-${batch || serial || "label"}.pdf`);
  };

  if (!gs1Payload) {
    return (
      <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
        DataMatrix nicht verfügbar — GTIN oder Produktionsdaten unvollständig.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-500/25 bg-indigo-950/20 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-indigo-200/80">
        GS1 DataMatrix
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Barcode für Produktlabel — encodiert UDI-DI / GTIN und UDI-PI / Produktionskennung.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="rounded-lg border border-indigo-400/40 bg-indigo-900/30 px-3 py-1.5 text-[11px] text-indigo-100 hover:bg-indigo-800/40"
        >
          {visible ? "DataMatrix ausblenden" : "DataMatrix anzeigen"}
        </button>
        {visible && (
          <>
            <button
              type="button"
              onClick={downloadPng}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800"
            >
              PNG herunterladen
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800"
            >
              PDF herunterladen
            </button>
          </>
        )}
      </div>
      {visible && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-white/15 bg-white p-3 shadow-inner"
          />
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <pre className="whitespace-pre-wrap break-all text-[10px] text-slate-400">
            {gs1HumanReadable}
          </pre>
        </div>
      )}
    </div>
  );
}
