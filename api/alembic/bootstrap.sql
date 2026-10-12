-- Run once per cluster as a superuser, before `alembic upgrade head`:
--   psql "$SUPERUSER_URL" -v owner_pw=... -v app_pw=... -v worker_pw=... -f alembic/bootstrap.sql
-- hunt_owner owns the schema and runs migrations. hunt_app (API) and hunt_worker (task worker)
-- never own tables and have no BYPASSRLS (TRD §3, eng review E1).
CREATE ROLE hunt_owner LOGIN NOBYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE hunt_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_pw';
CREATE ROLE hunt_worker LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'worker_pw';
CREATE DATABASE hunt OWNER hunt_owner;
\connect hunt
ALTER SCHEMA public OWNER TO hunt_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hunt_app, hunt_worker;
