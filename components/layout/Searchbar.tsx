import { LuSearch } from "react-icons/lu";

const Searchbar = () => {
  return (
    <form
      action="/dashboard/products"
      method="get"
      className="relative"
      role="search"
    >
      <input
        type="search"
        name="search"
        placeholder="ابحث عن منتج......"
        aria-label="ابحث عن منتج"
        className="w-48 rounded-lg border border-gray-300 bg-gray-50 py-2 pe-3 ps-9 text-sm text-gray-700 placeholder-gray-600 focus:border-(--primary-red)/70 focus:bg-white focus:outline-none focus:ring focus:ring-red-200 md:w-72 md:rounded-xl"
      />
      <button
        type="submit"
        aria-label="بحث"
        className="absolute inset-s-3 top-1/2 -translate-y-1/2 text-gray-500"
      >
        <LuSearch className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
};

export default Searchbar;
