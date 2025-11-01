#include "sha.h"

EFI_STATUS
smbios_hashValue(sha256_context_t *hash, UINT8 searchType, UINT8 type, UINT8 index, UINT8 offset, UINT8 size);
