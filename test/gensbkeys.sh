#!/bin/bash
set -e

# cf https://wiki.archlinux.org/title/Unified_Extensible_Firmware_Interface/Secure_Boot#Manual_process

# Platform key:
uuidgen --random > GUID.txt
openssl req -newkey rsa:4096 -nodes -keyout PK.key -new -x509 -sha256 -days 365242 -subj "/CN=Platform Key/" -out PK.crt
openssl x509 -outform DER -in PK.crt -out PK.cer
cert-to-efi-sig-list -g "$(< GUID.txt)" PK.crt PK.esl
sign-efi-sig-list -g "$(< GUID.txt)" -k PK.key -c PK.crt PK PK.esl PK.auth

# An empty file to allow removing Platform Key when in "User Mode":
sign-efi-sig-list -g "$(< GUID.txt)" -c PK.crt -k PK.key PK /dev/null noPK.auth

# Key Exchange Key:
openssl req -newkey rsa:4096 -nodes -keyout KEK.key -new -x509 -sha256 -days 365242 -subj "/CN=Key Exchange Key/" -out KEK.crt
openssl x509 -outform DER -in KEK.crt -out KEK.cer
cert-to-efi-sig-list -g "$(< GUID.txt)" KEK.crt KEK.esl
sign-efi-sig-list -g "$(< GUID.txt)" -k PK.key -c PK.crt KEK KEK.esl KEK.auth

# Signature Database key:
openssl req -newkey rsa:4096 -nodes -keyout db.key -new -x509 -sha256 -days 365242 -subj "/CN=Signature Database key/" -out db.crt
openssl x509 -outform DER -in db.crt -out db.cer
cert-to-efi-sig-list -g "$(< GUID.txt)" db.crt db.esl
sign-efi-sig-list -g "$(< GUID.txt)" -k KEK.key -c KEK.crt db db.esl db.auth
