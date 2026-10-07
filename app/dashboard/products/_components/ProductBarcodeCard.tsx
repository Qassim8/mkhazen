"use client";

import Barcode from "react-barcode";
import { LuPrinter } from "react-icons/lu";
import { printBarcodeOnly } from "./PrintBarcodeFunction";

interface BarcodePrintProps {
  value: string;
  productName: string;
  price?: number;
}

export const ProductBarcode = ({
  value,
  productName,
  price,
}: BarcodePrintProps) => {
  const handlePrint = () => {
    printBarcodeOnly(value, productName, price);
  };

  return (
    <div className="flex flex-col items-center gap-3 p-4 border border-gray-200 rounded-xl bg-white text-center">
      <button
        type="button"
        onClick={handlePrint}
        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
      >
        <LuPrinter className="w-4 h-4" />
        طباعة الملصق
      </button>
      <div id="printable-barcode" className="barcode-wrapper">
        <Barcode
          value={value}
          width={1.5}
          height={50}
          fontSize={12}
          margin={5}
        />
      </div>
    </div>
  );
};
