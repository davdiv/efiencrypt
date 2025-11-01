// Code initially coming from https://github.com/SIIR3X/aes-ni (and adapted)

#include <efi.h>
#include <efilib.h>
#include <emmintrin.h>
#include <wmmintrin.h>

/// AES block size in bytes (128 bits)
#define AES_BLOCK_SIZE 16

/// Number of encryption rounds for AES-256
#define AES_256_NUM_ROUNDS 14

/// Total number of round keys (128-bit words) for AES-256
#define AES_256_NUM_ROUND_KEYS (AES_256_NUM_ROUNDS + 1)

/**
 * @brief AES context structure containing round keys for encryption and decryption.
 *
 * This structure can be initialized with `aes_context_init()` and reused across
 * encryption/decryption operations for performance.
 */
typedef struct {
	__m128i dec_round_keys[AES_256_NUM_ROUND_KEYS]; ///< Expanded decryption round keys (same count as enc keys)
} aes_context_t;

/**
 * @brief Decrypts a single 128-bit block using AES-256.
 *
 * @param ciphertext Input 16-byte block to decrypt.
 * @param plaintext Output pointer to receive the decrypted 16-byte block.
 * @param dec_round_keys Array of 15 decryption round keys.
 */
void aes256_decrypt_block(const __m128i ciphertext, __m128i* plaintext, const __m128i dec_round_keys[AES_256_NUM_ROUND_KEYS]);

/**
 * @brief Initializes an AES context by expanding the encryption and decryption keys.
 *
 * @param ctx Pointer to the AES context to initialize.
 * @param key Raw AES key (must be 32 bytes).
 * @return 0 on success, non-zero on failure (e.g., invalid key size or null pointers).
 */
void aes_context_init(aes_context_t* ctx, const uint8_t* key);

/**
 * @brief Decrypts a buffer using AES in CBC mode.
 *
 * The input must be a multiple of 16 bytes (AES block size).
 * Padding removal must be handled externally after decryption.
 * The IV must be the same as used during encryption.
 *
 * @param ctx Pointer to a valid AES context (initialized with aes_context_init).
 * @param iv 16-byte initialization vector (IV) used during encryption. Must not be NULL.
 * @param input Pointer to the ciphertext buffer.
 * @param input_len Length of the input in bytes (must be a multiple of 16).
 * @param output Pointer to the buffer that will receive the plaintext.
 *               It must be at least input_len bytes long.
 */
void aes_cbc_decrypt(const aes_context_t* ctx, const uint8_t iv[16], const uint8_t* input, size_t input_len, uint8_t* output);

/**
 * @brief Removes padding from a previously padded buffer.
 *
 * This function inspects the final block of data and validates the padding
 * according to the selected scheme. It returns the original length of the
 * unpadded data.
 *
 * @param input Pointer to the padded buffer.
 * @param input_len Total length of the buffer in bytes (must be a multiple of AES block size).
 * @return The length of the data after removing padding, or 0 if padding is invalid.
 */
size_t aes_remove_padding(uint8_t* input, size_t input_len);
