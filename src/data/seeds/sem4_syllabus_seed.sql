-- ============================================================================
-- Seed: sem4_syllabus_seed
-- RGPV CSE IV-Semester master syllabus (units + topics) for the Syllabus Tracker.
--
-- Populates syllabus_units + syllabus_topics for the sem-4 subjects, keyed to
-- the existing syllabus_subjects by code:
--   BT-401 Mathematics-III, CS-402 ADA, CS-403 Software Engineering,
--   CS-404 Computer Org & Architecture, CS-405 Operating Systems,
--   CS-406 Programming Practices (Java syllabus content).
--
-- Java LAB PROGRAM list is intentionally NOT seeded here (theory/units only).
-- To add it later in one shot, run: seeds/sem4_java_lab_seed.sql
--
-- Idempotent & progress-safe: each subject is seeded only if it has no units
-- yet, so re-running never duplicates rows and never wipes teachers' progress.
-- To re-seed a subject's content, first delete its units, e.g.:
--   delete from public.syllabus_units u using public.syllabus_subjects s
--   where u.subject_id = s.id and s.code = 'CS-405';
--
-- Requires migration 0018_syllabus_master_and_progress.
-- ============================================================================

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- BT-401  Mathematics-III
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'BT-401' limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Numerical Methods - 1', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Bisection method', 1),
            (v_unit, 'Newton-Raphson method', 2),
            (v_unit, 'Regula-Falsi method', 3),
            (v_unit, 'Finite differences', 4),
            (v_unit, 'Relation between operators', 5),
            (v_unit, 'Newton''s forward difference interpolation', 6),
            (v_unit, 'Newton''s backward difference interpolation', 7),
            (v_unit, 'Newton''s divided difference formula', 8),
            (v_unit, 'Lagrange''s interpolation formula', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Numerical Methods - 2', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Numerical differentiation', 1),
            (v_unit, 'Numerical integration: Trapezoidal rule', 2),
            (v_unit, 'Simpson''s 1/3 rule', 3),
            (v_unit, 'Simpson''s 3/8 rule', 4),
            (v_unit, 'Gauss Elimination method', 5),
            (v_unit, 'Gauss Jordan method', 6),
            (v_unit, 'Crout''s method', 7),
            (v_unit, 'Jacobi''s iteration method', 8),
            (v_unit, 'Gauss-Seidel method', 9),
            (v_unit, 'Relaxation method', 10);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Numerical Methods - 3', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Taylor''s series method', 1),
            (v_unit, 'Euler''s method', 2),
            (v_unit, 'Modified Euler''s method', 3),
            (v_unit, 'Runge-Kutta method (4th order)', 4),
            (v_unit, 'Milne''s predictor-corrector method', 5),
            (v_unit, 'Adam''s predictor-corrector method', 6),
            (v_unit, 'PDE: 2D Laplace equation (finite difference)', 7),
            (v_unit, 'PDE: Poisson equation', 8),
            (v_unit, '1D heat equation: Bender-Schmidt method', 9),
            (v_unit, '1D heat equation: Crank-Nicholson method', 10),
            (v_unit, 'Wave equation: explicit finite difference', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Transform Calculus', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Laplace Transform', 1),
            (v_unit, 'Properties of Laplace Transform', 2),
            (v_unit, 'Laplace transform of periodic functions', 3),
            (v_unit, 'Inverse Laplace transform', 4),
            (v_unit, 'Convolution theorem', 5),
            (v_unit, 'Evaluation of integrals by Laplace transform', 6),
            (v_unit, 'Solving ODEs by Laplace transform', 7),
            (v_unit, 'Fourier transforms', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Concept of Probability', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Probability Mass Function', 1),
            (v_unit, 'Probability Density Function', 2),
            (v_unit, 'Binomial distribution', 3),
            (v_unit, 'Poisson distribution', 4),
            (v_unit, 'Normal distribution', 5),
            (v_unit, 'Exponential distribution', 6);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-402  Analysis & Design of Algorithms
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-402' limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Fundamentals & Divide and Conquer', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Algorithms and designing algorithms', 1),
            (v_unit, 'Analyzing algorithms', 2),
            (v_unit, 'Asymptotic notations', 3),
            (v_unit, 'Heap and heap sort', 4),
            (v_unit, 'Divide and conquer technique', 5),
            (v_unit, 'Binary search', 6),
            (v_unit, 'Merge sort', 7),
            (v_unit, 'Quick sort', 8),
            (v_unit, 'Strassen''s matrix multiplication', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Greedy Method', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Greedy strategy concept', 1),
            (v_unit, 'Optimal merge patterns', 2),
            (v_unit, 'Huffman coding', 3),
            (v_unit, 'Minimum spanning trees (Kruskal & Prim)', 4),
            (v_unit, 'Knapsack problem (fractional)', 5),
            (v_unit, 'Job sequencing with deadlines', 6),
            (v_unit, 'Single source shortest path (Dijkstra)', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Dynamic Programming', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Dynamic programming concept', 1),
            (v_unit, '0/1 knapsack problem', 2),
            (v_unit, 'Multistage graph', 3),
            (v_unit, 'Reliability design', 4),
            (v_unit, 'Floyd-Warshall algorithm', 5);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Backtracking & Branch and Bound', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Backtracking concept', 1),
            (v_unit, '8 queens problem', 2),
            (v_unit, 'Hamiltonian cycle', 3),
            (v_unit, 'Graph coloring problem', 4),
            (v_unit, 'Branch and bound method', 5),
            (v_unit, 'Travelling salesman problem', 6),
            (v_unit, 'Lower bound theory', 7),
            (v_unit, 'Introduction to parallel algorithms', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Trees, Graphs & NP-Completeness', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Binary search trees', 1),
            (v_unit, 'Height balanced trees (AVL)', 2),
            (v_unit, '2-3 trees', 3),
            (v_unit, 'B-trees', 4),
            (v_unit, 'Tree traversals (inorder, preorder, postorder)', 5),
            (v_unit, 'Graph traversals (DFS, BFS)', 6),
            (v_unit, 'NP-completeness', 7);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-403  Software Engineering
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-403' limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'The Software Product and Software Process', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Software product and process characteristics', 1),
            (v_unit, 'Linear sequential model', 2),
            (v_unit, 'Prototyping model', 3),
            (v_unit, 'RAD model', 4),
            (v_unit, 'Incremental model', 5),
            (v_unit, 'Spiral model', 6),
            (v_unit, 'Component assembly model', 7),
            (v_unit, 'RUP and Agile processes', 8),
            (v_unit, 'Software process customization and improvement', 9),
            (v_unit, 'CMM', 10),
            (v_unit, 'Product and process metrics', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Requirement Elicitation, Analysis & Specification', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Functional and non-functional requirements', 1),
            (v_unit, 'Requirement sources and elicitation techniques', 2),
            (v_unit, 'Analysis modeling (function-oriented)', 3),
            (v_unit, 'Analysis modeling (object-oriented)', 4),
            (v_unit, 'Use case modeling', 5),
            (v_unit, 'System and software requirement specification (SRS)', 6),
            (v_unit, 'Requirement validation', 7),
            (v_unit, 'Traceability', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Software Design', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Software design process', 1),
            (v_unit, 'Design concepts and principles', 2),
            (v_unit, 'Software modeling and UML', 3),
            (v_unit, 'Architectural design', 4),
            (v_unit, 'Architectural views and styles', 5),
            (v_unit, 'User interface design', 6),
            (v_unit, 'Function-oriented design', 7),
            (v_unit, 'SA/SD and component based design', 8),
            (v_unit, 'Design metrics', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Software Analysis and Testing', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Static and dynamic analysis', 1),
            (v_unit, 'Code inspections', 2),
            (v_unit, 'Software testing fundamentals', 3),
            (v_unit, 'Software test process', 4),
            (v_unit, 'Testing levels', 5),
            (v_unit, 'Test criteria and test case design', 6),
            (v_unit, 'Test oracles', 7),
            (v_unit, 'Black-box testing', 8),
            (v_unit, 'White-box testing', 9),
            (v_unit, 'Unit testing frameworks', 10),
            (v_unit, 'Integration testing', 11),
            (v_unit, 'System testing', 12),
            (v_unit, 'Test plan and test metrics', 13),
            (v_unit, 'Testing tools', 14),
            (v_unit, 'Introduction to OOA and OOD', 15);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Software Maintenance & Project Management', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Need and types of maintenance', 1),
            (v_unit, 'Software configuration management (SCM)', 2),
            (v_unit, 'Software change management', 3),
            (v_unit, 'Version control', 4),
            (v_unit, 'Change control and reporting', 5),
            (v_unit, 'Program comprehension techniques', 6),
            (v_unit, 'Re-engineering and reverse engineering', 7),
            (v_unit, 'Project management concepts', 8),
            (v_unit, 'Feasibility analysis', 9),
            (v_unit, 'Project and process planning', 10),
            (v_unit, 'Effort, schedule and cost estimation', 11),
            (v_unit, 'Project scheduling and tracking', 12),
            (v_unit, 'Risk assessment and mitigation', 13),
            (v_unit, 'Software quality assurance (SQA)', 14),
            (v_unit, 'Project plan and metrics', 15);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-404  Computer Organization & Architecture
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-404' limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Basic Structure of Computer & CPU', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Structure of desktop computers', 1),
            (v_unit, 'General register organization', 2),
            (v_unit, 'Memory register and instruction register', 3),
            (v_unit, 'Control word', 4),
            (v_unit, 'Stack organization', 5),
            (v_unit, 'Instruction format', 6),
            (v_unit, 'ALU', 7),
            (v_unit, 'I/O system and bus', 8),
            (v_unit, 'Program counter and bus structure', 9),
            (v_unit, 'Register transfer language', 10),
            (v_unit, 'Bus and memory transfer', 11),
            (v_unit, 'Addressing modes', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Control Unit Organization', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Basic concept of instruction', 1),
            (v_unit, 'Instruction types', 2),
            (v_unit, 'Micro instruction formats', 3),
            (v_unit, 'Fetch and execution cycle', 4),
            (v_unit, 'Hardwired control unit', 5),
            (v_unit, 'Microprogrammed control unit', 6),
            (v_unit, 'Microprogram sequencer', 7),
            (v_unit, 'Control memory', 8),
            (v_unit, 'Sequencing and execution of micro instruction', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Computer Arithmetic', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Addition and subtraction', 1),
            (v_unit, 'Two''s complement representation', 2),
            (v_unit, 'Signed addition and subtraction', 3),
            (v_unit, 'Multiplication and division', 4),
            (v_unit, 'Booth''s algorithm', 5),
            (v_unit, 'Division operation', 6),
            (v_unit, 'Floating point arithmetic operations', 7),
            (v_unit, 'Design of arithmetic unit', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'I/O Organization', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'I/O interface', 1),
            (v_unit, 'PCI bus', 2),
            (v_unit, 'SCSI bus', 3),
            (v_unit, 'USB', 4),
            (v_unit, 'Serial and parallel data transfer', 5),
            (v_unit, 'Synchronous and asynchronous modes', 6),
            (v_unit, 'Direct Memory Access (DMA)', 7),
            (v_unit, 'I/O processor', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Memory Organization & Multiprocessors', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Main memory (RAM, ROM)', 1),
            (v_unit, 'Secondary memory (magnetic tape, disk, optical)', 2),
            (v_unit, 'Cache memory structure and design', 3),
            (v_unit, 'Cache mapping schemes', 4),
            (v_unit, 'Cache replacement algorithms', 5),
            (v_unit, 'Improving cache performance', 6),
            (v_unit, 'Virtual memory', 7),
            (v_unit, 'Memory management hardware', 8),
            (v_unit, 'Characteristics of multiprocessor', 9),
            (v_unit, 'Interprocessor arbitration', 10),
            (v_unit, 'Interprocessor communication and synchronization', 11),
            (v_unit, 'Concept of pipelining', 12),
            (v_unit, 'Vector and array processing', 13),
            (v_unit, 'RISC and CISC', 14),
            (v_unit, 'Multicore processors (Intel, AMD)', 15);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-405  Operating Systems
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-405' limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction to Operating Systems', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'OS functions and goals', 1),
            (v_unit, 'Evolution of operating systems', 2),
            (v_unit, 'Types of operating systems', 3),
            (v_unit, 'Desirable characteristics and features of an OS', 4),
            (v_unit, 'OS services and types of services', 5),
            (v_unit, 'Utility programs', 6),
            (v_unit, 'System calls', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'File Systems', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'File concept and attributes', 1),
            (v_unit, 'User and system programmer view of file system', 2),
            (v_unit, 'Disk organization', 3),
            (v_unit, 'Tape organization', 4),
            (v_unit, 'Modules of a file system', 5),
            (v_unit, 'Disk space allocation - Contiguous', 6),
            (v_unit, 'Disk space allocation - Linked', 7),
            (v_unit, 'Disk space allocation - Indexed', 8),
            (v_unit, 'Directory structures', 9),
            (v_unit, 'File protection', 10),
            (v_unit, 'System calls for file management', 11),
            (v_unit, 'Disk scheduling algorithms (FCFS, SSTF, SCAN, C-SCAN, LOOK)', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'CPU Scheduling & Memory Management', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Process concept and PCB', 1),
            (v_unit, 'Scheduling concepts and criteria', 2),
            (v_unit, 'Types of schedulers', 3),
            (v_unit, 'Process state diagram', 4),
            (v_unit, 'Scheduling algorithm - FCFS', 5),
            (v_unit, 'Scheduling algorithm - SJF', 6),
            (v_unit, 'Scheduling algorithm - Priority', 7),
            (v_unit, 'Scheduling algorithm - Round Robin', 8),
            (v_unit, 'Algorithm evaluation', 9),
            (v_unit, 'System calls for process management', 10),
            (v_unit, 'Multiple processor scheduling', 11),
            (v_unit, 'Concept of threads', 12),
            (v_unit, 'Memory management - Partitioning', 13),
            (v_unit, 'Memory management - Swapping', 14),
            (v_unit, 'Memory management - Segmentation', 15),
            (v_unit, 'Memory management - Paging', 16),
            (v_unit, 'Paged segmentation', 17),
            (v_unit, 'Overlays', 18),
            (v_unit, 'Dynamic linking and loading', 19),
            (v_unit, 'Virtual memory and demand paging', 20);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'I/O & Concurrent Processes', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'I/O principles and programming', 1),
            (v_unit, 'I/O problems, speed gap and format conversion', 2),
            (v_unit, 'Asynchronous operations', 3),
            (v_unit, 'I/O interfaces', 4),
            (v_unit, 'Programmed I/O', 5),
            (v_unit, 'Interrupt-driven I/O', 6),
            (v_unit, 'Concurrent I/O', 7),
            (v_unit, 'Real vs virtual concurrency', 8),
            (v_unit, 'Mutual exclusion', 9),
            (v_unit, 'Process synchronization', 10),
            (v_unit, 'Inter-process communication (IPC)', 11),
            (v_unit, 'Critical section problem', 12),
            (v_unit, 'Semaphores - binary and counting', 13),
            (v_unit, 'WAIT and SIGNAL operations', 14),
            (v_unit, 'Deadlock - characterization', 15),
            (v_unit, 'Deadlock - prevention', 16),
            (v_unit, 'Deadlock - avoidance (Banker''s algorithm)', 17),
            (v_unit, 'Deadlock - detection and recovery', 18);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Distributed OS & Case Studies', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction to network OS', 1),
            (v_unit, 'Distributed OS', 2),
            (v_unit, 'Multiprocessor OS', 3),
            (v_unit, 'Case study - Unix/Linux', 4),
            (v_unit, 'Case study - Windows', 5);
    end if;
