import Link from "next/link";

// components
import StatsCard from "./(frontend)/components/StatsCard";
import AreaChartComponent from "./(frontend)/components/AreaChart";
import PieChartComponent from "./(frontend)/components/PieChart";
// data
import { actions, activities, statsData } from "@/data/data";
import PageHeader from "@/components/shared/PageHeader";

const Dashboard = () => {
  const products = [
    {
      title: "Mechanical Keyboard",
      category: "Electronics",
      totalQty: 38,
      recentQty: 5,
      status: "low stock",
    },
    {
      title: "Smart Watch",
      category: "Electronics",
      totalQty: 20,
      recentQty: 0,
      status: "out of stock",
    },
    {
      title: "Air Max, Shoe",
      category: "Cloths",
      totalQty: 40,
      recentQty: 7,
      status: "low stock",
    },
    {
      title: "Dior Sauvage",
      category: "Beauty",
      totalQty: 20,
      recentQty: 2,
      status: "low stock",
    },
    {
      title: "IPhone 16 Pro Max, Golden",
      category: "Electronics",
      totalQty: 50,
      recentQty: 0,
      status: "out of stock",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Welcome back, John! 👋"
        subtitle="
          Here's what's happening with your store today."
      />
      <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Stats cards */}
        {statsData.map((stat) => (
          <StatsCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            iconBg={stat.iconBg}
            statType={stat.statType}
            statNumber={stat.statNumber}
          />
        ))}
      </section>
      <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="col-span-2">
          <AreaChartComponent />
        </div>
        <div className="col-span-1">
          <PieChartComponent />
        </div>
      </section>
      <section className="my-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="col-span-1 space-y-5">
          <div className="frame">
            <p className="text-sm text-gray-500 mb-5">Quick actions</p>
            <div className="grid grid-cols-2 gap-3">
              {actions.map(({ name, href }) => (
                <Link
                  href={href}
                  key={name}
                  className="py-3 px-4 text-center text-sm rounded-xl border border-slate-300 transition duration-350 hover:text-white hover:border-0 hover:bg-(--primary-red)"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>
          <div className="frame">
            <p className="text-sm text-gray-500 mb-5">Recent Activity</p>
            <div className="space-y-2">
              {activities.map((active) => {
                const id = 0;
                return (
                  <div className="flex gap-3" key={`${active.name}empl${id}`}>
                    <div className="h-12 w-12 flex justify-center items-center font-semibold text-(--primary-pink) bg-(--primary-pink)/10 text-sm rounded-2xl">
                      {active.responsable.charAt(0).toUpperCase()}
                    </div>
                    <div className="">
                      <h3 className="font-semibold">{active.name}</h3>
                      <p className="text-(--primary-red) text-sm my-0 py-0">
                        {active.responsable}
                      </p>
                      <span className="text-gray-500 text-xs">
                        {active.time}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="col-span-2 frame">
          <div className="flex justify-between items-center mb-5">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Needs restocking</p>
              <h2 className="font-semibold text-gray-900">
                Low Stock / Out of Stock
              </h2>
            </div>
            <Link
              href="/products"
              className="text-(--primary-red) transition-colors duration-300 hover:text-(--primary-red-hover)"
            >
              Manage Products
            </Link>
          </div>
          <div className="space-y-2">
            {products.map((product, index) => (
              <Link
                href={product.title}
                key={product.title}
                className={`pt-2 pb-3 flex justify-between items-center ${index !== products.length - 1 ? "border-b border-b-gray-200" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-2xl bg-slate-400/30"></div>
                  <div>
                    <h2 className="font-semibold">{product.title}</h2>
                    <p className="text-gray-500 text-sm">{product.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="flex items-center gap-1 text-sm">
                    <span className="text-gray-500">{product.recentQty}</span> /{" "}
                    <span>{product.totalQty}</span>
                  </p>
                  <div
                    className={`py-1 px-3 text-sm rounded-full ${product.recentQty ? "text-amber-500 bg-amber-400/15" : "text-(--primary-red) bg-(--primary-red)/15"}`}
                  >
                    {product.status}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
