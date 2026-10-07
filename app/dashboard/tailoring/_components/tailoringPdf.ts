import type { TailoringOrder } from "../schemas/tailoring.schemas";

const PAGE_WIDTH = 1654;
const PAGE_HEIGHT = 2339;
const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;
const MARGIN = 90;

function money(value: number) {
  return `${value.toFixed(2)} ر.س`;
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function statusLabel(status: TailoringOrder["tailoringStatus"]) {
  const labels: Record<TailoringOrder["tailoringStatus"], string> = {
    NEW: "طلب جديد",
    UNDER_TAILORING: "تحت التفصيل",
    READY_FOR_PICKUP: "جاهز للتسليم",
    RECEIVED: "تم الاستلام",
    CANCELLED: "ملغي",
    CONVERTED_TO_PRODUCT: "تم التحويل إلى منتج",
  };

  return labels[status];
}

function customerMessage(order: TailoringOrder) {
  if (order.tailoringStatus === "READY_FOR_PICKUP") {
    return `مرحبًا ${order.customer?.name ?? ""}، طلبكم رقم ${order.orderNumber} أصبح جاهزًا للتسليم. مرفق تفاصيل الطلب بصيغة PDF. المبلغ المتبقي عند الاستلام: ${money(order.remainingAmount)}.`;
  }

  return `مرحبًا ${order.customer?.name ?? ""}، مرفق تفاصيل طلب التفصيل رقم ${order.orderNumber} (${order.tailoringItemName}) بصيغة PDF. إجمالي الطلب: ${money(order.totalAmount)}.`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 18,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawHeader(ctx: CanvasRenderingContext2D, order: TailoringOrder) {
  ctx.fillStyle = "#111827";
  ctx.textAlign = "right";
  ctx.direction = "rtl";
  ctx.font = "900 56px Arial, sans-serif";
  ctx.fillText("طلب تفصيل الملابس", PAGE_WIDTH - MARGIN, 115);

  ctx.fillStyle = "#6b7280";
  ctx.font = "700 30px Arial, sans-serif";
  ctx.fillText(order.orderNumber, PAGE_WIDTH - MARGIN, 165);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 205);
  ctx.lineTo(PAGE_WIDTH - MARGIN, 205);
  ctx.stroke();
}

function drawSectionTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  y: number,
) {
  ctx.fillStyle = "#111827";
  ctx.textAlign = "right";
  ctx.font = "900 34px Arial, sans-serif";
  ctx.fillText(title, PAGE_WIDTH - MARGIN, y);
  return y + 55;
}

function drawKeyValue(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  y: number,
) {
  const right = PAGE_WIDTH - MARGIN;
  const left = MARGIN;

  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "right";
  ctx.font = "700 27px Arial, sans-serif";
  ctx.fillText(label, right, y);

  ctx.fillStyle = "#111827";
  ctx.font = "800 29px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(value, left, y);

  ctx.strokeStyle = "#f3f4f6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y + 24);
  ctx.lineTo(right, y + 24);
  ctx.stroke();

  return y + 58;
}

