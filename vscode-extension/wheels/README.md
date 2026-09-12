# Bundled collector wheels

Wheels for `labwatch-lite`, one directory per platform and CPython ABI.
`pythonEnv.ts` installs from the directory matching the interpreter it found,
with `--no-index`, so a server with no outbound access still gets a working
collector. Anything not covered here falls back to PyPI.

- `manylinux2014_x86_64-cp310`: 24 wheels, 9.6 MB
- `manylinux2014_x86_64-cp311`: 24 wheels, 9.8 MB
- `manylinux2014_x86_64-cp312`: 24 wheels, 9.9 MB
- `win_amd64-cp312`: 24 wheels, 7.0 MB

Regenerate with `python scripts/bundle-extension-wheels.py`.
