"use client";

import { usePathname } from "next/navigation";

const PageName = () => {
  const pathname = usePathname();

  if (pathname === "/") {
    return <div>Dashboard</div>;
  }

  return (
    <div>
      {pathname
        .slice(1)
        .replace("-", " ")
        .replace(/\b\w/g, (l) => l.toUpperCase())}
    </div>
  );
};

export default PageName;
