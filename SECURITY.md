# Security policy

## Reporting a vulnerability

Please email **sales.bydtech@gmail.com** with the details, instead of opening a
public issue. We will acknowledge the report and keep you posted on the fix.

## Scope

`model-retire` reads files on disk and prints findings. It makes no network
requests, runs no code from the scanned project and writes nothing. A `--data`
file is parsed as JSON only. Reports about the tool reading files it should
skip, or about crafted files making it crash or hang, are in scope.

Wrong or outdated dates in the dataset are data bugs, not security issues:
please open a public issue with the provider's source URL.
