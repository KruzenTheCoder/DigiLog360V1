/// RSA public keys and constants used for South African driver's license parsing.
///
/// This file contains the cryptographic keys and magic bytes used to decrypt
/// and parse South African driver's license data from PDF417 barcodes.
library;

/// RSA public key (128-bit) for version 1 licenses.
///
/// This key is used to decrypt the first 5 blocks of v1 license data.
const String kPublicKeyV1_128 =
    'MIGXAoGBAP7S4cJ+M2MxbncxenpSxUmBOVGGvkl0dgxyUY1j4FRKSNCIszLFsMNwx2XWXZg8H53gpCsxDMwHrncL0rYdak3M6sdXaJvcv2CEePrzEvYIfMSWw3Ys9cRlHK7No0mfrn7bfrQOPhjrMEFw6R7VsVaqzm9DLW7KbMNYUd6MZ49nAhEAu3l//ex/nkLJ1vebE3BZ2w==';

/// RSA public key (74-bit) for version 1 licenses.
///
/// This key is used to decrypt the final block of v1 license data.
const String kPublicKeyV1_74 =
    'MGACSwD/POxrX0Djw2YUUbn8+u866wbcIynA5vTczJJ5cmcWzhW74F7tLFcRvPj1tsj3J221xDv6owQNwBqxS5xNFvccDOXqlT8MdUxrFwIRANsFuoItmswz+rfY9Cf5zmU=';

/// RSA public key (128-bit) for version 2 licenses.
///
/// This key is used to decrypt the first 5 blocks of v2 license data.
const String kPublicKeyV2_128 =
    'MIGWAoGBAMqfGO9sPz+kxaRh/qVKsZQGul7NdG1gonSS3KPXTjtcHTFfexA4MkGAmwKeu9XeTRFgMMxX99WmyaFvNzuxSlCFI/foCkx0TZCFZjpKFHLXryxWrkG1Bl9++gKTvTJ4rWk1RvnxYhm3n/Rxo2NoJM/822Oo7YBZ5rmk8NuJU4HLAhAYcJLaZFTOsYU+aRX4RmoF';

/// RSA public key (74-bit) for version 2 licenses.
///
/// This key is used to decrypt the final block of v2 license data.
const String kPublicKeyV2_74 =
    'MF8CSwC0BKDfEdHKz/GhoEjU1XP5U6YsWD10klknVhpteh4rFAQlJq9wtVBUc5DqbsdI0w/bga20kODDahmGtASy9fae9dobZj5ZUJEw5wIQMJz+2XGf4qXiDJu0R2U4Kw==';

/// Magic bytes identifying version 1 license format.
///
/// These bytes appear at the start of the encrypted data for v1 licenses.
const List<int> kLicenseVersionV1Header = [0x01, 0xe1, 0x02, 0x45];

/// Magic bytes identifying version 2 license format.
///
/// These bytes appear at the start of the encrypted data for v2 licenses.
const List<int> kLicenseVersionV2Header = [0x01, 0x9b, 0x09, 0x45];

/// Size of the header containing version information (in bytes).
const int kHeaderSize = 6;

/// Size of RSA encryption blocks using the 128-bit key (in bytes).
const int kBlockSize128 = 128;

/// Size of RSA encryption blocks using the 74-bit key (in bytes).
const int kBlockSize74 = 74;

/// Number of 128-byte blocks to decrypt.
const int kNumberOf128Blocks = 5;

/// Delimiter byte indicating field separation.
const int kDelimiterField = 0xe0;

/// Delimiter byte indicating section end.
const int kDelimiterSection = 0xe1;

/// Marker byte indicating the start of string data section.
const int kStringDataMarker = 0x82;

/// Marker byte indicating the end of binary date section.
const int kBinaryDataEndMarker = 0x57;

/// Length of South African ID number (in characters).
const int kIdNumberLength = 13;

/// Number of vehicle code issue dates to parse.
const int kVehicleCodeIssueDatesCount = 4;

/// Number of initial vehicle codes to read.
const int kInitialVehicleCodesCount = 4;

/// Nibble value indicating an empty/null date field.
const int kEmptyDateNibble = 10;

/// Gender code for male.
const String kGenderCodeMale = '01';

/// Gender code for female.
const String kGenderCodeFemale = '02';
