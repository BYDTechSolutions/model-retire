# Contributing

Thanks for helping. Issues and pull requests are welcome at
[github.com/BYDTechSolutions/model-retire](https://github.com/BYDTechSolutions/model-retire).

## Correcting the data

Most useful contributions are data corrections: a date that moved, a model
that was deprecated, a replacement that changed.

1. Find the change on the provider's **own** documentation page: a
   deprecations, model lifecycle or model versions page. News articles,
   forum posts, emails and third-party trackers are not accepted as sources.
2. Edit [`data/models.json`](data/models.json). Every entry needs `provider`,
   `id`, `status`, `source` (the exact URL you read) and `checked` (the date you
   read it). Add `deprecated_on`, `retires_on`, `replacement`, `aliases` and
   `note` only when the page states them. Copy dates exactly; when the page is
   ambiguous, leave the field out and say so in the pull request.
3. Set `status` to `retired` when the provider says so or the shutdown date has
   passed on your `checked` date, otherwise `deprecated`.
4. Keep entries sorted by `provider`, then `id`. Run:

   ```sh
   npm run check-data   # schema, dates, order, duplicates
   npm run sync-data    # copy the file into the Python package
   npm test
   ```

5. In the pull request, link the source and quote the row you used.

When re-verifying the whole dataset, re-read every source page, update each
`checked` date and the top-level `updated` date. The weekly "Data freshness"
workflow fails once `updated` is more than 45 days old.

## Code

The Node (`src/`) and Python (`python/src/model_retire/`) implementations must
behave identically. A change to one needs the same change to the other.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run parity            # both CLIs over test/fixtures/project; needs python3

cd python
python -m pip install -e . pytest
python -m pytest
```

Node.js 20 or later, Python 3.9 or later.

- `test/fixtures/expected.json` is the scan of `test/fixtures/project` with
  `test/fixtures/models.json`; both test suites compare against it. If you
  change the output on purpose, regenerate it with the Node CLI and check the
  diff by hand.
- No runtime dependencies in either package.
- Add a line to `CHANGELOG.md` under "Unreleased".
- American English in code, messages and docs.
