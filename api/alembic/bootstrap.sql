-- Run once per cluster as a superuser, before `alembic upgrade head`:
--   psql "$SUPERUSER_URL" -v owner_pw=... -v app_pw=... -v worker_pw=... -v admin_pw=... -f alembic/bootstrap.sql
-- hunt_owner owns the schema and runs migrations. hunt_app (API) and hunt_worker (task worker)
-- never own tables and have no BYPASSRLS (TRD §3, eng review E1).
-- hunt_admin (ADMIN_DATABASE_URL, admin console only) has BYPASSRLS for cross-user reads; migration 0008 grants it
-- SELECT on a few tables, UPDATE on tasks and INSERT on audit_log, nothing else. A cluster bootstrapped before
-- 0008 needs just the hunt_admin line below (as a superuser) before `alembic upgrade head`.
CREATE ROLE hunt_owner LOGIN NOBYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE hunt_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_pw';
CREATE ROLE hunt_worker LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'worker_pw';
CREATE ROLE hunt_admin LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'admin_pw';
CREATE DATABASE hunt OWNER hunt_owner;
\connect hunt
ALTER SCHEMA public OWNER TO hunt_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hunt_app, hunt_worker;
