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
import {
  LuChevronLeft,
  LuChevronRight,
  LuList,
  LuShoppingCart,
} from "react-icons/lu";
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
import { ApiError } from "@/lib/api-client";
import {
  type CheckoutKey,
  checkoutFingerprint,
  clearPosDraft,
  loadPosDraft,
  newIdempotencyKey,
  savePosDraft,
} from "./pos-draft";
import { getProducts } from "@/app/dashboard/products/services/products.services";
import { usdToSdg } from "@/lib/currency";
import { useExchangeRate } from "@/components/shared/useExchangeRate";

interface POSClientProps {
  initialProducts: Product[];
  initialPagination: ProductsPagination;
  initialHasNextPage: boolean;
  categories: Category[];
}

export interface POSCartItem {
  product: Product;
  variant: ProductVariant;
  qty: number;
  isGift: boolean;
  giftNote: string | null;
}

interface ProductsPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export default function POSClient({
  initialProducts,
  initialPagination,
  initialHasNextPage,
  categories,
}: POSClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [pagination, setPagination] =
    useState<ProductsPagination>(initialPagination);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [activeSearch, setActiveSearch] = useState("");

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

  // أسعار المنتجات مخزّنة بالدولار، والزبون بيدفع بالجنيه بسعر الصرف الحالي
  const { rate: exchangeRate, refresh: refreshExchangeRate } =
    useExchangeRate();

  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // منع النقر المزدوج (أسرع من تحديث الـ state) + مفتاح منع التكرار للسلة الحالية
  const checkingOutRef = useRef(false);
  const checkoutKeyRef = useRef<CheckoutKey | null>(null);
  const [draftReady, setDraftReady] = useState(false);

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
  // Cart draft (يرجع بعد انتهاء الجلسة وتسجيل الدخول في نفس النافذة)
  // =====================================================

  useEffect(() => {
    // الاستعادة بعد أول رسم (مش في الـ render) عشان السيرفر بيرسم سلة فاضية
    // ولازم الـ hydration يطابق؛ وبعد كده نحدّث الحالة مرة واحدة.
    const timer = window.setTimeout(() => {
      const draft = loadPosDraft();

      if (draft && draft.cart.length > 0) {
        cartRef.current = draft.cart;
        setCart(draft.cart);
        setDiscountAmount(draft.discountAmount);
        setDiscountInput(draft.discountInput);
        setPaymentMethod(
          draft.paymentMethod === "CARD" ? "BANK_TRANSFER" : draft.paymentMethod,
        );
        const restoredSplitMethods = new Set(
          draft.paymentSplits
            .filter((split) => split.method !== "CARD")
            .map((split) => split.method),
        );
        setPaymentSplits(
          draft.paymentSplits.map((split) => {
            let method = split.method;
            if (method === "CARD") {
              method = restoredSplitMethods.has("BANK_TRANSFER")
                ? "CASH"
                : "BANK_TRANSFER";
            }
            restoredSplitMethods.add(method);
            return { ...split, method };
          }),
        );
        checkoutKeyRef.current = draft.checkoutKey;

        toast(
          draft.checkoutKey?.uncertain
            ? "تمت استعادة السلة. آخر محاولة بيع لم تُؤكَّد — راجع آخر المبيعات قبل الإتمام."
            : "تمت استعادة السلة المحفوظة. راجعها قبل إتمام البيع.",
          { duration: 6000 },
        );
      }

      setDraftReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    savePosDraft({
      cart,
      discountAmount,
      discountInput,
      paymentMethod,
      paymentSplits,
      checkoutKey: checkoutKeyRef.current,
    });
  }, [draftReady, cart, discountAmount, discountInput, paymentMethod, paymentSplits]);

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
        (sum, item) => (item.variant.id === variant.id ? sum + item.qty : sum),
        0,
      );

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        alreadyReserved + quantity > stockQuantity + 0.000001
      ) {
        toast.error(
          `المخزون المتاح فقط ${Math.max(0, stockQuantity - alreadyReserved)}`,
        );
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
                  giftNote: isGift ? (giftNote ?? item.giftNote) : null,
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
    async (search: string, categoryId: string, page: number) => {
      setIsSearching(true);

      try {
        const normalizedSearch = search.trim();
        const result = await getProducts({
          search: normalizedSearch || undefined,
          categoryId: categoryId !== "all" ? categoryId : undefined,
          page,
          limit: 18,
          sortBy: "createdAt-desc",
        });
        const nextPageResult =
          result.meta.totalPages > page
            ? await getProducts({
                search: normalizedSearch || undefined,
                categoryId: categoryId !== "all" ? categoryId : undefined,
                page: page + 1,
                limit: 18,
                sortBy: "createdAt-desc",
              })
            : null;
        setProducts(result.data);
        setPagination(result.meta);
        setHasNextPage((nextPageResult?.data.length ?? 0) > 0);
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
      setActiveSearch("");
      await fetchProducts("", selectedCategory, 1);
      return;
    }

    setIsSearching(true);

    try {
      const result = await getProducts({ search: term, page: 1, limit: 100 });
      const results = result.data;

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

      if (results.length === 0) {
        toast.error("لم يتم العثور على منتج مطابق");
      }

      setActiveSearch(term);
      await fetchProducts(term, selectedCategory, 1);
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
    const search = searchQuery.trim();
    setActiveSearch(search);
    await fetchProducts(search, categoryId, 1);
  };

  const handleClearSearchAndFilters = async () => {
    setSearchQuery("");
    setActiveSearch("");
    setSelectedCategory("all");
    await fetchProducts("", "all", 1);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleProductPageChange = async (page: number) => {
    if (page < 1 || page > pagination.totalPages || page === pagination.page) {
      return;
    }

    await fetchProducts(activeSearch, selectedCategory, page);
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
        ? `الحد الأقصى للخصم هو 50% من الإجمالي قبل الخصم (${maxDiscount.toFixed(2)} ج.س). لن يتم السماح بإتمام البيع.`
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

  // سطر الفاتورة بالجنيه = (سعر الوحدة بالدولار × سعر الصرف، مقرّب) × الكمية
  // نفس معادلة دالة complete_sales_checkout بالظبط
  const getLineTotalSdg = useCallback(
    (item: POSCartItem) =>
      item.isGift
        ? 0
        : roundMoney(
            usdToSdg(item.variant.sellingPrice, exchangeRate) * item.qty,
          ),
    [exchangeRate],
  );

  const subtotal = useMemo(
    () =>
      roundMoney(cart.reduce((sum, item) => sum + getLineTotalSdg(item), 0)),
    [cart, getLineTotalSdg],
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
        method: "BANK_TRANSFER",
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
    if (checkingOutRef.current) return;

    if (cart.length === 0) {
      toast.error("السلة فارغة");
      return;
    }

    if (!exchangeRate) {
      toast.error("لا يوجد سعر صرف مسجّل. اطلب من المدير تسجيله من الإعدادات");
      return;
    }

    if (discountOverLimit) {
      toast.error(
        `الخصم يتجاوز 50% من الإجمالي قبل الخصم. الحد الأقصى ${maxDiscount.toFixed(2)} ج.س`,
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

    checkingOutRef.current = true;
    setIsCheckingOut(true);

    // نفس السلة = نفس المفتاح؛ أي تعديل في السلة/الخصم/الدفع = عملية جديدة
    const fingerprint = checkoutFingerprint({
      cart,
      discountAmount,
      paymentMethod,
      paymentSplits: paymentMethod === "MIXED" ? paymentSplits : [],
      exchangeRate,
    });

    if (checkoutKeyRef.current?.fingerprint !== fingerprint) {
      checkoutKeyRef.current = { fingerprint, key: newIdempotencyKey(), uncertain: false };
    }

    const idempotencyKey = checkoutKeyRef.current.key;

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

        exchangeRate,

        items: cart.map((item) => ({
          templateId: item.product.id,

          variantId: item.variant.id,

          quantity: item.qty,

          unitPrice: item.isGift
            ? 0
            : usdToSdg(item.variant.sellingPrice, exchangeRate),

          unitCost: Number(item.variant.purchasePrice),

          totalPrice: getLineTotalSdg(item),
          isGift: item.isGift,
          giftNote: item.giftNote,
        })),
      };

      const result = await createSalesOrder(payload, { idempotencyKey });

      checkoutKeyRef.current = null;
      clearPosDraft();

      toast.success(
        result.replayed
          ? `تم تأكيد عملية البيع السابقة (لم تتكرر) - ${result.orderNumber}`
          : `تمت المبيعة بنجاح - ${result.orderNumber}`,
      );

      const receiptUrl = `/dashboard/pos/receipt/${result.orderId}`;

      window.open(receiptUrl, "_blank", "width=420,height=700");

      replaceCart([]);
      resetDiscount();
      setSearchQuery("");
      setActiveSearch("");
      setPaymentMethod("CASH");
      setPaymentSplits([]);

      await fetchProducts("", selectedCategory, 1);

      if (window.innerWidth < 1024) {
        setIsCartOpen(false);
      }

      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر إتمام عملية البيع";

      // نتيجة غير معروفة (انقطاع الشبكة/الخادم بعد الإرسال): السلة والمفتاح بيفضلوا
      // زي ما هما → إعادة المحاولة بنفس السلة ما تعملش بيع مكرر
      const uncertain =
        error instanceof ApiError &&
        (error.status === 0 ||
          error.status >= 500 ||
          error.code === "IDEMPOTENCY_IN_PROGRESS");

      if (uncertain && checkoutKeyRef.current) {
        checkoutKeyRef.current = { ...checkoutKeyRef.current, uncertain: true };
        savePosDraft({
          cart,
          discountAmount,
          discountInput,
          paymentMethod,
          paymentSplits,
          checkoutKey: checkoutKeyRef.current,
        });
        toast.error(
        `${message}
لم يتم تأكيد البيع. راجع آخر المبيعات؛ إعادة المحاولة بنفس السلة لن تكرر البيع.`,
          { duration: 10000 },
        );
      } else if (!(error instanceof ApiError && error.isAuthError)) {
        toast.error(message);
      }

      // الأسعار اتغيرت في قاعدة البيانات → نحدّث أسعار السلة من رد السيرفر
      const currentPrices =
        error instanceof ApiError &&
        error.details &&
        typeof error.details === "object" &&
        "currentPrices" in error.details
          ? ((error.details as { currentPrices?: Record<string, number> }).currentPrices ?? null)
          : null;

      if (currentPrices) {
        replaceCart(
          cartRef.current.map((item) =>
            currentPrices[item.variant.id] !== undefined
              ? { ...item, variant: { ...item.variant, sellingPrice: Number(currentPrices[item.variant.id]) } }
              : item,
          ),
        );
        toast("تم تحديث أسعار السلة بالأسعار الحالية. راجع الإجمالي قبل الإتمام.", { duration: 6000 });
      }

      // المدير غيّر سعر الصرف أثناء البيع → نحدّث الأسعار المعروضة فورًا
      if (message.includes("سعر الصرف") || message.includes("تغيّرت أسعار")) {
        await refreshExchangeRate();
      }
    } finally {
      checkingOutRef.current = false;
      setIsCheckingOut(false);
    }
  };

  return (
    <div
      className="max-w-[1600px] my-5 mx-auto flex flex-col lg:flex-row gap-6 p-4 overflow-hidden"
      dir="rtl"
    >
      <div className="flex-1 flex flex-col min-h-0 pl-2 space-y-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex w-full flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white">
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
          <button
            type="button"
            onClick={() => void handleClearSearchAndFilters()}
            disabled={isSearching}
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            مسح البحث والفلاتر
          </button>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-4">
          {products.map((product) => (
            <Card
              key={product.id}
              product={product}
              onAdd={addProductToCart}
              exchangeRate={exchangeRate}
            />
          ))}

          {products.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-gray-400 border border-dashed rounded-2xl bg-gray-50">
              لم يتم العثور على أي منتج مطابق.
            </div>
          )}
        </div>

        {products.length > 0 && (pagination.page > 1 || hasNextPage) && (
          <nav
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2"
            aria-label="صفحات المنتجات"
          >
            <button
              type="button"
              onClick={() => void handleProductPageChange(pagination.page - 1)}
              disabled={isSearching || pagination.page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuChevronRight className="h-4 w-4" />
              السابق
            </button>
            <span className="text-xs font-medium text-gray-500">
              صفحة {pagination.page} من {pagination.totalPages}
              <span className="mx-1.5 text-gray-300">|</span>
              {pagination.total.toLocaleString("en-US")} منتج
            </span>
            <button
              type="button"
              onClick={() => void handleProductPageChange(pagination.page + 1)}
              disabled={isSearching || !hasNextPage}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              التالي
              <LuChevronLeft className="h-4 w-4" />
            </button>
          </nav>
        )}
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
            exchangeRate={exchangeRate}
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
