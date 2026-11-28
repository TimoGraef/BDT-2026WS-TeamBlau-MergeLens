import argparse
from collections import Counter
from datetime import UTC, datetime, timedelta
import gzip
from hashlib import sha256
import json
import logging
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from time import sleep
import zlib

import polars as pl
import requests
from urllib3.exceptions import HTTPError, InvalidHeader, ProtocolError, ReadTimeoutError
from urllib3.util import Retry

ARCHIVE_URL = "https://data.gharchive.org"
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
START = datetime(2026, 1, 1, tzinfo=UTC)
RETRY_DELAYS = (2, 4, 8, 16)
RETRY_STATUSES = {408, 429, 500, 502, 503, 504}
BUCKETS = 32
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
LOGGER = logging.getLogger(__name__)
UTC_DATETIME = pl.Datetime("us", "UTC")
OPEN_FIELDS = {
    "pr_id": pl.Int64,
    "repo_id": pl.Int64,
    "pr_api": pl.String,
    "user_api": pl.String,
    "title": pl.String,
    "description": pl.String,
    "user_created_at": UTC_DATETIME,
    "user_followers": pl.Int64,
    "user_following": pl.Int64,
    "user_public_repos": pl.Int64,
    "user_public_gists": pl.Int64,
    "user_has_bio": pl.Boolean,
    "user_has_public_email": pl.Boolean,
}
SCHEMA = {
    **OPEN_FIELDS,
    "merged": pl.Boolean,
    "opened_at": UTC_DATETIME,
    "closed_at": UTC_DATETIME,
    "terminal_action": pl.String,
}
EVENT_SCHEMA = {
    **OPEN_FIELDS,
    "timestamp": UTC_DATETIME,
    "action": pl.String,
    "bot_account": pl.String,
    "merged": pl.Boolean,
}
METRICS = {
    "archives": "Hourly archives processed",
    "pr_events": "PullRequestEvent events",
    "unique_opened": "Unique PRs opened (including excluded bot PRs)",
    "completed": "Matched completed PRs",
    "pending": "Unmatched pending PRs",
    "confirmed_merged": "Confirmed merged PRs",
    "confirmed_not_merged": "Confirmed closures without a merge",
    "unknown_outcome": "Completed PRs with unknown merge outcome",
    "malformed": "Skipped malformed events",
    "excluded_bot_prs": "Excluded bot-authored PRs",
    "excluded_bot_accounts": "Unique excluded bot accounts",
    "archive_retries": "Archive download retries",
}


def log_module_versions():
    print("MergeLens Data Collection - Module Versions")
    print(f"Python: {sys.version.split()[0]}")
    print(f"Polars: {pl.__version__}")
    print(f"Requests: {requests.__version__}", flush=True)  # pyright: ignore[reportPrivateImportUsage]


def parse_timestamp(value):
    if isinstance(value, str):
        try:
            timestamp = datetime.fromisoformat(value)
            if timestamp.tzinfo is not None:
                return timestamp.astimezone(UTC)
        except (ValueError, OverflowError):
            return None
    return None


def as_object(value):
    return value if isinstance(value, dict) else {}


def as_int(value):
    return value if type(value) is int and 0 <= value < 2**63 else None


def as_string(value):
    if not isinstance(value, str):
        return None
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return None
    return value


def presence(profile, field):
    value = profile.get(field)
    if isinstance(value, str):
        return bool(value.strip())
    if field in profile and value is None:
        return False
    return None


def opening_fields(event, pr):
    actor = as_object(event.get("actor"))
    profile = {**actor, **as_object(pr.get("user"))}
    login = (as_string(actor.get("login")) or "").lower()
    return {
        "repo_id": as_int(as_object(event.get("repo")).get("id")),
        "pr_api": as_string(pr.get("url")),
        "user_api": as_string(actor.get("url")),
        "bot_account": sha256(login.encode()).hexdigest() if login.endswith("[bot]") else None,
        "title": as_string(pr.get("title")),
        "description": as_string(pr.get("body")),
        "user_created_at": parse_timestamp(profile.get("created_at")),
        "user_followers": as_int(profile.get("followers")),
        "user_following": as_int(profile.get("following")),
        "user_public_repos": as_int(profile.get("public_repos")),
        "user_public_gists": as_int(profile.get("public_gists")),
        "user_has_bio": presence(profile, "bio"),
        "user_has_public_email": presence(profile, "email"),
    }


def terminal_merged(action, pr):
    merged = pr.get("merged")
    if action == "merged" or merged is True or parse_timestamp(pr.get("merged_at")) is not None:
        return True
    return False if merged is False else None


def archive_hours(start, end):
    hour = start.replace(minute=0, second=0, microsecond=0)
    while hour < end:
        yield hour
        hour += HOUR


