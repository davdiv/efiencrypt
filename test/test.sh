#!/bin/bash
set -e

REPODIR="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"

cd "$REPODIR/test"
if ! [ -d sbkeys1 ]; then
  mkdir -p sbkeys1
  ( cd sbkeys1 && ../gensbkeys.sh )
fi
if ! [ -d sbkeys2 ]; then
  mkdir -p sbkeys2
  ( cd sbkeys2 && ../gensbkeys.sh )
  ( cd sbkeys1 && sign-efi-sig-list -g "$(< GUID.txt)" -k PK.key -c PK.crt PK ../sbkeys2/PK.esl ../sbkeys2/PK2.auth )
fi
rm -f disk.img fat.img
cp ${OVMF_VARS_PATH:-/usr/share/ovmf/x64/OVMF_VARS.4m.fd} ovmf_vars.img
cp ${OVMF_CODE_PATH:-/usr/share/ovmf/x64/OVMF_CODE.secboot.4m.fd} ovmf_code.img
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

grub-mkimage -O x86_64-efi -p "" -o grub1.unsigned.efi -c grub1.cfg -- halt echo sleep
sbsign --key sbkeys1/db.key --cert sbkeys1/db.crt --output grub1.efi grub1.unsigned.efi
STEP=1 ../dist/efiencrypt -c config.ts
sbsign --key sbkeys1/db.key --cert sbkeys1/db.crt --output bootx64.efi ../bootcode/bootx64.efi
mcopy -i "$EFI" bootkey.img ::/BOOTKEY2
mcopy -i "$EFI" bootx64.efi ::/EFI/BOOT/BOOTX64.EFI

grub-mkimage -O x86_64-efi -p "" -o grub2.unsigned.efi -c grub2.cfg -- halt echo sleep
sbsign --key sbkeys2/db.key --cert sbkeys2/db.crt --output grub2.efi grub2.unsigned.efi
STEP=2 ../dist/efiencrypt -c config.ts
sbsign --key sbkeys1/db.key --cert sbkeys1/db.crt --output bootx64.efi ../bootcode/bootx64.efi
sbsign --key sbkeys2/db.key --cert sbkeys2/db.crt --output bootx64.efi bootx64.efi

function startQEMU() {
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
}

startQEMU
grep "^EFIENCRYPT-BOOT-ALL-OK-STEP-1" output.log

mdel -i "$EFI" ::/BOOTKEY2
mdel -i "$EFI" ::/EFI/BOOT/BOOTX64.EFI
mcopy -i "$EFI" bootkey.img ::/BOOTKEY2
mcopy -i "$EFI" bootx64.efi ::/EFI/BOOT/BOOTX64.EFI

startQEMU
grep "^EFIENCRYPT-BOOT-ALL-OK-STEP-2" output.log

startQEMU
grep "^EFIENCRYPT-BOOT-ALL-OK-STEP-2" output.log
