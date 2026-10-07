"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Image from "next/image";
import { LuList, LuShoppingCart } from "react-icons/lu";
import toast from "react-hot-toast";

import Card from "./Card";
import CartList from "./CartList";

import type {
  Product,
  ProductVariant,
} from "@/app/dashboard/products/schemas/product.schemas";

import type { Category } from "../../categories/schemas/category.schemas";
import type { PaymentMethod, PaymentSplit } from "../schemas/pos.schemas";

import { createSalesOrder } from "../services/pos.services";

interface POSClientProps {
  initialProducts: Product[];
  categories: Category[];
}

export interface POSCartItem {
  product: Product;
  variant: ProductVariant;
  qty: number;
  isGift: boolean;
  giftNote: string | null;
}

interface ProductsApiResponse {
  data: Product[];

  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export default function POSClient({
  initialProducts,
  categories,
}: POSClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("all");

  const [cart, setCart] = useState<POSCartItem[]>([]);

  const cartRef = useRef<POSCartItem[]>([]);

  const [discountAmount, setDiscountAmount] = useState(0);

  const [discountInput, setDiscountInput] = useState("");

  const [discountError, setDiscountError] = useState("");

  const [isCartOpen, setIsCartOpen] = useState(false);

  const [isSearching, setIsSearching] = useState(false);

  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const replaceCart = useCallback((nextCart: POSCartItem[]) => {
    cartRef.current = nextCart;
    setCart(nextCart);
  }, []);

  const resetDiscount = useCallback(() => {
    setDiscountInput("");
    setDiscountError("");
    setDiscountAmount(0);
  }, []);

  // =====================================================
  // Mobile cart
  // =====================================================

  useEffect(() => {
    const syncCartPanel = () => {
      setIsCartOpen(window.innerWidth >= 1024);
    };

    window.addEventListener("resize", syncCartPanel);

    return () => {
      window.removeEventListener("resize", syncCartPanel);
    };
  }, []);

  // =====================================================
  // Focus search
  // =====================================================

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // =====================================================
  // Add product
  // =====================================================

  const addCartItem = useCallback(
    (
      product: Product,
      variant: ProductVariant,
      quantity: number,
      isGift: boolean,
      giftNote: string | null,
    ): boolean => {
      if (!variant.isActive) {
        toast.error("هذا المتغير غير متاح للبيع");
        return false;
      }

      const currentCart = cartRef.current;
      const stockQuantity = Number(variant.stockQuantity);
      const alreadyReserved = currentCart.reduce(
        (sum, item) =>
          item.variant.id === variant.id ? sum + item.qty : sum,
        0,
      );

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        alreadyReserved + quantity > stockQuantity + 0.000001
      ) {
        toast.error(`المخزون المتاح فقط ${Math.max(0, stockQuantity - alreadyReserved)}`);
        return false;
      }

      const existing = currentCart.find(
        (item) => item.variant.id === variant.id && item.isGift === isGift,
      );
      const nextCart = existing
        ? currentCart.map((item) =>
            item === existing
              ? {
                  ...item,
                  qty: Number((item.qty + quantity).toFixed(2)),
                  giftNote: isGift ? giftNote ?? item.giftNote : null,
                }
              : item,
          )
        : [
            ...currentCart,
            {
              product,
              variant,
              qty: quantity,
              isGift,
              giftNote: isGift ? giftNote : null,
            },
          ];

      replaceCart(nextCart);
      return true;
    },
    [replaceCart],
  );

  const addProductToCart = useCallback(
    (product: Product, variant?: ProductVariant) => {
      const selectedVariant =
        variant ??
        product.variants.find((item) => item.isDefault && item.isActive) ??
        product.variants.find((item) => item.isActive);

      if (!selectedVariant) {
        toast.error("هذا المنتج لا يحتوي على متغير صالح للبيع");
        return;
      }

      addCartItem(product, selectedVariant, 1, false, null);
    },
    [addCartItem],
  );

  const addGiftToCart = useCallback(
    (
      product: Product,
      variant: ProductVariant,
      quantity: number,
      giftNote: string | null,
    ) => addCartItem(product, variant, quantity, true, giftNote),
    [addCartItem],
  );

  // =====================================================
  // Search products
  // =====================================================

