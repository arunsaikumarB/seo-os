-- 004_rls_tenancy.sql
-- Sprint 1: RLS for tenancy tables (001–003)

-- Helper functions (frozen in Database Freeze D8)
CREATE OR REPLACE FUNCTION public.auth_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.org_role_level(role TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE role
    WHEN 'owner' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'manager' THEN 3
    WHEN 'member' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(check_org_id UUID, min_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.org_id = check_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND public.org_role_level(om.role) >= public.org_role_level(min_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace(check_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    INNER JOIN public.org_members om ON om.org_id = w.org_id
    WHERE w.id = check_workspace_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND w.status <> 'archived'
  );
$$;

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_verifications ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY org_select ON public.organizations
  FOR SELECT USING (public.is_org_member(id));

CREATE POLICY org_insert ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY org_update ON public.organizations
  FOR UPDATE USING (public.has_org_role(id, 'admin'));

-- profiles
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_select_org ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.org_members om1
      INNER JOIN public.org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.user_id = auth.uid()
        AND om1.status = 'active'
        AND om2.user_id = profiles.id
        AND om2.status = 'active'
    )
  );

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- org_members
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT WITH CHECK (public.has_org_role(org_id, 'admin'));

CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE USING (public.has_org_role(org_id, 'admin'));

-- org_invites
CREATE POLICY org_invites_select ON public.org_invites
  FOR SELECT USING (public.has_org_role(org_id, 'admin'));

CREATE POLICY org_invites_insert ON public.org_invites
  FOR INSERT WITH CHECK (public.has_org_role(org_id, 'admin'));

-- workspaces
CREATE POLICY workspaces_select ON public.workspaces
  FOR SELECT USING (public.is_org_member(org_id) AND status <> 'archived');

CREATE POLICY workspaces_insert ON public.workspaces
  FOR INSERT WITH CHECK (public.has_org_role(org_id, 'member'));

CREATE POLICY workspaces_update ON public.workspaces
  FOR UPDATE USING (public.has_org_role(org_id, 'member'));

-- workspace_settings
CREATE POLICY workspace_settings_select ON public.workspace_settings
  FOR SELECT USING (public.can_access_workspace(workspace_id));

CREATE POLICY workspace_settings_update ON public.workspace_settings
  FOR UPDATE USING (public.can_access_workspace(workspace_id));

-- domain_verifications
CREATE POLICY domain_verifications_select ON public.domain_verifications
  FOR SELECT USING (public.can_access_workspace(workspace_id));

CREATE POLICY domain_verifications_insert ON public.domain_verifications
  FOR INSERT WITH CHECK (public.can_access_workspace(workspace_id));
