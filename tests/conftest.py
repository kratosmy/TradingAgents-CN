import os
import sys
from fnmatch import fnmatch
from pathlib import Path

# 将项目根目录加入 sys.path，确保 `import tradingagents` 可用
TESTS_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = TESTS_ROOT.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# The repository's top-level tests/ directory mixes dedicated pytest suites
# under stable subdirectories with many historical one-off scripts that are
# intended to be run directly (`python tests/foo.py`). Keep the manifest
# baseline broad enough to include real automated suites while explicitly
# reclassifying the manual/archive directories that are not safe for unattended
# collection.
_AUTOMATED_TEST_DIRS = {
    "config",
    "dataflows",
    "middleware",
    "services",
    "system",
    "test_tushare_unified",
    "tradingagents",
    "unit",
}

# A small number of root-level modules have since been repaired into hermetic
# pytest suites. Keep them collected explicitly while the remaining historical
# `tests/test_*.py` scripts stay reclassified as direct-run/manual checks.
_AUTOMATED_TOP_LEVEL_FILES = {
    "test_conditional_logic_config.py",
    "test_config_system.py",
    "test_debate_flow_simulation.py",
    "test_progress_time_calculation.py",
    "test_research_depth_5_levels.py",
    "test_research_depth_mapping.py",
    "test_request_deduplication.py",
    "test_sanitize_export.py",
    "test_sse_and_worker_config.py",
    "test_system_config_summary_sse_queue.py",
    "test_tradingagents_runtime_settings.py",
}

_EXCLUDED_TOP_LEVEL_DIRS = {
    "0.1.14",      # archived historical regression snapshots
    "data",        # test fixtures / captured data, not pytest suites
    "integration", # manual credential/network integration scripts
    "results",     # generated artifacts, not test code
}


def pytest_ignore_collect(collection_path, path=None, config=None):
    candidate = Path(str(collection_path)).resolve()

    if candidate.parent == TESTS_ROOT:
        if candidate.is_dir():
            if candidate.name.startswith("__"):
                return False
            if candidate.name in _AUTOMATED_TEST_DIRS:
                return False
            if candidate.name in _EXCLUDED_TOP_LEVEL_DIRS:
                return True
            return True
        if candidate.is_file():
            if candidate.name in _AUTOMATED_TOP_LEVEL_FILES:
                return False
            return any(
                fnmatch(candidate.name, pattern)
                for pattern in ("test*.py", "*_test.py")
            )

    return False