  const fetchProducts = useCallback(
    async (search: string, categoryId: string) => {
      setIsSearching(true);

      try {
        const params = new URLSearchParams();

        const normalizedSearch = search.trim();

        if (normalizedSearch) {
          params.set("search", normalizedSearch);
        }

        if (categoryId !== "all") {
          params.set("categoryId", categoryId);
        }

        params.set("page", "1");
        params.set("limit", "30");

        const response = await fetch(`/api/products?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const result = (await response.json()) as
          | ProductsApiResponse
          | { message?: string };

        if (!response.ok) {
          throw new Error(
            "message" in result && result.message
              ? result.message
              : "فشل جلب المنتجات",
          );
        }

        setProducts("data" in result ? result.data : []);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "حدث خطأ أثناء جلب المنتجات",
        );
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  // =====================================================
  // Search / barcode
  // =====================================================

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const term = searchQuery.trim();

    if (!term) {
      await fetchProducts("", selectedCategory);
      return;
    }

    setIsSearching(true);

    try {
      const params = new URLSearchParams();

      params.set("search", term);
      params.set("page", "1");
      params.set("limit", "100");

      const response = await fetch(`/api/products?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as
        | ProductsApiResponse
        | { message?: string };

      if (!response.ok) {
        throw new Error(
          "message" in result && result.message
            ? result.message
            : "فشل البحث عن المنتجات",
        );
      }

      const results = "data" in result ? result.data : [];

      const normalized = term.toLowerCase();

      let matchedProduct: Product | undefined;

      let matchedVariant: ProductVariant | undefined;

      for (const product of results) {
        const variant = product.variants.find((item) => {
          if (!item.isActive) {
            return false;
          }

          return (
            item.barcode?.toLowerCase() === normalized ||
            item.packBarcode?.toLowerCase() === normalized ||
            item.sku?.toLowerCase() === normalized
          );
        });

        if (variant) {
          matchedProduct = product;
          matchedVariant = variant;
          break;
        }
      }

      if (matchedProduct && matchedVariant) {
        addProductToCart(matchedProduct, matchedVariant);

        setSearchQuery("");

        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
        });

        return;
      }

      setProducts(results);

      if (results.length === 0) {
        toast.error("لم يتم العثور على منتج مطابق");
      }

      setSearchQuery("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "حدث خطأ أثناء البحث",
      );
    } finally {
      setIsSearching(false);
    }
  };

