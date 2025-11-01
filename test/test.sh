#!/bin/bash
set -e

REPODIR="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"

cd "$REPODIR/test"
rm -f disk.img fat.img
truncate -s 100G disk.img
fdisk disk.img << EOF
g
n
1
2048
+50M
n
2


t
1
1
x
u
1
CCFEACB5-A85F-4F23-95E9-794387DCCF0E
p
r
w
EOF
truncate -s 50M fat.img
mkfs.fat -F32 fat.img
dd if=fat.img of=disk.img conv=notrunc seek=2048
rm fat.img

EFI=disk.img@@1M
mmd -i "$EFI" ::/EFI ::/EFI/BOOT

../dist/efiencrypt -c config.ts

mcopy -i "$EFI" bootkey.img ::/BOOTKEY2
mcopy -i "$EFI" startup.nsh ::/startup.nsh
mcopy -i "$EFI" ../bootcode/bootx64.efi ::/EFI/BOOT/BOOTX64.EFI

qemu-system-x86_64 \
  -nographic \
  -cpu max \
  -m 4G \
  -machine q35 \
  -smbios type=1,serial=5870ffcf263a44c6afe8277c84c5a537,uuid=a64a956a-d0bb-4e23-ba59-ce433d62d6af \
  -drive if=pflash,format=raw,unit=0,file=${OVMF_PATH:-/usr/share/ovmf/x64/OVMF_CODE.4m.fd},readonly=on \
  -drive format=raw,file=disk.img,if=none,id=drv0 \
  -device virtio-scsi-pci,addr=4 \
  -device scsi-hd,drive=drv0,bootindex=0 \
  -boot menu=on \
  | tee output.log

grep "^EFIENCRYPT-BOOT-ALL-OK" output.log
