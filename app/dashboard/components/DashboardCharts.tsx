"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type {
  DashboardTopProduct,
  DashboardTrendPoint,
} from "../services/dashboard.services";

const AreaChartComponent = dynamic(() => import("./AreaChart"), {
  loading: () => (
    <div className="frame h-[25rem] animate-pulse bg-slate-100 md:h-[29rem]" />
  ),
});

const PieChartComponent = dynamic(() => import("./PieChart"), {
  loading: () => <div className="frame h-[25rem] animate-pulse bg-slate-100" />,
});

interface Props {
  trend: DashboardTrendPoint[];
  data: DashboardTopProduct[];
  periodLabel: string;
}

export default function DashboardCharts({ trend, data, periodLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldLoad) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={containerRef}
      className="col-span-full grid grid-cols-1 gap-5 xl:grid-cols-3"
      aria-busy={!shouldLoad}
    >
      {shouldLoad ? (
        <>
          <div className="xl:col-span-2">
            <AreaChartComponent data={trend} periodLabel={periodLabel} />
          </div>
          <PieChartComponent data={data} periodLabel={periodLabel} />
        </>
      ) : (
        <>
          <div className="frame h-[25rem] animate-pulse bg-slate-100 md:h-[29rem] xl:col-span-2" />
          <div className="frame h-[25rem] animate-pulse bg-slate-100" />
        </>
      )}
    </div>
  );
}
