-- This script runs automatically when PostgreSQL container starts for the first time.
-- It creates the necessary databases and grants privileges.

-- Create databases for each service
CREATE DATABASE scandb;
CREATE DATABASE repo_scanner_db;
CREATE DATABASE system_scanner_db;
CREATE DATABASE scanuser;

-- Grant all privileges to scanuser on each database
GRANT ALL PRIVILEGES ON DATABASE scandb TO scanuser;
GRANT ALL PRIVILEGES ON DATABASE repo_scanner_db TO scanuser;
GRANT ALL PRIVILEGES ON DATABASE system_scanner_db TO scanuser;
GRANT ALL PRIVILEGES ON DATABASE scanuser TO scanuser;

-- Connect to each database to enable extensions and set permissions.
-- This is necessary because some commands are database-specific.

\c scandb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO scanuser;

\c repo_scanner_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO scanuser;

\c system_scanner_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO scanuser;

\c scanuser;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO scanuser;