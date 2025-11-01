#include <efi.h>
#include <efilib.h>
#include "sha.h"

#define FREE_POOL(pool) \
  FreePool(pool);       \
  pool = NULL
#define PRINT_ERROR() Print(errorMsg, __LINE__, EFI_ERROR(status) ? status : EFI_DEVICE_ERROR)
#define HANDLE_PROTOCOL(handle, guid, result) status = uefi_call_wrapper(gBS->OpenProtocol, 6, handle, &guid, result, image_handle, NULL, EFI_OPEN_PROTOCOL_GET_PROTOCOL)
#define CHECK_ERROR(extraCondition)        \
  if (EFI_ERROR(status) || extraCondition) \
  {                                        \
    PRINT_ERROR();                         \
    return -1;                             \
  }

extern wchar_t *errorMsg;
extern uint8_t enc_payload[];
extern size_t enc_payload_len;
extern uint8_t iv[];
extern size_t iv_len;
EFI_STATUS gen_compute_hash(sha256_context_t *context, EFI_HANDLE image_handle);
