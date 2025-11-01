import { program } from "commander";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { build } from "./build";
import type { Config } from "./type";

program
	.description("Encrypts an EFI binary using a hash derived from user‑defined data (smbios, disk, ...)")
	.showHelpAfterError(true)
	.option("-c, --config-file <configFile>", "configuration file")
	.option("-i, --input-file <inputFile>", "path to the input efi file to embed")
	.option("-o, --output-file <outputFile>", "path to the output efi file to write")
	.option("-s, --smbios <smbios>", "path to the input smbios dump file")
	.option("-b, --build-folder <buildFolder>", "folder where to build the code")
	.option("--skip-gen-code", "skip generating code")
	.option("--skip-extract", "skip extracting source code")
	.option("--skip-make", "skip calling make")
	.action(async (options) => {
		try {
			let config: Config = {} as Config;
			if (options.configFile) {
				const require = createRequire(join(process.cwd(), "file"));
				const module = require(resolve(options.configFile));
				config = "default" in module ? (config = module.default) : module;
				delete options.configFile;
			}
			Object.assign(config, options);
			await build(config);
		} catch (error) {
			program.error(`${error}`);
		}
	})
	.parse();
