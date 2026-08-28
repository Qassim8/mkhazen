"use client";

import React from "react";
import Image from "next/image";
import Barcode from "react-barcode";
import { Product } from "../schemas/product.schemas";
import { printBarcodeOnly } from "./PrintBarcodeFunction";

interface ProductViewModalProps {
  product: Product;
}

const ProductViewModal = ({ product }: ProductViewModalProps) => {
  const handlePrintBarcode = () => {
    printBarcodeOnly(product.barcode, product.name);
  };

  return (
    <div className="space-y-6 text-right dir-rtl overflow-y-scroll max-h-[50vh] pl-2">
      {/* المعرض المباشر للصور */}
      {product.images && product.images.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {product.images.map((img, idx) => (
            <div
              key={idx}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200"
            >
              <Image
                src={img}
                alt={product.name}
                fill
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* تفاصيل أساسية */}
      <div className="grid grid-cols-2 gap-4 rounded-2xl bg-gray-50 p-4">
        <div>
          <span className="block text-xs text-gray-500">اسم المنتج</span>
          <span className="font-bold text-gray-900">{product.name}</span>
        </div>
        <div>
          <span className="block text-xs text-gray-500">الرمز (SKU)</span>
          <span className="font-mono text-sm text-gray-800">
            {product.sku || "—"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-gray-500">الفئة</span>
          <span className="text-sm font-medium text-gray-800">
            {product.category?.name || "غير محدد"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-gray-500">المورد</span>
          <span className="text-sm font-medium text-gray-800">
            {product.supplier?.name || "غير محدد"}
          </span>
        </div>
      </div>

      {/* الأسعار والوحدات */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="mb-3 text-sm font-bold text-gray-900">
          الأسعار والوحدات
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xs">
            <span className="block text-xs text-gray-500">سعر التكلفة</span>
            <span className="font-bold text-gray-900">
              {product.purchasePrice} ريال
            </span>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 shadow-xs">
            <span className="block text-xs text-emerald-600">سعر البيع</span>
            <span className="font-bold text-emerald-700">
              {product.sellingPrice} ريال
            </span>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xs">
            <span className="block text-xs text-gray-500">
              وحدة الشراء/البيع
            </span>
            <span className="text-xs font-semibold text-gray-800">
              {product.purchaseUnit} ➔ {product.sellingUnit} (
              {product.conversionFactor})
            </span>
          </div>
        </div>
      </div>

      {/* المخزون */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="mb-3 text-sm font-bold text-gray-900">المخزون</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <span className="block text-xs text-gray-500">المخزون الحالي</span>
            <span className="text-lg font-bold text-gray-900">
              {product.stockQuantity} {product.sellingUnit}
            </span>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <span className="block text-xs text-gray-500">حد إعادة الطلب</span>
            <span className="text-lg font-bold text-gray-900">
              {product.minStockLevel} {product.sellingUnit}
            </span>
          </div>
        </div>
      </div>

      {product.description && (
        <div className="border-t border-gray-100 pt-4">
          <span className="block text-xs text-gray-500 mb-1">الوصف</span>
          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl">
            {product.description}
          </p>
        </div>
      )}

      {product.barcode && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-gray-900">ملصق الباركود</h4>
            <button
              type="button"
              onClick={handlePrintBarcode}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
            >
              طباعة الملصق 🖨️
            </button>
          </div>

          <div
            id="printable-barcode"
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center"
          >
            <Barcode
              value={product.barcode}
              width={1.4}
              height={45}
              fontSize={12}
              margin={4}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductViewModal;
