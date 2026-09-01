"use client";

import { useState } from "react";
import AreaChartComponent from "./_components/BarChart";
import Filters from "../products/_components/Filters";
import Movement from "./_components/Movement";
import MovementTable from "./_components/MovementsTable";
import PageHeader from "@/components/shared/PageHeader";
import AdjustmentModal from "./_components/AdjustmentModal";
import { InventoryMovement } from "./services/inventory.services";

interface WarehouseClientProps {
  movements: InventoryMovement[];
  products: Array<{ id: string; name: string; stockQuantity: number }>;
}

export default function WarehouseClient({
  movements = [],
  products = [],
}: WarehouseClientProps) {
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);

  return (
    <main>
      <PageHeader
        title="تحركات المخزن"
        subtitle="تتبع كل التحركات والتغيرات في مخزنك"
        buttonTitle="عملية جديدة"
        redirect={() => setIsAdjustmentOpen(true)}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
        <div className="md:col-span-2">
          <AreaChartComponent movements={movements} />
        </div>
        <div className="frame">
          <Movement movements={movements.slice(0, 6)} />
        </div>
      </div>

      <div className="frame my-8 p-0!">
        <div className="p-5">
          <Filters />
        </div>
        <MovementTable movements={movements} />
      </div>

      <AdjustmentModal
        isOpen={isAdjustmentOpen}
        onClose={() => setIsAdjustmentOpen(false)}
        products={products}
      />
    </main>
  );
}
