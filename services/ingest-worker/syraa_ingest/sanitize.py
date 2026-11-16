"""Neutralise the untrusted-content delimiter in text extracted from PDFs.

The harness wraps everything the model reads from a document in an untrusted-data block
(packages/harness/src/untrusted.ts). Text stored here must never contain that tag, so a PDF cannot
forge the end of the block. The text itself is stored unwrapped: chunks are embedded and searched,
and the label is added when the model reads them. Keep the tag name in step with the harness.
"""

from __future__ import annotations

import re

_TAG = "untrusted_tool_result"
_DELIMITER = re.compile(_TAG, re.IGNORECASE)


def neutralise_delimiter(text: str) -> str:
    return _DELIMITER.sub(_TAG.replace("_", "-"), text)
