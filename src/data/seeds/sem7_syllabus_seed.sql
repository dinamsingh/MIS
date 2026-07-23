-- ============================================================================
-- Seed: sem7_syllabus_seed
-- RGPV CSE VII-Semester master syllabus (units + topics) for Syllabus Tracker.
--
-- Source: Official RGPV "New Scheme Based On AICTE Flexible Curricula,
-- Computer Science and Engineering, VII-Semester" document.
--
-- Subjects:
--   CS-701   Software Architectures              (5 units)
--   CS-702A  Computational Intelligence (Dept Elective)  (5 units)
--   CS-702B  Deep & Reinforcement Learning (Dept Elective) (5 units)
--   CS-702C  Wireless & Mobile Computing (Dept Elective)   (5 units)
--   CS-702D  Big Data (Dept Elective)                      (5 units)
--   CS-703A  Cryptography & Information Security (Open Elective) (5 units)
--   CS-703B  Data Mining and Warehousing (Open Elective)   (5 units)
--   CS-703C  Agile Software Development (Open Elective)    (5 units)
--   CS-703D  Disaster Management (Open Elective)           (5 units)
--
-- Strategy: Upsert subjects by (code, sem). If code doesn't exist, insert.
-- Units/topics replaced wholesale for each subject.
-- Idempotent: safe to re-run.
-- ============================================================================

-- First, ensure subjects exist (upsert)
insert into public.syllabus_subjects (sem, code, name, kind, elective_group)
values
    (7, 'CS-701', 'Software Architectures', 'theory', null),
    (7, 'CS-702A', 'Computational Intelligence', 'theory', 'DE-III'),
    (7, 'CS-702B', 'Deep & Reinforcement Learning', 'theory', 'DE-III'),
    (7, 'CS-702C', 'Wireless & Mobile Computing', 'theory', 'DE-III'),
    (7, 'CS-702D', 'Big Data', 'theory', 'DE-III'),
    (7, 'CS-703A', 'Cryptography & Information Security', 'theory', 'OE-III'),
    (7, 'CS-703B', 'Data Mining and Warehousing', 'theory', 'OE-III'),
    (7, 'CS-703C', 'Agile Software Development', 'theory', 'OE-III'),
    (7, 'CS-703D', 'Disaster Management', 'theory', 'OE-III')
on conflict (code, sem) do update
    set name = excluded.name,
        kind = excluded.kind,
        elective_group = excluded.elective_group;

