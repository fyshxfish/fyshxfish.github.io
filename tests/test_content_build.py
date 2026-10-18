import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("site_build", Path(__file__).resolve().parents[1] / "scripts/build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class ContentIndexTests(unittest.TestCase):
    def test_discovery_revision_and_deletion(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            book = root / "content/books/随笔/有 空格#问号?.md"
            diary = root / "content/.diary/.秘密.txt"
            for path, text in ((book, "# 新文章\n正文\n"), (diary, "*原样显示*")):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            sources = root / "content/weather/SOURCES.md"
            sources.parent.mkdir(parents=True)
            sources.write_text("Do not list source credits as articles")
            first = build.generate_index(root)
            self.assertEqual(set(first), {"/books/随笔/有 空格#问号?.md", "/.diary/.秘密.txt"})
            self.assertEqual(first["/.diary/.秘密.txt"]["format"], "text")
            snapshot = (root / "content-index.js").read_bytes()
            build.generate_index(root)
            self.assertEqual(snapshot, (root / "content-index.js").read_bytes())
            book.write_text("不同的正文", encoding="utf-8")
            second = build.generate_index(root)
            key = "/books/随笔/有 空格#问号?.md"
            self.assertNotEqual(first[key]["revision"], second[key]["revision"])
            book.unlink()
            self.assertNotIn(key, build.generate_index(root))

    def test_conflicting_paths_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ("content/books/重复.md", "content/pages/books/重复.md"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("正文", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "虚拟路径重复"):
                build.generate_index(root)

    def test_non_utf8_fails_at_build_time(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "content/books/broken.txt"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"\xff")
            with self.assertRaises(UnicodeDecodeError):
                build.generate_index(root)


if __name__ == "__main__":
    unittest.main()