def read_events(session, hour, stats):
    filename = f"{hour:%Y-%m-%d}-{hour.hour}.json.gz"
    url = f"{ARCHIVE_URL}/{filename}"
    for attempt in range(len(RETRY_DELAYS) + 1):
        attempt_stats = Counter()
        try:
            with session.get(url, stream=True, timeout=(15, 60)) as response:
                response.raise_for_status()
                with gzip.GzipFile(fileobj=response.raw) as archive:
                    events = project_events(archive, filename, attempt_stats)
        except (requests.RequestException, HTTPError, EOFError) as exc:
            delay = retry_delay(exc, attempt)
            if delay is None:
                raise RuntimeError(f"Download failed for {url}: {exc}") from exc
            LOGGER.warning("%s: %s; retrying in %.1f seconds", filename, exc, delay)
            stats["archive_retries"] += 1
            sleep(delay)
        except (OSError, zlib.error) as exc:
            raise RuntimeError(f"Could not decompress {filename}: {exc}") from exc
        else:
            malformed = attempt_stats["malformed"] + events.filter(invalid_pr()).height
            if malformed:
                LOGGER.warning("%s: skipped %d malformed events", filename, malformed)
            stats.update(attempt_stats)
            return events


def retry_delay(exc, attempt):
    if attempt >= len(RETRY_DELAYS):
        return None
    delay = RETRY_DELAYS[attempt]
    if isinstance(exc, requests.HTTPError):
        response = exc.response
        if response is None or response.status_code not in RETRY_STATUSES:
            return None
        try:
            return max(delay, Retry().get_retry_after(response) or 0)  # pyright: ignore[reportArgumentType]
        except InvalidHeader:
            return delay
    if isinstance(exc, requests.exceptions.SSLError):
        return None
    if isinstance(exc, (requests.Timeout, requests.ConnectionError, ProtocolError,
                        ReadTimeoutError, EOFError)):
        return delay
    return None


def invalid_pr():
    action = pl.col("action")
    return action.is_null() | (action.is_in(["opened", "closed", "merged"]) & pl.col("pr_id").is_null())


def project_events(archive, filename, stats):
    rows = []
    valid_events = 0
    for line in archive:
        try:
            event = json.loads(line)
        except (ValueError, RecursionError):
            stats["malformed"] += 1
            continue

        if not isinstance(event, dict) or not as_string(event.get("type")):
            stats["malformed"] += 1
            continue
        if event["type"] != "PullRequestEvent":
            valid_events += 1
            continue

        timestamp = parse_timestamp(event.get("created_at"))
        if timestamp is None:
            stats["malformed"] += 1
            continue
        payload = as_object(event.get("payload"))
        action = as_string(payload.get("action")) or None
        row = {"action": action, "timestamp": timestamp}
        if not action:
            rows.append(row)
            continue
        if action not in ("opened", "closed", "merged"):
            valid_events += 1
            rows.append(row)
            continue

        pr = as_object(payload.get("pull_request"))
        pr_id = as_int(pr.get("id"))
        if not pr_id:
            rows.append(row)
            continue
        valid_events += 1
        row["pr_id"] = pr_id
        if action == "opened":
            row.update(opening_fields(event, pr))
        else:
            row["merged"] = terminal_merged(action, pr)
        rows.append(row)

    if not valid_events:
        raise ValueError(f"{filename}: archive contains no valid event records "
                         f"({stats['malformed'] + len(rows)} malformed)")
    return pl.from_dicts(rows, schema=EVENT_SCHEMA)


def complete_pull_requests(events, stats, bot_accounts):
    # An event timestamp can fall outside the hour in the archive filename.
    events = (
        events.with_columns((pl.col("action") != "opened").alias("is_terminal"))
        .sort("timestamp", "is_terminal", maintain_order=True)
    )
    pending = {}
    completed = {}
    bot_prs = set()
    evidence_rank = {None: 0, False: 1, True: 2}

    for row in events.iter_rows(named=True):
        pr_id = row["pr_id"]
        if not row["is_terminal"]:
            if pr_id in pending or pr_id in completed or pr_id in bot_prs:
                continue
            bot_account = row["bot_account"]
            if bot_account:
                bot_prs.add(pr_id)
                bot_accounts.add(bot_account)
            else:
                pending[pr_id] = {name: row[name] for name in OPEN_FIELDS}
                pending[pr_id]["opened_at"] = row["timestamp"]
            continue

        if pr_id in pending:
            completed[pr_id] = pending.pop(pr_id)
        elif (
            pr_id not in completed
            or evidence_rank[row["merged"]] <= evidence_rank[completed[pr_id]["merged"]]
        ):
            continue
        completed[pr_id].update(
            merged=row["merged"], closed_at=row["timestamp"], terminal_action=row["action"]
        )

    stats["unique_opened"] += len(pending) + len(completed) + len(bot_prs)
    stats["pending"] += len(pending)
    stats["excluded_bot_prs"] += len(bot_prs)
    result = pl.from_dicts(list(completed.values()), schema=SCHEMA)
    merged = result.get_column("merged")
    stats["completed"] += result.height
    stats["confirmed_merged"] += merged.sum()
    stats["unknown_outcome"] += merged.null_count()
    stats["confirmed_not_merged"] += merged.len() - merged.null_count() - merged.sum()
    return result


