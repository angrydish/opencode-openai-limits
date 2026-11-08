from pathlib import Path
import subprocess
import tempfile
import unittest


SCANNER = Path(__file__).resolve().parents[1] / "scripts" / "secret_scan.py"


class SecretScanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp/opencode")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.run_git("init", "-q")
        self.run_git("config", "user.email", "test@example.invalid")
        self.run_git("config", "user.name", "Test")

    def run_git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True, text=True).stdout.strip()

    def scan(self, *args):
        return subprocess.run(["python3", str(SCANNER), *args], cwd=self.repo, capture_output=True, text=True)

    def test_clean_staged_and_history(self):
        (self.repo / "main.py").write_text("print('hello')\n")
        self.run_git("add", "main.py")
        self.assertEqual(self.scan("--staged").returncode, 0)
        self.run_git("commit", "-qm", "safe")
        self.assertEqual(self.scan("--history", "HEAD").returncode, 0)

    def test_force_added_ignored_file_is_blocked(self):
        (self.repo / ".env").write_text("TEST=placeholder\n")
        self.run_git("add", "-f", ".env")
        result = self.scan("--staged")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("BLOCKED filename", result.stderr)

    def test_token_in_deleted_old_commit_still_blocks_push_without_printing_secret(self):
        token = "ghp_" + "A" * 36
        file = self.repo / "oops.txt"
        file.write_text(token)
        self.run_git("add", "oops.txt")
        self.assertNotEqual(self.scan("--staged").returncode, 0)
        self.run_git("commit", "-qm", "leaked")
        file.unlink()
        self.run_git("add", "-u")
        self.run_git("commit", "-qm", "remove")
        result = self.scan("--history", "HEAD")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(token, result.stdout + result.stderr)

    def test_embedded_url_credentials_are_blocked(self):
        (self.repo / "config.txt").write_text("https://username:" + "verySecretPassword@example.invalid/path")
        self.run_git("add", "config.txt")
        result = self.scan("--staged")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("credentials in URL", result.stderr)
        self.assertNotIn("verySecretPassword", result.stderr)


if __name__ == "__main__":
    unittest.main()
