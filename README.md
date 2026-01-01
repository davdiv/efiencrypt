# efiencrypt

[![npm](https://img.shields.io/npm/v/efiencrypt)](https://www.npmjs.com/package/efiencrypt)

**Encrypts an EFI binary using a hash derived from user-defined data (random data, disk sectors, SMBIOS fields, EFI variables, ...). The resulting EFI can also optionally embed secure boot keys to enroll if the system is in setup mode.**

`efiencrypt` is a small utility that:

- Computes a cryptographic key: the SHA-256 hash of a collection of "hash components" (random data, disk sectors, SMBIOS fields, ...).
- Encrypts an input EFI binary with this cryptographic key (using AES-256-CBC)
- Generates code that
  - embeds the encrypted EFI binary, the random hash components and the random initialization vector
  - computes again the cryptographic key from the various "hash components" at boot time, thanks to the code coming from [this fast SHA-256 implementation](https://www.nayuki.io/page/fast-sha2-hashes-in-x86-assembly)
  - decrypts the encrypted EFI binary, thanks to the code coming from [this fast AES implementation](https://github.com/SIIR3X/aes-ni)
- Builds the code with [GNU-EFI](https://sourceforge.net/projects/gnu-efi/)

The resulting EFI can be booted with QEMU or any UEFI firmware.

It is also possible to embed secure boot keys in the resulting EFI that will be enrolled automatically before computing the hash, if the system is in setup mode. In that case, it is usually required to also sign both the input EFI binary and the resulting EFI.

## Installation

```bash
# Install globally (so that `efiencrypt` becomes a CLI command)
npm install -g efiencrypt

# Or use it locally in a project
npm install efiencrypt
```

The `efiencrypt` command is exposed on the path when installed globally.

## Usage

### CLI

Check `efiencrypt --help` for the full list of options.

Simplest usage:

```bash
# Use the default random 32-bytes hash component:
efiencrypt -i input.efi -o output.efi
```

Usage with SMBIOS dump:

```bash
# Extracts smbios data from the computer:
dmidecode --dump-bin smbios.bin
# Use the default system-serial-number and system-uuid SMBIOS fields:
efiencrypt -i input.efi -s smbios.bin -o output.efi
```

Usage with a configuration file:

```bash
efiencrypt -c config.ts
```

Options passed on the command line override values in the config file.

### Configuration file

The configuration file can be a `.json`, `.js` or even `.ts` file (any file accepted in [`require`](https://nodejs.org/api/modules.html#requireid) by node.js).

It should export a `Config` object.

See [`test/config.ts`](test/config.ts) for a comprehensive example.

```ts
// config.ts
import type { Config } from "efiencrypt";

const config: Config = {
	inputFile: "input.efi",
	outputFile: "output.efi",
	hashComponents: [
		{ type: "random", length: 64 },
		// ...
	],
};

export default config;
```

### API

The package exports a `build` function to run the build programmatically:

```ts
import { build } from "efiencrypt";

await build({
	inputFile: "input.efi",
	outputFile: "output.efi",
	hashComponents: [
		{ type: "random", length: 64 },
		// ...
	],
});
```
