import { reportsData } from "@/data/data";
import Filters from "./components/Filters";
import StatsCard from "../components/StatsCard";
import RevenueChart from "./components/RevenueChart";
import CategoryChart from "./components/CategoryChart";
import TopProductsChart from "./components/TopProductsChart";
import InventoryChart from "./components/InventoryChart";
import ProductTable from "./components/ProductTable";

const Reports = () => {
  return (
    <main>
      <Filters />
      <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Stats cards */}
        {reportsData.map((stat) => (
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
      <RevenueChart />
      <div className="grid md:grid-cols-2 gap-5 py-10">
        <TopProductsChart />
        <CategoryChart />
      </div>
      <div className="grid md:grid-cols-2 gap-5 max-h-[80vh] pb-10">
        <div className="col-span-1">
          <InventoryChart />
        </div>
        <div className="col-span-1">
          <ProductTable />
        </div>
      </div>
    </main>
  );
};

export default Reports;
