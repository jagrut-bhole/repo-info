import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, copyFile } from "fs/promises";

async function buildWorker() {
    await rm("dist", { recursive: true, force: true });

    console.log("building client...");
    await viteBuild();

    console.log("building worker...");

    await esbuild({
        entryPoints: ["worker/index.ts"],
        platform: "browser", // Workers use browser-like environment
        bundle: true,
        format: "esm", // Workers require ESM
        outfile: "dist/worker.js",
        define: {
            "process.env.NODE_ENV": '"production"',
        },
        minify: true,
        target: "es2022",
        conditions: ["worker", "browser"],
        mainFields: ["module", "main"],
        logLevel: "info",
    });

    // Copy worker.js to public/_worker.js for Cloudflare Pages
    console.log("copying worker to public/_worker.js...");
    await copyFile("dist/worker.js", "dist/public/_worker.js");

    console.log("Build complete! Ready for Cloudflare Pages deployment.");
}

buildWorker().catch((err) => {
    console.error(err);
    process.exit(1);
});
