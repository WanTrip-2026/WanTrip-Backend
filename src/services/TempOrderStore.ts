import fs from "fs";
import path from "path";

const STORAGE_FILE = path.resolve(process.cwd(), "temp_orders.json");

// Helper to read storage
const readStorage = (): Map<string, any> => {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return new Map();
    }
    const data = fs.readFileSync(STORAGE_FILE, "utf-8");
    return new Map(JSON.parse(data));
  } catch (error) {
    console.error("Failed to read temp orders:", error);
    return new Map();
  }
};

// Helper to write storage
const writeStorage = (map: Map<string, any>) => {
  try {
    const data = JSON.stringify(Array.from(map.entries()), null, 2);
    fs.writeFileSync(STORAGE_FILE, data, "utf-8");
  } catch (error) {
    console.error("Failed to write temp orders:", error);
  }
};

export const tempOrderStorage = {
  get: (key: string) => {
    const map = readStorage();
    return map.get(key);
  },
  set: (key: string, value: any) => {
    const map = readStorage();
    map.set(key, value);
    writeStorage(map);
    return map; // mimics Map.set return
  },
  delete: (key: string) => {
    const map = readStorage();
    const result = map.delete(key);
    writeStorage(map);
    return result;
  },
  get size() {
    return readStorage().size;
  },
};
