"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";

import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";

import AccountingTable from "./AccountingTable";
import NewJournalEntryModal from "./NewJournalModal";

import {
  JournalEntryInput,
} from "../schemas/accounting.schema";
import PageHeader from "@/components/shared/PageHeader";

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Props {
  initialData: JournalEntryInput[];
  initialMeta: Meta;
}

const ENTRY_TYPES = [
  { value: "CAPITAL", label: "رأس مال" },
  { value: "PURCHASE", label: "شراء" },
  { value: "PURCHASE_PAYMENT", label: "دفع للمورد" },
  { value: "SALE", label: "بيع" },
  { value: "EXPENSE", label: "مصروف" },
  { value: "ASSET", label: "أصل" },
  { value: "OTHER", label: "أخرى" },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const y = currentYear - index;
  return { label: String(y), value: String(y) };
});

export default function AccountingEntriesClient({
  initialData,
  initialMeta,
}: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  function handleCreated() {
    setShowModal(false);
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title=" القيود المحاسبية"
        subtitle=" دفتر اليومية لجميع العمليات المالية"
        buttonTitle=" قيد جديد"
        redirect={() => setShowModal(true)}
      />

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar
            placeholder="بحث برقم القيد أو البيان أو المرجع..."
            searchKey="search"
          />

          <div className="flex items-center gap-2">
            <TableFilter label="السنة" paramKey="year" options={YEAR_OPTIONS} />

            <TableFilter
              label="نوع القيد"
              paramKey="entryType"
              options={ENTRY_TYPES}
            />
          </div>
          <ResetFilters />
        </div>
      </Suspense>

      <AccountingTable data={initialData} />
      <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
        <Pagination meta={initialMeta} />
      </Suspense>

      {showModal && (
        <NewJournalEntryModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