def range_stamp(start, end):
    stamp = "%Y%m%dT%H%M%S.%fZ" if start.microsecond or end.microsecond else "%Y%m%dT%H%M%SZ"
    return f"{start:{stamp}}_{end:{stamp}}"


def write_outputs(data, output_dir, start, end, stats, actions):
    basename = f"pull_requests_{range_stamp(start, end)}"
    csv = output_dir / f"{basename}.csv"
    parquet = csv.with_suffix(".parquet")
    summary = output_dir / f"{basename}_summary.json"
    report = {
        "start_inclusive": start.isoformat(),
        "end_exclusive": end.isoformat(),
        "metrics": {metric: stats[metric] for metric in METRICS},
        "actions": dict(sorted(actions.items())),
        "datasets": {"csv": csv.name, "parquet": parquet.name},
    }
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=output_dir) as temporary_dir:
            staging = Path(temporary_dir)
            staged_csv = staging / csv.name
            staged_parquet = staging / parquet.name
            staged_summary = staging / summary.name
            data.write_csv(staged_csv)
            data.write_parquet(staged_parquet)
            staged_summary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            staged_csv.replace(csv)
            staged_parquet.replace(parquet)
            staged_summary.replace(summary)
    except (OSError, pl.exceptions.PolarsError) as exc:
        raise RuntimeError(f"Could not write {basename} to {output_dir}: {exc}") from exc
    return csv, parquet, summary


def day_checkpoint(session, directory, start, end):
    checkpoint = directory / range_stamp(start, end)
    metadata = checkpoint / "counts.json"
    if not metadata.is_file():
        LOGGER.info("Reading GH Archive from %s to %s", start.isoformat(), end.isoformat())
        stats = Counter()
        batches = []
        for hour in archive_hours(start, end):
            batches.append(read_events(session, hour, stats))
            stats["archives"] += 1
        events = (
            pl.concat(batches, rechunk=False)
            .with_columns((pl.col("pr_id") % BUCKETS).cast(pl.UInt8).alias("bucket"))
            .sort("bucket", maintain_order=True)
        )
        with TemporaryDirectory(dir=directory) as temporary_dir:
            staged = Path(temporary_dir) / "day"
            staged.mkdir()
            events.write_parquet(staged / "events.parquet", row_group_size=2048)
            (staged / metadata.name).write_text(
                json.dumps(stats), encoding="utf-8"
            )
            try:
                staged.rename(checkpoint)
            except OSError:
                if not metadata.is_file():
                    raise
    else:
        LOGGER.info("Reusing GH Archive checkpoint %s", checkpoint.name)
    return checkpoint / "events.parquet", json.loads(metadata.read_text(encoding="utf-8"))


def collect(session, start, end, checkpoint_dir):
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    stats = Counter()
    paths = []
    day_start = start
    while day_start < end:
        next_midnight = day_start.replace(hour=0, minute=0, second=0, microsecond=0) + DAY
        day_end = min(next_midnight, end)
        path, counts = day_checkpoint(session, checkpoint_dir, day_start, day_end)
        paths.append(path)
        stats.update(counts)
        day_start = day_end

    events = pl.scan_parquet(paths).filter(pl.col("timestamp").is_between(start, end, closed="left"))
    action_counts = events.group_by("action").agg(
        pl.len().alias("count"), invalid_pr().sum().alias("malformed")
    ).collect(engine="streaming")
    actions = Counter()
    for action, count, malformed in action_counts.iter_rows():
        stats["pr_events"] += count
        stats["malformed"] += malformed
        if action is not None:
            actions[action] = count
    bot_accounts = set()
    completed = []
    for bucket in range(BUCKETS):
        rows = events.filter(pl.col("bucket") == bucket).drop("bucket").collect(engine="streaming")
        completed.append(complete_pull_requests(rows, stats, bot_accounts))
    stats["excluded_bot_accounts"] = len(bot_accounts)
    return pl.concat(completed).sort("pr_id"), stats, actions


def default_end():
    return datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


def main():
    parser = argparse.ArgumentParser(description="Extract completed PRs from GH Archive.")
    parser.add_argument("--start", default=START.isoformat(),
                        help="Inclusive ISO 8601 timestamp (default: 2026-01-01 UTC)")
    parser.add_argument("--end", default=default_end().isoformat(),
                        help="Exclusive ISO 8601 timestamp (default: current UTC midnight)")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Dataset directory")
    args = parser.parse_args()
    start, end = parse_timestamp(args.start), parse_timestamp(args.end)
    if start is None or end is None or start >= end:
        parser.error("--start and --end must be increasing ISO 8601 timestamps with a timezone")

    logging.basicConfig(format="%(levelname)s %(message)s", level=logging.INFO)
    log_module_versions()
    with requests.Session() as session:
        data, stats, actions = collect(session, start, end, args.output_dir / ".archive-checkpoints-v1")
    paths = write_outputs(data, args.output_dir, start, end, stats, actions)
    for metric, label in METRICS.items():
        print(f"{label}: {stats[metric]}")
    print("Observed PullRequestEvent actions:")
    for action, count in sorted(actions.items()):
        print(f"  {action}: {count}")
    for path in paths:
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
