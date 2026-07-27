import React from "react";
import { LuArrowUpDown } from "react-icons/lu";

const Filters = () => {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <LuArrowUpDown className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <select className="rounded-lg shadow bg-gray-50 px-8 py-2 text-sm text-gray-700 placeholder-gray-600 focus:border-red-500 focus:bg-white focus:outline-none focus:ring focus:ring-red-200">
          <option value="">Newest</option>
          <option value=""></option>
          <option value=""></option>
        </select>
      </div>
      <select className="rounded-lg shadow bg-gray-50 px-8 py-2 text-sm text-gray-700 placeholder-gray-600 focus:border-red-500 focus:bg-white focus:outline-none focus:ring focus:ring-red-200">
        <option value="">Electronics</option>
        <option value=""></option>
        <option value=""></option>
      </select>
      <select className="rounded-lg shadow bg-gray-50 px-8 py-2 text-sm text-gray-700 placeholder-gray-600 focus:border-red-500 focus:bg-white focus:outline-none focus:ring focus:ring-red-200">
        <option value="">In Stock</option>
        <option value=""></option>
        <option value=""></option>
      </select>
    </div>
  );
};

export default Filters;
