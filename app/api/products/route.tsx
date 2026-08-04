import { products } from "@/data/data";
import { NextRequest, NextResponse } from "next/server";

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query");
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  let filterdProducts = [...products];

  if (query) {
    filterdProducts = products.filter((product) =>
      product.name.includes(query),
    );
  }

  if (category && category !== "all") {
    filterdProducts = products.filter(
      (product) => product.category === category,
    );
  }

  if (status) {
    if (status === "in") {
      filterdProducts = products.filter(
        (product) => product.status === "In stock",
      );
    }
    if (status === "out") {
      filterdProducts = products.filter(
        (product) => product.status === "Out of stock",
      );
    }
  }

  return NextResponse.json(filterdProducts);
};
