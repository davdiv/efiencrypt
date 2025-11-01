import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const sourceFiles: Record<string, string> = import.meta.glob(["./**/{Makefile,Make.*,*.h,*.c,*.S,*.in,*.lds,*.sh}", "!./gen-code.c", "!./gnu-efi/apps"], {
	eager: true,
	import: "default",
	base: "../bootcode",
	query: "?raw",
});

export const extract = async (outputFolder: string) => {
	for (const [file, content] of Object.entries(sourceFiles)) {
		await mkdir(join(outputFolder, dirname(file)), { recursive: true });
		await writeFile(join(outputFolder, file), content);
	}
};
