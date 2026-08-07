import { Category } from "@/types/types";
import Image from "next/image";
import { LuPencil, LuTrash2 } from "react-icons/lu";

const Card = ({ icon, title, products }: Category) => {
  return (
    <div className="frame space-y-2">
      <div className="flex justify-between items-center">
        <div className="relative h-28 w-28 flex justify-center items-center bg-amber-50 rounded-full">
          <Image fill src={icon} alt={title} className="object-cover" />
        </div>
        <div>
          {" "}
          <h2 className="font-semibold text-2xl mt-6 mb-0">{title}</h2>
          <p className="text-gray-500 text-sm">{products} منتج</p>
        </div>
      </div>
      <div className="mt-5 pt-3 border-t border-t-gray-300 flex justify-between items-center ">
        <button className="text-sm flex items-center gap-1 py-1 px-3 rounded text-gray-800 cursor-pointer transition-colors duration-200 hover:bg-blue-500/15 hover:text-blue-500">
          <LuPencil />
          <span>التعديل</span>
        </button>
        <button className="text-sm flex items-center gap-1 py-1 px-3 rounded text-gray-800 cursor-pointer transition-colors duration-200 hover:bg-red-500/15 hover:text-red-500">
          <LuTrash2 />
          <span>الحذف</span>
        </button>
      </div>
    </div>
  );
};

export default Card;
