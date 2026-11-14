# SAP2000 CSI text import fixtures

Original files uploaded by the project owner, who asked for them to be published in the NexFEM repository as-is (2026-11-14). They are preserved byte-for-byte: CRLF line endings, the Windows save path on the first line, model content and non-ASCII characters (`Ω` in combination names, UTF-8). `.gitattributes` marks `tests/fixtures/csi/**` as `-text`, so Git does not normalise them.

| File | Original name (first line of the file) | Program | Units (`CurrUnits`) | Size | Lines | SHA-256 | Git blob SHA-1 |
|---|---|---|---|---|---|---|---|
| [`24061_OMF.s2k`](./24061_OMF.s2k) | `24061_OMF.$2k` | SAP2000 **23.1.0** | `lb, ft, F` | 322239 B | 2246 | `a82f456fce94fdb373271c37ab2a0f2125c614269ec47c626f4f5f66ce2bce98` | `ad26ed56515493bad87b908e8e1cf78256a78a26` |
| [`Roof_model.2k`](./Roof_model.2k) | `Roof model.$2k` | SAP2000 **25.3.1** | `Kip, ft, F` | 194135 B | 1322 | `bb0ad5cc88e46f99deab8b1ed83e530c22dc2d9c31debbfee4369d9226d62a28` | `bfb81fdd46c182dccf4a78dd437da68701b47c47` |
| [`Roof_model.sdb`](./Roof_model.sdb) | — (binary model database) | SAP2000 **25.3.1** | — | 45550 B | — | `dcd43f13133659fb1ee517e0e06eea6266850173202f6a079ce0ac176741b536` | `ddeabde7a8ec57183afc1dcbfa6058a481b3dc5a` |

## What each file covers

- **24061_OMF.s2k**: a plane frame in the YZ plane (2 columns W14X211 rotated 90°, 1 beam W12X336 with M3 partial fixity at both ends and cardinal point 8), with inactive degrees of freedom UX, RY, RZ. It also holds 273 AISC W shapes with tabulated A, I33, I22, J, AS2, AS3; 53 load patterns, 12 cases and 87 combinations (two envelopes nest other combinations); distributed and point frame loads; and joint forces.
- **Roof_model.2k**: a small roof made of 13 W-shape frames and 4 area objects with section `None`, which carry gravity and local-3 wind loads. A roller support sits at joint 9. Of the 132 W shapes, 31 have `FilletRadius=0` even though their tabulated A, I and J include the fillets.
- **Roof_model.sdb**: the binary model database of the same roof. It starts with `SAP2000` and the version, each in a 16-byte field, followed by a PNG thumbnail and CSI's proprietary data. NexFEM does not read it; it is used to check that the importer recognises the file and tells the user to export `.s2k` from SAP2000.

Tests: `packages/io-formats/test/s2k-fixture.test.ts`. Mapping rules and limitations are documented in [`docs/csi-import.md`](../../../../docs/csi-import.md).

These files are inputs for **parser and mapping tests**. They are not validated reference results, because no SAP2000 displacement, reaction or force output has been provided. Do not modify them in place; write generated or normalised variants as separate files.
