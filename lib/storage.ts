import imageCompression from "browser-image-compression";

export async function uploadImage(
  file: File,
  folder: "products" | "categories" = "products",
): Promise<string> {
  if (!file) {
    throw new Error("الملف المحدد غير صالح لعملية الرفع.");
  }

  let fileBody: File | Blob = file;

  try {
    fileBody = await imageCompression(file, {
      maxSizeMB: 0.4,
      maxWidthOrHeight: 1200,
      useWebWorker: false,
    });
  } catch (error) {
    console.warn("فشل الضغط، سيتم رفع الملف الأصلي:", error);
  }

  const formData = new FormData();

  formData.append("file", fileBody, file.name);
  formData.append("folder", folder);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "فشل رفع الصورة");
  }

  return data.url;
}
