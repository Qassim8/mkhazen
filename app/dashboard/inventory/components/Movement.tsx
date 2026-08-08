import {
  LuArrowDownLeft,
  LuArrowRightLeft,
  LuArrowUpRight,
  LuRefreshCcw,
} from "react-icons/lu";

const Movement = () => {
  const moves = [
    {
      id: 1,
      product: "Wireless Noise-Canceling Headphones",
      type: "Stock In",
      qty: 5,
      responsable: "Eglal Omar",
    },
    {
      id: 2,
      product: "Oxford Cotton Shirt",
      type: "Stock Out",
      qty: 32,
      responsable: "Omar Ahmad",
    },
    {
      id: 3,
      product: "Cold Brew Coffee Maker",
      type: "Adjustment",
      qty: 14,
      responsable: "Yusuf Faris",
    },
    {
      id: 4,
      product: "Linen Table Lamp",
      type: "Transfer",
      qty: 7,
      responsable: "Omar Ahmad",
    },
    {
      id: 5,
      product: "Compact Mirrorless Camera",
      type: "Stock Out",
      qty: 22,
      responsable: "Yusuf Faris",
    },
    {
      id: 6,
      product: "Mechanical Keyboard 75%",
      type: "Stock In",
      qty: 15,
      responsable: "Eglal Omar",
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-1 pb-3">
        <p className="text-sm text-gray-500">الجدول الزمني</p>
        <h2 className="font-semibold text-gray-900">تحركات اليوم</h2>
      </div>
      <div className="flex flex-col gap-4">
        {moves.map(({ id, product, type, qty, responsable }, index) => {
          return (
            <div className="flex gap-3" key={id}>
              <div
                className={`relative h-8 w-8 flex justify-center items-center font-semibold
                     ${type === "Stock In" ? "text-emerald-500 bg-emerald-500/10" : type === "Stock Out" ? "text-(--primary-red) bg-(--primary-red)/10" : type === "Adjustment" ? "text-amber-500 bg-amber-500/10" : "text-blue-500 bg-blue-500/10"} 
                     text-sm font-semibold rounded-full `}
              >
                {type === "Stock In" ? (
                  <LuArrowDownLeft />
                ) : type === "Stock Out" ? (
                  <LuArrowUpRight />
                ) : type === "Adjustment" ? (
                  <LuRefreshCcw />
                ) : (
                  <LuArrowRightLeft />
                )}
                {index !== moves?.length - 1 && (
                  <div
                    className={`absolute -bottom-4.5 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-gray-200`}
                  ></div>
                )}
              </div>

              <div className="">
                <h3 className="font-semibold text-sm">{product}</h3>
                <span className="text-gray-500 text-xs">
                  {type} .
                  {type === "Stock In"
                    ? "+"
                    : type === "Stock Out"
                      ? "-"
                      : type === "Transfer"
                        ? "<>"
                        : ""}
                  {qty} . {responsable}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Movement;
