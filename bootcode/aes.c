// Code initially coming from https://github.com/SIIR3X/aes-ni (and adapted)

#include "aes.h"

/**
 * @brief Helper function for AES-256 key expansion using AES-NI.
 *
 * This function expands two 128-bit key parts (total 256-bit key) into new
 * round key material. The expansion uses the result of _mm_aeskeygenassist_si128,
 * shuffling, and repeated left shifts with XOR to generate strong diffusion.
 *
 * @param temp1 [in/out] First half of the key being expanded.
 * @param temp2 [in/out] Output from _mm_aeskeygenassist_si128 using current RCON value.
 * @param temp3 [in/out] Second half of the key being expanded.
 */
static inline void aes256_key_assist(__m128i* temp1, __m128i* temp2, __m128i* temp3)
{
	__m128i temp4;
	
	// Expand temp1 (first half of the key)
	*temp2 = _mm_shuffle_epi32(*temp2, 0xFF); // Broadcast one word from keygen assist
	temp4 = _mm_slli_si128(*temp1, 0x4);
	*temp1 = _mm_xor_si128(*temp1, temp4);
	temp4 = _mm_slli_si128(temp4, 0x4);
	*temp1 = _mm_xor_si128(*temp1, temp4);
	temp4 = _mm_slli_si128(temp4, 0x4);
	*temp1 = _mm_xor_si128(*temp1, temp4);
	*temp1 = _mm_xor_si128(*temp1, *temp2); // Mix with assist result

	// Expand temp3 (second half of the key)
	temp4 = _mm_aeskeygenassist_si128(*temp1, 0x00); // Generate assist from updated temp1
	temp4 = _mm_shuffle_epi32(temp4, 0xAA); // Broadcast relevant word
	
	*temp3 = _mm_xor_si128(*temp3, _mm_slli_si128(*temp3, 0x4));
	*temp3 = _mm_xor_si128(*temp3, _mm_slli_si128(*temp3, 0x4));
	*temp3 = _mm_xor_si128(*temp3, _mm_slli_si128(*temp3, 0x4));
	*temp3 = _mm_xor_si128(*temp3, temp4); // Final mixing with assist
}

void aes256_key_expansion(const __m128i user_key[2], __m128i enc_round_keys[AES_256_NUM_ROUND_KEYS])
{
	__m128i temp1 = user_key[0]; // First half of the user key
	__m128i temp3 = user_key[1]; // Second half of the user key
	__m128i temp2;

	enc_round_keys[0] = temp1;
	enc_round_keys[1] = temp3;

	// Generate remaining 13 round keys
	temp2 = _mm_aeskeygenassist_si128(temp3, 0x01);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[2] = temp1;
	enc_round_keys[3] = temp3;

	temp2 = _mm_aeskeygenassist_si128(temp3, 0x02);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[4] = temp1;
	enc_round_keys[5] = temp3;

	temp2 = _mm_aeskeygenassist_si128(temp3, 0x04);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[6] = temp1;
	enc_round_keys[7] = temp3;

	temp2 = _mm_aeskeygenassist_si128(temp3, 0x08);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[8] = temp1;
	enc_round_keys[9] = temp3;

	temp2 = _mm_aeskeygenassist_si128(temp3, 0x10);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[10] = temp1;
	enc_round_keys[11] = temp3;

	temp2 = _mm_aeskeygenassist_si128(temp3, 0x20);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[12] = temp1;
	enc_round_keys[13] = temp3;

	temp2 = _mm_aeskeygenassist_si128(temp3, 0x40);
	aes256_key_assist(&temp1, &temp2, &temp3);
	enc_round_keys[14] = temp1;
}