function createPage(order: TailoringOrder, pageNumber: number) {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر إنشاء PDF للطلب.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.direction = "rtl";

  drawHeader(ctx, order);

  let y = 280;

  y = drawSectionTitle(ctx, "بيانات العمل", y);
  y = drawKeyValue(ctx, "العمل / القطعة", order.tailoringItemName, y);
  if (order.tailoringItemDescription) {
    y = drawKeyValue(ctx, "الوصف", order.tailoringItemDescription, y);
  }

  y += 12;
  y = drawSectionTitle(ctx, "بيانات العميل", y);
  y = drawKeyValue(ctx, "العميل", order.customer?.name ?? "-", y);
  y = drawKeyValue(
    ctx,
    "واتساب",
    order.customer?.whatsappNumber ?? "-",
    y,
  );

  y += 24;
  y = drawSectionTitle(ctx, "مواعيد الطلب", y);
  y = drawKeyValue(ctx, "تاريخ الاستلام", formatDate(order.intakeDate), y);
  y = drawKeyValue(
    ctx,
    "التسليم المتوقع",
    formatDate(order.expectedDeliveryDate),
    y,
  );
  y = drawKeyValue(ctx, "الحالة", statusLabel(order.tailoringStatus), y);

  y += 24;
  y = drawSectionTitle(ctx, "المقاسات", y);

  const tableTop = y;
  const rowHeight = 64;
  const colRight = PAGE_WIDTH - MARGIN;
  const colMiddle = PAGE_WIDTH - 730;
  const colLeft = MARGIN;

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(MARGIN, tableTop - 38, PAGE_WIDTH - MARGIN * 2, rowHeight);
  ctx.fillStyle = "#374151";
  ctx.font = "800 25px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("المقاس", colRight - 20, tableTop);
  ctx.textAlign = "center";
  ctx.fillText("القيمة", colMiddle, tableTop);
  ctx.textAlign = "left";
  ctx.fillText("الوحدة", colLeft + 70, tableTop);

  y = tableTop + 46;
  for (const measurement of order.measurements) {
    ctx.strokeStyle = "#eef0f2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + 18);
    ctx.lineTo(PAGE_WIDTH - MARGIN, y + 18);
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "700 26px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(measurement.label, colRight - 20, y);

    ctx.textAlign = "center";
    ctx.font = "800 26px Arial, sans-serif";
    ctx.fillText(String(measurement.value), colMiddle, y);

    ctx.textAlign = "left";
    ctx.font = "700 25px Arial, sans-serif";
    ctx.fillText(measurement.unit === "CM" ? "سم" : "متر", colLeft + 70, y);

    y += rowHeight;
  }

  y += 20;
  const fabricHeight = order.fabric ? 130 : 95;
  roundedRect(ctx, MARGIN, y, PAGE_WIDTH - MARGIN * 2, fabricHeight, 20);
  ctx.fillStyle = "#f9fafb";
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.textAlign = "right";
  ctx.font = "800 28px Arial, sans-serif";
  ctx.fillText("القماش", PAGE_WIDTH - MARGIN - 30, y + 42);

  ctx.fillStyle = "#374151";
  ctx.font = "700 25px Arial, sans-serif";
  const fabricText = order.fabric
    ? `${order.fabric.name} — ${order.fabricQuantity?.toFixed(2) ?? "0.00"} متر`
    : "العميل أحضر القماش من الخارج";

  const fabricLines = wrapText(ctx, fabricText, PAGE_WIDTH - MARGIN * 2 - 100);
  fabricLines.forEach((line, index) => {
    ctx.fillText(line, PAGE_WIDTH - MARGIN - 30, y + 82 + index * 36);
  });

  y += fabricHeight + 35;
  y = drawSectionTitle(ctx, "المبالغ", y);

  const cardWidth = PAGE_WIDTH - MARGIN * 2;
  const cardHeight = 86;
  const cards = [
    ["الإجمالي", money(order.totalAmount)],
    [order.tailoringStatus === "RECEIVED" ? "المدفوع" : "العربون", money(order.paidAmount)],
    ["المتبقي", money(order.remainingAmount)],
  ];

  for (const [label, value] of cards) {
    roundedRect(ctx, MARGIN, y, cardWidth, cardHeight, 16);
    ctx.fillStyle = "#f9fafb";
    ctx.fill();

    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "right";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText(label, PAGE_WIDTH - MARGIN - 30, y + 36);

    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.font = "900 28px Arial, sans-serif";
    ctx.fillText(value, MARGIN + 30, y + 36);

    y += cardHeight + 12;
  }

  if (order.notes) {
    y += 20;
    y = drawSectionTitle(ctx, "ملاحظات", y);
    ctx.fillStyle = "#374151";
    ctx.font = "600 24px Arial, sans-serif";
    ctx.textAlign = "right";
    const notesLines = wrapText(ctx, order.notes, PAGE_WIDTH - MARGIN * 2 - 20);
    for (const line of notesLines) {
      ctx.fillText(line, PAGE_WIDTH - MARGIN, y);
      y += 36;
    }
  }

  ctx.fillStyle = "#9ca3af";
  ctx.textAlign = "center";
  ctx.font = "600 20px Arial, sans-serif";
  ctx.fillText(`صفحة ${pageNumber}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 45);

  return canvas;
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function jpegPdf(jpegs: { bytes: Uint8Array; width: number; height: number }[]) {
  const chunks: Uint8Array[] = [asciiBytes("%PDF-1.4\n")];
  const offsets: number[] = [0];

  let length = chunks[0].length;
  const objectNumbers = {
    catalog: 1,
    pages: 2,
  };

  const pageObjects: number[] = [];
  let nextObject = 3;

  for (let index = 0; index < jpegs.length; index += 1) {
    const imageObject = nextObject++;
    const contentObject = nextObject++;
    const pageObject = nextObject++;

    pageObjects.push(pageObject);

    const image = jpegs[index];
    const imageHeader = asciiBytes(
      `${imageObject} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
    );
    const imageFooter = asciiBytes("\nendstream\nendobj\n");

    offsets[imageObject] = length;
    const imageChunk = concatBytes(imageHeader, image.bytes, imageFooter);
    chunks.push(imageChunk);
    length += imageChunk.length;

    const contentBody = `q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`;
    const content = asciiBytes(
      `${contentObject} 0 obj\n<< /Length ${asciiBytes(contentBody).length} >>\nstream\n${contentBody}endstream\nendobj\n`,
    );
    offsets[contentObject] = length;
    chunks.push(content);
    length += content.length;

    const page = asciiBytes(
      `${pageObject} 0 obj\n<< /Type /Page /Parent ${objectNumbers.pages} 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>\nendobj\n`,
    );
    offsets[pageObject] = length;
    chunks.push(page);
    length += page.length;
  }

  const kids = pageObjects.map((object) => `${object} 0 R`).join(" ");
  const pages = asciiBytes(
    `${objectNumbers.pages} 0 obj\n<< /Type /Pages /Count ${pageObjects.length} /Kids [ ${kids} ] >>\nendobj\n`,
  );
  offsets[objectNumbers.pages] = length;
  chunks.push(pages);
  length += pages.length;

  const catalog = asciiBytes(
    `${objectNumbers.catalog} 0 obj\n<< /Type /Catalog /Pages ${objectNumbers.pages} 0 R >>\nendobj\n`,
  );
  offsets[objectNumbers.catalog] = length;
  chunks.push(catalog);
  length += catalog.length;

  const xrefOffset = length;
  const objectCount = nextObject;
  let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;

  for (let object = 1; object < objectCount; object += 1) {
    xref += `${String(offsets[object] ?? 0).padStart(10, "0")} 00000 n \n`;
  }

  xref +=
    `trailer\n<< /Size ${objectCount} /Root ${objectNumbers.catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(asciiBytes(xref));

  const blobParts: BlobPart[] = chunks.map((chunk) => {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    return buffer;
  });
  return new Blob(blobParts, { type: "application/pdf" });
}

export async function createTailoringCustomerPdf(order: TailoringOrder) {
  const canvas = createPage(order, 1);
  const jpeg = canvas.toDataURL("image/jpeg", 0.93);

  return jpegPdf([
    {
      bytes: dataUrlToBytes(jpeg),
      width: canvas.width,
      height: canvas.height,
    },
  ]);
}

export function getTailoringCustomerMessage(order: TailoringOrder) {
  return customerMessage(order);
}

export function getTailoringPdfFileName(order: TailoringOrder) {
  return `طلب-تفصيل-${order.orderNumber}.pdf`;
}
