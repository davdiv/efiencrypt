import { Readable } from "node:stream";
import { StringBuilder, type StringBuilderPart } from "./stringBuilder";
import { HexCVarTransform } from "./hexTransform";

export class CodeBuilder {
	#varCounter = 0;
	#blocks = new Map<string, StringBuilder>();
	#alreadyIncluded = new Map<string, any>();
	curBlock = "main";

	constructor(header = "") {
		this.#blocks.set(this.curBlock, new StringBuilder());
		this.write(header);
		this.writeNewBlock("headers");
		this.writeNewBlock("global");
	}

	changeCurBlock(curBlock: string, fn: () => void) {
		const savedCurBlock = this.curBlock;
		try {
			this.curBlock = curBlock;
			fn();
		} finally {
			this.curBlock = savedCurBlock;
		}
	}

	newVar() {
		return `var${this.#varCounter++}`;
	}

	write(code: StringBuilderPart, blockName = this.curBlock) {
		this.#blocks.get(blockName)!.write(code);
	}

	writeNewBlock(newBlockName: string, blockName = this.curBlock) {
		const newBlock = new StringBuilder();
		if (this.#blocks.has(newBlockName)) {
			throw new Error(`Block ${newBlockName} already exists!`);
		}
		this.#blocks.set(newBlockName, newBlock);
		this.write(newBlock, blockName);
	}

	createBinaryVar(content: Buffer | Readable, varName?: string, blockName = "global") {
		const isStatic = !varName;
		if (!varName) {
			varName = this.newVar();
		}
		const readable = Buffer.isBuffer(content) ? Readable.from(content) : content;
		this.write(readable.pipe(new HexCVarTransform(varName, isStatic)), blockName);
		return varName;
	}

	insertOnce<T>(name: string, fn: (data: Partial<T>) => void) {
		let data = this.#alreadyIncluded.get(name);
		if (!data) {
			data = {};
			this.#alreadyIncluded.set(name, data);
			fn(data);
		}
		return data as T;
	}

	addHeader(header: string) {
		const headerCode = `#include ${header}\n`;
		this.insertOnce(header, () => {
			this.write(headerCode, "headers");
		});
	}

	toReadable() {
		return this.#blocks.get("main")!.toReadable();
	}
}
