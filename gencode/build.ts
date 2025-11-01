import { spawn, SpawnOptions } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { genCode } from "./genCode";
import type { Config, HashComponent } from "./type";
import { validate } from "./validator";

const spawnProcess = (command: string, args: string[], options: SpawnOptions) =>
	new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, options);
		child.on("close", (code, signal) => {
			if (!code && !signal) {
				resolve();
			} else {
				throw new Error("Command failed");
			}
		});
	});

export const build = async (config: Config) => {
	if (!validate(config)) {
		console.error(validate.errors);
		throw new Error("Invalid configuration");
	}
	if (!config.hashComponents) {
		config = {
			...config,
			hashComponents: [
				{ type: "random", length: 32 },
				...(config.smbios
					? ([
							{ type: "smbios", ref: "system-serial-number" },
							{ type: "smbios", ref: "system-uuid" },
						] as HashComponent[])
					: []),
			],
		};
	}
	let useTempFolder = false;
	if (!config.buildFolder) {
		useTempFolder = true;
		config.buildFolder = await mkdtemp(join(tmpdir(), "efiencrypt-"));
	}
	try {
		await mkdir(join(config.buildFolder), { recursive: true });
		if (!config.skipGenCode) {
			await genCode(config as Config & { buildFolder: {}; hashComponents: {} });
		}
		if (!config.skipExtract) {
			const extract = (await import("./extract")).extract;
			await extract(config.buildFolder);
		}
		if (!config.skipMake) {
			await spawnProcess("make", [], {
				stdio: "inherit",
				cwd: config.buildFolder,
			});
			if (config.outputFile) {
				await mkdir(dirname(config.outputFile), { recursive: true });
				await cp(join(config.buildFolder, "bootx64.efi"), config.outputFile);
			}
		}
	} finally {
		if (useTempFolder) {
			await rm(config.buildFolder, { recursive: true, force: true });
		}
	}
};
