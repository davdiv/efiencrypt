import { randomBytes } from "node:crypto";
import { statSync, writeFileSync } from "node:fs";
import { EFI_VAR_PK, EFI_VAR_KEK, EFI_VAR_DB, EFI_VAR_DBX, type Config } from "../dist/index.js";

const step = process.env.STEP ?? "1";

const bootkey = randomBytes(2048);
writeFileSync("bootkey.img", bootkey);
const hdDevice = "PciRoot(0x0)/Pci(0x4,0x0)/Scsi(0x0,0x0)";
const hdSize = statSync("./disk.img").size;
const efiStart = "0x800";
const efiSize = "0x19000";
const efiDevice = `${hdDevice}/HD(1,GPT,CCFEACB5-A85F-4F23-95E9-794387DCCF0E,${efiStart},${efiSize})`;
const config: Config = {
	inputFile: `grub${step}.efi`,
	buildFolder: "../bootcode",
	skipExtract: true,
	enrollSecureBoot: {
		kek: { type: "file" as const, file: `sbkeys${step}/KEK.auth` },
		db: { type: "file", file: `sbkeys${step}/db.auth` },
		dbx: { type: "file", file: `sbkeys${step}/dbx.auth` },
		pk: [{ type: "file", file: `sbkeys${step}/PK.auth` }, ...(step === "2" ? [{ type: "file" as const, file: `sbkeys${step}/PK2.auth` }] : [])],
	},
	hashComponents: [
		{ type: "random", length: 64 },
		{ type: "efivar", guid: "8be4df61-93ca-11d2-aa0d-00e098032b8c", name: "Lang", value: { type: "binary", buffer: "eng\0" } },
		{ type: "efivar", guid: EFI_VAR_PK.guid, name: "SecureBoot", value: { type: "binary", buffer: "\x01" } },
		EFI_VAR_PK,
		EFI_VAR_KEK,
		EFI_VAR_DB,
		EFI_VAR_DBX,
		{ type: "efivar", guid: "8be4df61-93ca-11d2-aa0d-00e098032b8c", name: "SetupMode", value: { type: "binary", buffer: "\0" } },
		{ type: "efivar", guid: "6f4e8ca1-6115-416e-9e92-db2e142a882c", name: "MissingVar", value: "missing" },
		{ type: "hd-size", value: hdSize },
		{ type: "hd-size", device: efiDevice, value: +efiSize * 512 },
		{ type: "hd-data", offsetRef: "start", offset: 0, value: { type: "file", file: "disk.img", offset: 0, size: (+efiStart + 1) * 512 } },
		{ type: "hd-data", offsetRef: "end", offset: 0, value: { type: "file", file: "disk.img", offset: hdSize - +efiStart * 512, size: +efiStart * 512 } },
		{ type: "file-size", file: "EFI\\Microsoft\\Boot\\bootmgfw.efi", value: "missing" },
		{ type: "file-size", file: "BOOTKEY1", value: "missing" },
		{ type: "file-data", file: "BOOTKEY1", value: { type: "missing" } },
		{ type: "file-size", file: "BOOTKEY2", value: bootkey.length },
		{ type: "file-data", file: "BOOTKEY2", value: { type: "buffer", buffer: bootkey } },
		{ type: "file-size", file: "BOOTKEY3", value: "missing" },
		{ type: "file-data", file: "BOOTKEY3", value: { type: "missing" } },
		{ type: "boot-hd-device", value: hdDevice },
		{ type: "boot-partition-device", value: efiDevice },
		{ type: "boot-file", value: "\\EFI\\BOOT\\BOOTX64.EFI" },
		{ type: "smbios", ref: "system-uuid", value: "a64a956a-d0bb-4e23-ba59-ce433d62d6af" },
		{ type: "smbios", ref: "system-serial-number", value: "5870ffcf263a44c6afe8277c84c5a537" },
		{ type: "random", length: 64 },
	],
};
export default config;