  // =====================================================
  // Category
  // =====================================================

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);

    await fetchProducts(searchQuery, categoryId);
  };

  // =====================================================
  // Cart quantity
  // =====================================================

  const updateQuantity = useCallback(
    (variantId: string, isGift: boolean, amount: number) => {
      const currentCart = cartRef.current;
      const target = currentCart.find(
        (item) => item.variant.id === variantId && item.isGift === isGift,
      );
      if (!target) return;

      const nextQuantity = Number((target.qty + amount).toFixed(2));
      const nextCart =
        nextQuantity <= 0
          ? currentCart.filter((item) => item !== target)
          : currentCart.map((item) =>
              item === target ? { ...item, qty: nextQuantity } : item,
            );

      if (nextQuantity > 0) {
        const reservedByOtherLines = currentCart.reduce(
          (sum, item) =>
            item.variant.id === variantId && item !== target
              ? sum + item.qty
              : sum,
          0,
        );
        if (
          nextQuantity + reservedByOtherLines >
          Number(target.variant.stockQuantity) + 0.000001
        ) {
          toast.error(
            `المخزون المتاح فقط ${Math.max(0, Number(target.variant.stockQuantity) - reservedByOtherLines)}`,
          );
          return;
        }
      } else if (nextCart.length === 0) {
        resetDiscount();
      }

      replaceCart(nextCart);
    },
    [replaceCart, resetDiscount],
  );

  // =====================================================
  // Exact quantity (important for meter-based products)
  // =====================================================

  const setQuantity = useCallback(
    (variantId: string, isGift: boolean, quantity: number) => {
      if (!Number.isFinite(quantity)) {
        toast.error("الكمية غير صالحة");
        return;
      }

      if (quantity <= 0) {
        toast.error("الكمية يجب أن تكون أكبر من صفر");
        return;
      }

      const normalized = Number(quantity.toFixed(2));

      if (Math.abs(quantity - normalized) > 0.000001) {
        toast.error("الكمية يجب ألا تتجاوز منزلتين عشريتين");
        return;
      }

      const currentCart = cartRef.current;
      const target = currentCart.find(
        (item) => item.variant.id === variantId && item.isGift === isGift,
      );
      if (!target) return;

      const reservedByOtherLines = currentCart.reduce(
        (sum, item) =>
          item.variant.id === variantId && item !== target
            ? sum + item.qty
            : sum,
        0,
      );
      const available =
        Number(target.variant.stockQuantity) - reservedByOtherLines;

      if (normalized > available + 0.000001) {
        toast.error(`المخزون المتاح فقط ${Math.max(0, available)}`);
        return;
      }

      replaceCart(
        currentCart.map((item) =>
          item === target ? { ...item, qty: normalized } : item,
        ),
      );
    },
    [replaceCart],
  );

  // =====================================================
  // Remove
  // =====================================================

  const removeItem = useCallback(
    (variantId: string, isGift: boolean) => {
      const currentCart = cartRef.current;
      const nextCart = currentCart.filter(
        (item) => !(item.variant.id === variantId && item.isGift === isGift),
      );
      if (nextCart.length === 0) {
        resetDiscount();
      }
      replaceCart(nextCart);
    },
    [replaceCart, resetDiscount],
  );

  const handleDiscountInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const rawValue = event.currentTarget.value;
    setDiscountInput(rawValue);

    if (rawValue.trim() === "") {
      setDiscountError("");
      setDiscountAmount(0);
      return;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      setDiscountError("قيمة الخصم غير صحيحة.");
      setDiscountAmount(0);
      return;
    }

    const normalized = Number(value.toFixed(2));
    setDiscountError(
      normalized > maxDiscount + 0.001
        ? `الحد الأقصى للخصم هو 50% من الإجمالي قبل الخصم (${maxDiscount.toFixed(2)} ر.س). لن يتم السماح بإتمام البيع.`
        : "",
    );
    setDiscountAmount(normalized);
  };

  const clearCart = () => {
    replaceCart([]);
    resetDiscount();
    setPaymentSplits([]);
    setPaymentMethod("CASH");
  };

  // =====================================================
  // Totals
  // =====================================================

  const subtotal = useMemo(
    () =>
      roundMoney(
        cart.reduce(
            (sum, item) =>
              sum +
              (item.isGift ? 0 : Number(item.variant.sellingPrice) * item.qty),
            0,
          ),
      ),
    [cart],
  );

  const taxAmount = 0;

  const maxDiscount = Math.floor(subtotal * 0.5 * 100 + 1e-9) / 100;

  const discountOverLimit = discountAmount > maxDiscount + 0.001;

  const totalAmount = roundMoney(subtotal - discountAmount + taxAmount);

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  const mixedPaymentAmount = roundMoney(
    paymentSplits.reduce((sum, split) => sum + Number(split.amount), 0),
  );

  const mixedMethods = new Set(paymentSplits.map((split) => split.method));

  const mixedPaymentValid =
    paymentMethod !== "MIXED" ||
    (paymentSplits.length >= 2 &&
      paymentSplits.length <= 3 &&
      mixedMethods.size === paymentSplits.length &&
      paymentSplits.every(
        (split) => Number.isFinite(split.amount) && split.amount > 0,
      ) &&
      Math.abs(mixedPaymentAmount - totalAmount) < 0.01);

  // =====================================================
  // Payment method
  // =====================================================

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method);

    if (method !== "MIXED") {
      setPaymentSplits([]);
      return;
    }

    const firstAmount = roundMoney(totalAmount / 2);

    setPaymentSplits([
      {
        method: "CASH",
        amount: firstAmount,
        reference: null,
        notes: null,
      },
      {
        method: "CARD",
        amount: roundMoney(totalAmount - firstAmount),
        reference: null,
        notes: null,
      },
    ]);
  };

  const handlePaymentSplitsChange = (splits: PaymentSplit[]) => {
    setPaymentSplits(splits);
  };

  // =====================================================
  // Checkout
  // =====================================================

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("السلة فارغة");
      return;
    }

    if (discountOverLimit) {
      toast.error(
        `الخصم يتجاوز 50% من الإجمالي قبل الخصم. الحد الأقصى ${maxDiscount.toFixed(2)} ر.س`,
      );
      return;
    }

    if (totalAmount <= 0) {
      toast.error("إجمالي الفاتورة غير صالح");
      return;
    }

    if (!mixedPaymentValid) {
      toast.error(
        "مبالغ الدفع المختلط يجب أن تساوي إجمالي الفاتورة وأن تكون الطرق مختلفة.",
      );
      return;
    }

    setIsCheckingOut(true);

    try {
      const payload = {
        orderType: "POS" as const,

        customerId: null,

        tailorId: null,

        subtotal,

        discountAmount,

        taxAmount,

        totalAmount,

        paymentMethod,

        paymentSplits: paymentMethod === "MIXED" ? paymentSplits : [],

        notes: null,

        items: cart.map((item) => ({
          templateId: item.product.id,

          variantId: item.variant.id,

          quantity: item.qty,

          unitPrice: item.isGift ? 0 : Number(item.variant.sellingPrice),

          unitCost: Number(item.variant.purchasePrice),

          totalPrice: item.isGift
            ? 0
            : roundMoney(Number(item.variant.sellingPrice) * item.qty),
          isGift: item.isGift,
          giftNote: item.giftNote,
        })),
      };

      const result = await createSalesOrder(payload);

      toast.success(`تمت المبيعة بنجاح - ${result.orderNumber}`);

      const receiptUrl = `/dashboard/pos/receipt/${result.orderId}`;

      window.open(receiptUrl, "_blank", "width=420,height=700");

      replaceCart([]);
      resetDiscount();
      setSearchQuery("");
      setPaymentMethod("CASH");
      setPaymentSplits([]);

      await fetchProducts("", selectedCategory);

      if (window.innerWidth < 1024) {
        setIsCartOpen(false);
      }

      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر إتمام عملية البيع",
      );
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div
      className="max-w-[1600px] my-5 mx-auto flex flex-col lg:flex-row gap-6 p-4 overflow-hidden"
      dir="rtl"
    >
      <div className="flex-1 flex flex-col min-h-0 pl-2 space-y-4">
        <form onSubmit={handleSearchSubmit} className="w-full">
          <div className="relative rounded-2xl bg-white border border-gray-200 overflow-hidden">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="امسح الباركود أو اكتب اسم المنتج..."
              autoComplete="off"
              className="w-full px-5 py-3.5 pl-24 text-sm text-gray-900 focus:outline-none font-medium bg-gray-50/50 focus:bg-white transition"
            />

            <button
              type="submit"
              disabled={isSearching}
              className="absolute left-4 top-2.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
            >
              {isSearching ? "..." : "بحث"}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => setIsCartOpen((current) => !current)}
          className="lg:hidden flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3.5 py-3 text-xs font-bold text-white shadow-sm"
        >
          <LuShoppingCart className="h-4 w-4" />
          <span>{isCartOpen ? "إخفاء السلة" : `السلة (${totalItems})`}</span>
        </button>

        <div className="bg-white p-4 rounded-2xl border border-gray-200">
          <h2 className="text-xs font-bold text-gray-400 mb-2.5">
            الفلترة حسب النوع:
          </h2>

          <div className="flex items-center gap-2 overflow-x-auto scroll-smooth pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200">
            <button
              type="button"
              onClick={() => handleCategoryChange("all")}
              className={`flex min-w-max items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
                selectedCategory === "all"
                  ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <LuList className="text-sm" />
              كل المعروض
            </button>

            {categories?.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                className={`flex min-w-max items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
                  selectedCategory === category.id
                    ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {category.imageUrl && (
                  <Image
                    src={category.imageUrl}
                    alt={category.name}
                    width={20}
                    height={20}
                  />
                )}
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-4 pb-6">
          {products.map((product) => (
            <Card key={product.id} product={product} onAdd={addProductToCart} />
          ))}

          {products.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-gray-400 border border-dashed rounded-2xl bg-gray-50">
              لم يتم العثور على أي منتج مطابق.
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-100 min-h-0 flex flex-col shrink-0">
        <div
          className={`
            fixed inset-y-0 right-0
            w-[88%] max-w-sm
            bg-white shadow-2xl
            transition-transform duration-200 ease-out
            ${isCartOpen ? "translate-x-0" : "translate-x-full"}
            lg:static
            lg:w-full
            lg:max-w-none
            lg:shadow-none
            lg:translate-x-0
          `}
        >
          <CartList
            cart={cart}
            giftProducts={products}
            paymentMethod={paymentMethod}
            paymentSplits={paymentSplits}
            subtotal={subtotal}
            discountAmount={discountAmount}
            taxAmount={taxAmount}
            totalAmount={totalAmount}
            totalItems={totalItems}
            maxDiscount={maxDiscount}
            isDiscountOverLimit={discountOverLimit}
            mixedPaymentValid={mixedPaymentValid}
            mixedPaymentAmount={mixedPaymentAmount}
            isCheckingOut={isCheckingOut}
            discountInput={discountInput}
            discountError={discountError}
            onPaymentMethodChange={handlePaymentMethodChange}
            onPaymentSplitsChange={handlePaymentSplitsChange}
            onUpdateQty={updateQuantity}
            onSetQty={setQuantity}
            onRemove={removeItem}
            onClear={() => {
              clearCart();
            }}
            onCheckout={handleCheckout}
            onClose={() => setIsCartOpen(false)}
            onDiscountInputChange={handleDiscountInputChange}
            onAddGift={addGiftToCart}
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
