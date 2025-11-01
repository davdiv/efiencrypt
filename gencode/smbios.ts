// cf specification at https://www.dmtf.org/standards/smbios/

export interface SmbiosTable {
	type: number;
	handle: number;
	structure: Buffer;
	strings: string[];
}

export interface SmbiosTables {
	buffer: Buffer;
	offset: number;
	tables: SmbiosTable[];
	byType: Record<number, SmbiosTable[]>;
	byHandle: Record<number, SmbiosTable>;
}

export type SmbiosTableRefDetails =
	| {
			handle: number;
	  }
	| { type: number; index?: number };

export type SmbiosTableRef = number | keyof typeof SmbiosTableNames | SmbiosTableRefDetails;

export type SmbiosFieldRefDetails = {
	table: SmbiosTableRef;
	offset: number;
	type: "byte" | "word" | "dword" | "qword" | "string" | "uuid";
};

export const smbiosDataTypeSize: Record<SmbiosFieldRefDetails["type"], number> = {
	byte: 1,
	string: 1,
	word: 2,
	dword: 4,
	qword: 8,
	uuid: 16,
};

export type SmbiosFieldRef = SmbiosFieldRefDetails | keyof typeof SmbiosFieldNames;

export const SmbiosTableNames = {
	"Platform Firmware": 0,
	System: 1,
	Baseboard: 2,
	Chassis: 3,
	Processor: 4,
	"Memory Controller": 5,
	"Memory Module": 6,
	Cache: 7,
	"Port Connector": 8,
	"System Slots": 9,
	"Onboard Devices": 10,
	"OEM Strings": 11,
	"System Configuration Options": 12,
	"Firmware Language": 13,
	"Group Associations": 14,
	"System Event Log": 15,
	"Physical Memory Array": 16,
	"Memory Device": 17,
	"32-bit Memory Error": 18,
	"Memory Array Mapped Address": 19,
	"Memory Device Mapped Address": 20,
	"Built-in Pointing Device": 21,
	"Portable Battery": 22,
	"System Reset": 23,
	"Hardware Security": 24,
	"System Power Controls": 25,
	"Voltage Probe": 26,
	"Cooling Device": 27,
	"Temperature Probe": 28,
	"Electrical Current Probe": 29,
	"Out-of-band Remote Access": 30,
	"Boot Integrity Services": 31,
	"System Boot": 32,
	"64-bit Memory Error": 33,
	"Management Device": 34,
	"Management Device Component": 35,
	"Management Device Threshold Data": 36,
	"Memory Channel": 37,
	"IPMI Device": 38,
	"Power Supply": 39,
	"Additional Information": 40,
	"Onboard Devices Extended Information": 41,
	"Management Controller Host Interface": 42,
	"TPM Device": 43,
	"Processor Additional Information": 44,
	"Firmware Inventory": 45,
	"String Property": 46,
};

export const SmbiosFieldNames = {
	"bios-vendor": { table: "Platform Firmware", offset: 0x4, type: "string" },
	"bios-version": { table: "Platform Firmware", offset: 0x5, type: "string" },
	"bios-release-date": {
		table: "Platform Firmware",
		offset: 0x8,
		type: "string",
	},
	"bios-revision": { table: "Platform Firmware", offset: 0x14, type: "word" },
	"system-manufacturer": { table: "System", offset: 0x4, type: "string" },
	"system-product-name": { table: "System", offset: 0x5, type: "string" },
	"system-version": { table: "System", offset: 0x6, type: "string" },
	"system-serial-number": { table: "System", offset: 0x7, type: "string" },
	"system-uuid": { table: "System", offset: 0x8, type: "uuid" },
	"system-sku-number": { table: "System", offset: 0x19, type: "string" },
	"system-family": { table: "System", offset: 0x1a, type: "string" },
	"baseboard-manufacturer": { table: "Baseboard", offset: 0x4, type: "string" },
	"baseboard-product-name": { table: "Baseboard", offset: 0x5, type: "string" },
	"baseboard-version": { table: "Baseboard", offset: 0x6, type: "string" },
	"baseboard-serial-number": {
		table: "Baseboard",
		offset: 0x7,
		type: "string",
	},
	"baseboard-asset-tag": { table: "Baseboard", offset: 0x8, type: "string" },
	"chassis-manufacturer": { table: "Chassis", offset: 0x4, type: "string" },
	"chassis-version": { table: "Chassis", offset: 0x6, type: "string" },
	"chassis-serial-number": { table: "Chassis", offset: 0x7, type: "string" },
	"chassis-asset-tag": { table: "Chassis", offset: 0x8, type: "string" },
	"processor-manufacturer": { table: "Processor", offset: 0x7, type: "string" },
	"processor-version": { table: "Processor", offset: 0x10, type: "string" },
} satisfies Record<string, SmbiosFieldRefDetails>;

