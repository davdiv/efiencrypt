// Code initially coming from https://www.nayuki.io/page/fast-sha2-hashes-in-x86-assembly (and adapted)

#include <efi.h>
#include <efilib.h>
#include "sha.h"

void sha256_init(sha256_context_t *context)
{
  context->totalLen = 0;
  context->pendingBytes = 0;
  RtSetMem(context->pendingBlock, 64u, 0);
  context->hash[0] = UINT32_C(0x6A09E667);
  context->hash[1] = UINT32_C(0xBB67AE85);
  context->hash[2] = UINT32_C(0x3C6EF372);
  context->hash[3] = UINT32_C(0xA54FF53A);
  context->hash[4] = UINT32_C(0x510E527F);
  context->hash[5] = UINT32_C(0x9B05688C);
  context->hash[6] = UINT32_C(0x1F83D9AB);
  context->hash[7] = UINT32_C(0x5BE0CD19);
}

void sha256_update(sha256_context_t *context, const uint8_t message[], size_t len)
{
  size_t off = 0;
  context->totalLen += len;
  if (context->pendingBytes > 0)
  {
    size_t totalPendingBytes = context->pendingBytes + len;
    off = totalPendingBytes > 64u ? 64u - context->pendingBytes : len;
    RtCopyMem(&context->pendingBlock[context->pendingBytes], message, off);
    context->pendingBytes += off;
    if (totalPendingBytes < 64u)
      return;
    sha256_compress(context->pendingBlock, context->hash);
    context->pendingBytes = 0;
    RtSetMem(context->pendingBlock, 64u, 0);
  }

  for (; len - off >= 64u; off += 64u)
    sha256_compress(&message[off], context->hash);

  size_t rem = len - off;
  if (rem > 0)
  {
    context->pendingBytes = rem;
    RtCopyMem(context->pendingBlock, &message[off], rem);
  }
}

void sha256_finalize(sha256_context_t *context)
{
  size_t rem = context->pendingBytes;
  context->pendingBlock[rem] = 0x80;
  rem++;
  if (64u - rem < 8)
  {
    sha256_compress(context->pendingBlock, context->hash);
    RtSetMem(context->pendingBlock, 64u, 0);
  }

  size_t len = context->totalLen;
  context->pendingBlock[64u - 1] = (uint8_t)((len & 0x1FU) << 3);
  len >>= 5;
  for (int i = 1; i < 8; i++, len >>= 8)
    context->pendingBlock[64u - 1 - i] = (uint8_t)(len & 0xFFU);

  sha256_compress(context->pendingBlock, context->hash);
}
