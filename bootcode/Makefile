# cf https://wiki.osdev.org/GNU-EFI

CFLAGS=-Ignu-efi/inc -fpic -ffreestanding -fno-stack-protector -fno-stack-check -fshort-wchar -mno-red-zone -maccumulate-outgoing-args -std=c11 -Wall -Wextra -O3 -march=x86-64 -maes -msse2 -mssse3 -mpclmul
LDFLAGS=-O3 -shared -Bsymbolic -Lgnu-efi/x86_64/lib -Lgnu-efi/x86_64/gnuefi -Tgnu-efi/gnuefi/elf_x86_64_efi.lds gnu-efi/x86_64/gnuefi/crt0-efi-x86_64.o
OCFLAGS=--strip-unneeded -j .text -j .sdata -j .data -j .rodata -j .dynamic -j .dynsym  -j .rel -j .rela -j .rel.* -j .rela.* -j .reloc --target efi-app-x86_64 --subsystem=10

all: gnuefi bootx64.efi

gnuefi:
	make -C gnu-efi gnuefi

main.o aes.o sha.o sha-asm.o smbios.o gen-code.o: main.c aes.c sha.c sha-asm.S smbios.c gen-code.c *.h
	gcc $(CFLAGS) -c main.c aes.c sha.c sha-asm.S smbios.c gen-code.c

main.so: main.o aes.o sha.o sha-asm.o smbios.o gen-code.o
	ld $(LDFLAGS) main.o aes.o sha.o sha-asm.o smbios.o gen-code.o -lgnuefi -lefi -o main.so

bootx64.efi: main.so
	objcopy  $(OCFLAGS) main.so bootx64.efi

clean:
	rm -f *.o *.so bootx64.efi
