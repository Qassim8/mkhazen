export type filterOption = {
  label: string;
  value: string;
};

type filterProps = {
  paramKey?: string;
  options: filterOption[];
};

const TableFilter = ({ options }: filterProps) => {
  return (
    <div className="relative">
      <select className="rounded-lg shadow bg-gray-50 px-6 py-2 text-sm text-gray-700 border border-gray-300 placeholder-gray-600 focus:border-red-500 focus:bg-white focus:outline-none focus:ring focus:ring-red-200">
        {options.map(({ label, value }) => (
          <option key={label} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TableFilter;
