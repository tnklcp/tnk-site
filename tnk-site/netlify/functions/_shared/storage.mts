import { getDeployStore, getStore } from "@netlify/blobs";

type StoreName = "tnk-ops";

const getStoreName = (): StoreName => "tnk-ops";

export const getDataStore = () => {
  const storeName = getStoreName();
  const deployContext = Netlify?.context?.deploy?.context;
  if (deployContext === "production") {
    return getStore(storeName);
  }

  return getDeployStore(storeName);
};

export const readCollection = async <T>(key: string): Promise<T[]> => {
  const store = getDataStore();
  const data = await store.get(key, { type: "json" });
  if (!Array.isArray(data)) {
    return [];
  }
  return data as T[];
};

export const writeCollection = async <T>(key: string, value: T[]): Promise<void> => {
  const store = getDataStore();
  await store.setJSON(key, value);
};
