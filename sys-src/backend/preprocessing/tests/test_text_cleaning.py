import unittest

from text_cleaning import clean_text


class TestTextCleaning(unittest.TestCase):

    def test_missing_text(self):
        self.assertEqual(clean_text(None), "")

    def test_empty_text(self):
        self.assertEqual(clean_text(""), "")

    def test_html_comments(self):
        text = "<!-- Template instruction -->Fix login bug"
        self.assertEqual(clean_text(text), "Fix login bug")

    def test_multiline_comments(self):
        text = "<!-- First line\nSecond line -->Fix bug"
        self.assertEqual(clean_text(text), "Fix bug")

    def test_whitespace(self):
        text = "  Fix login bug   "
        self.assertEqual(clean_text(text), "Fix login bug")

    def test_line_endings(self):
        text = "First line\r\nSecond line"
        self.assertEqual(
            clean_text(text),
            "First line\nSecond line"
        )

    def test_empty_lines(self):
        text = "First paragraph\n\n\n\nSecond paragraph"
        self.assertEqual(
            clean_text(text),
            "First paragraph\n\nSecond paragraph"
        )

    def test_unicode(self):
        self.assertEqual(clean_text("Cafe\u0301"), "Café")

    def test_preserve_markdown(self):
        text = "## Changes\n- Fixed `login()`\n- [x] Tests"
        self.assertEqual(clean_text(text), text)

    def test_preserve_code(self):
        text = "```python\nif True:\n    print('Hello')\n```"
        self.assertEqual(clean_text(text), text)


if __name__ == "__main__":
    unittest.main()