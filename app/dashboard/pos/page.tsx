"use client";

import { useState, useEffect } from "react";
import { categories, products } from "@/data/data";
import Card from "./components/Card";
import CartList from "./components/CartList";
import { LuList, LuShoppingCart } from "react-icons/lu";
import Image from "next/image";

export default function POSPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    const syncCartPanel = () => {
      setIsCartOpen(window.innerWidth >= 1024);
    };

    syncCartPanel();
    window.addEventListener("resize", syncCartPanel);

    return () => window.removeEventListener("resize", syncCartPanel);
  }, []);

  // 1. منطق ذكي جداً لماسح الباركود و الـ QR
  const handleBarcodeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // البحث عن المنتج المطابق للباركود أو الـ SKU الممسوح
    const matchedProduct = products.find(
      (p) =>
        p.sku?.toLowerCase() === searchQuery.toLowerCase().trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase().trim()),
    );

    if (matchedProduct) {
      addToCart(matchedProduct);
      setSearchQuery(""); // تصفير الحقل فوراً لاستقبال المسحة التالية من الـ QR
    }
  };

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: (item.qty || 1) + 1 } : item,
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  // تصفية المنتجات حركياً حسب البحث والصنف المختارة
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "all" || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div
      className="max-w-[1600px] my-5 mx-auto flex flex-col lg:flex-row gap-6 p-4 overflow-hidden"
      dir="rtl"
    >
      {/* الطرف الأيمن: المنتجات والفلاتر (متحرك ومستقل) */}
      <div className="flex-1 flex flex-col h-full pl-2 space-y-4">
        {/* حقل البحث المدعوم بنظام الـ Enter لماسح الـ QR */}
        <div className="flex items-center gap-2 lg:gap-3">
          <form onSubmit={handleBarcodeSearch} className="w-full">
            <div className="relative rounded-2xl bg-white border border-gray-200 overflow-hidden">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="امسح باركود الـ QR أو اكتب اسم الجلابية للبحث السريع..."
                className="w-full px-5 py-3.5 text-sm text-gray-900 focus:outline-none font-medium bg-gray-50/50 focus:bg-white transition"
              />
              <button
                type="submit"
                className="absolute left-4 top-3 px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition"
              >
                بحث (Enter)
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => setIsCartOpen((prev) => !prev)}
            className="lg:hidden flex items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-3 text-xs font-bold text-white shadow-sm"
          >
            <LuShoppingCart className="h-4 w-4" />
            <span>{isCartOpen ? "إخفاء السلة" : `السلة (${cart.length})`}</span>
          </button>
        </div>

        {/* فلاتر الأصناف الفاخرة */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200">
          <h2 className="text-xs font-bold text-gray-400 mb-2.5">
            الفلترة حسب نوع اللباس:
          </h2>
          <div
            className="flex items-center gap-2 overflow-x-auto scroll-smooth pb-1
            [&::-webkit-scrollbar]:h-1
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-gray-200"
          >
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`flex min-w-max items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
                selectedCategory === "all"
                  ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <LuList className="text-sm" />
              <span>كل المعروض</span>
            </button>

            {categories.map(({ id, title, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedCategory(id)}
                className={`flex min-w-max items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
                  selectedCategory === id
                    ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Image
                  src={icon}
                  alt={title}
                  width={16}
                  height={16}
                  className="object-contain"
                />
                <span>{title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* شبكة عرض كروت المنتجات */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-6">
          {filteredProducts.map((product) => (
            <Card key={product.id} product={product} onAdd={addToCart} />
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-gray-400 border border-dashed rounded-2xl bg-gray-50">
              لم يتم العثور على أي جلاليب مطابقة للبحث.
            </div>
          )}
        </div>
      </div>

      {/* الطرف الأيسر: السلة وحسابات الكاشير (ثابتة بارتفاع الشاشة) */}
      <div className="w-full lg:w-[400px] h-full flex flex-col shrink-0">
        <div
          className={`
            fixed inset-y-0 right-0 z-40 w-[88%] max-w-sm bg-white shadow-2xl transition-transform duration-200 ease-out
            lg:static lg:w-full lg:max-w-none lg:shadow-none lg:translate-x-0
            ${isCartOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          `}
        >
          <CartList
            cart={cart}
            setCart={setCart}
            onClose={() => setIsCartOpen(false)}
          />
        </div>

        {isCartOpen && (
          <button
            type="button"
            aria-label="إغلاق السلة"
            onClick={() => setIsCartOpen(false)}
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          />
        )}
      </div>
    </div>
  );
}
