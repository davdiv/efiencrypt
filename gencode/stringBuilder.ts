import { Readable } from "node:stream";

export type StringBuilderPart = string | Readable | StringBuilder;

export class StringBuilder {
	#content: StringBuilderPart[] = [];

	write(content: StringBuilderPart) {
		this.#content.push(content);
		return this;
	}

	async *#read() {
		const content = this.#content;
		this.#content = [];
		while (content.length > 0) {
			const item = content.shift()!;
			if (item instanceof StringBuilder) {
				content.unshift(...item.#content);
				item.#content = [];
			} else if (typeof item === "string") {
				yield item;
			} else if (Readable.isReadable(item)) {
				for await (const part of item) {
					yield part;
				}
			}
		}
	}

	toReadable() {
		return Readable.from(this.#read(), {
			objectMode: false,
			encoding: "ascii",
		});
	}
}
