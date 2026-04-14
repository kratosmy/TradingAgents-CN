import os
import sys
from fnmatch import fnmatch
from pathlib import Path

# 将项目根目录加入 sys.path，确保 `import tradingagents` 可用
TESTS_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = TESTS_ROOT.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# The repository's top-level tests/ directory also contains many historical
# one-off scripts that are intended to be run directly (`python tests/foo.py`)
# rather than collected by the manifest pytest baseline. Keep collection scoped
# to the curated automated suites under dedicated subdirectories.
_CURATED_TEST_DIRS = {
    "config",
    "dataflows",
    "middleware",
    "services",
    "system",
    "unit",
}


def pytest_ignore_collect(collection_path, path=None, config=None):
    candidate = Path(str(collection_path)).resolve()

    if candidate.parent == TESTS_ROOT:
        if candidate.is_dir():
            return candidate.name not in _CURATED_TEST_DIRS and not candidate.name.startswith("__")
        if candidate.is_file():
            return any(
                fnmatch(candidate.name, pattern)
                for pattern in ("test*.py", "*_test.py")
            )

    return False

