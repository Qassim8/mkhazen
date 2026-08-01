"use client";

import { useState } from "react";
import {
  LuPackage,
  LuBarcode,
  LuLayers,
  LuDollarSign,
  LuTrendingUp,
} from "react-icons/lu";

export default function ProductDetails() {
  const [activeTab, setActiveTab] = useState("info");

  const product = {
    name: "Wireless Noise-Canceling Headphones",
    sku: "WH-1000XM4",
    category: "Electronics",
    costPrice: 80,
    salePrice: 120,
    quantity: 15,
    reorderLevel: 5,
  };

  const profitPerItem = product.salePrice - product.costPrice;
  const totalInventoryValue = product.quantity * product.costPrice;

  return (
    <div className="space-y-6">
      {/* كارت المنتج الرئيسي */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center gap-5">
        <div className="h-20 w-20 rounded-2xl bg-(--primary-red)/10 text-(--primary-red) flex items-center justify-center text-3xl shrink-0">
          <LuPackage className="h-10 w-10" />
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-950 truncate">
            {product.name}
          </h2>
          <p className="text-gray-500 font-medium text-sm">
            SKU: {product.sku} — Category: {product.category}
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0">
          <div className="flex-1 text-center bg-gray-50 p-3 rounded-2xl border min-w-[100px]">
            <p className="text-[10px] text-gray-400 font-bold uppercase">
              Stock
            </p>
            <p className="text-lg font-black text-gray-900">
              {product.quantity}
            </p>
          </div>
          <div className="flex-1 text-center bg-green-50 border border-green-100 p-3 rounded-2xl min-w-[100px]">
            <p className="text-[10px] text-green-500 font-bold uppercase">
              Profit/Item
            </p>
            <p className="text-lg font-black text-green-600">
              ${profitPerItem}
            </p>
          </div>
        </div>
      </div>

      {/* التبويبات */}
      <div className="flex border-b border-gray-100 gap-4 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("info")}
          className={`pb-3 transition-all ${activeTab === "info" ? "border-b-2 border-(--primary-red) text-(--primary-red)" : "text-gray-400"}`}
        >
          Pricing & Stock Analytics
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 transition-all ${activeTab === "history" ? "border-b-2 border-(--primary-red) text-(--primary-red)" : "text-gray-400"}`}
        >
          Stock Movement Ledger
        </button>
      </div>

      {/* المحتوى المالي والتحليلي */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm min-h-[200px]">
        {activeTab === "info" ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-3 text-sm">
              <LuDollarSign className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Cost Price</p>
                <p className="font-semibold text-gray-900">
                  ${product.costPrice}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LuTrendingUp className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Retail Sale Price</p>
                <p className="font-semibold text-gray-900">
                  ${product.salePrice}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LuLayers className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Total Stock Value</p>
                <p className="font-semibold text-gray-900">
                  ${totalInventoryValue}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm border-t border-gray-50 pt-4 sm:col-span-2 lg:col-span-3">
              <LuBarcode className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">
                  Low Stock Alert Threshold
                </p>
                <p className="font-semibold text-gray-900">
                  Triggers warning alert at {product.reorderLevel} units or less
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-gray-400 italic">
            No warehouse movement history (In/Out/Adjustment) recorded for this
            asset yet.
          </div>
        )}
      </div>
    </div>
  );
}