void aes256_invert_round_keys(const __m128i enc_round_keys[AES_256_NUM_ROUND_KEYS], __m128i dec_round_keys[AES_256_NUM_ROUND_KEYS])
{
	// First decryption round key = last encryption round key
	dec_round_keys[0]  = enc_round_keys[14];

	// Apply aesimc to intermediate keys (in reverse order)
	dec_round_keys[1]  = _mm_aesimc_si128(enc_round_keys[13]);
	dec_round_keys[2]  = _mm_aesimc_si128(enc_round_keys[12]);
	dec_round_keys[3]  = _mm_aesimc_si128(enc_round_keys[11]);
	dec_round_keys[4]  = _mm_aesimc_si128(enc_round_keys[10]);
	dec_round_keys[5]  = _mm_aesimc_si128(enc_round_keys[9]);
	dec_round_keys[6]  = _mm_aesimc_si128(enc_round_keys[8]);
	dec_round_keys[7]  = _mm_aesimc_si128(enc_round_keys[7]);
	dec_round_keys[8]  = _mm_aesimc_si128(enc_round_keys[6]);
	dec_round_keys[9]  = _mm_aesimc_si128(enc_round_keys[5]);
	dec_round_keys[10] = _mm_aesimc_si128(enc_round_keys[4]);
	dec_round_keys[11] = _mm_aesimc_si128(enc_round_keys[3]);
	dec_round_keys[12] = _mm_aesimc_si128(enc_round_keys[2]);
	dec_round_keys[13] = _mm_aesimc_si128(enc_round_keys[1]);

	// Last decryption round key = first encryption round key
	dec_round_keys[14] = enc_round_keys[0];
}

void aes_context_init(aes_context_t* ctx, const uint8_t* key)
{
	__m128i key256[2] = {
		_mm_loadu_si128((const __m128i*)key),
		_mm_loadu_si128((const __m128i*)(key + 16))
	};
	__m128i enc_round_keys[AES_256_NUM_ROUND_KEYS];
	aes256_key_expansion(key256, enc_round_keys);
	aes256_invert_round_keys(enc_round_keys, ctx->dec_round_keys);
}

void aes256_decrypt_block(const __m128i ciphertext, __m128i* plaintext, const __m128i dec_round_keys[AES_256_NUM_ROUND_KEYS])
{
	// Initial AddRoundKey
	__m128i tmp = _mm_xor_si128(ciphertext, dec_round_keys[0]);

	// 13 standard AES decryption rounds
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[1]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[2]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[3]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[4]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[5]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[6]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[7]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[8]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[9]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[10]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[11]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[12]);
	tmp = _mm_aesdec_si128(tmp, dec_round_keys[13]);

	// Final round (AddRoundKey + SubBytes + ShiftRows)
	tmp = _mm_aesdeclast_si128(tmp, dec_round_keys[14]);

	// Store the result
	*plaintext = tmp;
}

void aes_cbc_decrypt(const aes_context_t* ctx, const uint8_t iv[16], const uint8_t* input, size_t input_len, uint8_t* output)
{
	if (!ctx || !iv || !input || !output || input_len % AES_BLOCK_SIZE != 0)
		return;

	// Load the initialization vector (IV) as the starting "previous ciphertext block"
	__m128i previous = _mm_loadu_si128((const __m128i*)iv);

	for (size_t i = 0; i < input_len; i += AES_BLOCK_SIZE)
	{
		// Get pointers to the current 16-byte input and output blocks
		const uint8_t* block_in = input + i;
		uint8_t* block_out = output + i;

		// Load ciphertext block into SSE register
		__m128i ciphertext = _mm_loadu_si128((const __m128i*)block_in);
		__m128i decrypted;

		// Call the decryption function from context (128, 192, or 256)
		aes256_decrypt_block(ciphertext, &decrypted, ctx->dec_round_keys);

		// XOR the decrypted block with the previous ciphertext block (or IV for the first block)
		__m128i plaintext = _mm_xor_si128(decrypted, previous);

		// Store the decrypted block into the output buffer
		_mm_storeu_si128((__m128i*)block_out, plaintext);

		// Update the previous ciphertext block for the next iteration
		previous = ciphertext;
	}
}

/**
 * @brief Removes PKCS#7 padding from a padded buffer.
 *
 * This function checks that all padding bytes at the end of the buffer
 * are equal to the padding length value. If the padding is invalid,
 * it returns 0.
 *
 * @param input Pointer to the padded input buffer.
 * @param input_len Total length of the input buffer (must be a multiple of block size).
 * @param pad_len Padding length (should be equal to the value of the last byte).
 * @return Length of the data after removing padding, or 0 if padding is invalid.
 */
static inline size_t aes_pcks7_unpad(uint8_t* input, size_t input_len, size_t pad_len)
{
	for (size_t i = 0; i < pad_len; ++i)
	{
		if (input[input_len - 1 - i] != pad_len)
			return 0;
	}

	return input_len - pad_len;
}

size_t aes_remove_padding(uint8_t* input, size_t input_len)
{
	if (input_len == 0 || input_len % AES_BLOCK_SIZE != 0)
		return 0;

	uint8_t pad_len = input[input_len - 1];

	return aes_pcks7_unpad(input, input_len, pad_len);
}
