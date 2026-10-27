# Backend dependencies

- `requirements.in` lists runtime packages; the Docker image installs the hash-locked `requirements.txt`.
- `requirements-dev.in` adds test and audit tools; local development installs `requirements-dev.txt`.
- Both locks target Python 3.11, matching `backend/Dockerfile`.

The dependency workflow runs the isolated unit tests in `tests/test_annual_billing_filters.py` and `tests/test_client_invoice_scope.py`. Integration suites that require a running API, production-like data, or external email services remain outside this CI job.

Regenerate the locks after editing an input file with `uv`:

```powershell
uv pip compile requirements.in --python-version 3.11 --generate-hashes --output-file requirements.txt
uv pip compile requirements-dev.in --python-version 3.11 --generate-hashes --output-file requirements-dev.txt
```

Install and audit the locked environment with:

```powershell
python -m pip install --require-hashes -r requirements-dev.txt
pip-audit --requirement requirements.txt
pip-audit --requirement requirements-dev.txt
```
