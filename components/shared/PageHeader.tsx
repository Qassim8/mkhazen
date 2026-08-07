"use client";
import { useTable } from "@/store/useTable";
import { LuPlus } from "react-icons/lu";

type HeaderProps = {
  title: string;
  subtitle: string;
  buttonTitle?: string;
  redirect?: () => void;
};

const PageHeader = ({
  title,
  subtitle,
  buttonTitle,
  redirect,
}: HeaderProps) => {
  const openModal = useTable((state) => state.openModal);
  return (
    <header className="pt-3 pb-7 flex justify-between items-center">
      <div>
        <h1 className="text-xl md:text-3xl font-bold">{title}</h1>
        <p className="text-xs md:text-sm text-gray-500">{subtitle}</p>
      </div>
      {buttonTitle && (
        <button
          className="flex items-center justify-center gap-2 py-2 px-4 text-white bg-(--primary-red) hover:bg-(--primary-red-hover) rounded-lg md:rounded-xl transition-colors duration-300 cursor-pointer"
          onClick={redirect || openModal}
        >
          <span className="text-xs md:text-sm">{buttonTitle}</span>
          <LuPlus />
        </button>
      )}
    </header>
  );
};

export default PageHeader;
