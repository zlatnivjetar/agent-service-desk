-- Agent Service Desk — Database Verification
-- Run: psql $DATABASE_URL -f seed/verify.sql

\echo '=== Agent Service Desk — Database Verification ==='
\echo ''
\echo '--- Row counts ---'

SELECT
    'organizations'          AS table_name, count(*) AS count FROM organizations
UNION ALL SELECT 'users',                  count(*) FROM users
UNION ALL SELECT 'workspaces',             count(*) FROM workspaces
UNION ALL SELECT 'memberships',            count(*) FROM memberships
UNION ALL SELECT 'workspace_memberships',  count(*) FROM workspace_memberships
UNION ALL SELECT 'sla_policies',           count(*) FROM sla_policies
UNION ALL SELECT 'prompt_versions',        count(*) FROM prompt_versions
UNION ALL SELECT 'tickets',                count(*) FROM tickets
UNION ALL SELECT 'ticket_messages',        count(*) FROM ticket_messages
UNION ALL SELECT 'knowledge_documents',    count(*) FROM knowledge_documents
UNION ALL SELECT 'knowledge_chunks',       count(*) FROM knowledge_chunks
UNION ALL SELECT 'ticket_predictions',     count(*) FROM ticket_predictions
UNION ALL SELECT 'draft_generations',      count(*) FROM draft_generations
UNION ALL SELECT 'approval_actions',       count(*) FROM approval_actions
UNION ALL SELECT 'eval_sets',              count(*) FROM eval_sets
UNION ALL SELECT 'eval_examples',          count(*) FROM eval_examples
ORDER BY table_name;

\echo ''
\echo '--- Minimum volume assertions ---'

DO $$
BEGIN
    ASSERT (SELECT count(*) FROM organizations) >= 100,
        'FAIL: Expected >= 100 organizations';

    ASSERT (SELECT count(*) FROM users) >= 250,
        'FAIL: Expected >= 250 users';

    ASSERT (SELECT count(*) FROM tickets) >= 15000,
        'FAIL: Expected >= 15,000 tickets';

    ASSERT (SELECT count(*) FROM ticket_messages) >= 75000,
        'FAIL: Expected >= 75,000 messages';

    ASSERT (SELECT count(*) FROM knowledge_documents) >= 1000,
        'FAIL: Expected >= 1,000 knowledge docs';

    ASSERT (SELECT count(*) FROM knowledge_chunks) >= 5000,
        'FAIL: Expected >= 5,000 chunks';

    ASSERT (SELECT count(*) FROM eval_examples) >= 150,
        'FAIL: Expected >= 150 eval examples';

    ASSERT (SELECT count(*) FROM sla_policies) >= 10,
        'FAIL: Expected >= 10 SLA policies';

    ASSERT (SELECT count(*) FROM prompt_versions) >= 4,
        'FAIL: Expected >= 4 prompt versions';

    RAISE NOTICE 'All minimum count checks PASSED';
END $$;

\echo ''
\echo '--- Demo accounts ---'

SELECT
    u.email,
    wm.role,
    u.id AS user_id
FROM users u
JOIN workspace_memberships wm ON wm.user_id = u.id
WHERE u.email LIKE '%@demo.com'
ORDER BY u.email;

\echo ''
\echo '--- Demo ticket spread (Org #1) ---'

SELECT
    t.category,
    t.status,
    t.priority,
    count(*) AS ticket_count
FROM tickets t
JOIN organizations o ON o.id = t.org_id
WHERE o.ctid = (SELECT min(ctid) FROM organizations)
GROUP BY t.category, t.status, t.priority
ORDER BY t.category, t.status;

\echo ''
\echo '--- RLS role exists ---'

SELECT rolname, rolcanlogin
FROM pg_roles
WHERE rolname = 'rls_user';

\echo ''
\echo '=== Verification complete ==='
