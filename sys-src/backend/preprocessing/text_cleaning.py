import re
import unicodedata


def clean_text(text: str | None) -> str:
    """Clean PR text while preserving meaningful technical content."""

    if text is None:
        return ""

    # Normalize Unicode characters
    text = unicodedata.normalize("NFC", text)

    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove HTML comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)

    # Remove trailing whitespace from each line
    text = "\n".join(line.rstrip() for line in text.split("\n"))

    # Reduce consecutive empty lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()