import { categories, products } from "@/data/data";
import Card from "./components/Card";
import CartList from "./components/CartList";
import { LuList } from "react-icons/lu";
import TableSearchbar from "@/components/layout/TableSearchbar";

const POS = () => {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="col-span-2">
          <div>
            <TableSearchbar placeholder="Search for products...." />
          </div>
          <div className="py-5 md:py-10">
            <h2 className="mb-3 text-gray-600">Filter By Catgory:</h2>
            <div
              className="flex items-center gap-3 overflow-x-auto scroll-smooth px-2 py-3"
              style={{ scrollbarWidth: "thin", msOverflowStyle: "none" }}
            >
              <div className="flex min-w-max shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-300 hover:border-(--primary-pink) hover:bg-(--primary-pink) hover:text-white">
                <LuList className="text-base" />
                <h3>All</h3>
              </div>
              {categories.map(({ id, title, icon: Icon }) => (
                <div
                  key={id}
                  className="flex min-w-max shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-300 hover:border-(--primary-pink) hover:bg-(--primary-pink) hover:text-white"
                >
                  <Icon className="text-base" />
                  <h3>{title}</h3>
                </div>
              ))}
            </div>
            <div className="py-5 grid grid-cols-2 md:grid-cols-3 gap-5">
              {products.map(({ id, image, name, price }) => (
                <Card key={id} image={image} name={name} price={price} />
              ))}
            </div>
          </div>
        </div>
        <CartList />
      </div>
    </div>
  );
};

export default POS;
