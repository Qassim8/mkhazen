import { LuPencil, LuTrash2 } from "react-icons/lu";
import { Category } from "../page";

const Card = ({ id, icon, color, title, products }: Category) => {
  return (
    <div className="frame space-y-2">
      <div
        style={{ backgroundColor: color }}
        className="h-12 w-12 flex justify-center items-center text-2xl text-white rounded-xl"
      >
        {icon}
      </div>
      <h2 className="font-semibold mt-6 mb-0">{title}</h2>
      <p className="text-gray-500 text-sm">{products} products</p>
      <div className="mt-5 pt-3 border-t border-t-gray-300 flex justify-between items-center ">
        <button className="text-sm flex items-center gap-1 py-1 px-3 rounded-xl text-gray-800 cursor-pointer transition-colors duration-200 hover:bg-blue-500/15 hover:text-blue-500">
          <LuPencil />
          <span>Edit</span>
        </button>
        <button className="text-sm flex items-center gap-1 py-1 px-3 rounded-xl text-gray-800 cursor-pointer transition-colors duration-200 hover:bg-red-500/15 hover:text-red-500">
          <LuTrash2 />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
};

export default Card;
