import { createHash, type Hash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { CodeBuilder } from "./codeBuilder";
import { CountTransform } from "./hexTransform";
import { getSmbiosField, resolveSmbiosField, smbiosDataTypeSize, SmbiosTables } from "./smbios";
import type { BinaryData, BinaryMissingData, Config, HashComponent } from "./type";

export type HashComponentHandler<T> = (params: { hash: Hash; codeBuilder: CodeBuilder; config: Config; hashComponent: T; smbios?: SmbiosTables }) => void | Promise<void>;

export const reorderHash = (hash: Buffer) => {
	for (let i = 0; i < 8; i++) {
		hash.writeUint32LE(hash.readUInt32BE(i * 4), i * 4);
	}
	return hash;
};

const reorderUUID = (buffer: Buffer) => {
	buffer.writeUint32LE(buffer.readUInt32BE(0), 0);
	buffer.writeUint16LE(buffer.readUInt16BE(4), 4);
	buffer.writeUint16LE(buffer.readUInt16BE(6), 6);
	return buffer;
};

const uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseUUID = (uuid: string) => {
	if (!uuidRegExp.test(uuid)) {
		throw new Error("Invalid UUID");
	}
	return reorderUUID(Buffer.from(uuid.replaceAll("-", ""), "hex"));
};

const fail = (msg: string): never => {
	throw new Error(msg);
};

const hashData = async (hash: Hash, binaryData: BinaryData | BinaryMissingData): Promise<number> => {
	if (binaryData.type === "missing") {
		return binaryData.size ?? 1;
	}
	if (binaryData.type === "file") {
		const count = new CountTransform();
		const start = binaryData.offset ?? 0;
		await pipeline(
			createReadStream(binaryData.file, {
				start,
				end: binaryData.size != null ? start + binaryData.size - 1 : Infinity,
			}),
			count,
			hash,
			{ end: false },
		);
		return count.length;
	}
	const buffer = binaryData.type === "buffer" ? binaryData.buffer : Buffer.from(binaryData.buffer, binaryData.type);
	hash.update(buffer);
	return buffer.length;
};

const codeBlockDiskSectorVar = (codeBuilder: CodeBuilder) => {
	codeBuilder.insertOnce(`diskSector`, () => {
		codeBuilder.write(`UINT8 *diskSector = NULL;\n`, "gen_compute_hash_vars");
	});
};

const codeBlockProtocolGuid = (codeBuilder: CodeBuilder, protocolName: string) => {
	codeBuilder.insertOnce(`GUID_${protocolName}`, () => {
		codeBuilder.insertOnce("guidVars", () => codeBuilder.writeNewBlock("guidVars", "gen_compute_hash_vars"));
		codeBuilder.write(`EFI_GUID GUID_${protocolName} = EFI_${protocolName}_PROTOCOL_GUID;\n`, "guidVars");
	});
};

const codeBlockLoadedImage = (codeBuilder: CodeBuilder) => {
	codeBuilder.insertOnce("loadedImage", () => {
		codeBlockProtocolGuid(codeBuilder, "LOADED_IMAGE");
		codeBuilder.write("EFI_LOADED_IMAGE_PROTOCOL *loadedImage = NULL;\n", "gen_compute_hash_vars");
		codeBuilder.write(
			`HANDLE_PROTOCOL(image_handle, GUID_LOADED_IMAGE, &loadedImage);
CHECK_ERROR(!loadedImage);\n`,
			"gen_compute_hash_prep",
		);
	});
};

const codeBlockDevicePathToText = (codeBuilder: CodeBuilder) => {
	codeBuilder.insertOnce("devicePathToText", () => {
		codeBlockProtocolGuid(codeBuilder, "DEVICE_PATH_TO_TEXT");
		codeBuilder.write("EFI_DEVICE_PATH_TO_TEXT_PROTOCOL *devicePathToText = NULL;\n", "gen_compute_hash_vars");
		codeBuilder.write(
			`status = uefi_call_wrapper(gBS->LocateProtocol, 3, &GUID_DEVICE_PATH_TO_TEXT, NULL, &devicePathToText);
CHECK_ERROR(!devicePathToText);\n`,
			"gen_compute_hash_prep",
		);
	});
};

const codeBlockBootPartitionDevice = (codeBuilder: CodeBuilder) => {
	codeBuilder.insertOnce("bootPartitionDevice", () => {
		codeBlockLoadedImage(codeBuilder);
		codeBlockDevicePathToText(codeBuilder);
		codeBlockProtocolGuid(codeBuilder, "DEVICE_PATH");
		codeBuilder.write("EFI_DEVICE_PATH_PROTOCOL *bootDevice = NULL;\n", "gen_compute_hash_vars");
		codeBuilder.write(
			`HANDLE_PROTOCOL(loadedImage->DeviceHandle, GUID_DEVICE_PATH, &bootDevice);
CHECK_ERROR(!bootDevice);
CHAR16 *bootPartitionDeviceString = (void *)uefi_call_wrapper(devicePathToText->ConvertDevicePathToText, 3, bootDevice, FALSE, FALSE);
CHECK_ERROR(!bootPartitionDeviceString);
UINTN bootPartitionDeviceStringLen = 2 * RtStrLen(bootPartitionDeviceString);\n`,
			"gen_compute_hash_prep",
		);
	});
};

const codeBlockBootFile = (codeBuilder: CodeBuilder) => {
	codeBuilder.insertOnce("bootFile", () => {
		codeBlockLoadedImage(codeBuilder);
		codeBlockDevicePathToText(codeBuilder);
		codeBuilder.write(
			`CHAR16 *bootFileString = (void *)uefi_call_wrapper(devicePathToText->ConvertDevicePathToText, 3, loadedImage->FilePath, FALSE, FALSE);
CHECK_ERROR(!bootFileString);
UINTN bootFileStringLen = 2 * RtStrLen(bootFileString);\n`,
			"gen_compute_hash_prep",
		);
	});
};

const codeBlockFindBlock = (codeBuilder: CodeBuilder) =>
	codeBuilder.insertOnce<{ salt: Buffer }>("findBlock", (data) => {
		data.salt = randomBytes(32);
		const saltVarName = codeBuilder.createBinaryVar(data.salt);
		codeBlockProtocolGuid(codeBuilder, "DEVICE_PATH");
		codeBlockProtocolGuid(codeBuilder, "BLOCK_IO");
		codeBuilder.write(
			`UINTN blockIONbHandles = 0;
EFI_HANDLE *blockIOHandles = NULL;
status = uefi_call_wrapper(gBS->LocateHandleBuffer, 5, ByProtocol, &GUID_BLOCK_IO, NULL, &blockIONbHandles, &blockIOHandles);
CHECK_ERROR(0);
for (UINTN i = 0; i < blockIONbHandles; i++)
{
    EFI_BLOCK_IO_PROTOCOL *bio = NULL;
    HANDLE_PROTOCOL(blockIOHandles[i], GUID_BLOCK_IO, &bio);
    if (EFI_ERROR(status) || !bio || !bio->Media->BlockSize)
        continue;
    EFI_DEVICE_PATH_PROTOCOL *devPath = NULL;
    HANDLE_PROTOCOL(blockIOHandles[i], GUID_DEVICE_PATH, &devPath);
    if (EFI_ERROR(status) || !devPath)
        continue;
    CHAR16 *devPathString = (void *)uefi_call_wrapper(devicePathToText->ConvertDevicePathToText, 3, devPath, FALSE, FALSE);
    if (!devPathString)
        continue;
    UINTN devPathStringLen = 2 * RtStrLen(devPathString);
    if (devPathStringLen)
    {
			sha256_context_t devPathStringHash;
    	sha256_init(&devPathStringHash);
			sha256_update(&devPathStringHash, ${saltVarName}, ${saltVarName}_len);
    	sha256_update(&devPathStringHash, (void*)devPathString, devPathStringLen);
    	sha256_finalize(&devPathStringHash);\n`,
		);
		codeBuilder.writeNewBlock("blockIOHandlesTestDevice");
		codeBuilder.write(`
		}
}
FREE_POOL(blockIOHandles);\n`);
	});

const codeBlockGetDeviceHandle = (codeBuilder: CodeBuilder, device?: string) =>
	codeBuilder.insertOnce<{ varName: string }>(`deviceHandle:${device ?? ""}`, (data) => {
		data.varName = codeBuilder.newVar();
		codeBuilder.write(
			`EFI_HANDLE ${data.varName}_handle = NULL;
EFI_BLOCK_IO_PROTOCOL *${data.varName}_bio = NULL;
UINT64 ${data.varName}_size = 0;
CHAR16 *${data.varName}_devPathString = NULL;
UINTN ${data.varName}_devPathStringLen = 0;\n`,
			"gen_compute_hash_vars",
		);
		const { salt } = codeBlockFindBlock(codeBuilder);
		let condition;
		if (device) {
			const hashVar = codeBuilder.createBinaryVar(reorderHash(createHash("sha256").update(salt).update(device, "utf16le").digest()));
			condition = `RtCompareMem(devPathStringHash.hash, ${hashVar}, 32) == 0`;
		} else {
			codeBlockBootPartitionDevice(codeBuilder);
			condition = `!bio->Media->LogicalPartition && devPathStringLen && devPathStringLen <= bootPartitionDeviceStringLen && RtCompareMem(devPathString, bootPartitionDeviceString, devPathStringLen) == 0`;
		}
		codeBuilder.write(
			`if (${condition}) {
${data.varName}_handle = blockIOHandles[i];
${data.varName}_bio = bio;
${data.varName}_devPathString = devPathString;
${data.varName}_devPathStringLen = devPathStringLen;
${data.varName}_size = ((bio->Media->LastBlock + 1) * bio->Media->BlockSize);
}\n`,
			"blockIOHandlesTestDevice",
		);
	});

const codeBlockGetDeviceDiskIO = (codeBuilder: CodeBuilder, device?: string) =>
	codeBuilder.insertOnce<{ varName: string }>(`deviceDiskIO:${device ?? ""}`, (data) => {
		data.varName = codeBlockGetDeviceHandle(codeBuilder, device).varName;
		codeBlockProtocolGuid(codeBuilder, "DISK_IO");
		codeBuilder.write(`EFI_DISK_IO_PROTOCOL *${data.varName}_dio = NULL;\n`, "gen_compute_hash_vars");
		codeBuilder.write(`if (${data.varName}_handle) { HANDLE_PROTOCOL(${data.varName}_handle, GUID_DISK_IO, &${data.varName}_dio); }\n`);
	});

const codeBlockGetDeviceVolume = (codeBuilder: CodeBuilder, device?: string) =>
	codeBuilder.insertOnce<{ varName: string }>(`deviceVolume:${device ?? ""}`, (data) => {
		let handleVariable;
		if (device) {
			data.varName = codeBlockGetDeviceHandle(codeBuilder, device).varName;
			handleVariable = `${data.varName}_handle`;
		} else {
			codeBlockLoadedImage(codeBuilder);
			data.varName = "efiDevice";
			handleVariable = "loadedImage->DeviceHandle";
		}
		codeBlockProtocolGuid(codeBuilder, "SIMPLE_FILE_SYSTEM");
		codeBuilder.write(`EFI_FILE_IO_INTERFACE *${data.varName}_fio = NULL;\n`, "gen_compute_hash_vars");
		codeBuilder.write(`EFI_FILE_HANDLE ${data.varName}_volume = NULL;\n`, "gen_compute_hash_vars");
		codeBuilder.write(`if (${handleVariable}) {
	HANDLE_PROTOCOL(${handleVariable}, GUID_SIMPLE_FILE_SYSTEM, &${data.varName}_fio);
	if (${data.varName}_fio) {
		uefi_call_wrapper(${data.varName}_fio->OpenVolume, 2, ${data.varName}_fio, &${data.varName}_volume);
	}
}\n`);
	});

const codeBlockGetFile = (codeBuilder: CodeBuilder, file: string, device?: string) =>
	codeBuilder.insertOnce<{ varName: string }>(`file:${device ?? ""}:${file}`, (data) => {
		data.varName = codeBuilder.newVar();
		const { varName: deviceVar } = codeBlockGetDeviceVolume(codeBuilder, device);
		codeBuilder.write(`EFI_FILE_HANDLE ${data.varName}_handle = NULL;\n`, "gen_compute_hash_vars");
		codeBuilder.write(`EFI_FILE_INFO *${data.varName}_fileInfo = NULL;\n`, "gen_compute_hash_vars");
		codeBuilder.write(`if (${deviceVar}_volume) {
	uefi_call_wrapper(${deviceVar}_volume->Open, 5, ${deviceVar}_volume, &${data.varName}_handle, L${JSON.stringify(file)}, EFI_FILE_MODE_READ, EFI_FILE_READ_ONLY | EFI_FILE_HIDDEN | EFI_FILE_SYSTEM);
	if (${data.varName}_handle) {
		${data.varName}_fileInfo = LibFileInfo(${data.varName}_handle);
	}
}\n`);
	});

export const handlers: {
	[T in HashComponent["type"]]: HashComponentHandler<HashComponent & { type: T }>;
} = {
	random({ hash, codeBuilder, hashComponent }) {
		const secret = randomBytes(hashComponent.length);
		hash.update(secret);
		const secretVar = codeBuilder.createBinaryVar(secret);
		codeBuilder.write(`sha256_update(hash, ${secretVar}, ${secretVar}_len);\n`);
	},
	smbios({ hash, codeBuilder, hashComponent, smbios }) {
		const fieldRef = resolveSmbiosField(hashComponent.ref);
		const value = hashComponent.value ?? getSmbiosField(smbios ?? fail("Missing SMBIOS information"), fieldRef);
		if (value) {
			if (typeof value === "string" && fieldRef.type != "string") {
				if (fieldRef.type === "uuid") {
					hash.update(parseUUID(value));
				} else {
					hash.update(Buffer.from(value, "hex"));
				}
			} else {
				hash.update(value);
			}
			if (fieldRef.type === "string") {
				hash.update("\0");
			}
		}
		codeBuilder.addHeader('"smbios.h"');
		if ("type" in fieldRef.table) {
			codeBuilder.write(
				`status = smbios_hashValue(hash, 0, ${fieldRef.table.type}, ${fieldRef.table.index ?? 0}, ${fieldRef.offset}, ${fieldRef.type === "string" ? 0 : smbiosDataTypeSize[fieldRef.type]});\n`,
			);
		} else {
			codeBuilder.write(
				`status = smbios_hashValue(hash, 1, ${fieldRef.table.handle & 0xff}, ${(fieldRef.table.handle >> 8) & 0xff}, ${fieldRef.offset}, ${
					fieldRef.type === "string" ? 0 : smbiosDataTypeSize[fieldRef.type]
				});\n`,
			);
		}
		codeBuilder.write("CHECK_ERROR(0);\n");
	},
	"boot-partition-device"({ hash, codeBuilder, hashComponent }) {
		hash.update(Buffer.from(hashComponent.value, "utf16le"));
		hash.update("\0\0");
		codeBlockBootPartitionDevice(codeBuilder);
		codeBuilder.write(`sha256_update(hash, (void*)bootPartitionDeviceString, bootPartitionDeviceStringLen + 2);\n`);
	},
	"boot-hd-device"({ hash, codeBuilder, hashComponent }) {
		hash.update(Buffer.from(hashComponent.value, "utf16le"));
		hash.update("\0\0");
		const { varName } = codeBlockGetDeviceHandle(codeBuilder);
		codeBuilder.write(`if (${varName}_devPathString) sha256_update(hash, (void*)${varName}_devPathString, ${varName}_devPathStringLen + 2);\n`);
	},
	"boot-file"({ hash, codeBuilder, hashComponent }) {
		hash.update(Buffer.from(hashComponent.value, "utf16le"));
		hash.update("\0\0");
		codeBlockBootFile(codeBuilder);
		codeBuilder.write(`sha256_update(hash, (void*)bootFileString, bootFileStringLen + 2);\n`);
	},
	"hd-size"({ hash, codeBuilder, hashComponent }) {
		if (hashComponent.value !== "missing") {
			const size = Buffer.alloc(8);
			size.writeBigUInt64LE(BigInt(hashComponent.value));
			hash.update(size);
		}
		const { varName } = codeBlockGetDeviceHandle(codeBuilder, hashComponent.device);
		codeBuilder.write(`if (${varName}_bio) sha256_update(hash, (void*)&${varName}_size, sizeof ${varName}_size);\n`);
	},
	async "hd-data"({ hash, codeBuilder, hashComponent }) {
		const size = await hashData(hash, hashComponent.value);
		codeBlockDiskSectorVar(codeBuilder);
		const { varName } = codeBlockGetDeviceDiskIO(codeBuilder, hashComponent.device);
		const offset = BigInt(hashComponent.offset);
		const startPos = hashComponent.offsetRef === "start" ? offset : `${varName}_size - ${offset} - ${size}`;
		codeBuilder.write(`if (${varName}_dio && ${offset} + ${size} <= ${varName}_size) {
	diskSector = AllocatePool(${size});
	if (diskSector) {
		status = uefi_call_wrapper(${varName}_dio->ReadDisk, 5, ${varName}_dio, ${varName}_bio->Media->MediaId, ${startPos}, ${size}, diskSector);
		if (!EFI_ERROR(status)) {
			sha256_update(hash, diskSector, ${size});
		}
		FREE_POOL(diskSector);
	}
}\n`);
	},
	"file-size"({ hash, codeBuilder, hashComponent }) {
		if (hashComponent.value !== "missing") {
			const size = Buffer.alloc(8);
			size.writeBigUInt64LE(BigInt(hashComponent.value));
			hash.update(size);
		}
		const { varName } = codeBlockGetFile(codeBuilder, hashComponent.file, hashComponent.device);
		codeBuilder.write(`if (${varName}_fileInfo) sha256_update(hash, (void*)&${varName}_fileInfo->FileSize, 8);\n`);
	},
	async "file-data"({ hash, codeBuilder, hashComponent }) {
		const size = await hashData(hash, hashComponent.value);
		codeBlockDiskSectorVar(codeBuilder);
		const { varName } = codeBlockGetFile(codeBuilder, hashComponent.file, hashComponent.device);
		const ref = hashComponent.offsetRef ?? "full";
		const offset = BigInt(ref === "full" ? 0 : (hashComponent.offset ?? "0"));
		const startPos = ref === "end" ? `${varName}_fileInfo->FileSize - ${offset} - ${size}` : offset;
		codeBuilder.write(`if (${varName}_fileInfo) {
	UINT64 size = ${ref === "full" ? `${varName}_fileInfo->FileSize` : size};
	if (size + ${hashComponent.offset ?? 0} <= ${varName}_fileInfo->FileSize) {
		diskSector = AllocatePool(size);
		if (diskSector) {
			status = uefi_call_wrapper(${varName}_handle->SetPosition, 2, ${varName}_handle, ${startPos});
			if (!EFI_ERROR(status)) {
				status = uefi_call_wrapper(${varName}_handle->Read, 3, ${varName}_handle, &size, diskSector);
				if (!EFI_ERROR(status)) {
					sha256_update(hash, diskSector, size);
				}
			}
			FREE_POOL(diskSector);
		}
	}
}\n`);
	},
};
