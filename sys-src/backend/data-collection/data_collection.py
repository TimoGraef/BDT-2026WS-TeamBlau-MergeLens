import sys
import os

import polars as pl
import requests

github_token = ""


def log_module_versions():
    try:
        print("MergeLens Data Collection - Module Versions")
        print(f"Python: {sys.version.split()[0]}")
        print(f"Polars: {pl.__version__}")
        print(f"Requests: {requests.__version__}")  # pyright: ignore[reportPrivateImportUsage]
    except Exception as e:
        raise RuntimeError(f"Failed to log module versions: {e}") from e


def init_env_variables():
    global github_token

    try:
        github_token = os.environ["GITHUB_TOKEN"]
    except Exception as e:
        raise RuntimeError(f"Failed to initialize environment variables: {e}") from e


if __name__ == "__main__":
    init_env_variables()
    log_module_versions()
