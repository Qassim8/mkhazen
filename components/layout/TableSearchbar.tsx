import { LuSearch } from "react-icons/lu";

type searchbarProps = {
  placeholder: string;
  searchKey?: string;
};

const TableSearchbar = ({ placeholder }: searchbarProps) => {
  return (
    <div className="relative grow">
      <LuSearch className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        placeholder={placeholder}
        className="w-full rounded-lg custom-shadow bg-gray-50 px-8 py-2 text-sm text-gray-700 placeholder-gray-600 border border-gray-300 focus:border-red-500 focus:bg-white focus:outline-none focus:ring focus:ring-red-200"
      />
    </div>
  );
};

export default TableSearchbar;
