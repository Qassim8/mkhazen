"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Category } from "@/types/types";
import ModalContent from "./ModalContent";
import Card from "./Card";
import { useModalStore } from "@/store/useModalStore";

interface CategoriesProps {
  initialCategories: Category[];
}

export default function CategoriesClient({
  initialCategories,
}: CategoriesProps) {
  const openModal = useModalStore((state) => state.openModal);

  return (
    <main className="p-6">
      <PageHeader
        title="الفئات"
        subtitle={`لديك ${initialCategories?.length || 0} من الفئات`}
        buttonTitle="أضف فئة"
        redirect={() =>
          openModal("CREATE", {
            title: "انشاء فئة جديدة",
            content: <ModalContent />,
          })
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 my-8">
        {initialCategories?.map((category) => (
          <Card key={category.id} category={category} />
        ))}
      </div>
    </main>
  );
}
