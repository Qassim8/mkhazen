"use client";

import { InventoryMovement } from "../services/inventory.services";
import { LuArrowDownLeft, LuArrowUpRight, LuRefreshCcw } from "react-icons/lu";

interface MovementTimelineProps {
  movements: InventoryMovement[];
}

const Movement = ({ movements }: MovementTimelineProps) => {
  return (
    <div>
      <div className="flex flex-col gap-1 pb-3">
        <p className="text-sm text-gray-500">الجدول الزمني</p>
        <h2 className="font-semibold text-gray-900">أحدث التحركات المخزنية</h2>
      </div>

      {movements.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          لا توجد تحركات مخزنية مسجلة حتى الآن.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {movements.map((move, index) => {
            const isStockIn = move.movement_type === "STOCK_IN";
            const isStockOut = move.movement_type === "STOCK_OUT";

            return (
              <div className="flex gap-3" key={move.id}>
                <div
                  className={`relative h-8 w-8 flex justify-center items-center font-semibold shrink-0
                    ${
                      isStockIn
                        ? "text-emerald-500 bg-emerald-500/10"
                        : isStockOut
                          ? "text-rose-500 bg-rose-500/10"
                          : "text-amber-500 bg-amber-500/10"
                    } 
                    text-sm rounded-full`}
                >
                  {isStockIn ? (
                    <LuArrowDownLeft />
                  ) : isStockOut ? (
                    <LuArrowUpRight />
                  ) : (
                    <LuRefreshCcw />
                  )}

                  {index !== movements.length - 1 && (
                    <div className="absolute -bottom-4.5 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-gray-200" />
                  )}
                </div>

                <div className="overflow-hidden">
                  <h3 className="font-semibold text-sm truncate text-gray-900">
                    {move.products?.name || "منتج غير معروف"}
                  </h3>
                  <span className="text-gray-500 text-xs block truncate">
                    {isStockIn ? "إدخال" : isStockOut ? "إخراج" : "تسوية"}{" "}
                    <span className="font-mono font-bold mx-1">
                      {move.quantity > 0 ? `+${move.quantity}` : move.quantity}
                    </span>
                    {move.reference ? `• ${move.reference}` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Movement;
