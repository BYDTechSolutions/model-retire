import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
FIXTURES = os.path.join(REPO, "test", "fixtures")


@pytest.fixture
def fixtures():
    """The fixture directory shared with the Node package. Absent from the sdist."""
    if not os.path.isdir(os.path.join(FIXTURES, "project")):
        pytest.skip("shared fixtures are only available in the repository")
    return FIXTURES


@pytest.fixture
def project(tmp_path):
    """Writes {relative path: str | bytes} into a temporary directory and returns its path."""

    def make(files):
        for rel, body in files.items():
            p = tmp_path / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(body, bytes):
                p.write_bytes(body)
            else:
                p.write_bytes(body.encode("utf-8"))
        return str(tmp_path)

    return make
