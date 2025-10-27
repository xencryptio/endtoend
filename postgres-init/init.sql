-- This script runs automatically when PostgreSQL container starts for the first time
-- It creates the necessary tables if they don't exist

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant all privileges to scanuser
GRANT ALL PRIVILEGES ON DATABASE scandb TO scanuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO scanuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO scanuser;

-- Note: SQLAlchemy will create the actual tables via models.py
-- This file is just for initial setup and permissions