#!/bin/bash
set -e

REPODIR="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"

cd "$REPODIR/test"
if ! [ -d sbkeys ]; then
  mkdir -p sbkeys
  ( cd sbkeys && ../gensbkeys.sh )
fi
rm -f disk.img fat.img
cp ${OVMF_VARS_PATH:-/usr/share/ovmf/x64/OVMF_VARS.4m.fd} ovmf_vars.img
cp ${OVMF_CODE_PATH:-/usr/share/ovmf/x64/OVMF_CODE.secboot.4m.fd} ovmf_code.img
grub-mkimage -O x86_64-efi -p "" -o grub.unsigned.efi -c grub.cfg -- halt echo sleep
sbsign --key sbkeys/db.key --cert sbkeys/db.crt --output grub.efi grub.unsigned.efi
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

sbsign --key sbkeys/db.key --cert sbkeys/db.crt --output bootx64.efi ../bootcode/bootx64.efi
mcopy -i "$EFI" bootkey.img ::/BOOTKEY2
mcopy -i "$EFI" bootx64.efi ::/EFI/BOOT/BOOTX64.EFI

qemu-system-x86_64 \
  -nographic \
  -cpu max \
  -m 4G \
  -machine q35 \
  -smbios type=1,serial=5870ffcf263a44c6afe8277c84c5a537,uuid=a64a956a-d0bb-4e23-ba59-ce433d62d6af \
  -global driver=cfi.pflash01,property=secure,value=on \
  -drive if=pflash,format=raw,unit=0,file=ovmf_code.img,readonly=on \
  -drive if=pflash,format=raw,unit=1,file=ovmf_vars.img \
  -drive format=raw,file=disk.img,if=none,id=drv0 \
  -device virtio-scsi-pci,addr=4 \
  -device scsi-hd,drive=drv0,bootindex=0 \
  -boot menu=on \
  | tee output.log

grep "^EFIENCRYPT-BOOT-ALL-OK" output.log
