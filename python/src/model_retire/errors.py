"""Errors raised by model_retire."""


class UsageError(Exception):
    """Invalid options, an unreadable data file or a missing path. The CLI exits with code 2."""
