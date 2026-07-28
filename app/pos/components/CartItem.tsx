import { Product } from "@/types/types";
import Image from "next/image";
import { LuPlus, LuMinus } from "react-icons/lu";

const CartItem = ({ image, name, price, qty }: Product) => {
  return (
    <div className="flex items-center gap-3 w-full p-2 rounded-lg border border-gray-200">
      <div className="relative h-10 w-14 rounded overflow-hidden">
        <Image alt={name} src={image} fill className="object-cover" />
      </div>
      <div className="w-full space-y-1.5">
        <h1 className="text-sm">{name}</h1>
        <div className="w-full flex justify-between items-center">
          <h2 className="font-semibold">${price}</h2>
          <div className="flex items-center gap-3">
            <div className="flex justify-center items-center w-5 h-5 text-white bg-(--primary-red) rounded-full">
              <LuPlus />
            </div>
            <p>{qty}</p>
            <div className="flex justify-center items-center w-5 h-5 text-white bg-(--primary-red) rounded-full">
              <LuMinus />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartItem;
