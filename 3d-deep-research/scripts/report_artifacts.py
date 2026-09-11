"""Track local report inputs and output identity (not a security signature)."""
from __future__ import annotations

import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import url2pathname


class MediaReferences(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"img", "image", "use"}:
            values = dict(attrs)
            ref = values.get("src") if tag == "img" else values.get("href") or values.get("xlink:href")
            if ref:
                self.refs.append(ref)


def local_path(ref: str, base: Path) -> Path | None:
    if len(ref) > 2 and ref[1] == ":" and ref[2] in "\\/":
        return Path(ref).resolve()
    parsed = urlsplit(ref)
    if ref.startswith("#") or parsed.scheme in {"http", "https", "data"} or parsed.netloc:
        return None
    if parsed.scheme == "file":
        return Path(url2pathname(parsed.path)).resolve()
    if parsed.scheme:
        return None
    return (base / unquote(parsed.path)).resolve()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest_path(output: Path) -> Path:
    return output.with_name(output.name + ".manifest.json")


def write_manifest(
    source: Path, output: Path, dependencies: list[Path], remote: list[str],
    expected_inputs: dict[Path, str] | None = None,
) -> None:
    import os
    def dependency_name(path: Path) -> str:
        try:
            return os.path.relpath(path, source.parent)
        except ValueError:  # Different Windows drives have no relative path.
            return str(path.resolve())

    input_hashes = {path: sha256(path) for path in {source, *dependencies}}
    if expected_inputs is not None and input_hashes != expected_inputs:
        raise ValueError("Report inputs changed during rendering; render again.")
    data = {
        "version": 1,
        "source_sha256": input_hashes[source],
        "output_sha256": sha256(output),
        "dependencies": [
            {"path": dependency_name(path), "sha256": input_hashes[path]}
            for path in sorted(set(dependencies))
        ],
        "remote_resources": sorted(set(remote)),
    }
    destination = manifest_path(output)
    temporary = destination.with_name(destination.name + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(destination)


def validate_manifest(source: Path, output: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        data = json.loads(manifest_path(output).read_text(encoding="utf-8"))
        if data["version"] != 1:
            raise ValueError("unsupported manifest version")
        if data["source_sha256"] != sha256(source):
            errors.append("Artifact was built from a different Markdown revision.")
        if data["output_sha256"] != sha256(output):
            errors.append("Artifact does not match its build manifest.")
        for dependency in data["dependencies"]:
            path = source.parent / dependency["path"]
            if not path.is_file() or sha256(path) != dependency["sha256"]:
                errors.append(f"Build dependency is missing or changed: {dependency['path']}")
        if data.get("remote_resources"):
            warnings.append("Remote media are not content-pinned; verify availability and rendered content.")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"Missing or invalid artifact manifest; render again: {exc}")
    return errors, warnings
