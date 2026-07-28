import React from "react";
import Searchbar from "../products/(components)/Searchbar";
import { categories, products } from "@/data/data";
import Card from "./(components)/Card";
import CartList from "./(components)/CartList";

const POS = () => {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="col-span-2">
          <div>
            <Searchbar />
          </div>
          <div className="py-5 md:py-10">
            <h2 className="text-gray-600 mb-3">Filter By Catgory:</h2>
            <div className="flex justify-between items-center gap-5 overflow-x-scroll md:overflow-x-auto">
              {categories.map(({ id, title, icon: Icon }) => (
                <div
                  key={id}
                  className={`py-2 px-6 grow flex items-center justify-center gap-3 text-gray-600 rounded-2xl border border-gray-600 cursor-pointer transition-colors duration-300 hover:text-white hover:bg-(--primary-pink) hover:border-(--primary-pink)`}
                >
                  <Icon />
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
