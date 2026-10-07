"use client";

import Image from "next/image";
import { LuTrash2, LuPackage, LuSquarePen } from "react-icons/lu";

import { deleteCategory } from "../services/categories.services";
import { useModalStore } from "@/store/useModalStore";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";
import ModalContent from "./CategoriesModalContent";
import { Category } from "../schemas/category.schemas";

interface CardProps {
  category: Category;
}

const Card = ({ category }: CardProps) => {
  const openModal = useModalStore((state) => state.openModal);

  return (
    <div className="frame space-y-2 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-md transition">
      <div className="flex justify-between items-center gap-4">
        <div className="relative h-20 w-20 flex justify-center items-center bg-amber-50 rounded-2xl overflow-hidden shrink-0">
          {category.imageUrl ? (
            <Image
              fill
              src={category.imageUrl}
              alt={category.name ?? "Category image"}
              className="object-cover"
            />
          ) : (
            <LuPackage className="h-8 w-8 text-amber-600" />
          )}
        </div>
        <div className="flex-1 text-right">
          <h2 className="font-semibold text-xl text-gray-900">
            {category.name}
          </h2>
          <p className="text-gray-500 text-xs mt-1">
            {category.productsCount ?? 0} منتج
          </p>
        </div>
      </div>

      <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between items-center">
        <button
          onClick={() =>
            openModal("UPDATE", {
              title: "تعديل بيانات الفئة",
              content: <ModalContent initialData={category} />,
            })
          }
          className="text-sm font-medium flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-gray-700 hover:text-blue-600 transition"
        >
          <LuSquarePen className="h-3.5 w-3.5" />
          <span>تعديل</span>
        </button>

        <button
          onClick={() =>
            openModal("DELETE_CONFIRM", {
              rowId: category.id,
              itemName: category.name,
              actionFunction: deleteCategory,
              contet: <DeleteConfirmationModal />,
            })
          }
          className="text-sm font-medium flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-gray-700 hover:text-red-600 transition disabled:opacity-50"
        >
          <LuTrash2 className="h-3.5 w-3.5" />

          <span>حذف</span>
        </button>
      </div>
    </div>
  );
};

export default Card;
