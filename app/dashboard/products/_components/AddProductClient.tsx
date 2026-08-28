"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ProductFormInputType,
  ProductFormOutputType,
  productSchema,
} from "../schemas/product.schemas";
import { useRouter } from "next/navigation";
import { LuSave, LuLoader } from "react-icons/lu";
import { createProduct } from "../services/products.services";
import { uploadImage } from "@/lib/storage";
import { toast } from "react-hot-toast";
import { useModalStore } from "@/store/useModalStore";

// Components
import Images from "./Images";
import BasicInfoForm from "./BasicInfoForm";
import PricingAndStockForm from "./PricingAndStockForm";
import ProductVisibility from "./ProductVisibility";
// import CreateSupplierForm from "./CreateSupplierForm";
import UnitConversionSection from "./UnitConversionSection";
import ProductSizes from "./ProductSizes";

interface Category {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface AddProductFormProps {
  initialCategories: Category[];
  initialSuppliers: Supplier[];
}

export default function AddProductClient({
  initialCategories,
  initialSuppliers,
}: AddProductFormProps) {
  const router = useRouter();
  const { openModal, closeModal } = useModalStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [categories] = useState<Category[]>(initialCategories);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormInputType>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      packBarcode: "",
      description: "",
      categoryId: "",
      supplierId: "",
      purchasePrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      minStockLevel: 5,
      purchaseUnit: "قطعة",
      sellingUnit: "قطعة",
      sizes: [],
      images: [],
      isActive: true,
    },
  });

  // Watchers
  const selectedCategoryId = watch("categoryId") ?? "";
  const selectedSellingUnit = watch("sellingUnit") ?? "قطعة";
  const selectedPurchaseUnit = watch("purchaseUnit") ?? "قطعة";
  const selectedSizes = watch("sizes") ?? [];
  const currentImages = watch("images") ?? [];

  const selectedCategoryObj = categories.find(
    (c) => c.id === selectedCategoryId,
  );
  const selectedCategoryName = selectedCategoryObj?.name || "";

  useEffect(() => {
    setValue("sizes", []);
  }, [selectedCategoryId, setValue]);

  const toggleSize = (size: string) => {
    const exists = selectedSizes.includes(size);
    const updated = exists
      ? selectedSizes.filter((s) => s !== size)
      : [...selectedSizes, size];
    setValue("sizes", updated, { shouldValidate: true });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(
        Array.from(filesList).map((file) => uploadImage(file, "products")),
      );

      setValue("images", [...currentImages, ...uploadedUrls].slice(0, 5), {
        shouldValidate: true,
      });

      toast.success("تم رفع الصور بنجاح!");
    } catch (error: any) {
      toast.error(error?.message || serverError || "حدث خطأ أثناء رفع الصور");
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    setValue(
      "images",
      currentImages.filter((_, i) => i !== index),
      { shouldValidate: true },
    );
  };

  //   const handleAddSupplierModal = () => {
  //     openModal("CREATE", {
  //       title: "إنشاء مورد جديد",
  //       content: (
  //         <CreateSupplierForm
  //           onSuccess={(newSupplier) => {
  //             setSuppliers((prev) => [...prev, newSupplier]);
  //             setValue("supplierId", newSupplier.id, { shouldValidate: true });
  //             closeModal();
  //             toast.success("تم إضافة المورد وتحديده بنجاح");
  //           }}
  //         />
  //       ),
  //     });
  //   };

  const onSubmit = async (data: ProductFormInputType) => {
    try {
      setIsSubmitting(true);
      setServerError(null);

      await createProduct(data as ProductFormOutputType);
      toast.success("تم إضافة المنتج بنجاح");
      router.push("/dashboard/products");
    } catch (err: any) {
      setServerError(err.message || "حدث خطأ أثناء حفظ المنتج");
      toast.error(err.message || "حدث خطأ أثناء حفظ المنتج");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid gap-5 lg:grid-cols-2"
    >
      {/* العمود الأول */}
      <div className="space-y-6">
        <Images
          images={currentImages}
          onImageChange={handleImageChange}
          onRemoveImage={removeImage}
        />

        <BasicInfoForm
          register={register}
          errors={errors}
          categories={categories}
          suppliers={suppliers}
          loadingOptions={false} // لم نعد بحاجة
        />
      </div>

      {/* العمود الثاني */}
      <div className="space-y-6">
        <UnitConversionSection
          register={register}
          watch={watch}
          setValue={setValue}
        />
        <PricingAndStockForm
          register={register}
          selectedSellingUnit={selectedSellingUnit}
          selectedPurchaseUnit={selectedPurchaseUnit}
        />

        <ProductSizes
          categoryName={selectedCategoryName}
          selectedSizes={selectedSizes}
          onToggleSize={toggleSize}
        />

        <ProductVisibility register={register} />

        <button
          type="submit"
          disabled={isSubmitting || uploadingImages}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) py-3.5 text-sm font-bold text-white hover:bg-(--primary-red-hover) active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting || uploadingImages ? (
            <LuLoader className="h-5 w-5 animate-spin" />
          ) : (
            <LuSave className="h-5 w-5" />
          )}
          {uploadingImages ? "جاري رفع الصور..." : "حفظ المنتج"}
        </button>
      </div>
    </form>
  );
}
