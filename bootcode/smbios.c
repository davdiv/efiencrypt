// Code initially coming from GNU-EFI (and adapted)

#include "smbios.h"

EFI_STATUS
smbios_hashValue(sha256_context_t *hash, UINT8 searchType, UINT8 type, UINT8 index, UINT8 offset, UINT8 size)
{
  EFI_STATUS Status;
  SMBIOS_STRUCTURE_TABLE *SmbiosTable;
  SMBIOS_STRUCTURE_POINTER Smbios;
  SMBIOS_STRUCTURE_POINTER SmbiosEnd;
  UINT16 TableIndex;

  Status = LibGetSystemConfigurationTable(&SMBIOSTableGuid, (VOID **)&SmbiosTable);
  if (EFI_ERROR(Status))
  {
    return EFI_NOT_FOUND;
  }

  Smbios.Hdr = (SMBIOS_HEADER *)SmbiosTable->TableAddress;
  SmbiosEnd.Raw = (UINT8 *)((UINTN)SmbiosTable->TableAddress + SmbiosTable->TableLength);
  for (TableIndex = 0; TableIndex < SmbiosTable->TableLength; TableIndex++)
  {
    if (searchType == 0 ? (Smbios.Hdr->Type == type && index-- == 0) : (Smbios.Hdr->Handle[0] == type && Smbios.Hdr->Handle[1] == index))
    {
      if (Smbios.Hdr->Length < offset + (size || 1))
      {
        return EFI_SUCCESS;
      }

      if (size == 0)
      {
        CHAR8 *str = LibGetSmbiosString(&Smbios, *(Smbios.Raw + offset));
        sha256_update(hash, str, strlena(str) + 1);
      }
      else
      {
        sha256_update(hash, (void *)Smbios.Raw + offset, size);
      }

      return EFI_SUCCESS;
    }

    //
    // Make Smbios point to the next record
    //
    LibGetSmbiosString(&Smbios, -1);

    if (Smbios.Raw >= SmbiosEnd.Raw)
    {
      return EFI_SUCCESS;
    }
  }
  return EFI_SUCCESS;
}