import swaggerAutogen from "swagger-autogen";
swaggerAutogen()("./swagger.json", ["./app.js"]);

import fs from "fs";
import YAML from "yaml";

const yamlText = fs.readFileSync("./swagger/openapi.yaml", "utf-8");
const doc = YAML.parse(yamlText);

fs.writeFileSync("./swagger/swagger.json", JSON.stringify(doc, null, 2));
