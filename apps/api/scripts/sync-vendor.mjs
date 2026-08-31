import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(root, "public/vendor");
const nodeModules = join(root, "../../node_modules");

mkdirSync(vendorDir, { recursive: true });

cpSync(join(nodeModules, "marked/lib/marked.esm.js"), join(vendorDir, "marked.esm.js"));
cpSync(join(nodeModules, "dompurify/dist/purify.es.mjs"), join(vendorDir, "purify.es.mjs"));
