import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist");
if (path.dirname(outputDirectory) !== projectRoot || path.basename(outputDirectory) !== "dist") {
  throw new Error("Refusing to build outside the expected dist directory");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const rootFiles = [
  "index.html",
  "style.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  "googlea9cdf7d55bcd2e95.html",
  "_headers",
  "_redirects",
];
for (const filename of rootFiles) {
  await cp(path.join(projectRoot, filename), path.join(outputDirectory, filename));
}

await cp(
  path.join(projectRoot, "assets"),
  path.join(outputDirectory, "assets"),
  {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(projectRoot, "assets"), source);
      return relative !== "CV" && !relative.startsWith(`CV${path.sep}`);
    },
  },
);
await cp(path.join(projectRoot, "resume-access"), path.join(outputDirectory, "resume-access"), { recursive: true });
await cp(path.join(projectRoot, "admin"), path.join(outputDirectory, "admin"), { recursive: true });

async function findPdf(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findPdf(entryPath);
      if (nested) return nested;
    } else if (entry.name.toLowerCase().endsWith(".pdf")) {
      return entryPath;
    }
  }
  return null;
}

const publicPdf = await findPdf(outputDirectory);
if (publicPdf) throw new Error(`Public build contains a PDF: ${publicPdf}`);
const outputStats = await stat(outputDirectory);
if (!outputStats.isDirectory()) throw new Error("Static build output was not created");

console.log("Static Pages output created in dist with resume PDFs excluded.");