end $$;

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-406  Programming Practices (Java) - theory/syllabus content only
    -- (Java LAB PROGRAM list is seeded separately by sem4_java_lab_seed.sql)
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-406' limit 1;
    if v_subject is not null and not exists (select 1 from public.syllabus_units where subject_id = v_subject) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Basic Java Features', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'C++ vs Java', 1),
            (v_unit, 'Java Virtual Machine (JVM)', 2),
            (v_unit, 'Constants and variables', 3),
            (v_unit, 'Data types', 4),
            (v_unit, 'Class, methods, objects', 5),
            (v_unit, 'Strings and arrays', 6),
            (v_unit, 'Type casting', 7),
            (v_unit, 'Operators and precedence', 8),
            (v_unit, 'Control statements', 9),
            (v_unit, 'Exception handling', 10),
            (v_unit, 'File and streams', 11),
            (v_unit, 'Visibility (access modifiers)', 12),
            (v_unit, 'Constructors', 13),
            (v_unit, 'Operator and method overloading', 14),
            (v_unit, 'Static members', 15),
            (v_unit, 'Inheritance', 16),
            (v_unit, 'Polymorphism', 17),
            (v_unit, 'Abstract methods and classes', 18);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Java Collections Framework', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Data structures introduction', 1),
            (v_unit, 'Type-wrapper classes for primitive types', 2),
            (v_unit, 'Dynamic memory allocation', 3),
            (v_unit, 'Linked list, stack, queues, trees', 4),
            (v_unit, 'Generics: introduction', 5),
            (v_unit, 'Overloading generic methods', 6),
            (v_unit, 'Generic classes', 7),
            (v_unit, 'Collection interface and Collections class', 8),
            (v_unit, 'Lists, ArrayList and Iterator', 9),
            (v_unit, 'LinkedList and Vector', 10),
            (v_unit, 'Collection algorithms (sort, shuffle, reverse, fill, copy, max, min, binary search)', 11),
            (v_unit, 'Stack class and PriorityQueue', 12),
            (v_unit, 'Maps and Properties class', 13),
            (v_unit, 'Unmodifiable collections', 14);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Advance Java Features', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Multithreading: thread states and priorities', 1),
            (v_unit, 'Thread scheduling and life cycle', 2),
            (v_unit, 'Thread synchronization', 3),
            (v_unit, 'Creating and executing threads', 4),
            (v_unit, 'Multithreading with GUI', 5),
            (v_unit, 'Monitors and monitor locks', 6),
            (v_unit, 'Networking: manipulating URLs', 7),
            (v_unit, 'Reading a file on a web server', 8),
            (v_unit, 'Socket programming', 9),
            (v_unit, 'Security and the network', 10),
            (v_unit, 'RMI', 11),
            (v_unit, 'JDBC: relational database, SQL, MySQL, Oracle', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Advance Java Technologies', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Servlets: overview and architecture', 1),
            (v_unit, 'Setting up Apache Tomcat server', 2),
            (v_unit, 'Handling HTTP GET requests', 3),
            (v_unit, 'Deploying a web application', 4),
            (v_unit, 'Multitier applications', 5),
            (v_unit, 'Using JDBC from a servlet', 6),
            (v_unit, 'JSP: overview and first example', 7),
            (v_unit, 'JSP implicit objects', 8),
            (v_unit, 'JSP scripting, standard actions, directives', 9),
            (v_unit, 'Multimedia: loading, displaying and scaling images', 10),
            (v_unit, 'Animating a series of images', 11),
            (v_unit, 'Loading and playing audio clips', 12);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Advance Web/Internet Programming', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'J2ME', 1),
            (v_unit, 'J2EE', 2),
            (v_unit, 'EJB', 3),
            (v_unit, 'XML', 4);
    end if;
end $$;