export const parseSmbios = (buffer: Buffer): SmbiosTables => {
	const v3 = buffer.subarray(0, 5).toString("ascii") === "_SM3_";
	const v2 = !v3 && buffer.subarray(0, 4).toString("ascii") === "_SM_";
	const rawTable = !v3 && !v2;
	let position = 0;
	if (!rawTable) {
		const tableMaxSize = v3 ? buffer.readUint32LE(0x0c) : buffer.readUint16LE(0x16);
		const tableAddress = v3 ? buffer.readBigUint64LE(0x10) : BigInt(buffer.readUint16LE(0x18));
		if (tableAddress + BigInt(tableMaxSize) !== BigInt(buffer.length)) {
			throw new Error("Unexpected smbios file size.");
		}
		position = Number(tableAddress);
	}
	const offset = position;
	const tables: SmbiosTable[] = [];
	const byType: Record<number, SmbiosTable[]> = {};
	const byHandle: Record<number, SmbiosTable> = {};
	while (position < buffer.length) {
		const length = buffer.readUint8(position + 1);
		const structure = buffer.subarray(position, position + length);
		const strings: string[] = [];
		position += length;
		while (true) {
			const endPosition = buffer.indexOf(0, position);
			if (endPosition === -1) {
				throw new Error("Missing null character in smbios structure");
			}
			if (endPosition === position) {
				if (strings.length === 0) {
					position++;
					if (buffer.readUInt8(position) !== 0) {
						throw new Error("Expected null character in smbios structure");
					}
				}
				position++;
				break;
			}
			strings.push(buffer.subarray(position, endPosition).toString("utf8"));
			position = endPosition + 1;
		}
		const table = {
			type: structure.readUint8(0),
			handle: structure.readUint16LE(2),
			structure,
			strings,
		};
		tables.push(table);
		if (byHandle[table.handle] != null) {
			throw new Error(`Duplicate handle 0x${table.handle.toString(16)} in smbios structure.`);
		}
		byHandle[table.handle] = table;
		let withCurType = byType[table.type];
		if (!withCurType) {
			withCurType = [];
			byType[table.type] = withCurType;
		}
		withCurType.push(table);
	}
	return { tables, byType, byHandle, offset, buffer };
};

export const getSmbiosString = (table: SmbiosTable, offset: number): string => {
	const stringIndex = table.structure.readUint8(offset) - 1;
	return stringIndex === -1 ? "" : table.strings[stringIndex];
};

export const resolveSmbiosTable = (ref: SmbiosTableRef) => {
	if (typeof ref === "string") {
		ref = SmbiosTableNames[ref];
	}
	if (typeof ref === "number") {
		ref = { type: ref };
	}
	return ref;
};

export const getSmbiosTable = (tables: SmbiosTables, ref: SmbiosTableRef) => {
	ref = resolveSmbiosTable(ref);
	if ("handle" in ref) {
		return tables.byHandle[ref.handle];
	}
	return tables.byType[ref.type]?.[ref.index ?? 0];
};

export const resolveSmbiosField = (data: SmbiosFieldRef): SmbiosFieldRefDetails & { table: SmbiosTableRefDetails } => {
	if (typeof data === "string") {
		data = SmbiosFieldNames[data];
	}
	return {
		...data,
		table: resolveSmbiosTable(data.table),
	};
};

export const getSmbiosField = (tables: SmbiosTables, data: SmbiosFieldRef): Buffer | null => {
	data = resolveSmbiosField(data);
	const table = getSmbiosTable(tables, data.table);
	if (!table) return null;
	if (data.type === "string") {
		return Buffer.from(getSmbiosString(table, data.offset));
	} else {
		return table.structure.subarray(data.offset, data.offset + smbiosDataTypeSize[data.type]);
	}
};
