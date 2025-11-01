#include <efi.h>
#include <efilib.h>

#ifndef SHA_H
#define SHA_H

typedef struct
{
  uint32_t totalLen;
  uint8_t pendingBytes;
  uint8_t pendingBlock[64];
  uint32_t hash[8];
} sha256_context_t;

void sha256_init(sha256_context_t *context);
void sha256_update(sha256_context_t *context, const uint8_t message[], size_t len);
void sha256_finalize(sha256_context_t *context);
void sha256_compress(const uint8_t block[64], uint32_t state[8]);

#endif