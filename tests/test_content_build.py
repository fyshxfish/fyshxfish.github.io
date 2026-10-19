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
            renamed = diary.with_name("公开名字.txt")
            diary.rename(renamed)
            renamed_index = build.generate_index(root)
            self.assertNotIn("/.diary/.秘密.txt", renamed_index)
            self.assertIn("/.diary/公开名字.txt", renamed_index)
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

    def test_pocket_images_and_optional_captions(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            photo = root / "content/pockets/夏天/小鱼 #1.JPG"
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b"\xff\xd8\xff\xe0binary image")
            caption = photo.with_suffix(".txt")
            caption.write_text("照片说明", encoding="utf-8")
            files = build.generate_index(root)
            key = "/pockets/夏天/小鱼 #1.JPG"
            self.assertEqual(files[key]["type"], "image")
            self.assertEqual(files[key]["caption"], "/pockets/夏天/小鱼 #1.txt")
            self.assertTrue(files[files[key]["caption"]]["internal"])
            original_revision = files[key]["revision"]
            markdown = photo.with_suffix(".md")
            markdown.write_text("**另一份说明**", encoding="utf-8")
            photo.write_bytes(b"\xff\xd8new image")
            files = build.generate_index(root)
            self.assertEqual(files[key]["caption"], "/pockets/夏天/小鱼 #1.md")
            self.assertTrue(files[files[key]["caption"]]["internal"])
            self.assertNotEqual(files[key]["revision"], original_revision)
            markdown.unlink()
            caption.unlink()
            self.assertNotIn("caption", build.generate_index(root)[key])
            photo.unlink()
            self.assertNotIn(key, build.generate_index(root))


if __name__ == "__main__":
    unittest.main()
