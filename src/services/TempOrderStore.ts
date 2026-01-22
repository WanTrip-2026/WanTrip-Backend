// 使用記憶體中的 Map 來暫存訂單，避免檔案 I/O 的效能問題和競爭條件
const tempOrderMap = new Map<string, any>();
export const tempOrderStorage = {
  get: (key: string) => {
    return tempOrderMap.get(key);
  },
  set: (key: string, value: any) => {
    tempOrderMap.set(key, value);
    return tempOrderMap; // mimics Map.set return
  },
  delete: (key: string) => {
    return tempOrderMap.delete(key);
  },
  get size() {
    return tempOrderMap.size;
  },
};
