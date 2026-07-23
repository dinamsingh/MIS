-- ============================================================================
-- Seed: Onboarding — live batches + RGPV B.Tech CSE syllabus (Sem 1–8)
-- Requires migration 0010_onboarding_schema.sql.
-- Idempotent: ON CONFLICT DO NOTHING.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Batches (status != 'graduated' → "live"; graduated one is excluded in UI)
-- ----------------------------------------------------------------------------
INSERT INTO public.batches (id, start_year, current_sem, status) VALUES
    ('2026-30', 2026, 1, 'classes'),
    ('2025-29', 2025, 3, 'classes'),
    ('2024-28', 2024, 5, 'classes'),
    ('2023-27', 2023, 7, 'classes'),
    ('2022-26', 2022, 8, 'graduated'),
    ('2021-25', 2021, 8, 'graduated')
ON CONFLICT (id) DO UPDATE
SET start_year = EXCLUDED.start_year,
    current_sem = EXCLUDED.current_sem,
    status = EXCLUDED.status;

-- ----------------------------------------------------------------------------
-- Syllabus subjects. kind: theory | lab | project | elective | special.
-- lab_name set on theory subjects that carry an attached lab.
-- ----------------------------------------------------------------------------
INSERT INTO public.syllabus_subjects (sem, code, name, kind, lab_name) VALUES
    -- Sem 1 (I)
    (1, 'BT-101', 'Engineering Chemistry', 'theory', 'Engineering Chemistry Lab'),
    (1, 'BT-102', 'Mathematics-I', 'theory', NULL),
    (1, 'BT-103', 'English for Communication', 'theory', 'English Communication Lab'),
    (1, 'BT-104', 'Basic Electrical & Electronics Engineering', 'theory', 'Basic Electrical & Electronics Lab'),
    (1, 'BT-105', 'Engineering Graphics', 'theory', 'Engineering Graphics Lab'),
    (1, 'BT-106', 'Manufacturing Practices (Lab)', 'lab', NULL),
    (1, 'BT-107', 'Internship-I', 'special', NULL),
    (1, 'BT-108', 'Rural Outreach / Swachh Bharat Internship', 'special', NULL),

    -- Sem 2 (II)
    (2, 'BT-201', 'Engineering Physics', 'theory', 'Engineering Physics Lab'),
    (2, 'BT-202', 'Mathematics-II', 'theory', NULL),
    (2, 'BT-203', 'Basic Mechanical Engineering', 'theory', 'Basic Mechanical Engineering Lab'),
    (2, 'BT-204', 'Basic Civil Engineering & Mechanics', 'theory', 'Basic Civil Engineering & Mechanics Lab'),
    (2, 'BT-205', 'Basic Computer Engineering', 'theory', 'Basic Computer Engineering Lab'),
    (2, 'BT-206', 'Language Lab & Seminars', 'lab', NULL),

    -- Sem 3 (III)
    (3, 'ES-301', 'Energy & Environmental Engineering', 'theory', NULL),
    (3, 'CS-302', 'Discrete Structure', 'theory', NULL),
    (3, 'CS-303', 'Data Structure', 'theory', 'Data Structure Lab'),
    (3, 'CS-304', 'Digital Systems', 'theory', 'Digital Systems Lab'),
    (3, 'CS-305', 'Object Oriented Programming & Methodology', 'theory', 'OOP Lab'),
    (3, 'CS-306', 'Computer Workshop (Lab)', 'lab', NULL),
    (3, 'BT-307', 'Internship-II', 'special', NULL),

    -- Sem 4 (IV)
    (4, 'BT-401', 'Mathematics-III', 'theory', NULL),
    (4, 'CS-402', 'Analysis & Design of Algorithms', 'theory', 'ADA Lab'),
    (4, 'CS-403', 'Software Engineering', 'theory', 'Software Engineering Lab'),
    (4, 'CS-404', 'Computer Organization & Architecture', 'theory', 'COA Lab'),
    (4, 'CS-405', 'Operating Systems', 'theory', 'Operating Systems Lab'),
    (4, 'CS-406', 'Programming Practices (Lab)', 'lab', NULL),
    (4, 'BT-407', 'Internship-II', 'special', NULL),
    (4, 'BT-408', 'Cyber Security (Audit)', 'special', NULL),

    -- Sem 5 (V)
    (5, 'CS-501', 'Theory of Computation', 'theory', 'TOC Lab'),
    (5, 'CS-502', 'Database Management Systems', 'theory', 'DBMS Lab'),
    (5, 'CS-503', 'Departmental Elective-I', 'elective', NULL),
    (5, 'CS-504', 'Open Elective-I', 'elective', NULL),
    (5, 'CS-505', 'Mini Project', 'project', NULL),
    (5, 'CS-506', 'Skill Development / Practical', 'lab', NULL),

    -- Sem 6 (VI)
    (6, 'CS-601', 'Machine Learning', 'theory', 'Machine Learning Lab'),
    (6, 'CS-602', 'Computer Networks', 'theory', 'Computer Networks Lab'),
    (6, 'CS-603', 'Departmental Elective-II', 'elective', NULL),
    (6, 'CS-604', 'Open Elective-II', 'elective', NULL),
    (6, 'CS-605', 'Minor Project', 'project', NULL),
    (6, 'CS-606', 'Internship / Skill Development', 'special', NULL),

    -- Sem 7 (VII)
    (7, 'CS-701', 'Software Architectures', 'theory', NULL),
    (7, 'CS-702A', 'Computational Intelligence', 'theory', NULL),
    (7, 'CS-702B', 'Deep & Reinforcement Learning', 'theory', NULL),
    (7, 'CS-702C', 'Wireless & Mobile Computing', 'theory', NULL),
    (7, 'CS-702D', 'Big Data', 'theory', NULL),
    (7, 'CS-703A', 'Cryptography & Information Security', 'theory', NULL),
    (7, 'CS-703B', 'Data Mining and Warehousing', 'theory', NULL),
    (7, 'CS-703C', 'Agile Software Development', 'theory', NULL),
    (7, 'CS-703D', 'Disaster Management', 'theory', NULL),
    (7, 'CS-7006', 'Major Project Phase-I', 'project', NULL),
    (7, 'CS-7007', 'Seminar', 'special', NULL),

    -- Sem 8 (VIII)
    (8, 'CS-8001', 'Major Project Phase-II', 'project', NULL),
    (8, 'CS-8002', 'Comprehensive Viva', 'special', NULL),
    (8, 'CS-8003', 'Industrial Training / Internship', 'special', NULL)
ON CONFLICT DO NOTHING;