-- Now seed units and topics
do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-701  Software Architectures
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-701' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction to Software Architecture', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Overview of Software development methodology and software quality model', 1),
            (v_unit, 'Different models of software development and their issues', 2),
            (v_unit, 'Introduction to software architecture', 3),
            (v_unit, 'Evolution of software architecture', 4),
            (v_unit, 'Software components and connectors', 5),
            (v_unit, 'Common software architecture frameworks', 6),
            (v_unit, 'Architecture business cycle', 7),
            (v_unit, 'Architectural patterns', 8),
            (v_unit, 'Reference model', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Software Architecture Models and Styles', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Structural models', 1),
            (v_unit, 'Framework models', 2),
            (v_unit, 'Dynamic models', 3),
            (v_unit, 'Process models', 4),
            (v_unit, 'Dataflow architecture', 5),
            (v_unit, 'Pipes and filters architecture', 6),
            (v_unit, 'Call-and-return architecture', 7),
            (v_unit, 'Data-centered architecture', 8),
            (v_unit, 'Layered architecture', 9),
            (v_unit, 'Agent based architecture', 10),
            (v_unit, 'Micro-services architecture', 11),
            (v_unit, 'Reactive Architecture', 12),
            (v_unit, 'Representational state transfer architecture', 13);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Implementation Technologies', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Software Architecture Description Languages (ADLs)', 1),
            (v_unit, 'Struts', 2),
            (v_unit, 'Hibernate', 3),
            (v_unit, 'Node JS', 4),
            (v_unit, 'Angular JS', 5),
            (v_unit, 'J2EE: JSP, Servlets, EJBs', 6),
            (v_unit, 'Middleware: JDBC, JNDI, JMS, RMI and CORBA', 7),
            (v_unit, 'Role of UML in software architecture', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Architecture Analysis and Design', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Requirements for architecture and life-cycle view', 1),
            (v_unit, 'Architecture design and analysis methods', 2),
            (v_unit, 'Cost Benefit Analysis Method (CBAM)', 3),
            (v_unit, 'Architecture Tradeoff Analysis Method (ATAM)', 4),
            (v_unit, 'Active Reviews for Intermediate Design (ARID)', 5),
            (v_unit, 'Attribute Driven Design method (ADD)', 6),
            (v_unit, 'Architecture reuse', 7),
            (v_unit, 'Domain-specific Software architecture', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Architecture Documentation', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Principles of sound documentation', 1),
            (v_unit, 'Refinement', 2),
            (v_unit, 'Context diagrams', 3),
            (v_unit, 'Variability', 4),
            (v_unit, 'Software interfaces', 5),
            (v_unit, 'Documenting behavior of software elements and systems', 6),
            (v_unit, 'Documentation package using seven-part template', 7);
    end if;

    -- ========================================================================
    -- CS-702A  Computational Intelligence
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-702A' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction to Computational Intelligence', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Types of Computational Intelligence', 1),
            (v_unit, 'Components of Computational Intelligence', 2),
            (v_unit, 'Concept of Learning/Training model', 3),
            (v_unit, 'Parametric Models', 4),
            (v_unit, 'Nonparametric Models', 5),
            (v_unit, 'Feed Forward network', 6),
            (v_unit, 'Feedback network', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Fuzzy Systems', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Fuzzy set theory: Fuzzy sets and operations', 1),
            (v_unit, 'Membership Functions', 2),
            (v_unit, 'Fuzzy relations and their composition', 3),
            (v_unit, 'Fuzzy Measures', 4),
            (v_unit, 'Fuzzy Logic: Fuzzy Rules, Inferencing', 5),
            (v_unit, 'Fuzzy Control: Selection of Membership Functions', 6),
            (v_unit, 'Fuzzyfication', 7),
            (v_unit, 'Rule Based Design & Inferencing', 8),
            (v_unit, 'Defuzzyfication', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Genetic Algorithms', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Basic Genetics, Concepts, Working Principle', 1),
            (v_unit, 'Creation of Offsprings', 2),
            (v_unit, 'Encoding', 3),
            (v_unit, 'Fitness Function', 4),
            (v_unit, 'Selection Functions', 5),
            (v_unit, 'Genetic Operators: Reproduction, Crossover, Mutation', 6),
            (v_unit, 'Genetic Modeling', 7),
            (v_unit, 'Benefits', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Rough Set Theory', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction and Fundamental Concepts', 1),
            (v_unit, 'Set approximation', 2),
            (v_unit, 'Rough membership', 3),
            (v_unit, 'Attributes and Optimization', 4),
            (v_unit, 'Hidden Markov Models', 5),
            (v_unit, 'Decision tree model', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Swarm Intelligence', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction to Swarm Intelligence', 1),
            (v_unit, 'Ant Colony Optimization', 2),
            (v_unit, 'Particle Swarm Optimization', 3),
            (v_unit, 'Bee Colony Optimization', 4),
            (v_unit, 'Applications of Computational Intelligence', 5);
    end if;

    -- ========================================================================
    -- CS-702B  Deep & Reinforcement Learning
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-702B' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Deep Learning Foundations', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'History of Deep Learning', 1),
            (v_unit, 'McCulloch Pitts Neuron, Thresholding Logic', 2),
            (v_unit, 'Activation functions', 3),
            (v_unit, 'Gradient Descent variants: Momentum, Nesterov, Stochastic, AdaGrad, RMSProp, Adam', 4),
            (v_unit, 'Eigenvalue Decomposition', 5),
            (v_unit, 'Recurrent Neural Networks', 6),
            (v_unit, 'Backpropagation through time (BPTT)', 7),
            (v_unit, 'Vanishing and Exploding Gradients', 8),
            (v_unit, 'GRU, LSTMs', 9),
            (v_unit, 'Encoder Decoder Models', 10),
            (v_unit, 'Attention Mechanism', 11);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Autoencoders and Regularization', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Autoencoders and relation to PCA', 1),
            (v_unit, 'Regularization in autoencoders', 2),
            (v_unit, 'Denoising autoencoders', 3),
            (v_unit, 'Sparse autoencoders', 4),
            (v_unit, 'Contractive autoencoders', 5),
            (v_unit, 'Bias Variance Tradeoff', 6),
            (v_unit, 'L2 regularization, Early stopping', 7),
            (v_unit, 'Dataset augmentation', 8),
            (v_unit, 'Dropout', 9),
            (v_unit, 'Batch, Instance, Group Normalization', 10);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Convolutional Neural Networks', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Greedy Layerwise Pre-training', 1),
            (v_unit, 'Better activation functions and weight initialization', 2),
            (v_unit, 'Learning Vectorial Representations Of Words', 3),
            (v_unit, 'CNN architectures: LeNet, AlexNet, ZF-Net, VGGNet, GoogLeNet, ResNet', 4),
            (v_unit, 'Visualizing CNNs', 5),
            (v_unit, 'Guided Backpropagation', 6),
            (v_unit, 'Deep Dream, Deep Art', 7),
            (v_unit, 'Recent Trends in Deep Learning Architectures', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Reinforcement Learning Foundations', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction to RL', 1),
            (v_unit, 'Bandit algorithms: UCB, PAC, Median Elimination', 2),
            (v_unit, 'Policy Gradient', 3),
            (v_unit, 'Full RL & MDPs', 4),
            (v_unit, 'Bellman Optimality', 5),
            (v_unit, 'Dynamic Programming: Value iteration, Policy iteration', 6),
            (v_unit, 'Q-learning & Temporal Difference Methods', 7),
            (v_unit, 'Eligibility Traces', 8),
            (v_unit, 'Function Approximation, Least Squares Methods', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Advanced Reinforcement Learning', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Fitted Q, Deep Q-Learning', 1),
            (v_unit, 'DQN & Policy Gradient', 2),
            (v_unit, 'Policy Gradient Algorithms for Full RL', 3),
            (v_unit, 'Hierarchical RL, POMDPs', 4),
            (v_unit, 'Actor-Critic Method', 5),
            (v_unit, 'Inverse reinforcement learning', 6),
            (v_unit, 'Maximum Entropy Deep Inverse RL', 7),
            (v_unit, 'Generative Adversarial Imitation Learning', 8),
            (v_unit, 'Recent Trends in RL Architectures', 9);
    end if;

    -- ========================================================================
    -- CS-702C  Wireless & Mobile Computing
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-702C' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Review of Traditional Networks', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Review of LAN, MAN, WAN, Intranet, Internet', 1),
            (v_unit, 'Interconnectivity devices: bridges, Routers', 2),
            (v_unit, 'TCP/IP Protocol Architecture: ARP/RARP, IP addressing', 3),
            (v_unit, 'IP Datagram format, Routing table, ICMP', 4),
            (v_unit, 'Subnetting, Supernetting and CIDR, DNS', 5),
            (v_unit, 'NAT: SNAT, DNAT, NAT and firewalls', 6),
            (v_unit, 'VLANs: Concepts, Types, Tagging', 7),
            (v_unit, 'IPv6: address structure, address space and header', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Traditional Routing and Transport', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Routing Protocols: BGP concepts and messages', 1),
            (v_unit, 'Interior Gateway protocol: RIP, OSPF', 2),
            (v_unit, 'TCP: Segment format, Sockets, Synchronization', 3),
            (v_unit, 'Three Way Handshaking, Flow control', 4),
            (v_unit, 'Timeout and Retransmission algorithms', 5),
            (v_unit, 'Silly window Syndrome', 6),
            (v_unit, 'TCP variants: Tahoe, Reno, Sack', 7),
            (v_unit, 'UDP: Message Encapsulation, Format, Pseudo header', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Wireless LAN and Mobile IP', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Transmission Medium for WLANs', 1),
            (v_unit, 'MAC problems: Hidden, Exposed, Near, Far terminals', 2),
            (v_unit, 'IEEE 802.11: System arch, Protocol arch, Physical layer', 3),
            (v_unit, 'Spread spectrum, MAC management, Power management, Security', 4),
            (v_unit, 'Mobile IP: Goals, Terminology, Agent discovery', 5),
            (v_unit, 'Registration, Tunneling techniques', 6),
            (v_unit, 'Ad hoc network routing: AODV, DSDV, DSR, ZRP', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Mobile Transport and Cellular Networks', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Mobile transport layer: I-TCP, S-TCP, M-TCP', 1),
            (v_unit, 'Cellular system concepts', 2),
            (v_unit, 'Cellular networks vs WLAN', 3),
            (v_unit, 'GSM: Services, system architecture', 4),
            (v_unit, 'Localization and calling', 5),
            (v_unit, 'Handover and Roaming', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Mobile OS and M-Commerce', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Mobile Device Operating Systems: Constraints & Requirements', 1),
            (v_unit, 'Commercial Mobile Operating Systems', 2),
            (v_unit, 'Software Development Kit: iOS, Android', 3),
            (v_unit, 'M-Commerce: Structure, Pros & Cons', 4),
            (v_unit, 'Mobile Payment System', 5),
            (v_unit, 'Security Issues', 6);
    end if;

    -- ========================================================================
    -- CS-702D  Big Data
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-702D' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction to Big Data', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Big data characteristics and types', 1),
            (v_unit, 'Traditional versus Big data', 2),
            (v_unit, 'Evolution and challenges of Big Data', 3),
            (v_unit, 'Technologies available for Big Data', 4),
            (v_unit, 'Infrastructure for Big data', 5),
            (v_unit, 'Use of Data Analytics', 6),
            (v_unit, 'Desired properties of Big Data system', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Hadoop Ecosystem', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Core Hadoop components', 1),
            (v_unit, 'Hadoop Eco system', 2),
            (v_unit, 'Hive Physical Architecture', 3),
            (v_unit, 'Hadoop limitations, RDBMS vs Hadoop', 4),
            (v_unit, 'Hadoop Distributed File System', 5),
            (v_unit, 'Processing Data with Hadoop', 6),
            (v_unit, 'Hadoop YARN', 7),
            (v_unit, 'MapReduce programming', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Hive and Pig', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Hive Architecture, Data types, HiveQL', 1),
            (v_unit, 'Introduction to Pig', 2),
            (v_unit, 'Anatomy of Pig, Pig on Hadoop', 3),
            (v_unit, 'ETL Processing', 4),
            (v_unit, 'Data types, Execution model of Pig', 5),
            (v_unit, 'Operators, functions', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'NoSQL', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction to NoSQL', 1),
            (v_unit, 'NoSQL Business Drivers', 2),
            (v_unit, 'NoSQL Data architectural patterns', 3),
            (v_unit, 'Variations of NOSQL architectural patterns', 4),
            (v_unit, 'Using NoSQL to Manage Big Data', 5),
            (v_unit, 'Introduction to MongoDB', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Social Network Mining', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Applications of social Network mining', 1),
            (v_unit, 'Social Networks as a Graph', 2),
            (v_unit, 'Types of social Networks', 3),
            (v_unit, 'Clustering of social Graphs', 4),
            (v_unit, 'Direct Discovery of communities', 5),
            (v_unit, 'Introduction to recommender system', 6);
    end if;
end $$;


do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    -- ========================================================================
    -- CS-703A  Cryptography & Information Security
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-703A' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Mathematical Background and Classical Cryptography', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Abstract Algebra, Number Theory', 1),
            (v_unit, 'Modular Inverse, Extended Euclid Algorithm', 2),
            (v_unit, 'Fermat''s Little Theorem, Euler Phi-Function, Euler''s theorem', 3),
            (v_unit, 'Principles of Cryptography', 4),
            (v_unit, 'Classical Cryptosystem', 5),
            (v_unit, 'Cryptanalysis on Substitution Cipher (Frequency Analysis)', 6),
            (v_unit, 'Play Fair Cipher, Block Cipher', 7),
            (v_unit, 'DES, Triple DES, Modes of Operation, Stream Cipher', 8);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Public Key Cryptography', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'AES', 1),
            (v_unit, 'Introduction to Public Key Cryptosystem', 2),
            (v_unit, 'Discrete Logarithmic Problem', 3),
            (v_unit, 'Diffie-Hellman Key Exchange', 4),
            (v_unit, 'RSA Assumptions & Cryptosystem', 5),
            (v_unit, 'RSA Signatures & Schnorr Identification Schemes', 6),
            (v_unit, 'Primarily Testing', 7),
            (v_unit, 'Elliptic Curve Cryptography', 8),
            (v_unit, 'Chinese Remainder Theorem', 9);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Authentication and Hash Functions', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Message Authentication, Digital Signature', 1),
            (v_unit, 'Key Management, Key Exchange', 2),
            (v_unit, 'Hash Function, Universal Hashing', 3),
            (v_unit, 'Cryptographic Hash Function, MD, SHA', 4),
            (v_unit, 'Digital Signature Standard (DSS)', 5),
            (v_unit, 'Cryptanalysis: Time-Memory Trade-off, Differential Cryptanalysis', 6),
            (v_unit, 'Secure channel and Kerberos', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Network and Information Security', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Threats in Networks, Network Security Controls', 1),
            (v_unit, 'Wireless Security, Honey pots', 2),
            (v_unit, 'Firewalls: Design and Types, IDS', 3),
            (v_unit, 'Email Security: PGP, S-MIME', 4),
            (v_unit, 'IP Security: IPSec, ESP, IKE', 5),
            (v_unit, 'Web Security: SSL/TLS', 6),
            (v_unit, 'Secure Electronic Transaction (SET)', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Security Tools', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Spoofing tools', 1),
            (v_unit, 'Foot printing Tools: nslookup, dig, Whois', 2),
            (v_unit, 'Vulnerabilities Scanning Tools', 3),
            (v_unit, 'Steganography tools and Steganalysis', 4),
            (v_unit, 'Trojans Detection Tools', 5),
            (v_unit, 'LAN Scanner Tools: Wireshark, Tcpdump', 6),
            (v_unit, 'DoS Attack Understanding Tools', 7);
    end if;

    -- ========================================================================
    -- CS-703B  Data Mining and Warehousing
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-703B' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Data Warehousing', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction, Delivery Process', 1),
            (v_unit, 'Data warehouse Architecture', 2),
            (v_unit, 'Data Preprocessing: cleaning, integration, transformation, reduction', 3),
            (v_unit, 'Data warehouse Design: schema, Partitioning strategy', 4),
            (v_unit, 'Data Marts, Meta Data', 5),
            (v_unit, 'Example of Multidimensional Data model', 6),
            (v_unit, 'Introduction to Pattern Warehousing', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'OLAP Systems', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Basic concepts of OLAP', 1),
            (v_unit, 'OLAP queries', 2),
            (v_unit, 'Types of OLAP servers', 3),
            (v_unit, 'OLAP operations', 4),
            (v_unit, 'Data Warehouse Hardware and Operational Design', 5),
            (v_unit, 'Security, Backup And Recovery', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Introduction to Data Mining', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Data Types, Quality of data', 1),
            (v_unit, 'Data Preprocessing, Similarity measures', 2),
            (v_unit, 'Summary statistics, Data distributions', 3),
            (v_unit, 'Basic data mining tasks', 4),
            (v_unit, 'Data Mining vs knowledge discovery in databases', 5),
            (v_unit, 'Issues in Data mining', 6),
            (v_unit, 'Introduction to Fuzzy sets and fuzzy logic', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Classification', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Statistical-based algorithms', 1),
            (v_unit, 'Distance-based algorithms', 2),
            (v_unit, 'Decision tree-based algorithms', 3),
            (v_unit, 'Neural network-based algorithms', 4),
            (v_unit, 'Rule-based algorithms', 5),
            (v_unit, 'Probabilistic Classifiers', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Clustering & Association Rule Mining', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Hierarchical algorithms', 1),
            (v_unit, 'Partitional algorithms', 2),
            (v_unit, 'Clustering large databases: BIRCH, DBSCAN, CURE', 3),
            (v_unit, 'Association rules: Apriori algorithm', 4),
            (v_unit, 'FP growth algorithm', 5);
    end if;

    -- ========================================================================
    -- CS-703C  Agile Software Development
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-703C' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Fundamentals of Agile Process', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Introduction and background', 1),
            (v_unit, 'Agile Manifesto and Principles', 2),
            (v_unit, 'Stakeholders and Challenges', 3),
            (v_unit, 'Overview: Scrum, XP, FDD, Crystal, Kanban, Lean', 4);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Agile Projects', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Planning for Agile Teams: Scrum, XP, General', 1),
            (v_unit, 'Team Distribution', 2),
            (v_unit, 'Agile Project Lifecycles', 3),
            (v_unit, 'Product Vision, Release Planning', 4),
            (v_unit, 'Product Backlog, User Stories', 5),
            (v_unit, 'Prioritizing and Estimating', 6),
            (v_unit, 'Monitoring and Adapting: Risks, Retrospectives', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Scrum', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Agile Scrum Framework', 1),
            (v_unit, 'Scrum Artifacts, Meetings, Roles', 2),
            (v_unit, 'Scrum Planning Principles', 3),
            (v_unit, 'Sprint: Planning, Execution, Review, Retrospective', 4),
            (v_unit, 'User story definition and Characteristics', 5),
            (v_unit, 'Acceptance tests, Burn down chart, Daily scrum', 6),
            (v_unit, 'Scrum Case Study', 7);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Extreme Programming (XP)', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'XP Lifecycle, The XP Team', 1),
            (v_unit, 'XP Concepts: Refactoring, Technical Debt, Timeboxing, Velocity', 2),
            (v_unit, 'Adopting XP: Pre-requisites, Challenges', 3),
            (v_unit, 'Applying XP: Pair Programming, Collaborating, Release', 4),
            (v_unit, 'XP Case Study', 5);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Agile Design and Quality Assurance', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Agile design practices, Design Principles', 1),
            (v_unit, 'Refactoring Techniques', 2),
            (v_unit, 'Continuous Integration, Automated build tools', 3),
            (v_unit, 'Version control', 4),
            (v_unit, 'Agile approach to Quality Assurance', 5),
            (v_unit, 'Test Driven Development', 6),
            (v_unit, 'Pair programming: Issues and Challenges', 7);
    end if;

    -- ========================================================================
    -- CS-703D  Disaster Management
    -- ========================================================================
    select id into v_subject from public.syllabus_subjects where code = 'CS-703D' and sem = 7 limit 1;
    if v_subject is not null then
        delete from public.syllabus_units where subject_id = v_subject;

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 1, 'Introduction to Disasters', 1) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Definition: Disaster, Hazard, Vulnerability, Resilience, Risks', 1),
            (v_unit, 'Types of disasters: Earthquake, Landslide, Flood, Drought, Fire', 2),
            (v_unit, 'Classification, Causes, Impacts', 3),
            (v_unit, 'Differential impacts: caste, class, gender, age, location', 4),
            (v_unit, 'Global trends: urban disasters, pandemics, climate change', 5),
            (v_unit, 'Dos and Don''ts during various types of Disasters', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 2, 'Approaches to Disaster Risk Reduction', 2) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Disaster cycle - Phases', 1),
            (v_unit, 'Culture of safety, prevention, mitigation, preparedness', 2),
            (v_unit, 'Community based DRR', 3),
            (v_unit, 'Structural and nonstructural measures', 4),
            (v_unit, 'Roles: community, PRIs/ULBs, States, Centre', 5),
            (v_unit, 'SDMA, Early Warning System', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 3, 'Disasters and Development', 3) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Factors affecting Vulnerabilities', 1),
            (v_unit, 'Impact of Development projects: dams, embankments, land-use', 2),
            (v_unit, 'Climate Change Adaptation', 3),
            (v_unit, 'IPCC Scenario in context of India', 4),
            (v_unit, 'Indigenous knowledge and appropriate technology', 5);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 4, 'Disaster Risk Management in India', 4) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Hazard and Vulnerability profile of India', 1),
            (v_unit, 'Components of Disaster Relief: Water, Food, Sanitation, Shelter', 2),
            (v_unit, 'Institutional arrangements: Mitigation, Response, Preparedness', 3),
            (v_unit, 'Disaster Management Act and Policy', 4),
            (v_unit, 'Role of GIS and IT in Disaster Management', 5),
            (v_unit, 'Disaster Damage Assessment', 6);

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 5, 'Applications and Case Studies', 5) returning id into v_unit;
        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Landslide Hazard Zonation', 1),
            (v_unit, 'Earthquake Vulnerability Assessment', 2),
            (v_unit, 'Drought Assessment', 3),
            (v_unit, 'Coastal Flooding: Storm Surge Assessment', 4),
            (v_unit, 'Floods: Fluvial and Pluvial Flooding', 5),
            (v_unit, 'Forest Fire, Man Made disasters', 6),
            (v_unit, 'Space Based Inputs for Disaster Management', 7);
    end if;
end $$;


-- ============================================================================
-- Cleanup: Remove old placeholder codes from onboarding_seed that don't match
-- actual RGPV codes (CS-7001..CS-7007). Only delete if no teacher_assignments
-- reference them and they have no units (orphans).
-- Safe: if any teacher already uses them, keep them.
-- ============================================================================
delete from public.syllabus_subjects
where sem = 7
  and code in ('CS-7001','CS-7002','CS-7003','CS-7004','CS-7005','CS-7006','CS-7007')
  and id not in (select subject_id from public.syllabus_units)
  and id not in (select subject_id from public.teacher_assignments);
