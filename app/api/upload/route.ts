import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const BUCKET_NAME = "store-assets";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const folder = formData.get("folder");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "الملف غير صالح" }, { status: 400 });
    }

    const validFolders = ["products", "categories"];

    if (typeof folder !== "string" || !validFolders.includes(folder)) {
      return NextResponse.json({ message: "المجلد غير صالح" }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";

    const safeFileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)}.${extension}`;

    const filePath = `${folder}/${safeFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type || "image/png",
        upsert: true,
      });

    if (error) {
      return NextResponse.json(
        { message: `فشل رفع الصورة: ${error.message}` },
        { status: 500 },
      );
    }

    const { data } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return NextResponse.json({
      url: data.publicUrl,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "حدث خطأ أثناء رفع الصورة" },
      { status: 500 },
    );
  }
}
