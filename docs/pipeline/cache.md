# Cached tokens

Follow-on to `changes-3.md`. The recorder now keeps how many prompt tokens the provider says it served from its cache
(`cachedTokens` in the trace file, and "cached x/y" in the driver's line for each run). `null` means the provider did not
say.

## What was measured

Free model `nvidia/nemotron-3-ultra-550b-a55b:free`, strict mode. The run was cut short by rate limits, so this is a
handful of requests, not a benchmark. The per-request rows come from the trace file.

- **Short scenarios (3 and 4): no hits at all**, in every request, even though the requests of one reply share a start of
  about 4,000 tokens.
- **Scenario 9 (the longer one): hits in the middle of a reply.** Over 7 requests, 13,152 of 33,943 prompt tokens (39%)
  were cached. Request by request in one run:

| Request            | Tools sent | Prompt tokens | Cached |
| ------------------ | ---------- | ------------- | ------ |
| 1                  | 18         | 4,444         | 0      |
| 2                  | 18         | 5,834         | 4,384  |
| 3                  | 16         | 6,488         | **0**  |
| 4                  | 16         | 6,554         | 4,384  |
| 5                  | 16         | 6,620         | 4,384  |
| 6 (last, no tools) | 0          | 3,836         | **0**  |

## What it says

- This provider does cache, and it reports it. Whether a hit happens is not predictable: the same kind of request hit in
  a long scenario and missed in short ones.
- **When the list of tools changes, the cache misses for that request** (request 3: the read tools had been withdrawn at
  the limit, 18 to 16 tools, and all 6,488 tokens were charged; request 6 has no tools at all). Those changes are on
  purpose (a tool that is taken away cannot be called again), so they were left alone. The cost is about one uncached
  request each time the list changes.
- Everything else at the front of a request (the system prompt, the rules, the tools in a fixed order) is already the
  same from round to round, so the app is not getting in its own way.

## Not done

- Putting the tools that get withdrawn last in the list, so that a removal keeps more of the start intact. It is cheap to
  try, but where the tools sit in the prompt depends on the model's template and the gain is unknown, so it was left.
- A fair comparison on a paid model that documents its caching (the new `--allow-paid` option could do it for a few
  cents).
