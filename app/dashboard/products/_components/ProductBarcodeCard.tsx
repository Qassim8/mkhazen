import Barcode from "react-barcode";

interface BarcodePrintProps {
  value: string; // قيمة الباركود المخزنة في الداتا بيز
  productName: string;
  price: number;
}

export const ProductBarcodeCard = ({ value }: BarcodePrintProps) => {
  return (
    <div className="flex flex-col items-center p-4 border rounded-lg bg-white w-48 text-center print:w-auto">
      <div className="barcode-wrapper print-area">
        <Barcode
          id="barcode"
          value={value}
          width={1.5}
          height={50}
          fontSize={12}
          margin={5}
        />
      </div>
    </div>
  );
};
