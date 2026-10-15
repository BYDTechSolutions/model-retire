"""Find deprecated, retiring and retired LLM model IDs in a codebase.

Example::

    from model_retire import scan, format_text
    result = scan(["src"], warn_days=60)
    print(format_text(result), end="")
"""

__version__ = "0.1.0"

from .data import default_dataset, load_dataset_file, merge_datasets, validate_dataset  # noqa: E402
from .dates import days_between, is_valid_date, today_utc  # noqa: E402
from .errors import UsageError  # noqa: E402
from .fmt import describe_timing, format_github, format_json, format_list, format_text  # noqa: E402
from .match import BOUNDARY_CLASS, Matcher, create_matcher  # noqa: E402
from .scan import DEFAULT_MAX_BYTES, DEFAULT_WARN_DAYS, assess, scan  # noqa: E402
from .walk import LOCKFILES, SKIP_DIRS, walk_files  # noqa: E402

__all__ = [
    "BOUNDARY_CLASS",
    "DEFAULT_MAX_BYTES",
    "DEFAULT_WARN_DAYS",
    "LOCKFILES",
    "Matcher",
    "SKIP_DIRS",
    "UsageError",
    "__version__",
    "assess",
    "create_matcher",
    "days_between",
    "default_dataset",
    "describe_timing",
    "format_github",
    "format_json",
    "format_list",
    "format_text",
    "is_valid_date",
    "load_dataset_file",
    "merge_datasets",
    "scan",
    "today_utc",
    "validate_dataset",
    "walk_files",
]
