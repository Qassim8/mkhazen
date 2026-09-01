export const printBarcodeOnly = (
  barcodeValue: string | null | undefined,
  productName: string,
  price,
) => {
  const printWindow = window.open("", "_blank", "width=400,height=400");
  if (!printWindow) {
    window.alert("يرجى السماح بالنوافذ المنبثقة لطباعة الملصق");
    return;
  }

  const barcodeElem = document.querySelector(
    "#printable-barcode svg",
  )?.outerHTML;
  if (!barcodeElem) {
    printWindow.close();
    window.alert("تعذر العثور على الباركود للطباعة");
    return;
  }

  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character] || character,
    );

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl">
      <head>
        <title>طباعة ملصق - ${productName}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm; /* لإلغاء الهوامش المزعجة في طابعات الملصقات */
          }
          body {
            font-family: system-ui, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 10px;
            margin: 0;
            text-align: center;
          }
          svg { max-width: 100%; height: auto; }
          .title { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
          .price { font-size: 12px; font-weight: bold; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="title">${escapeHtml(productName)}</div>
        ${barcodeElem}
        ${price ? `<div class="price">${price} ر.س</div>` : ""}
        <script>
          window.onload = function () {
            window.print();
          };
          window.onafterprint = function () { window.close(); };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
};
