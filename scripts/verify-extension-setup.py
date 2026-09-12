"""End-to-end check of the extension's managed-environment setup.

Calls the compiled `setupManagedEnvironment` against a real interpreter and a
throwaway directory, so the venv creation, the pip install and the verification
are exercised for real rather than against fakes.

The venv lives in the system temp directory and is removed afterwards; nothing
global is installed.
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

EXT = pathlib.Path(r"D:\IDE\vscode\MyDemo\LabWatch-lite\vscode-extension")
SCRIPT = EXT / "out" / "pythonEnv.js"

if not SCRIPT.is_file():
    raise SystemExit(f"compile the extension first: {SCRIPT}")

venv_dir = pathlib.Path(tempfile.mkdtemp(prefix="labwatch-venv-")) / "venv"
print(f"target venv: {venv_dir}")

driver = f"""
const {{ setupManagedEnvironment, managedEnvironmentWorks, nodeRunner }} = require({json.dumps(str(SCRIPT))});
setupManagedEnvironment({{ venvDir: {json.dumps(str(venv_dir))} }})
  .then(async (outcome) => {{
    console.log(JSON.stringify(outcome, null, 2));
    console.log("managedEnvironmentWorks:", await managedEnvironmentWorks({json.dumps(str(venv_dir))}, nodeRunner));
    process.exit(outcome.ok ? 0 : 1);
  }})
  .catch((error) => {{ console.error(error); process.exit(2); }});
"""

driver_path = venv_dir.parent / "driver.js"
driver_path.write_text(driver, encoding="utf-8")

try:
    result = subprocess.run(
        ["node", str(driver_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=900,
    )
    print("--- setup outcome ---")
    print(result.stdout.strip() or "(no stdout)")
    if result.stderr.strip():
        print("--- stderr ---")
        print(result.stderr.strip())

    python = venv_dir / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if python.is_file():
        version = subprocess.run(
            [str(python), "-m", "labwatch", "version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        print("--- the venv's own collector ---")
        print(f"{python} -m labwatch version -> {version.stdout.strip() or version.stderr.strip()}")
        print(f"exit code: {version.returncode}")
    else:
        print(f"--- the venv has no interpreter at {python} ---")

    print(f"setup exit code: {result.returncode}")
finally:
    shutil.rmtree(venv_dir.parent, ignore_errors=True)
    print("temporary venv removed")
