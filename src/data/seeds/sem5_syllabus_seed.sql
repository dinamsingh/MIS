-- ============================================================================
-- Seed: sem5_syllabus_seed
-- RGPV CSE V-Semester master syllabus (units + topics) for the Syllabus Tracker.
--
-- Content matched to the official RGPV "New Scheme Based On AICTE Flexible
-- Curricula, Computer Science and Engineering, V-Semester" document, subject by
-- subject, unit by unit:
--   CS-501  Theory of Computation            (5 units)
--   CS-502  Database Management Systems       (5 units)
--   CS-503A Data Analytics        (Dept. Elective)      (5 units)
--   CS-503B Pattern Recognition   (Dept. Elective)      (5 units)
--   CS-503C Cyber Security        (Dept. Elective)      (5 units)
--   CS-504A Internet and Web Technology  (Open Elective) (5 units)
--   CS-504B Object Oriented Programming  (Open Elective) (5 units)
--   CS-504C Introduction to DBMS         (Open Elective) (5 units)
--   CS-505  Linux (LAB)                    (6 topic blocks)
--   CS-506  Python (LAB)                   (15 experiments, grouped in 5 units)
--
-- Note: CS-506 in the scheme is only a "List of Experiments (Please Expand it)"
-- with no theory units, so its 15 programs are grouped into 5 logical units for
-- tracking. Projects/internships and book lists are excluded.
--
-- Requires: migration 0018 (syllabus tables) + 0021 (sem-5 subjects/electives).
-- Idempotent & progress-safe: a subject is seeded only if it has no units yet,
-- so re-running never duplicates rows and never wipes teachers' progress.
-- To re-seed one subject, first delete its units, e.g.:
--   delete from public.syllabus_units u using public.syllabus_subjects s
--   where u.subject_id = s.id and s.code = 'CS-503B' and s.sem = 5;
-- ============================================================================

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-501  Theory of Computation
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-501' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction of Automata Theory', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Examples of automata machines', 1),
            (v_unit, 'Finite Automata as a language acceptor and translator', 2),
            (v_unit, 'Moore machines', 3),
            (v_unit, 'Mealy machines', 4),
            (v_unit, 'Composite machine', 5),
            (v_unit, 'Conversion from Mealy to Moore and vice versa', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Types of Finite Automata', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Non Deterministic Finite Automata (NDFA)', 1),
            (v_unit, 'Deterministic Finite Automata (DFA)', 2),
            (v_unit, 'Conversion of NDFA to DFA', 3),
            (v_unit, 'Minimization of automata machines', 4),
            (v_unit, 'Regular expression', 5),
            (v_unit, 'Arden''s theorem', 6),
            (v_unit, 'Meaning of union, intersection, concatenation and closure', 7),
            (v_unit, '2-way DFA', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Grammars', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Types of grammar', 1),
            (v_unit, 'Context sensitive grammar', 2),
            (v_unit, 'Context free grammar', 3),
            (v_unit, 'Regular grammar', 4),
            (v_unit, 'Derivation trees', 5),
            (v_unit, 'Ambiguity in grammar', 6),
            (v_unit, 'Simplification of context free grammar', 7),
            (v_unit, 'Conversion of grammar to automata machine and vice versa', 8),
            (v_unit, 'Chomsky hierarchy of grammar', 9),
            (v_unit, 'Killing null and unit productions', 10),
            (v_unit, 'Chomsky normal form', 11),
            (v_unit, 'Greibach normal form', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Push Down Automata', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Example of PDA', 1),
            (v_unit, 'Deterministic and non-deterministic PDA', 2),
            (v_unit, 'Conversion of PDA into context free grammar and vice versa', 3),
            (v_unit, 'CFG equivalent to PDA', 4),
            (v_unit, 'Petrinet model', 5);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Turing Machine', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Techniques for construction', 1),
            (v_unit, 'Universal Turing machine', 2),
            (v_unit, 'Multitape, multihead and multidimensional Turing machine', 3),
            (v_unit, 'NP-complete problems', 4),
            (v_unit, 'Decidability and recursively enumerable languages', 5),
            (v_unit, 'Decidable languages', 6),
            (v_unit, 'Undecidable languages', 7),
            (v_unit, 'Halting problem of Turing machine', 8),
            (v_unit, 'Post correspondence problem', 9);
    end if;

    -- ========================================================================
    -- CS-502  Database Management Systems
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-502' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'DBMS Concepts and Architecture', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction; database approach v/s traditional file accessing approach', 1),
            (v_unit, 'Advantages of database systems', 2),
            (v_unit, 'Data models, schemas and instances', 3),
            (v_unit, 'Data independence', 4),
            (v_unit, 'Database language and interfaces', 5),
            (v_unit, 'Overall database structure', 6),
            (v_unit, 'Functions of DBA and designer', 7),
            (v_unit, 'ER data model: entities and attributes, entity types', 8),
            (v_unit, 'Defining the E-R diagram', 9),
            (v_unit, 'Generalization, aggregation and specialization', 10),
            (v_unit, 'Transforming ER diagram into tables', 11),
            (v_unit, 'Object oriented, network and relational data models; comparison', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Relational Data Models', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Domains, tuples, attributes, relations', 1),
            (v_unit, 'Characteristics of relations', 2),
            (v_unit, 'Keys, key attributes of relation', 3),
            (v_unit, 'Relational database, schemas, integrity constraints', 4),
            (v_unit, 'Referential integrity', 5),
            (v_unit, 'Intension and extension', 6),
            (v_unit, 'Relational query languages: SQL-DDL, DML, integrity constraints', 7),
            (v_unit, 'Complex queries, various joins, indexing, triggers, assertions', 8),
            (v_unit, 'Relational algebra operations: select, project, join, division, outer union', 9),
            (v_unit, 'Tuple oriented and domain oriented relational calculus', 10);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Database Design', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction to normalization', 1),
            (v_unit, 'Normal forms', 2),
            (v_unit, 'Functional dependency', 3),
            (v_unit, 'Decomposition', 4),
            (v_unit, 'Dependency preservation and lossless join', 5),
            (v_unit, 'Problems with null valued and dangling tuples', 6),
            (v_unit, 'Multivalued dependencies', 7),
            (v_unit, 'Query optimization: introduction and steps of optimization', 8),
            (v_unit, 'Algorithms to implement select, project and join operations', 9),
            (v_unit, 'Optimization methods: heuristic based, cost estimation based', 10);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Transaction Processing and Concurrency Control', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Transaction system', 1),
            (v_unit, 'Testing of serializability', 2),
            (v_unit, 'Serializability of schedules; conflict and view serializable schedule', 3),
            (v_unit, 'Recoverability; recovery from transaction failures', 4),
            (v_unit, 'Log based recovery; checkpoints', 5),
            (v_unit, 'Deadlock handling', 6),
            (v_unit, 'Concurrency control; locking techniques', 7),
            (v_unit, 'Time stamping protocols; validation based protocol', 8),
            (v_unit, 'Multiple granularity; multi version schemes', 9),
            (v_unit, 'Recovery with concurrent transaction', 10),
            (v_unit, 'Introduction to distributed databases, data mining, data warehousing', 11),
            (v_unit, 'Object technology and DBMS; OODBMS vs DBMS', 12),
            (v_unit, 'Temporal, deductive, multimedia, web and mobile databases', 13);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'RDBMS through Oracle / PL-SQL / MySQL', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Architecture, physical files, memory structures, background process', 1),
            (v_unit, 'Table spaces, segments, extents and block', 2),
            (v_unit, 'Dedicated server, multi threaded server', 3),
            (v_unit, 'Distributed database, database links and snapshot', 4),
            (v_unit, 'Data dictionary and dynamic performance view', 5),
            (v_unit, 'Security, role, privilege management, profiles, invoker defined security model', 6),
            (v_unit, 'SQL queries and joins: equi, non equi, self, outer', 7),
            (v_unit, 'Usage of like, any, all, exists, in special operators', 8),
            (v_unit, 'Hierarchical, inline and flashback queries', 9),
            (v_unit, 'ANSI SQL, anonymous and nested anonymous blocks, branching and looping', 10),
            (v_unit, 'Cursor management: nested and parameterized cursors', 11),
            (v_unit, 'Oracle exception handling mechanism', 12),
            (v_unit, 'Stored procedures; in, out, in-out parameters', 13),
            (v_unit, 'User defined functions and their limitations', 14),
            (v_unit, 'Triggers, mutating errors, instead of triggers', 15);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-503A  Data Analytics  (Departmental Elective)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-503A' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Descriptive Statistics', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Probability distributions', 1),
            (v_unit, 'Inferential statistics', 2),
            (v_unit, 'Inferential statistics through hypothesis tests', 3),
            (v_unit, 'Regression and ANOVA', 4),
            (v_unit, 'Regression ANOVA (Analysis of Variance)', 5);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Introduction to Big Data and Big Data Technologies', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Big Data and its importance', 1),
            (v_unit, 'Four V''s of Big Data', 2),
            (v_unit, 'Drivers for Big Data', 3),
            (v_unit, 'Introduction to Big Data Analytics', 4),
            (v_unit, 'Big Data Analytics applications', 5),
            (v_unit, 'Hadoop''s parallel world', 6),
            (v_unit, 'Data discovery', 7),
            (v_unit, 'Open source technology for Big Data Analytics', 8),
            (v_unit, 'Cloud and Big Data', 9),
            (v_unit, 'Predictive analytics', 10),
            (v_unit, 'Mobile business intelligence and Big Data', 11),
            (v_unit, 'Crowd sourcing analytics', 12),
            (v_unit, 'Inter- and trans-firewall analytics', 13),
            (v_unit, 'Information management', 14);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Processing Big Data', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Integrating disparate data stores', 1),
            (v_unit, 'Mapping data to the programming framework', 2),
            (v_unit, 'Connecting and extracting data from storage', 3),
            (v_unit, 'Transforming data for processing', 4),
            (v_unit, 'Subdividing data in preparation for Hadoop MapReduce', 5);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Hadoop MapReduce', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Employing Hadoop MapReduce', 1),
            (v_unit, 'Creating the components of Hadoop MapReduce jobs', 2),
            (v_unit, 'Distributing data processing across server farms', 3),
            (v_unit, 'Executing Hadoop MapReduce jobs', 4),
            (v_unit, 'Monitoring the progress of job flows', 5),
            (v_unit, 'The building blocks of Hadoop MapReduce', 6),
            (v_unit, 'Distinguishing Hadoop daemons', 7),
            (v_unit, 'Investigating the Hadoop Distributed File System (HDFS)', 8),
            (v_unit, 'Selecting execution modes: local, pseudo-distributed, fully distributed', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Big Data Tools and Techniques', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Installing and running Pig', 1),
            (v_unit, 'Comparison with databases', 2),
            (v_unit, 'Pig Latin', 3),
            (v_unit, 'User-defined functions', 4),
            (v_unit, 'Data processing operators', 5),
            (v_unit, 'Installing and running Hive', 6),
            (v_unit, 'HiveQL and querying data', 7),
            (v_unit, 'User-defined functions in Hive', 8),
            (v_unit, 'Oracle Big Data', 9);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-503B  Pattern Recognition  (Departmental Elective)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-503B' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Definitions, data sets for pattern', 1),
            (v_unit, 'Application areas and examples of pattern recognition', 2),
            (v_unit, 'Design principles of pattern recognition system', 3),
            (v_unit, 'Classification and clustering', 4),
            (v_unit, 'Supervised learning', 5),
            (v_unit, 'Unsupervised learning and adaptation', 6),
            (v_unit, 'Pattern recognition approaches', 7),
            (v_unit, 'Decision boundaries and decision region', 8),
            (v_unit, 'Metric spaces and distances', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Classification', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction and application of classification', 1),
            (v_unit, 'Types of classification', 2),
            (v_unit, 'Decision tree', 3),
            (v_unit, 'Naive Bayes', 4),
            (v_unit, 'Logistic regression', 5),
            (v_unit, 'Support vector machine', 6),
            (v_unit, 'Random forest', 7),
            (v_unit, 'K nearest neighbour classifier and variants', 8),
            (v_unit, 'Efficient algorithms for nearest neighbour classification', 9),
            (v_unit, 'Different approaches to prototype selection', 10),
            (v_unit, 'Combination of classifiers', 11),
            (v_unit, 'Training set, test set, standardization and normalization', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Clustering', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Different paradigms of pattern recognition', 1),
            (v_unit, 'Representations of patterns and classes', 2),
            (v_unit, 'Unsupervised learning and clustering', 3),
            (v_unit, 'Criterion functions for clustering', 4),
            (v_unit, 'Iterative square-error partitional clustering (K-means)', 5),
            (v_unit, 'Hierarchical clustering', 6),
            (v_unit, 'Cluster validation', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Feature Extraction and Feature Selection', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction of feature extraction and feature selection', 1),
            (v_unit, 'Types of feature extraction', 2),
            (v_unit, 'Problem statement and uses', 3),
            (v_unit, 'Branch and bound algorithm', 4),
            (v_unit, 'Sequential forward / backward selection algorithms', 5),
            (v_unit, '(l, r) algorithm', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Recent Advances', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Recent advances in pattern recognition', 1),
            (v_unit, 'Structural pattern recognition', 2),
            (v_unit, 'Support vector machines (SVMs)', 3),
            (v_unit, 'Fuzzy C-means (FCM)', 4),
            (v_unit, 'Soft computing and neuro-fuzzy techniques', 5),
            (v_unit, 'Real-life examples', 6),
            (v_unit, 'Histogram rules', 7),
            (v_unit, 'Density estimation', 8),
            (v_unit, 'Nearest neighbor rule', 9),
            (v_unit, 'Fuzzy classification', 10);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-503C  Cyber Security  (Departmental Elective)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-503C' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction to Cyber Crime', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction of cyber crime', 1),
            (v_unit, 'Challenges of cyber crime', 2),
            (v_unit, 'Classifications of cybercrimes', 3),
            (v_unit, 'E-mail spoofing', 4),
            (v_unit, 'Spamming', 5),
            (v_unit, 'Internet time theft', 6),
            (v_unit, 'Salami attack / Salami technique', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Types of Cyber Crimes', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Web jacking', 1),
            (v_unit, 'Online frauds', 2),
            (v_unit, 'Software piracy', 3),
            (v_unit, 'Computer network intrusions', 4),
            (v_unit, 'Password sniffing', 5),
            (v_unit, 'Identity theft', 6),
            (v_unit, 'Cyber terrorism', 7),
            (v_unit, 'Virtual crime', 8),
            (v_unit, 'Perception of cyber criminals: hackers, insurgents and extremist groups', 9),
            (v_unit, 'Web servers hacking', 10),
            (v_unit, 'Session hijacking', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Cyber Crime and Criminal Justice', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Concept of cyber crime and the IT Act, 2000', 1),
            (v_unit, 'Hacking', 2),
            (v_unit, 'Teenage web vandals', 3),
            (v_unit, 'Cyber fraud and cheating', 4),
            (v_unit, 'Defamation', 5),
            (v_unit, 'Harassment and e-mail abuse', 6),
            (v_unit, 'Other IT Act offences', 7),
            (v_unit, 'Monetary penalties', 8),
            (v_unit, 'Jurisdiction and cyber crimes', 9),
            (v_unit, 'Nature of criminality', 10),
            (v_unit, 'Strategies to tackle cyber crime and trends', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Indian Evidence Act vs Information Technology Act', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'The Indian Evidence Act of 1872 v. Information Technology Act, 2000', 1),
            (v_unit, 'Status of electronic records as evidence', 2),
            (v_unit, 'Proof and management of electronic records', 3),
            (v_unit, 'Relevancy, admissibility and probative value of e-evidence', 4),
            (v_unit, 'Proving digital signatures', 5),
            (v_unit, 'Proof of electronic agreements', 6),
            (v_unit, 'Proving electronic messages', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Tools and Methods in Cybercrime', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Proxy servers and anonymizers', 1),
            (v_unit, 'Password cracking', 2),
            (v_unit, 'Keyloggers and spyware', 3),
            (v_unit, 'Virus and worms', 4),
            (v_unit, 'Trojan horses', 5),
            (v_unit, 'Backdoors', 6),
            (v_unit, 'DoS and DDoS attacks', 7),
            (v_unit, 'Buffer overflow', 8),
            (v_unit, 'Attack on wireless networks', 9),
            (v_unit, 'Phishing: method of phishing', 10),
            (v_unit, 'Phishing techniques', 11);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-504A  Internet and Web Technology  (Open Elective)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-504A' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction and Web Design', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Concept of WWW; Internet and WWW', 1),
            (v_unit, 'HTTP protocol: request and response', 2),
            (v_unit, 'Web browser and web servers', 3),
            (v_unit, 'Features of Web 2.0', 4),
            (v_unit, 'Concepts of effective web design', 5),
            (v_unit, 'Web design issues: browser, bandwidth and cache', 6),
            (v_unit, 'Display resolution; look and feel of the website', 7),
            (v_unit, 'Page layout and linking', 8),
            (v_unit, 'User centric design; sitemap', 9),
            (v_unit, 'Planning and publishing website', 10),
            (v_unit, 'Designing effective navigation', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'HTML', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Basics of HTML', 1),
            (v_unit, 'Formatting and fonts', 2),
            (v_unit, 'Commenting code', 3),
            (v_unit, 'Color and hyperlink', 4),
            (v_unit, 'Lists, tables and images', 5),
            (v_unit, 'Forms', 6),
            (v_unit, 'XHTML', 7),
            (v_unit, 'Meta tags and character entities', 8),
            (v_unit, 'Frames and frame sets', 9),
            (v_unit, 'Browser architecture and website structure', 10),
            (v_unit, 'Overview and features of HTML5', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Style Sheets and JavaScript', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Need for CSS; introduction to CSS', 1),
            (v_unit, 'Basic syntax and structure', 2),
            (v_unit, 'Using CSS; background images, colors and properties', 3),
            (v_unit, 'Manipulating texts; using fonts, borders and boxes', 4),
            (v_unit, 'Margins, padding, lists', 5),
            (v_unit, 'Positioning using CSS; CSS2; overview and features of CSS3', 6),
            (v_unit, 'JavaScript: client side scripting', 7),
            (v_unit, 'Variables, functions, conditions, loops and repetition', 8),
            (v_unit, 'Pop up boxes', 9),
            (v_unit, 'Advance JavaScript: JavaScript and objects, JavaScript own objects', 10),
            (v_unit, 'The DOM and web browser environments; manipulation using DOM', 11),
            (v_unit, 'Forms and validations', 12),
            (v_unit, 'DHTML: combining HTML, CSS and JavaScript; events and buttons', 13);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'XML and PHP', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction to XML; uses of XML', 1),
            (v_unit, 'Simple XML; XML key components', 2),
            (v_unit, 'DTD and schemas', 3),
            (v_unit, 'Using XML with application', 4),
            (v_unit, 'Transforming XML using XSL and XSLT', 5),
            (v_unit, 'PHP: introduction and basic syntax', 6),
            (v_unit, 'Decision and looping with examples', 7),
            (v_unit, 'PHP and HTML; arrays; functions', 8),
            (v_unit, 'Browser control and detection; string; form processing; files', 9),
            (v_unit, 'Cookies and sessions', 10),
            (v_unit, 'Object oriented programming with PHP', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'PHP and MySQL', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Basic commands with PHP examples', 1),
            (v_unit, 'Connection to server', 2),
            (v_unit, 'Creating database; selecting a database', 3),
            (v_unit, 'Listing database; listing table names', 4),
            (v_unit, 'Creating a table; inserting data', 5),
            (v_unit, 'Altering tables; queries', 6),
            (v_unit, 'Deleting database; deleting data and tables', 7),
            (v_unit, 'PHP myAdmin and database bugs', 8);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-504B  Object Oriented Programming  (Open Elective)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-504B' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Basics of Programming', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Character set', 1),
            (v_unit, 'Constants, variables, keywords, identifiers, literals', 2),
            (v_unit, 'Type declaration instruction', 3),
            (v_unit, 'Arithmetic: integer, long, short; signed and unsigned', 4),
            (v_unit, 'Storage classes', 5),
            (v_unit, 'Integer and float conversions', 6),
            (v_unit, 'Type conversion in assignment', 7),
            (v_unit, 'Hierarchy of operations', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Decision Control and Loop Control Structures', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Control instructions; if, if-else', 1),
            (v_unit, 'Use of logical operator; hierarchy of logical operators', 2),
            (v_unit, 'Arithmetic operators; relational operators', 3),
            (v_unit, 'Assignment operators; increment and decrement operators', 4),
            (v_unit, 'Conditional operators; bitwise operators', 5),
            (v_unit, 'Special operators (&, *, ., ->, sizeof)', 6),
            (v_unit, 'while loop, for loop, do-while loop', 7),
            (v_unit, 'Odd loop; nested loop', 8),
            (v_unit, 'break, continue', 9),
            (v_unit, 'Case control structure; goto; exit statement', 10);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Arrays and Strings', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'What are arrays; array initialization', 1),
            (v_unit, 'Bound checking', 2),
            (v_unit, '1D array; 2D array', 3),
            (v_unit, 'Initialization of 1D and 2D array', 4),
            (v_unit, 'Memory map of 1D and 2D array', 5),
            (v_unit, 'Multidimensional array', 6),
            (v_unit, 'Strings: what are strings', 7),
            (v_unit, 'Standard library string functions: strlen(), strcpy(), strcat(), strcmp()', 8),
            (v_unit, '2D array of characters', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Structure, Preprocessor and Union', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Why use structure; declaration of structure', 1),
            (v_unit, 'Accessing structure elements; how structure elements are stored', 2),
            (v_unit, 'Array of structure; uses of structure', 3),
            (v_unit, 'Preprocessor: features; macro expansion; macro with arguments', 4),
            (v_unit, 'File inclusion; conditional compilation (#if, #elif)', 5),
            (v_unit, 'Miscellaneous directives: #include, #define, #undef, #pragma', 6),
            (v_unit, 'Union: definition and declaration; accessing a union member', 7),
            (v_unit, 'Union of structures; initialization of union member', 8),
            (v_unit, 'Uses of union; use of user defined data types', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Object Oriented Programming Concepts', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Basic concepts of OOP: object, class', 1),
            (v_unit, 'Data abstraction and data encapsulation', 2),
            (v_unit, 'Inheritance', 3),
            (v_unit, 'Polymorphism', 4),
            (v_unit, 'Static and dynamic binding', 5),
            (v_unit, 'Message passing', 6),
            (v_unit, 'Benefits and disadvantages of OOP', 7),
            (v_unit, 'Applications of OOP', 8),
            (v_unit, 'A simple program; anatomy of program', 9),
            (v_unit, 'Creating a source file; compiling and linking', 10);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-504C  Introduction to Database Management Systems  (Open Elective)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-504C' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Database Management System Concepts', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction; significance of database', 1),
            (v_unit, 'Database system applications', 2),
            (v_unit, 'Data independence', 3),
            (v_unit, 'Data modeling for a database', 4),
            (v_unit, 'Entities and their attributes', 5),
            (v_unit, 'Entities, attributes, relationships and relationship types', 6),
            (v_unit, 'Advantages and disadvantages of DBMS', 7),
            (v_unit, 'DBMS vs RDBMS', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Database Models and Implementation', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Data model and types of data model', 1),
            (v_unit, 'Relational data model', 2),
            (v_unit, 'Hierarchical model', 3),
            (v_unit, 'Network data model', 4),
            (v_unit, 'Object/relational model', 5),
            (v_unit, 'Object-oriented model', 6),
            (v_unit, 'Entity-relationship model; modeling using E-R diagrams', 7),
            (v_unit, 'Notation used in E-R model', 8),
            (v_unit, 'Relationships and relationship types', 9),
            (v_unit, 'Associative database model', 10);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'SQL - Data Definition Language', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Categories of SQL commands', 1),
            (v_unit, 'Data Definition Language', 2),
            (v_unit, 'Create table', 3),
            (v_unit, 'Drop table', 4),
            (v_unit, 'Alter table', 5),
            (v_unit, 'Primary key; foreign key', 6),
            (v_unit, 'Truncate table', 7),
            (v_unit, 'Index', 8),
            (v_unit, 'Cursor', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'SQL - Data Manipulation Language', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Data Manipulation Language', 1),
            (v_unit, 'Insert statement', 2),
            (v_unit, 'Multiple inserts', 3),
            (v_unit, 'Delete statement', 4),
            (v_unit, 'Delete with conditions', 5),
            (v_unit, 'Update statement', 6),
            (v_unit, 'Update with conditions', 7),
            (v_unit, 'Merge statement', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'SQL - SELECT and Queries', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'SQL queries', 1),
            (v_unit, 'Data extraction from single and multiple tables', 2),
            (v_unit, 'equi-join, non equi-join, self-join, outer join', 3),
            (v_unit, 'Usage of like, any, all, exists, in special operators', 4),
            (v_unit, 'Hierarchical queries; inline queries; flashback queries', 5),
            (v_unit, 'Introduction of ANSI SQL', 6),
            (v_unit, 'Anonymous block; nested anonymous block', 7),
            (v_unit, 'Branching and looping constructs in ANSI SQL', 8);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-505  Linux (LAB)  -- 6 topic blocks from the scheme
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-505' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Overview of Unix/Linux', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Concepts', 1),
            (v_unit, 'Unix/Linux installation process', 2),
            (v_unit, 'Hardware requirements for Unix/Linux', 3),
            (v_unit, 'Advantages of Unix/Linux', 4),
            (v_unit, 'Reasons for popularity and success of Linux/Unix', 5),
            (v_unit, 'Features of Linux/Unix operating system', 6),
            (v_unit, 'Kernel and kernel functions', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'The Shell and Shell Programming', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'The shell basic commands', 1),
            (v_unit, 'Shell variables', 2),
            (v_unit, 'Branching control structures', 3),
            (v_unit, 'Loop-control structure', 4),
            (v_unit, 'Continue and break statements', 5),
            (v_unit, 'Sleep command', 6),
            (v_unit, 'Debugging script', 7),
            (v_unit, 'Use of Linux as web server, file server, directory server, application server', 8),
            (v_unit, 'Use of Linux as DNS server, SMTP server, firewall, proxy server', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'File System', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Definition of file system', 1),
            (v_unit, 'Defining geometry', 2),
            (v_unit, 'Disk controller', 3),
            (v_unit, 'Solaris file system', 4),
            (v_unit, 'Disk based file systems', 5),
            (v_unit, 'Network-based file systems', 6),
            (v_unit, 'Virtual file systems', 7),
            (v_unit, 'UFS file system', 8),
            (v_unit, 'The boot block, the super block, the inode', 9),
            (v_unit, 'Tuning file system', 10),
            (v_unit, 'Repairing file system', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Process Control', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Viewing a process', 1),
            (v_unit, 'Command to display process', 2),
            (v_unit, 'Process attributes', 3),
            (v_unit, 'Process states', 4),
            (v_unit, 'Process fields', 5),
            (v_unit, 'PS command options', 6),
            (v_unit, 'PGREP, PRSTAT', 7),
            (v_unit, 'CDE process manager', 8),
            (v_unit, 'Scheduling process and scheduling priorities', 9),
            (v_unit, 'Changing the priority of a time-sharing process', 10),
            (v_unit, 'Killing process', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'System Security', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Physical security', 1),
            (v_unit, 'Controlling system access', 2),
            (v_unit, 'Restricted shells', 3),
            (v_unit, 'Controlling file access; file access commands', 4),
            (v_unit, 'Access Control List (ACLs)', 5),
            (v_unit, 'Setting ACL entries', 6),
            (v_unit, 'Modifying ACL entries on a file', 7),
            (v_unit, 'Deleting ACL entries on a file', 8),
            (v_unit, 'Restricting FTP', 9),
            (v_unit, 'Securing super user access; restricting root access', 10),
            (v_unit, 'Monitoring super user access', 11),
            (v_unit, 'TCP wrappers', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 6, 'Dynamic Host Configuration Protocol (DHCP)', 6) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction', 1),
            (v_unit, 'DHCP leased time', 2),
            (v_unit, 'DHCP scopes', 3),
            (v_unit, 'DHCP IP address', 4),
            (v_unit, 'Allocation types', 5),
            (v_unit, 'Planning DHCP deployment', 6),
            (v_unit, 'DHCP configuration files', 7),
            (v_unit, 'Automatic startup of DHCP server', 8),
            (v_unit, 'Configuration of DHCP clients', 9),
            (v_unit, 'Manually configuring the DHCP', 10);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-506  Python (LAB)
    -- The scheme lists only 15 experiments ("Please Expand it"); they are
    -- grouped here into 5 logical units so each program can be tracked.
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-506' and sem = 5 limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Basics and Numeric Programs', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Program to find GCD of two numbers', 1),
            (v_unit, 'Program to find the square root of a number by Newton''s method', 2),
            (v_unit, 'Program to find the exponentiation of a number', 3),
            (v_unit, 'Program to find first n prime numbers', 4);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Lists and Searching', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Program to find the maximum from a list of numbers', 1),
            (v_unit, 'Program to perform linear search', 2),
            (v_unit, 'Program to perform binary search', 3);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Sorting Techniques', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Program to perform selection sort', 1),
            (v_unit, 'Program to perform insertion sort', 2),
            (v_unit, 'Program to perform merge sort', 3);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Matrices, Command Line and Files', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Program to multiply matrices', 1),
            (v_unit, 'Program for command line arguments', 2),
            (v_unit, 'Program to find the most frequent words in a text read from a file', 3);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Graphics with Pygame', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Program to simulate elliptical orbits in Pygame', 1),
            (v_unit, 'Program for a bouncing ball in Pygame', 2);
    end if;
end $$;
