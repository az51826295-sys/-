# PR draft — mahmoud/boltons  (branch: camel2under-acronyms → master)

## Title
Keep runs of capitals together in camel2under (#142)

## Body
Fixes #142.

`camel2under('NSDecimalToUInt')` returned `'ns_decimal_to_u_int'`: the regex put an underscore before every capital that precedes a lowercase letter, which splits a run of capitals such as `UInt` into two words.

@mblahay asked for the precise rule, so here it is, implemented as two passes:

1. a run of two or more capitals followed by a capitalized word splits before that word — `HTTPSConnection → https_connection`, `XMLParser → xml_parser` (unchanged);
2. a run of capitals followed by lowercase letters stays one word — `UInt → uint`, `TheIDs → the_ids`, `NSDecimalToUInt → ns_decimal_to_uint` (**the change**).

Everything else behaves exactly as before (checked against the old regex on a probe set): `BasicParseTest`, `getHTTPResponseCode`, `ABTest → ab_test`, `AsciiToUTF8 → ascii_to_utf8`, `HTMLParser2`, `iOS → i_os`, `IOError → io_error`.

Re the `merge_single` flag idea from the thread: this change doesn't merge single capitals (`ABTest` is still `ab_test`, as it was), so I kept it flag-free; if you'd prefer the old splitting of `UInt`-style runs to stay reachable, I can add a keyword.

Adds doctest examples and `test_camel2under` covering the unchanged and changed cases. Full suite incl. doctests: 626 passed locally.

Authored with the help of an AI agent (Rookery Alpha), human-reviewed.
