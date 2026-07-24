/// RSA decryption for South African driver's license data.
library;

import 'dart:convert';
import 'dart:typed_data';
import 'package:pointycastle/pointycastle.dart' as pointy;

import 'constants.dart';
import 'exceptions/sadl_exceptions.dart';
import 'utils/binary_utils.dart';

/// Handles decryption of South African driver's license data.
///
/// South African driver's licenses encode data in a PDF417 barcode that is
/// encrypted using RSA public key cryptography. This class handles the
/// decryption process for both v1 and v2 license formats.
class SadlDecryptor {
  /// Decrypts South African driver's license data.
  ///
  /// The input [data] should be the raw bytes extracted from the PDF417 barcode.
  /// The first 6 bytes contain version information and determine which RSA keys
  /// to use for decryption.
  ///
  /// The encrypted data consists of:
  /// - 6-byte header (version identifier)
  /// - 5 blocks of 128 bytes each (encrypted with 128-bit key)
  /// - 1 block of 74 bytes (encrypted with 74-bit key)
  ///
  /// Example:
  /// ```dart
  /// final decryptor = SadlDecryptor();
  /// final encryptedData = Uint8List.fromList([...]); // From barcode scan
  /// final decryptedData = decryptor.decrypt(encryptedData);
  /// ```
  ///
  /// Throws [InvalidInputDataException] if data is too short or null.
  /// Throws [UnsupportedLicenseVersionException] if the version is not recognized.
  /// Throws [SadlDecryptionException] if decryption fails.
  Uint8List decrypt(Uint8List data) {
    // Validate input
    _validateInput(data);

    // Extract and validate version header
    final header = data.sublist(0, kHeaderSize);
    final keys = _selectKeysForVersion(header);

    try {
      // Parse RSA public keys
      final publicKey128 = _parsePublicKeyFromPem(keys['pk128']!);
      final publicKey74 = _parsePublicKeyFromPem(keys['pk74']!);

      // Decrypt blocks
      return _decryptBlocks(data, publicKey128, publicKey74);
    } catch (e) {
      if (e is SadlException) {
        rethrow;
      }
      throw SadlDecryptionException('Failed to decrypt license data', e);
    }
  }

  /// Validates the input data meets minimum requirements.
  void _validateInput(Uint8List data) {
    const minDataLength =
        kHeaderSize + (kNumberOf128Blocks * kBlockSize128) + kBlockSize74;

    if (data.isEmpty) {
      throw const InvalidInputDataException('Input data is empty');
    }

    if (data.length < minDataLength) {
      throw InvalidInputDataException(
        'Input data too short. Expected at least $minDataLength bytes, got ${data.length}',
      );
    }
  }

  /// Selects the appropriate RSA keys based on the license version header.
  ///
  /// Returns a map with keys 'pk128' and 'pk74' containing the PEM strings.
  Map<String, String> _selectKeysForVersion(Uint8List header) {
    // Check for version 1
    if (_headerMatches(header, kLicenseVersionV1Header)) {
      return {
        'pk128': kPublicKeyV1_128,
        'pk74': kPublicKeyV1_74,
      };
    }

    // Check for version 2
    if (_headerMatches(header, kLicenseVersionV2Header)) {
      return {
        'pk128': kPublicKeyV2_128,
        'pk74': kPublicKeyV2_74,
      };
    }

    // Unknown version
    throw UnsupportedLicenseVersionException(header.sublist(0, 4));
  }

  /// Checks if the header matches the expected version bytes.
  bool _headerMatches(Uint8List header, List<int> expectedVersion) {
    return header[0] == expectedVersion[0] &&
        header[1] == expectedVersion[1] &&
        header[2] == expectedVersion[2] &&
        header[3] == expectedVersion[3];
  }

  /// Decrypts all data blocks using the provided RSA keys.
  ///
  /// Decrypts 5 blocks with the 128-bit key, then 1 block with the 74-bit key.
  Uint8List _decryptBlocks(
    Uint8List data,
    pointy.RSAPublicKey publicKey128,
    pointy.RSAPublicKey publicKey74,
  ) {
    var decrypted = Uint8List(0);
    var offset = kHeaderSize;

    // Decrypt 128-byte blocks
    for (var i = 0; i < kNumberOf128Blocks; i++) {
      final block = data.sublist(offset, offset + kBlockSize128);
      final decryptedBlock = _processBlock(block, publicKey128);
      decrypted = Uint8List.fromList([...decrypted, ...decryptedBlock]);
      offset += kBlockSize128;
    }

    // Decrypt final 74-byte block
    final finalBlock = data.sublist(offset, offset + kBlockSize74);
    final decryptedFinalBlock = _processBlock(finalBlock, publicKey74);
    decrypted = Uint8List.fromList([...decrypted, ...decryptedFinalBlock]);

    return decrypted;
  }

  /// Processes (decrypts) a single block using RSA public key.
  ///
  /// The "decryption" is actually encryption with the public key,
  /// which undoes the "encryption" that was done with the private key
  /// (a signature verification operation).
  Uint8List _processBlock(Uint8List block, pointy.RSAPublicKey publicKey) {
    try {
      final input = uint8ListToBigInt(block);
      final output = input.modPow(publicKey.exponent!, publicKey.modulus!);
      return bigIntToUint8List(output);
    } catch (e) {
      throw SadlDecryptionException('Failed to process encryption block', e);
    }
  }

  /// Parses an RSA public key from a PEM-encoded string.
  ///
  /// The PEM string should be the base64-encoded ASN.1 DER format
  /// (without the BEGIN/END markers).
  pointy.RSAPublicKey _parsePublicKeyFromPem(String pemString) {
    try {
      final derBytes = base64Decode(pemString);
      final asn1Parser = pointy.ASN1Parser(derBytes);
      final topLevelSeq = asn1Parser.nextObject() as pointy.ASN1Sequence;

      final modulus = topLevelSeq.elements![0] as pointy.ASN1Integer;
      final exponent = topLevelSeq.elements![1] as pointy.ASN1Integer;

      return pointy.RSAPublicKey(
        modulus.integer!,
        exponent.integer!,
      );
    } catch (e) {
      throw SadlDecryptionException('Failed to parse RSA public key', e);
    }
  }
}
