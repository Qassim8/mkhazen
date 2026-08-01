"use client";

import { IoClose } from "react-icons/io5";
import { useTable } from "@/store/useTable";

export default function GenericModal({
  modalContent,
}: {
  modalContent: React.ReactNode;
}) {
  const { isOpen, closeModal } = useTable();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={closeModal}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn"
      />

      <div className="relative w-full max-w-2xl transform rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300 scale-in border border-gray-100 h-[85vh] overflow-y-scroll">
        <button
          onClick={closeModal}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition"
        >
          <IoClose className="h-5 w-5" />
        </button>

        <div className="mt-2">{modalContent}</div>
      </div>
    </div>
  );
}
