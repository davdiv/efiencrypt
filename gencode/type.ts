import type { SmbiosFieldRef } from "./smbios";

export type BigNumber = number | string;

export interface BinaryDataFromFile {
	type: "file";
	file: string;
	offset?: number;
	size?: number;
}

export interface BinaryDataFromLiteral {
	type: BufferEncoding;
	buffer: string;
}

export interface BinaryDataFromBuffer {
	type: "buffer";
	/**
	 * @TJS-type object
	 */
	buffer: Buffer;
}

export interface BinaryMissingData {
	type: "missing";
	size?: number;
}

export type BinaryData = BinaryDataFromFile | BinaryDataFromLiteral | BinaryDataFromBuffer;

export interface HashComponentRandom {
	type: "random";
	length: number;
}

export interface HashEfiVariable {
	type: "efivar";
	guid: string;
	name: string;
	value: BinaryData;
}

export interface HashComponentSmbios {
	type: "smbios";
	ref: SmbiosFieldRef;
	value?: string;
}

export interface HashComponentHardDiskData {
	type: "hd-data";
	device?: string;
	offsetRef: "start" | "end";
	offset: BigNumber;
	value: BinaryData | BinaryMissingData;
}

export interface HashComponentHardDiskSize {
	type: "hd-size";
	device?: string;
	value: BigNumber | "missing";
}

export interface HashComponentFileData {
	type: "file-data";
	device?: string;
	file: string;
	offsetRef?: "start" | "end" | "full";
	offset?: BigNumber;
	value: BinaryData | BinaryMissingData;
}

export interface HashComponentFileSize {
	type: "file-size";
	device?: string;
	file: string;
	value: BigNumber | "missing";
}

export interface HashComponentMiscStringData {
	type: "boot-hd-device" | "boot-partition-device" | "boot-file";
	value: string;
}

export type HashComponent =
	| HashComponentRandom
	| HashEfiVariable
	| HashComponentSmbios
	| HashComponentFileData
	| HashComponentFileSize
	| HashComponentHardDiskData
	| HashComponentHardDiskSize
	| HashComponentMiscStringData;

export interface SecureBootEnrollConfig {
	kek: BinaryData;
	db: BinaryData;
	pk: BinaryData;
}

export interface Config {
	$schema?: string;

	/**
	 * Path to the input efi file to embed.
	 */
	inputFile: string;

	/**
	 * Path to the output efi file to write.
	 */
	outputFile?: string;

	/**
	 * Whether to skip generating code
	 */
	skipGenCode?: boolean;

	/**
	 * Whether to skip extracting source code
	 * (can be useful if the extraction was already done)
	 */
	skipExtract?: boolean;

	/**
	 * Whether to skip calling make
	 * (can be useful to change the code before calling make)
	 */
	skipMake?: boolean;

	/**
	 * Folder where to build the code.
	 * Defaults to a temporary folder that is removed when the build is finished.
	 */
	buildFolder?: string;

	/**
	 * Data to include in the hash for encryption.
	 */
	hashComponents?: HashComponent[];

	/**
	 * Path to the input smbios dump file.
	 * Can be produced by: dmidecode --dump-bin <filePath>
	 */
	smbios?: string;

	/**
	 * Secure boot keys to enroll automatically if the system is in setup mode.
	 */
	enrollSecureBoot?: SecureBootEnrollConfig;
}
