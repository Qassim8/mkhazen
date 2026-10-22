"use client";

import { useState } from "react";

import PageHeader from "@/components/shared/PageHeader";

import NewAssetModal from "./NewAssetsModal";

/** الكاشير يسجّل أصلًا جديدًا فقط — بدون قائمة الأصول ولا إجمالي قيمتها */
export default function CashierAssetEntry() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="تسجيل أصل جديد"
        subtitle="سجّل شراء أصل جديد (ماكينة، مكيف، أثاث...) ويُخصم ثمنه من الخزينة أو البنك"
        buttonTitle="أصل جديد"
        redirect={() => setShowModal(true)}
      />

      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
        اضغط «أصل جديد» لتسجيل عملية شراء أصل. يصل الإشعار إلى المالك تلقائيًا.
      </div>

      {showModal && <NewAssetModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
