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

      <div
        className="relative w-full max-w-2xl transform rounded-3xl bg-white p-6 shadow-2xl duration-300 scale-in border border-gray-100 max-h-[80vh] overflow-y-auto pr-2
        [&::-webkit-scrollbar]:w-2
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-gray-200
        hover:[&::-webkit-scrollbar-thumb]:bg-gray-300
        transition-colors"
      >
        <button
          onClick={closeModal}
          className="absolute right-4 top-4 z-10 rounded-xl p-1.5 text-gray-400 bg-white/80 backdrop-blur-sm hover:bg-gray-50 hover:text-gray-700 transition"
        >
          <IoClose className="h-5 w-5" />
        </button>

        <div className="mt-2">{modalContent}</div>
      </div>
    </div>
  );
}
