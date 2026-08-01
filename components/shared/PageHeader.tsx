"use client";
import { useTable } from "@/store/useTable";
import { LuPlus } from "react-icons/lu";

type HeaderProps = {
  title: string;
  subtitle: string;
  buttonTitle?: string;
};

const PageHeader = ({ title, subtitle, buttonTitle }: HeaderProps) => {
  const openModal = useTable((state) => state.openModal);
  return (
    <header className="pt-3 pb-7 flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-gray-500 text-sm">{subtitle}</p>
      </div>
      {buttonTitle && (
        <button
          className="flex items-center justify-center gap-2 py-2 px-4 text-white bg-(--primary-red) hover:bg-(--primary-red-hover) rounded-xl transition-colors duration-300 cursor-pointer"
          onClick={openModal}
        >
          <LuPlus />
          <span className="text-sm">{buttonTitle}</span>
        </button>
      )}
    </header>
  );
};

export default PageHeader;
