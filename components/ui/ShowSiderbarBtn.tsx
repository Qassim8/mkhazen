"use client";
import { useTable } from "@/store/useTable";
import { GoSidebarCollapse, GoSidebarExpand } from "react-icons/go";

const ShowSiderbarBtn = () => {
  const sidebarOpen = useTable((state) => state.sidebarOpen);
  const sidebarToggler = useTable((state) => state.sidebarToggler);

  return (
    <button
      onClick={() => sidebarToggler(!sidebarOpen)} // تمرير عكس القيمة الحالية مباشرة لزوستند لتجنب اللخبطة
      className="md:hidden fixed right-4 top-4 w-10 h-10 flex justify-center items-center text-white bg-(--primary-red) rounded-xl z-50 shadow-md active:scale-95 transition-transform"
    >
      {sidebarOpen ? (
        <GoSidebarCollapse className="h-5 w-5" />
      ) : (
        <GoSidebarExpand className="h-5 w-5" />
      )}
    </button>
  );
};

export default ShowSiderbarBtn;
