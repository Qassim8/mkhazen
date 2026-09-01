import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidateTag, revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { updateProductSchema } from "@/app/dashboard/products/schemas/product.schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 1. جلب تفاصيل منتج معين بواسطة الـ ID
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("product_templates")
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name),
        variants:product_variants(*)
      `,
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "المنتج غير موجود" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب تفاصيل المنتج", error: err.message },
      { status: 500 },
    );
  }
}

// 2. تحديث المنتج ومتغيراته
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بإجراء التعديل." },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    // تنظيف القيم النصية الفارغة
    if (body) {
      Object.keys(body).forEach((key) => {
        if (body[key] === "") body[key] = null;
      });
      if (Array.isArray(body.variants)) {
        body.variants = body.variants.map((v: any) => {
          Object.keys(v).forEach((k) => {
            if (v[k] === "") v[k] = null;
          });
          return v;
        });
      }
    }

    const validation = updateProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صحيحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { variants, ...templateData } = validation.data;

    // 1. تحديث بيانات النموذج الأساسي (Product Template)
    const { data: updatedTemplate, error: templateError } = await supabaseAdmin
      .from("product_templates")
      .update(templateData)
      .eq("id", id)
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
      )
      .single();

    if (templateError) {
      return NextResponse.json(
        { message: `فشل تعديل المنتج الأساسي: ${templateError.message}` },
        { status: 400 },
      );
    }

    // 2. تحديث المتغيرات (إن وُجدت في الـ Payload)
    if (variants && Array.isArray(variants)) {
      const { data: existingVariants } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("templateId", id);

      const existingIds = existingVariants?.map((v) => v.id) || [];
      const incomingIds = variants.map((v) => v.id).filter(Boolean) as string[];

      // حذف المتغيرات المزالة من الواجهة
      const idsToDelete = existingIds.filter(
        (existingId) => !incomingIds.includes(existingId),
      );

      if (idsToDelete.length > 0) {
        await supabaseAdmin
          .from("product_variants")
          .delete()
          .in("id", idsToDelete);
      }

      // تجهيز بيانات Upsert للمتغيرات
      const isSingleProduct = !updatedTemplate.hasVariants;
      const variantsToUpsert = variants.map((variant, idx) => ({
        ...(variant.id ? { id: variant.id } : {}),
        templateId: id,
        sku: variant.sku || `SKU-${Date.now().toString().slice(-6)}-${idx + 1}`,
        barcode:
          variant.barcode ||
          Math.floor(100000000000 + Math.random() * 900000000000).toString(),
        packBarcode: variant.packBarcode || null,
        colorName: variant.colorName || null,
        colorCode: variant.colorCode || null,
        size: variant.size || null,
        length: variant.length ?? null,
        width: variant.width ?? null,
        purchasePrice: variant.purchasePrice,
        sellingPrice: variant.sellingPrice,
        minSellingPrice: variant.minSellingPrice ?? null,
        stockQuantity: variant.stockQuantity,
        minStockLevel: variant.minStockLevel,
        images: variant.images || [],
        isDefault: isSingleProduct ? true : (variant.isDefault ?? idx === 0),
        isActive: variant.isActive ?? true,
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("product_variants")
        .upsert(variantsToUpsert);

      if (upsertError) {
        return NextResponse.json(
          { message: `فشل تحديث متغيرات المنتج: ${upsertError.message}` },
          { status: 400 },
        );
      }
    }

    // جلب المنتج المحدث كاملاً مع متغيراته
    const { data: finalProduct } = await supabaseAdmin
      .from("product_templates")
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name),
        variants:product_variants(*)
      `,
      )
      .eq("id", id)
      .single();

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم تحديث بيانات المنتج بنجاح", data: finalProduct },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء تعديل المنتج", error: err.message },
      { status: 500 },
    );
  }
}

// 3. حذف المنتج الرئيسي ومتغيراته التابعة تلقائياً
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بحذف هذا المنتج." },
        { status: 401 },
      );
    }

    const { id } = await params;

    const { error } = await supabaseAdmin
      .from("product_templates")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { message: `تعذر حذف المنتج: ${error.message}` },
        { status: 400 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم حذف المنتج ومتغيراته بنجاح" },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء حذف المنتج", error: err.message },
      { status: 500 },
    );
  }
}
