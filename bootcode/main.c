#include <efi.h>
#include <efilib.h>
#include "aes.h"
#include "gen-code.h"

wchar_t *errorMsg = L"Error %d: %r\n";

EFI_STATUS
efi_main(EFI_HANDLE image_handle, EFI_SYSTEM_TABLE *system_table)
{
    EFI_STATUS status = 0;

    InitializeLib(image_handle, system_table);

    UINT8 *payload = AllocatePool(enc_payload_len);
    CHECK_ERROR(!payload);

    sha256_context_t hash;
    sha256_init(&hash);
    status = gen_compute_hash(&hash, image_handle);
    sha256_finalize(&hash);

    aes_context_t decCTX;
    aes_context_init(&decCTX, (uint8_t *)hash.hash);
    aes_cbc_decrypt(
        &decCTX,
        iv,
        enc_payload,
        enc_payload_len,
        payload);
    sha256_init(&hash); // erase the key just after decryption
    size_t payload_len = aes_remove_padding(payload, enc_payload_len);

    EFI_GUID GUID_LOADED_IMAGE = EFI_LOADED_IMAGE_PROTOCOL_GUID;
    EFI_GUID GUID_DEVICE_PATH = EFI_DEVICE_PATH_PROTOCOL_GUID;
    EFI_LOADED_IMAGE_PROTOCOL *loadedImage = NULL;
    EFI_DEVICE_PATH_PROTOCOL *bootDevice = NULL;
    HANDLE_PROTOCOL(image_handle, GUID_LOADED_IMAGE, &loadedImage);
    if (loadedImage) {
        HANDLE_PROTOCOL(loadedImage->DeviceHandle, GUID_DEVICE_PATH, &bootDevice);
    }

    EFI_HANDLE payloadHandle = NULL;
    status = uefi_call_wrapper(gBS->LoadImage, 6,
                               FALSE,
                               image_handle,
                               bootDevice,
                               payload,
                               payload_len,
                               &payloadHandle);
    CHECK_ERROR(!payloadHandle);

    FREE_POOL(payload);

    status = uefi_call_wrapper(gBS->StartImage, 3, payloadHandle, NULL, NULL);
    CHECK_ERROR(0);

    return 0;
}
