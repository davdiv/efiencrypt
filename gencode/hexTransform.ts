import { Transform, type TransformCallback } from "node:stream";

const hex = (buffer: Buffer) => {
	const res = Buffer.alloc(buffer.length * 6, " 0x00,");
	for (let i = 0; i < buffer.length; i++) {
		if (i % 16 === 0) {
			res.write("\n", i * 6, "ascii");
		}
		const byte = buffer.at(i)!;
		res.write(byte.toString(16), i * 6 + (byte >= 16 ? 3 : 4), "ascii");
	}
	return res;
};

export class CountTransform extends Transform {
	length = 0;
	constructor() {
		super({
			objectMode: false,
		});
	}
	override _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
		chunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
		this.length += chunk.length;
		callback(null, chunk);
	}
}

export class HexTransform extends CountTransform {
	override _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
		super._transform(chunk, encoding, (err, data) => callback(err, hex(data)));
	}
}

export class HexCVarTransform extends HexTransform {
	readonly #varName: string;
	readonly #static: boolean;
	constructor(varName: string, isStatic: boolean) {
		super();
		this.#varName = varName;
		this.#static = isStatic;
		this.push(`${this.#static ? "static " : ""}uint8_t ${this.#varName}[] = {`);
	}
	override _flush(callback: TransformCallback): void {
		this.push(`};\n${this.#static ? "static " : ""}size_t ${this.#varName}_len = 0x${this.length.toString(16)};\n`);
		callback();
	}
}
