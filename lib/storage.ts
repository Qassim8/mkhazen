import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabase";

const BUCKET_NAME = "store-assets";

export async function uploadImage(
  file: File,
  folder: "products" | "categories" = "products",
): Promise<string> {
  if (!file) {
    throw new Error("الملف المحدد غير صالِح لعملية الرفع.");
  }

  // 1️⃣ استخراج الامتداد الأصلي وتوليد اسم آمن تماماً (بدون مسافات أو أقواس)
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${extension}`;
  const filePath = `${folder}/${safeFileName}`;

  let fileBody: File | Blob = file;

  // 2️⃣ محاولة الضغط
  try {
    const options = {
      maxSizeMB: 0.4,
      maxWidthOrHeight: 1200,
      useWebWorker: false,
    };
    // imageCompression تُرجع Blob وهذا كافٍ جداً للرفع
    fileBody = await imageCompression(file, options);
  } catch (compressError) {
    console.warn("فشل الضغط، سيتم رفع الملف الأصلي:", compressError);
    fileBody = file; // التراجع واستخدام الملف الأصلي
  }

  // 3️⃣ الرفع إلى Supabase باستخدام الاسم الآمن
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileBody, {
      contentType: fileBody.type || file.type,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`فشل رفع الصورة: ${uploadError.message}`);
  }

  // 4️⃣ استخراج الرابط العام
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error("تعذر الحصول على رابط الصورة العام بعد الرفع.");
  }

  return data.publicUrl;
}
