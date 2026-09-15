import AssetsClient from "../_components/AssetsClient";

import { getAssets } from "../services/accounting.services";

const AssetsPage = async () => {
  const { data } = await getAssets();

  return <AssetsClient initialData={data} />;
};

export default AssetsPage;
