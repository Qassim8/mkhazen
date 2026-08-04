import { LuSearch } from "react-icons/lu";

const Searchbar = () => {
  return (
    <div className="relative">
      <LuSearch className="h-4 w-4 text-gray-500 absolute inset-s-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        placeholder="ابحث عن منتج......"
        className="w-72 rounded-xl bg-gray-50 px-8 py-2 text-sm text-gray-700 border border-gray-300 placeholder-gray-600 focus:border-red-500 focus:bg-white focus:outline-none focus:ring focus:ring-red-200"
      />
    </div>
  );
};

export default Searchbar;
