import { Product } from "@/types/types";
import Image from "next/image";
import React from "react";
import { LuPlus } from "react-icons/lu";

const Card = ({ image, name, price }: Product) => {
  return (
    <div className="frame p-4!">
      <div className="relative w-full h-44 rounded-xl bg-(--primary-pink)/30 overflow-hidden">
        <Image src={image} alt={name} fill className="object-cover" />
      </div>
      <h1 className="font-semibold mt-3 leading-5">{name}</h1>
      <div className="flex justify-between items-center mt-5">
        <h2 className="font-semibold text-emerald-500">${price}</h2>
        <div className="h-8 w-8 text-white bg-(--primary-red) rounded-lg flex justify-center items-center cursor-pointer transition-colors duration-300 hover:bg-(--primary-red-hover)">
          <LuPlus />
        </div>
      </div>
    </div>
  );
};

export default Card;
