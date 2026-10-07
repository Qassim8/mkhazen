"use client";

import { useEffect, useState } from "react";
import { LuCheck, LuLoaderCircle, LuSearch, LuX } from "react-icons/lu";
import { getProducts } from "@/app/dashboard/products/services/products.services";

type FabricVariant = {
  id: string;
  sku?: string | null;
  stockQuantity?: number;
  colorName?: string | null;
  size?: string | null;
};

type FabricProduct = {
  id: string;
  name: string;
  sellingUnit?: string | null;
  variants: FabricVariant[];
};

interface SelectedFabric {
  variantId: string;
  productName: string;
  sku: string | null;
  colorName: string | null;
  stockQuantity: number;
  sellingUnit: string | null;
}

interface Props {
  value: string | null;
  onChange: (fabric: SelectedFabric | null) => void;
  disabled?: boolean;
  initialSelection?: SelectedFabric | null;
}

export default function FabricSearch({ value, onChange, disabled, initialSelection = null }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FabricProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFabric, setSelected] = useState<SelectedFabric | null>(null);
  const selected =
    value && initialSelection?.variantId === value
      ? initialSelection
      : value && selectedFabric?.variantId === value
        ? selectedFabric
        : null;

  useEffect(() => {
    if (!search.trim()) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const payload = await getProducts({
          search: search.trim(),
          page: 1,
          limit: 20,
        });

        if (active) setResults(payload.data);
      } catch (error) {
        if (active) {
          console.error("Fabric search:", error);
          setResults([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  function selectVariant(product: FabricProduct, variant: FabricVariant) {
    const fabric: SelectedFabric = {
      variantId: variant.id,
      productName: product.name,
      sku: variant.sku ?? null,
      colorName: variant.colorName ?? null,
      stockQuantity: Number(variant.stockQuantity ?? 0),
      sellingUnit: product.sellingUnit ?? null,
    };

    setSelected(fabric);
    onChange(fabric);
    setSearch("");
    setResults([]);
  }

  function clear() {
    setSelected(null);
    setSearch("");
    setResults([]);
    onChange(null);
  }

  return (
    <div className="relative space-y-2">
      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-gray-900">
              {selected.productName}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
              {selected.sku && <span>SKU: {selected.sku}</span>}
              {selected.colorName && <span>{selected.colorName}</span>}
              <span>المتاح: {selected.stockQuantity}</span>
              {selected.sellingUnit && (
                <span>الوحدة: {selected.sellingUnit}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-emerald-200 bg-white p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            aria-label="إزالة القماش"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              disabled={disabled}
              onChange={(event) => {
                const nextSearch = event.target.value;
                setSearch(nextSearch);
                if (!nextSearch.trim()) {
                  setResults([]);
                  setLoading(false);
                }
              }}
              placeholder="ابحث باسم القماش أو SKU..."
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pr-10 pl-10 text-sm outline-none transition focus:border-(--primary-red)"
            />
            {loading && (
              <LuLoaderCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
            )}
          </div>

          {results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
              {results.map((product) => (
                <div key={product.id} className="p-2">
                  <p className="px-2 pb-1 text-xs font-black text-gray-900">
                    {product.name}
                  </p>

                  <div className="space-y-1">
                    {(product.variants ?? [])
                      .filter(
                        (variant) => Number(variant.stockQuantity ?? 0) > 0,
                      )
                      .map((variant) => (
                        <button
                          key={variant.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => selectVariant(product, variant)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-right hover:bg-gray-50 disabled:opacity-50"
                        >
                          <span className="min-w-0 truncate text-xs text-gray-700">
                            {variant.colorName ?? "متغير"}
                            {variant.size ? ` · ${variant.size}` : ""}
                            {variant.sku ? ` · ${variant.sku}` : ""}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <LuCheck className="h-3 w-3" />
                            {Number(variant.stockQuantity ?? 0).toFixed(2)}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
