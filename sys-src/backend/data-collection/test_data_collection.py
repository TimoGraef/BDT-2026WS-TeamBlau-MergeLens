from collections import Counter
import gzip
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, call, patch

import polars as pl
from polars.testing import assert_frame_equal
import requests

from data_collection import SCHEMA, START, archive_hours, collect, default_end, parse_timestamp
from data_collection import write_outputs


def event(pr_id, action, time, login="creator", **pr_fields):
    return {
        "type": "PullRequestEvent",
        "created_at": f"2026-11-01T{time}Z",
        "repo": {"id": 12},
        "actor": {
            "login": login,
            "display_login": "ignored[bot]",
            "url": f"https://api.github.com/users/{login}",
        },
        "payload": {
            "action": action,
            "pull_request": {
                "id": pr_id, "url": f"https://api.github.com/repos/x/y/pulls/{pr_id}", **pr_fields
            },
        },
    }


def archive_response(*events):
    lines = [item if isinstance(item, bytes) else json.dumps(item).encode() for item in events]
    response = MagicMock()
    response.__enter__.return_value = response
    response.raw = BytesIO(gzip.compress(b"\n".join(lines) + b"\n"))
    return response


class DataCollectionTests(unittest.TestCase):
    start = parse_timestamp("2026-11-01T00:05:00Z")
    end = parse_timestamp("2026-11-01T02:00:00Z")

    def setUp(self):
        self.checkpoints = Path(self.enterContext(TemporaryDirectory()))

    def test_default_range_starts_in_january_and_ends_at_utc_midnight(self):
        self.assertEqual(START, parse_timestamp("2026-01-01T00:00:00Z"))
        now = parse_timestamp("2026-11-28T12:30:15Z")
        with patch("data_collection.datetime") as clock:
            clock.now.return_value = now
            end = default_end()
        self.assertEqual(end, parse_timestamp("2026-11-28T00:00:00Z"))
        self.assertEqual(len(list(archive_hours(START, end))), 7944)

    def test_lifecycle_and_exports(self):
        opening = event(
            1, "opened", "00:10:00", title="Title, with punctuation", body="First\nsecond",
            user={
                "followers": 0, "created_at": "2020-05-01T01:00:00+01:00",
                "bio": "a public bio", "email": None,
            },
        )
        no_metadata = event(2, "opened", "00:13:00", body="")
        del no_metadata["repo"]
        del no_metadata["actor"]
        bot = event(4, "opened", "00:20:00", "app[BoT]")
        session = MagicMock()
        session.get.side_effect = [
            archive_response(
                event(1, "closed", "00:12:00", "maintainer"),
                event(2, "closed", "00:15:00"),
                event(3, "opened", "00:16:00"),
                event(3, "closed", "02:00:00", merged=True),
                event(5, "closed", "00:07:00", merged=True),
                event(6, "closed", "00:35:00", merged=False),
                event(8, "opened", "00:04:59"),
                event(8, "closed", "00:08:00", merged=False),
                bot,
                bot,
                event(9, "opened", "00:20:00", "app[bot]"),
                event(4, "closed", "00:21:00", merged=True),
                event(1, "labeled", "00:09:00"),
                event(None, "opened", "00:09:00"),
                {"type": "PushEvent"},
                b"bad json",
            ),
            archive_response(
                opening,
                opening,
                no_metadata,
                event(5, "opened", "00:30:00"),
                event(6, "opened", "00:31:00"),
                event(7, "closed", "01:01:00", merged_at="2026-11-01T01:01:00Z"),
                event(7, "opened", "01:01:00"),
                event(1, "merged", "01:02:00", "maintainer"),
                event(1, "merged", "01:02:00", "maintainer"),
                event(1, "closed", "01:05:00", merged=False),
            ),
        ]

        with self.assertLogs("data_collection", level="WARNING") as logs:
            frame, stats, actions = collect(session, self.start, self.end, self.checkpoints)
        self.assertIn("2026-11-01-0.json.gz: skipped 2", logs.output[0])
        self.assertEqual([call.args[0].rsplit("/", 1)[-1] for call in session.get.call_args_list],
                         ["2026-11-01-0.json.gz", "2026-11-01-1.json.gz"])
        self.assertEqual(stats, Counter(
            archives=2, pr_events=22, unique_opened=8, completed=4, pending=2,
            confirmed_merged=2, confirmed_not_merged=1, unknown_outcome=1,
            malformed=2, excluded_bot_prs=2,
            excluded_bot_accounts=1,
        ))
        self.assertEqual(actions, Counter(opened=11, closed=8, labeled=1, merged=2))
        self.assertEqual(frame.schema, SCHEMA)
        rows = {row["pr_id"]: row for row in frame.to_dicts()}
        self.assertEqual(set(rows), {1, 2, 6, 7})
        self.assertEqual(rows[1]["user_api"], "https://api.github.com/users/creator")
        self.assertEqual(rows[1]["title"], "Title, with punctuation")
        self.assertEqual(rows[1]["description"], "First\nsecond")
        self.assertEqual(rows[1]["user_created_at"], parse_timestamp("2020-05-01T00:00:00Z"))
        self.assertEqual(rows[1]["user_followers"], 0)
        self.assertIs(rows[1]["user_has_bio"], True)
        self.assertIs(rows[1]["user_has_public_email"], False)
        self.assertEqual(rows[1]["terminal_action"], "merged")
        self.assertEqual(rows[1]["closed_at"], parse_timestamp("2026-11-01T01:02:00Z"))
        self.assertIs(rows[1]["merged"], True)
        self.assertIsNone(rows[2]["merged"])
        self.assertIsNone(rows[2]["user_api"])
        self.assertIsNone(rows[2]["repo_id"])
        self.assertEqual(rows[2]["description"], "")
        self.assertIs(rows[6]["merged"], False)
        self.assertIs(rows[7]["merged"], True)
        self.assertEqual(rows[7]["terminal_action"], "closed")

        with TemporaryDirectory() as directory:
            csv, parquet, summary = write_outputs(
                frame, Path(directory) / "output", self.start, self.end, stats, actions
            )
            self.assertIn("20261101T000500Z_20261101T020000Z", csv.name)
            assert_frame_equal(pl.read_csv(csv, schema_overrides=SCHEMA), frame)
            assert_frame_equal(pl.read_parquet(parquet), frame)
            report = json.loads(summary.read_text(encoding="utf-8"))
            self.assertEqual(
                report["start_inclusive"],
                self.start.isoformat(),  # pyright: ignore[reportOptionalMemberAccess]
            )
            self.assertEqual(
                report["end_exclusive"],
                self.end.isoformat(),  # pyright: ignore[reportOptionalMemberAccess]
            )
            self.assertEqual(report["datasets"], {"csv": csv.name, "parquet": parquet.name})
            self.assertEqual(report["actions"], dict(actions))
            self.assertEqual(Counter(report["metrics"]), stats)

    def test_archive_with_no_prs_produces_typed_empty_frame(self):
        session = MagicMock()
        session.get.return_value = archive_response({"type": "PushEvent"})
        end = parse_timestamp("2026-11-01T01:00:00Z")
        frame, stats, actions = collect(session, self.start, end, self.checkpoints)
        self.assertEqual(frame.schema, SCHEMA)
        self.assertTrue(frame.is_empty())
        self.assertEqual(stats["confirmed_merged"], 0)
        self.assertFalse(actions)

    def test_http_error_has_archive_context(self):
        session = MagicMock()
        session.get.return_value = archive_response()
        response = requests.Response()
        response.status_code = 404
        session.get.return_value.raise_for_status.side_effect = requests.HTTPError(
            "404", response=response
        )
        with self.assertRaisesRegex(RuntimeError, r"Download failed.*2026-11-01-0.json.gz.*404"):
            collect(session, self.start, self.end, self.checkpoints)
        session.get.assert_called_once()

    def test_invalid_gzip_has_archive_context(self):
        session = MagicMock()
        session.get.return_value = archive_response()
        session.get.return_value.raw = BytesIO(b"not gzip")
        with self.assertRaisesRegex(RuntimeError, r"Could not decompress 2026-11-01-0.json.gz"):
            collect(session, self.start, self.end, self.checkpoints)

    def test_archive_with_only_malformed_events_fails(self):
        session = MagicMock()
        session.get.return_value = archive_response(b"bad json", {"type": "PullRequestEvent"})
        with self.assertRaisesRegex(ValueError, "2026-11-01-0.json.gz: archive contains no valid"):
            collect(session, self.start, self.end, self.checkpoints)

    @patch("data_collection.sleep")
    def test_retries_timeouts_rate_limits_and_truncation_without_double_counting(self, sleep):
        session = MagicMock()
        limit = requests.Response()
        limit.status_code = 429
        limit.headers["Retry-After"] = "9"
        rate_limited = archive_response()
        rate_limited.raise_for_status.side_effect = requests.HTTPError("429", response=limit)
        opening = event(1, "opened", "00:10:00")
        terminal = event(1, "merged", "00:15:00")
        truncated = archive_response(opening, terminal)
        truncated.raw = BytesIO(truncated.raw.getvalue()[:-4])
        session.get.side_effect = [
            requests.Timeout("connect timeout"), rate_limited, truncated,
            archive_response(opening, terminal),
        ]
        with self.assertLogs("data_collection", level="WARNING"):
            frame, stats, actions = collect(
                session, self.start, parse_timestamp("2026-11-01T01:00:00Z"), self.checkpoints
            )
        self.assertEqual(sleep.call_args_list, [call(2), call(9), call(8)])
        self.assertEqual(frame.height, 1)
        self.assertEqual(stats["archive_retries"], 3)
        self.assertEqual(stats["pr_events"], 2)
        self.assertEqual(stats["archives"], 1)
        self.assertEqual(actions, Counter(opened=1, merged=1))

    @patch("data_collection.sleep")
    def test_exhausted_retry_preserves_and_reuses_previous_day(self, sleep):
        start = parse_timestamp("2026-11-01T23:00:00Z")
        end = parse_timestamp("2026-11-02T01:00:00Z")
        session = MagicMock()
        terminal = event(5, "merged", "00:05:00")
        terminal["created_at"] = "2026-11-02T00:05:00Z"
        session.get.side_effect = [archive_response(terminal), *[requests.Timeout()] * 5]
        with self.assertLogs("data_collection", level="WARNING"):
            with self.assertRaisesRegex(RuntimeError, "2026-11-02-0.json.gz"):
                collect(session, start, end, self.checkpoints)
        self.assertEqual(sleep.call_args_list, [call(2), call(4), call(8), call(16)])
        session.reset_mock()
        session.get.side_effect = [archive_response(event(5, "opened", "23:59:00"))]
        frame, stats, actions = collect(session, start, end, self.checkpoints)
        session.get.assert_called_once()
        self.assertEqual(frame["pr_id"].to_list(), [5])
        self.assertEqual(stats["archives"], 2)
        self.assertEqual(actions, Counter(opened=1, merged=1))


if __name__ == "__main__":
    unittest.main()
