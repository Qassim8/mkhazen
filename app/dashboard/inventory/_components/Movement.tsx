"use client";

import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuPackagePlus,
  LuRefreshCcw,
  LuScissors,
} from "react-icons/lu";

import { InventoryMovement } from "../services/inventory.services";

interface Props {
  movements: InventoryMovement[];
}

const getMovement = (type: InventoryMovement["movement_type"]) => {
  switch (type) {
    case "PURCHASE":
      return {
        label: "شراء",
        icon: LuArrowDownLeft,
        className: "text-emerald-600 bg-emerald-50 border-emerald-200",
        incoming: true,
      };

    case "SALE":
      return {
        label: "بيع",
        icon: LuArrowUpRight,
        className: "text-rose-600 bg-rose-50 border-rose-200",
        incoming: false,
      };

    case "PURCHASE_RETURN":
      return {
        label: "مرتجع شراء",
        icon: LuArrowUpRight,
        className: "text-rose-600 bg-rose-50 border-rose-200",
        incoming: false,
      };

    case "SALE_RETURN":
      return {
        label: "مرتجع بيع",
        icon: LuArrowDownLeft,
        className: "text-emerald-600 bg-emerald-50 border-emerald-200",
        incoming: true,
      };

    case "OPENING_STOCK":
      return {
        label: "مخزون افتتاحي",
        icon: LuPackagePlus,
        className: "text-indigo-600 bg-indigo-50 border-indigo-200",
        incoming: true,
      };

    case "ADJUSTMENT_IN":
      return {
        label: "تسوية إدخال",
        icon: LuRefreshCcw,
        className: "text-amber-600 bg-amber-50 border-amber-200",
        incoming: true,
      };

    case "ADJUSTMENT_OUT":
      return {
        label: "تسوية إخراج",
        icon: LuRefreshCcw,
        className: "text-amber-600 bg-amber-50 border-amber-200",
        incoming: false,
      };

    case "PRODUCTION_ISSUE":
      return {
        label: "تفصيل وخياطة",
        icon: LuScissors,
        className: "text-blue-600 bg-blue-50 border-blue-200",
        incoming: false, // حركة خروج (صادر من المخزون)
      };
    case "PRODUCTION_RECEIPT":
      return {
        label: "تصنيع",
        icon: LuArrowDownLeft,
        className: "text-gray-600 bg-gray-50 border-gray-200",
        incoming: true, // حركة دخول (وارد للمخزون)
      };

    case "GIFT":
      return {
        label: "إهداء",
        icon: LuArrowUpRight,
        className: "text-violet-600 bg-violet-50 border-violet-200",
        incoming: false, // حركة خروج
      };

    default:
      return {
        label: "حركة",
        icon: LuRefreshCcw,
        className: "text-gray-500 bg-gray-50 border-gray-200",
        incoming: false,
      };
  }
};

export default function Movement({ movements }: Props) {
  return (
    <div>
      <div className="pb-4">
        <p className="text-sm text-gray-500">الجدول الزمني</p>

        <h2 className="mt-1 font-semibold text-gray-900">أحدث التحركات</h2>
      </div>

      {!movements.length ? (
        <div className="py-8 text-center text-sm text-gray-400">
          لا توجد تحركات مخزنية حتى الآن.
        </div>
      ) : (
        <div className="space-y-3">
          {movements.map((movement, index) => {
            const info = getMovement(movement.movement_type);

            const Icon = info.icon;

            const product =
              movement.product_variants?.product_templates?.name || "منتج";

            return (
              <div key={movement.id} className="flex gap-3">
                <div
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${info.className}`}
                >
                  <Icon className="h-4 w-4" />

                  {index < movements.length - 1 && (
                    <div className="absolute -bottom-9 left-1/2 h-9 w-px -translate-x-1/2 bg-gray-200" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {product}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {info.label}{" "}
                    <span
                      className={`font-mono font-bold ${
                        info.incoming ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {info.incoming ? "+" : "-"}
                      {movement.quantity}
                    </span>
                  </p>

                  <p className="mt-0.5 truncate text-[11px] text-gray-400">
                    بواسطة {movement.users?.name || "النظام"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
