#!/usr/bin/env python3
"""Build and verify report artifacts with a configured local runtime."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from report_artifacts import manifest_path, sha256, validate_manifest
from render_report import FONT_FILES, REQUIRED_WEASYPRINT_VERSION
from validate_report import _configure_utf8_console, validate_markdown

SCRIPTS = Path(__file__).resolve().parent
DEFAULT_CONFIG = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "3d-deep-research" / "runtime.json"


def reusable(source: Path, artifact: Path, fonts: Path | None) -> bool:
    errors, warnings = validate_manifest(source, artifact)
    if errors or warnings:
        return False
    data = json.loads(manifest_path(artifact).read_text(encoding="utf-8"))
    paths = {(source.parent / item["path"]).resolve() for item in data["dependencies"]}
    required = {SCRIPTS / name for name in ("render_report.py", "linkify_sources.py", "report_artifacts.py")}
    required.add(SCRIPTS.parent / "assets" / "report.css")
    if fonts is not None:
        required.update(fonts / name for name in FONT_FILES.values())
    # External SVGs may have nested dependencies beyond the manifest's scope.
    return required <= paths and not any(path.suffix.lower() == ".svg" for path in paths)


def run_step(name: str, command: list[str], env: dict[str, str], log_dir: Path) -> str:
    log = log_dir / f"{name}.log"
    try:
        result = subprocess.run(command, env=env, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=300)
    except subprocess.TimeoutExpired as exc:
        def decoded(value):
            return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value or ""
        log.write_text(decoded(exc.stdout) + decoded(exc.stderr) + "\n[TIMEOUT]\n", encoding="utf-8")
        raise RuntimeError(f"{name} timed out; see {log}") from exc
    output = result.stdout + result.stderr
    log.write_text(output, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"{name} failed (exit {result.returncode}); see {log}\n{output[-1500:]}")
    # Preserve warnings without flooding the model with routine build output.
    warnings = [line for line in result.stdout.splitlines() if "WARN" in line.upper()]
    warnings += [f"[WARN] {line}" for line in result.stderr.splitlines() if line.strip()]
    for warning in warnings[:5]:
        print(warning)
    if len(warnings) > 5:
        print(f"[WARN] Further warnings in {log}")
    return result.stdout.strip()


def main() -> int:
    _configure_utf8_console()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--output-dir", help="Default: Markdown directory")
    parser.add_argument("--runtime-config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--formats", nargs="+", choices=("html", "pdf"), default=["html", "pdf"])
    args = parser.parse_args()
    source = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else source.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    log_dir = output_dir / "build-logs"
    log_dir.mkdir(exist_ok=True)
    started = time.monotonic()
    summary = {"artifacts": {}, "visual_review": "pending", "content_review": "not evaluated by script"}
    state_path = output_dir / "build-state.json"
    try:
        config = json.loads(args.runtime_config.read_text(encoding="utf-8-sig")) if args.runtime_config.is_file() else {}
        python = config.get("python", sys.executable)
        fonts = Path(config.get("font_dir", source.parent / "fonts")).expanduser().resolve()
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        if config.get("dll_dirs"):
            env["WEASYPRINT_DLL_DIRECTORIES"] = os.pathsep.join(config["dll_dirs"])
        if config.get("fontconfig_file"):
            env["FONTCONFIG_FILE"] = config["fontconfig_file"]
            env["FONTCONFIG_PATH"] = str(Path(config["fontconfig_file"]).parent)
        errors, warnings = validate_markdown(source.read_text(encoding="utf-8"), source.parent)
        if errors:
            raise RuntimeError("\n".join(errors))
        for warning in warnings:
            print(f"[WARN] {warning}")
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = {}
        for fmt in (fmt for fmt in ("html", "pdf") if fmt in args.formats):
            probe = "import sys, markdown; print(sys.version); print(markdown.__version__)"
            if fmt == "pdf":
                missing = [str(fonts / name) for name in FONT_FILES.values() if not (fonts / name).is_file()]
                if missing:
                    raise RuntimeError("Missing PDF fonts: " + ", ".join(missing))
                probe += f"; import weasyprint, pypdf; print(weasyprint.__version__); assert weasyprint.__version__ == {REQUIRED_WEASYPRINT_VERSION!r}, 'WeasyPrint version mismatch'"
            runtime = run_step(f"preflight-{fmt}", [python, "-c", probe], env, log_dir)
            render_config = {"python": python}
            if fmt == "pdf":
                render_config.update(font_dir=str(fonts), dll_dirs=env.get("WEASYPRINT_DLL_DIRECTORIES", ""))
                if env.get("FONTCONFIG_FILE"):
                    fontconfig = Path(env["FONTCONFIG_FILE"])
                    if not fontconfig.is_file():
                        raise RuntimeError(f"Fontconfig file not found: {fontconfig}")
                    render_config["fontconfig"] = {str(path): sha256(path) for path in sorted(fontconfig.parent.rglob("*.conf"))}
            signature = hashlib.sha256((runtime + json.dumps(render_config, sort_keys=True)).encode()).hexdigest()
            artifact = output_dir / f"output.{fmt}"
            cached = state.get(fmt) == signature and reusable(source, artifact, fonts if fmt == "pdf" else None)
            if not cached:
                command = [python, str(SCRIPTS / "render_report.py"), str(source), str(artifact)]
                if fmt == "pdf":
                    command += ["--font-dir", str(fonts)]
                run_step(f"render-{fmt}", command, env, log_dir)
            run_step(f"validate-{fmt}", [python, str(SCRIPTS / "validate_report.py"), str(source), f"--{fmt}", str(artifact)], env, log_dir)
            state[fmt] = signature
            state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
            summary["artifacts"][fmt] = {"path": str(artifact), "status": "reused" if cached else "built", "sha256": sha256(artifact)}
            print(f"[OK] {fmt.upper()} {'reused' if cached else 'built'} and validated: {artifact}")
        if "pdf" in args.formats:
            preview_python = config.get("preview_python", python)
            poppler = config.get("pdftoppm", "pdftoppm")
            preview_output = run_step("preview", [preview_python, str(SCRIPTS / "preview_report.py"),
                str(output_dir / "output.pdf"), str(output_dir / "preview"), "--pdftoppm", poppler], env, log_dir)
            print(preview_output)
            summary["preview"] = str(output_dir / "preview")
        print("[OK] Structure and artifact consistency checks passed. Content and visual review must be completed separately.")
        summary["status"] = "checks_passed"
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        summary["status"] = "blocked"
        summary["error"] = str(exc)
        print(f"[FAIL] {exc}\nRuntime configuration: {args.runtime_config}\nAlready validated artifacts, if any, are listed in build-summary.json; this is not complete delivery.")
        return 1
    finally:
        summary["elapsed_seconds"] = round(time.monotonic() - started, 3)
        (output_dir / "build-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
