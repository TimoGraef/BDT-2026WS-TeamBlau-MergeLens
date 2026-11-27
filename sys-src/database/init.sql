CREATE TABLE pull_requests (
    repository_id BIGINT NOT NULL,
    pr_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    outcome TEXT CHECK (outcome IN ('merged', 'closed_unmerged')),
    PRIMARY KEY (repository_id, pr_number)
);