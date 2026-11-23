-- Runtime access and trusted workspace bootstrap.
-- The backend MUST derive app.user_id from a verified authentication session.
-- Keep the database credential server-side; never expose it to browsers/mobile clients.
-- Runtime connections must use a non-owner role without BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synqforge_app') THEN
    CREATE ROLE synqforge_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO synqforge_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON workspaces, projects, project_artifacts, project_activity
  TO synqforge_app;
GRANT SELECT ON workspace_memberships TO synqforge_app;

-- No caller-supplied user ID: identity comes only from the backend's
-- transaction-local context, which must be populated after token verification.
CREATE OR REPLACE FUNCTION public.create_workspace(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text := btrim(p_name);
  v_slug text := lower(btrim(p_slug));
BEGIN
  v_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'verified application identity is required'
      USING ERRCODE = '28000';
  END IF;

  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'workspace name must contain 2 to 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_slug IS NULL OR char_length(v_slug) > 120
     OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'workspace slug must be lowercase alphanumeric words separated by hyphens'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspaces (name, slug)
  VALUES (v_name, v_slug)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  RETURN v_workspace_id;
END
$function$;

REVOKE ALL ON FUNCTION public.create_workspace(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text) TO synqforge_app;
