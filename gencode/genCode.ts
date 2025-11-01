import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { CodeBuilder } from "./codeBuilder";
import { handlers, reorderHash, type HashComponentHandler } from "./handlers";
import { parseSmbios } from "./smbios";
import type { Config } from "./type";

export const genCode = async (config: Config & { buildFolder: {}; hashComponents: {} }) => {
	const codeBuilder = new CodeBuilder("/*\n * DO NOT EDIT! This file was generated automatically!\n */\n");
	codeBuilder.addHeader('"gen-code.h"');
	codeBuilder.write(
		`EFI_STATUS gen_compute_hash(sha256_context_t *hash, EFI_HANDLE image_handle) {
EFI_STATUS status = 0;\n`,
	);
	codeBuilder.writeNewBlock("gen_compute_hash_vars");
	codeBuilder.writeNewBlock("gen_compute_hash_prep");
	codeBuilder.writeNewBlock("gen_compute_hash");
	codeBuilder.write("return status;\n}\n");
	codeBuilder.curBlock = "gen_compute_hash";

	const hash = createHash("sha256");

	const smbios = config.smbios ? parseSmbios(await readFile(config.smbios)) : undefined;
	for (const hashComponent of config.hashComponents) {
		const handler: HashComponentHandler<any> = handlers[hashComponent.type];
		await handler({ hashComponent, codeBuilder, config, hash, smbios });
	}

	const iv = randomBytes(16);
	codeBuilder.createBinaryVar(iv, "iv");
	const cipher = createCipheriv("aes-256-cbc", reorderHash(hash.digest()), iv);
	codeBuilder.createBinaryVar(createReadStream(config.inputFile).pipe(cipher), "enc_payload");
	await pipeline(codeBuilder.toReadable(), createWriteStream(join(config.buildFolder, "gen-code.c")));
};
