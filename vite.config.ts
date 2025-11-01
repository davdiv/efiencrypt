import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone";
import { chmod, cp, rename, writeFile } from "fs/promises";
import { resolve } from "path";
import tjs from "typescript-json-schema";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import packageJson from "./package.json";

const distRegExp = /^(\.\/)?dist\//;
const removeDist = (obj: any): any => {
	if (typeof obj === "string") {
		obj = obj.replace(distRegExp, "$1");
	} else if (typeof obj === "object") {
		obj = Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, removeDist(value)]));
	}
	return obj;
};

const validatorFile = fileURLToPath(new URL("./gencode/validator.js", import.meta.url));
const typeFile = fileURLToPath(new URL("./gencode/type.ts", import.meta.url));
const smbiosFile = fileURLToPath(new URL("./gencode/smbios.ts", import.meta.url));
let configSchema = "";

// https://vitejs.dev/config/
export default defineConfig({
	ssr: {
		noExternal: true,
	},
	build: {
		ssr: true,
		outDir: "dist",
		lib: {
			entry: {
				efiencrypt: "./gencode/cli",
				smbios: "./gencode/smbios",
				index: "./gencode/index",
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: (id) => id.startsWith("node:"),
			output: {
				banner: (chunk) => (chunk.isEntry && chunk.name === "efiencrypt" ? "#!/usr/bin/env node\n" : ""),
			},
		},
	},
	plugins: [
		{
			name: "schema",
			enforce: "pre",
			resolveId(id, source) {
				if (source && resolve(source, "..", id) + ".js" === validatorFile) {
					return { id: validatorFile, external: false };
				}
			},
			async load(id) {
				if (id === validatorFile) {
					const program = tjs.programFromConfig(fileURLToPath(new URL("./tsconfig.json", import.meta.url)), [typeFile, smbiosFile]);
					const schema = tjs.generateSchema(program, "Config", { noExtraProps: true, required: true });
					configSchema = JSON.stringify(schema);
					const ajv = new Ajv({ code: { source: true, esm: true }, allowUnionTypes: true });
					const validate = ajv.compile(schema!);
					const moduleCode = standaloneCode(ajv, validate);
					return moduleCode;
				}
			},
			async closeBundle() {
				await writeFile(new URL("./dist/schema.json", import.meta.url), configSchema);
			},
		},
		{
			name: "extra",
			async writeBundle() {
				await rename("dist/efiencrypt.js", "dist/efiencrypt");
				await chmod("dist/efiencrypt", 0o755);
				await cp("README.md", "dist/README.md");
				await cp("LICENSE.md", "dist/LICENSE.md");
				const pkg: Partial<typeof packageJson> = { ...packageJson };
				delete pkg.scripts;
				delete pkg.devDependencies;
				delete pkg.private;
				await writeFile("dist/package.json", JSON.stringify(removeDist(pkg)));
			},
		},
	],
});
